import 'package:flutter/material.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:async';
import '../services/api_service.dart';
import '../utils/constants.dart';
import 'app_config_provider.dart';

class ChatProvider with ChangeNotifier, WidgetsBindingObserver {
  List<dynamic> _rooms = [];
  List<dynamic> _currentMessages = [];
  int _unreadCount = 0;
  bool _isLoading = false;
  String? _error;
  io.Socket? _socket;
  bool _socketConnected = false;
  int? _currentRoomId;
  int? _activeUserId;
  List<int> _typingUsers = [];
  VoidCallback? _onAttendanceChanged;
  VoidCallback? _onAnnouncementsChanged;
  VoidCallback? _onLeavesChanged;
  void Function(Map<String, dynamic>)? _onScheduleChanged;
  void Function(dynamic)? _onAnnouncementNew;
  void Function(dynamic)? _onAnnouncementUpdate;
  AppConfigProvider? _appConfig;
  String? _lastEventTime;

  void setAppConfig(AppConfigProvider p) => _appConfig = p;

  // Dedup cache — prevents double-processing of replayed/duplicate events
  final Set<String> _processedMsgIds = {};
  static const int _maxMsgIdCache = 500;

  bool _isDuplicateMsg(String key) {
    if (_processedMsgIds.contains(key)) return true;
    if (_processedMsgIds.length >= _maxMsgIdCache) {
      _processedMsgIds.removeAll(_processedMsgIds.take(100).toList());
    }
    _processedMsgIds.add(key);
    return false;
  }

  List<dynamic> get rooms => _rooms;
  List<dynamic> get currentMessages => _currentMessages;
  int get unreadCount => _unreadCount;
  int? get currentRoomId => _currentRoomId;
  bool get isLoading => _isLoading;
  bool get socketConnected => _socketConnected;
  String? get error => _error;
  List<int> get typingUsers => _typingUsers;

  final _api = ApiService.instance;

  ChatProvider() {
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    disconnectSocket();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      if (_activeUserId != null) {
        if (_socket == null || !_socket!.connected) {
          // Force fresh reconnect with new token on resume
          _socket?.dispose();
          _socket = null;
          connectSocket(_activeUserId!);
        }
      }
      getUnreadCount();
      getMyRooms(silent: true);
    }
  }

  // ── Socket lifecycle ──────────────────────────────────────────────────────

  Future<void> connectSocket(int userId) async {
    _activeUserId = userId;
    if (_socket?.connected == true) return;
    _lastEventTime ??= await _loadLastEventTime();

    // Always get a fresh token — refresh if needed
    final token = await _api.getToken();
    if (token == null) return;

    _socket?.dispose();

    _socket = io.io(ApiConstants.socketUrl, <String, dynamic>{
      'transports': ['websocket', 'polling'],
      'autoConnect': false,
      'reconnection': true,
      'reconnectionAttempts': 20,
      'reconnectionDelay': 1000,
      'reconnectionDelayMax': 5000,
      'auth': {'token': token},
    });

    _socket!.onConnect((_) {
      _socketConnected = true;
      // Clear dedup cache on reconnect so missed messages replay correctly
      _processedMsgIds.clear();
      // Re-join active room on every (re)connect so messages sent while
      // disconnected are received via the room broadcast channel.
      // Use ACK so we know the join succeeded before trusting real-time events.
      if (_currentRoomId != null) {
        final roomId = _currentRoomId!;
        _emitJoinWithAck(roomId).then((joined) {
          if (joined && _currentRoomId == roomId) {
            // Reload messages to catch anything missed while disconnected
            getMessages(roomId, silent: true);
          } else if (_currentRoomId == roomId) {
            // ACK timed out — fall back to HTTP reload anyway
            getMessages(roomId, silent: true);
          }
        });
      }
      // Refresh rooms list to update unread counts
      _syncMissedEvents();
      getMyRooms(silent: true);
      notifyListeners();
    });

    _socket!.onDisconnect((_) {
      _socketConnected = false;
      notifyListeners();
    });

    // On connect error (e.g. expired token) — refresh token and reconnect
    _socket!.onConnectError((err) {
      _socketConnected = false;
      notifyListeners();
      final errStr = err?.toString() ?? '';
      if (errStr.contains('Authentication') || errStr.contains('auth') || errStr.contains('token')) {
        // Token likely expired — refresh and reconnect with new token
        _refreshAndReconnect();
      }
    });

    // ── Register all socket event handlers BEFORE connecting ─────────────
    _socket!.on('chat:new',    (data) { _rememberEventEnvelope(data); handleMessage(data); });
    _socket!.on('chat:update', (data) { _rememberEventEnvelope(data); handleUpdate(data); });
    _socket!.on('chat:typing', (data) { _rememberEventEnvelope(data); handleTyping(data); });
    // chat:room is sent by the server when a new room is created for us,
    // OR as confirmation that chat:join was processed. We use it to detect
    // when we've been added to a room while the app was in the foreground.
    _socket!.on('chat:room',   (data) { _rememberEventEnvelope(data); _handleRoomEvent(data); });

    // All non-chat socket events are deferred to post-frame to prevent
    // "setState() or markNeedsBuild() called during build" errors.
    // Socket events can fire at any time, including during widget builds.
    _socket!.on('attendance:update',   (data) { _rememberEventEnvelope(data); WidgetsBinding.instance.addPostFrameCallback((_) => _onAttendanceChanged?.call()); });
    _socket!.on('announcement:new',    (data) { _rememberEventEnvelope(data); WidgetsBinding.instance.addPostFrameCallback((_) { _onAnnouncementNew?.call(data); _onAnnouncementsChanged?.call(); }); });
    _socket!.on('announcement:update', (data) { _rememberEventEnvelope(data); WidgetsBinding.instance.addPostFrameCallback((_) { _onAnnouncementUpdate?.call(data); _onAnnouncementsChanged?.call(); }); });
    _socket!.on('leave:request',       (data) { _rememberEventEnvelope(data); WidgetsBinding.instance.addPostFrameCallback((_) => _onLeavesChanged?.call()); });
    _socket!.on('leave:update',        (data) { _rememberEventEnvelope(data); WidgetsBinding.instance.addPostFrameCallback((_) => _onLeavesChanged?.call()); });
    _socket!.on('config:update', (data) {
      _rememberEventEnvelope(data);
      // Force-refresh: bypass the 6-hour TTL cache so admin changes take effect immediately.
      // Also invalidate schedule + holiday caches — policy fields and holidays live there.
      WidgetsBinding.instance.addPostFrameCallback((_) {
        _appConfig?.load(forceRefresh: true);
        // Bust schedule cache — policy fields (grace, auto-absent) live in schedule response
        ApiService.instance.invalidateCache('/schedules/my');
        // Bust holiday caches for current and adjacent months
        final now = DateTime.now();
        ApiService.instance.invalidateCache('/holidays?year=${now.year}&month=${now.month}');
        ApiService.instance.invalidateCache('/holidays?year=${now.year}');
        if (now.month < 12) {
          ApiService.instance.invalidateCache('/holidays?year=${now.year}&month=${now.month + 1}');
        }
      });
    });
    _socket!.on('schedule_updated',    (data) {
      _rememberEventEnvelope(data);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (data is Map) {
          final inner = data['data'];
          final payload = inner is Map
              ? Map<String, dynamic>.from(inner)
              : Map<String, dynamic>.from(data);
          _onScheduleChanged?.call(payload);
        }
      });
    });

    _socket!.connect();
  }

  // Debounce timer for persisting last event time — avoids disk write on every socket event
  Timer? _eventPersistTimer;

  Future<String> _loadLastEventTime() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString('socket_last_event_time') ??
        DateTime.now().subtract(const Duration(minutes: 5)).toIso8601String();
  }

  void _rememberEventTime(String timestamp) {
    // Update in-memory immediately — UI is always fresh
    _lastEventTime = timestamp;
    // Debounce disk write: persist only after 5s of quiet to avoid per-event I/O
    _eventPersistTimer?.cancel();
    _eventPersistTimer = Timer(const Duration(seconds: 5), () {
      SharedPreferences.getInstance().then(
        (p) => p.setString('socket_last_event_time', timestamp),
      );
    });
  }

  void _rememberEventEnvelope(dynamic data) {
    if (data is Map && data['timestamp'] != null) {
      _rememberEventTime(data['timestamp'].toString());
    }
  }

  void _syncMissedEvents() {
    final since = _lastEventTime;
    if (since == null || _socket?.connected != true) return;
    _socket!.emit('sync_missed_events', {'lastEventTime': since});
  }

  Future<void> _refreshAndReconnect() async {
    if (_activeUserId == null) return;
    try {
      final refreshed = await _api.refreshTokenExplicit();
      if (refreshed) {
        // Dispose old socket and create new one with fresh token
        _socket?.dispose();
        _socket = null;
        await Future.delayed(const Duration(milliseconds: 500));
        await connectSocket(_activeUserId!);
      }
    } catch (_) {}
  }

  // ── Incoming message handler ──────────────────────────────────────────────

  void handleMessage(dynamic data) {
    if (data == null) return;

    // Unwrap server envelope { eventId, timestamp, data: {...} }
    Map<String, dynamic>? msg;
    if (data is Map) {
      final inner = data['data'];
      msg = inner is Map
          ? Map<String, dynamic>.from(inner)
          : Map<String, dynamic>.from(data);
    }
    if (msg == null) return;

    final msgId = msg['id']?.toString();
    if (msgId != null && _isDuplicateMsg('msg_$msgId')) return;

    final msgRoomId = msg['roomId']?.toString();
    final sameRoom  = msgRoomId != null &&
        _currentRoomId != null &&
        msgRoomId == _currentRoomId.toString();

    if (sameRoom) {
      final tempId = msg['tempId']?.toString();
      if (tempId != null) {
        // Replace optimistic temp message
        final idx = _currentMessages.indexWhere(
          (m) => m['tempId']?.toString() == tempId ||
                 m['id']?.toString() == tempId,
        );
        if (idx >= 0) {
          final updated = List<dynamic>.from(_currentMessages);
          updated[idx] = msg;
          _currentMessages = updated;
          notifyListeners();
          _updateRoomLastMessage(msg);
          return;
        }
      }

      final exists = _currentMessages
          .any((m) => m['id']?.toString() == msgId);
      if (!exists) {
        _currentMessages = [..._currentMessages, msg];
        // Auto-mark as read since user is viewing this room
        _api.post('/chat/rooms/$msgRoomId/read')
            .catchError((_) => <String, dynamic>{});
        notifyListeners();
      }
    } else {
      // Message arrived for a different room — schedule room list refresh
      // for after the current frame to avoid setState during build.
      WidgetsBinding.instance.addPostFrameCallback((_) => getMyRooms(silent: true));
    }
    // Always update the room list (unread count, last message preview, sort order)
    _updateRoomLastMessage(msg);
  }

  void handleUpdate(dynamic data) {
    if (data == null) return;
    Map<String, dynamic>? d;
    if (data is Map) {
      final inner = data['data'];
      d = inner is Map
          ? Map<String, dynamic>.from(inner)
          : Map<String, dynamic>.from(data);
    }
    if (d == null) return;
    final payload = d;

    final action = payload['action']?.toString() ?? '';
    final updateKey = action == 'READ_STATUS'
        ? 'upd_read_${payload['roomId']}_${(payload['messageIds'] as List<dynamic>? ?? []).join(',')}_${payload['seenAt']}'
        : 'upd_${payload['id']}_${payload['action']}';
    if (_isDuplicateMsg(updateKey)) return;

    if (action == 'EDITED') {
      // Update message text and mark as edited — works for both sender and receiver
      _currentMessages = _currentMessages.map((m) {
        final msg = m is Map<String, dynamic> ? m : Map<String, dynamic>.from(m as Map);
        if (msg['id']?.toString() == payload['id']?.toString()) {
          return <String, dynamic>{
            ...msg,
            'message': payload['message'],
            'isEdited': true,
            'editedAt': payload['editedAt'],
          };
        }
        return msg;
      }).toList();
      notifyListeners();

    } else if (action == 'READ_STATUS') {
      final ids = (payload['messageIds'] as List<dynamic>? ?? [])
          .map((e) => e.toString()).toSet();
      _currentMessages = _currentMessages.map((m) {
        final msg = m is Map<String, dynamic> ? m : Map<String, dynamic>.from(m as Map);
        return ids.contains(msg['id']?.toString())
            ? <String, dynamic>{...msg, 'deliveryStatus': 'SEEN', 'seenAt': payload['seenAt']}
            : msg;
      }).toList();
      notifyListeners();

    } else if (action == 'DELETED_FOR_EVERYONE' || action == 'DELETED') {
      // Remove from list or show "Message deleted" placeholder
      _currentMessages = _currentMessages.map((m) {
        final msg = m is Map<String, dynamic> ? m : Map<String, dynamic>.from(m as Map);
        if (msg['id']?.toString() == payload['id']?.toString()) {
          return <String, dynamic>{
            ...msg,
            'message': 'Message deleted',
            'isDeleted': true,
          };
        }
        return msg;
      }).toList();
      notifyListeners();

    } else if (action == 'DELETED_FOR_ME') {
      // Only remove from this user's view
      _currentMessages = _currentMessages
          .where((m) => m['id']?.toString() != payload['id']?.toString())
          .toList();
      notifyListeners();
    }
  }

  void handleTyping(dynamic data) {
    if (data == null) return;
    Map<String, dynamic>? d;
    if (data is Map) {
      final inner = data['data'];
      d = inner is Map
          ? Map<String, dynamic>.from(inner)
          : Map<String, dynamic>.from(data);
    }
    if (d == null) return;
    if (d['roomId']?.toString() != _currentRoomId?.toString()) return;
    if (d['userId']?.toString() == _activeUserId?.toString()) return;

    final userId = int.tryParse(d['userId'].toString());
    if (userId == null) return;

    if (d['isTyping'] == true) {
      if (!_typingUsers.contains(userId)) {
        _typingUsers = [..._typingUsers, userId];
      }
    } else {
      _typingUsers = _typingUsers.where((id) => id != userId).toList();
    }
    notifyListeners();
  }

  void registerRealtimeHandlers({
    VoidCallback? onAttendanceChanged,
    VoidCallback? onAnnouncementsChanged,
    VoidCallback? onLeavesChanged,
    void Function(Map<String, dynamic>)? onScheduleChanged,
    void Function(dynamic)? onAnnouncementNew,
    void Function(dynamic)? onAnnouncementUpdate,
  }) {
    _onAttendanceChanged    = onAttendanceChanged;
    _onAnnouncementsChanged = onAnnouncementsChanged;
    _onLeavesChanged        = onLeavesChanged;
    _onScheduleChanged      = onScheduleChanged;
    _onAnnouncementNew      = onAnnouncementNew;
    _onAnnouncementUpdate   = onAnnouncementUpdate;
  }

  void _updateRoomLastMessage(Map<String, dynamic> msg) {
    _rooms = _rooms.map((r) {
      final room = r is Map<String, dynamic> ? r : Map<String, dynamic>.from(r as Map);
      if (room['id']?.toString() == msg['roomId']?.toString()) {
        final isCurrentRoom = msg['roomId']?.toString() == _currentRoomId?.toString();
        final isOwnMessage  = msg['senderId']?.toString() == _activeUserId?.toString();
        return <String, dynamic>{
          ...room,
          'lastMessage':   msg['message'],
          'lastMessageAt': msg['createdAt'],
          'unreadCount': (isCurrentRoom || isOwnMessage)
              ? 0
              : ((room['unreadCount'] ?? 0) as num).toInt() + 1,
        };
      }
      return room;
    }).toList();
    _rooms.sort((a, b) {
      final at = a['lastMessageAt'] ?? a['createdAt'] ?? '';
      final bt = b['lastMessageAt'] ?? b['createdAt'] ?? '';
      return bt.toString().compareTo(at.toString());
    });
    _unreadCount = _rooms.fold(0, (sum, r) => sum + ((r['unreadCount'] ?? 0) as num).toInt());
    notifyListeners();
  }

  void disconnectSocket() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _socketConnected = false;
    _activeUserId = null;
  }

  // Track pending join completers so onConnect can resolve them after reconnect
  final Map<int, Completer<bool>> _pendingJoins = {};

  /// Joins the socket room for [roomId] using ACK-based confirmation.
  /// Returns a Future that resolves to true when the server confirms the join,
  /// or false on timeout/error. Sets _currentRoomId immediately so that
  /// onConnect can re-join automatically after a reconnect.
  Future<bool> joinRoom(int roomId) async {
    _currentRoomId = roomId;
    _markCurrentRoomRead();

    if (_socket?.connected != true) {
      // Not connected yet — onConnect will call joinRoom again automatically.
      return false;
    }

    return _emitJoinWithAck(roomId);
  }

  Future<bool> _emitJoinWithAck(int roomId) async {
    // Cancel any previous pending join for the same room
    _pendingJoins[roomId]?.complete(false);
    _pendingJoins.remove(roomId);

    final completer = Completer<bool>();
    _pendingJoins[roomId] = completer;

    final timer = Timer(const Duration(seconds: 6), () {
      if (!completer.isCompleted) {
        completer.complete(false);
        _pendingJoins.remove(roomId);
      }
    });

    _socket!.emitWithAck(
      'chat:join',
      {'roomId': roomId},
      ack: (dynamic ack) {
        timer.cancel();
        _pendingJoins.remove(roomId);
        if (!completer.isCompleted) {
          final success = ack is Map
              ? (ack['success'] == true || ack['roomId'] != null)
              : (ack != null);
          completer.complete(success);
        }
      },
    );

    return completer.future;
  }

  void markCurrentRoomRead() => _markCurrentRoomRead();

  void _markCurrentRoomRead() {
    if (_currentRoomId == null) return;
    final roomId = _currentRoomId!;
    _rooms = _rooms.map((r) {
      final room = r is Map<String, dynamic> ? r : Map<String, dynamic>.from(r as Map);
      return room['id']?.toString() == roomId.toString()
          ? <String, dynamic>{...room, 'unreadCount': 0}
          : room;
    }).toList();
    _unreadCount = _rooms.fold(0, (sum, r) => sum + ((r['unreadCount'] ?? 0) as num).toInt());
    notifyListeners();
    _api.post('/chat/rooms/$roomId/read').catchError((_) => <String, dynamic>{});
  }

  void leaveRoom(int roomId) {
    if (_socket?.connected == true) {
      _socket!.emit('chat:leave', {'roomId': roomId});
    }
    if (_currentRoomId == roomId) _currentRoomId = null;
    _typingUsers = [];
  }

  // ── Send message — socket-first with HTTP fallback ────────────────────────

  Future<void> sendMessage(int roomId, String text) async {
    final tempId = 'temp_${DateTime.now().millisecondsSinceEpoch}';
    final tempMsg = <String, dynamic>{
      'id':        tempId,
      'tempId':    tempId,
      'roomId':    roomId,
      'message':   text,
      'senderId':  _activeUserId,
      'createdAt': DateTime.now().toIso8601String(),
      'isEdited':  false,
      'isRead':    false,
      '_temp':     true,
    };

    // Optimistic: show immediately
    _currentMessages = [..._currentMessages, tempMsg];
    notifyListeners();

    // ── Try socket first (ACK-based) ────────────────────────────────────────
    if (_socket?.connected == true) {
      final completer = Completer<Map<String, dynamic>?>();
      final timer = Timer(const Duration(seconds: 8), () {
        if (!completer.isCompleted) completer.complete(null);
      });

      _socket!.emitWithAck(
        'chat:send',
        {'roomId': roomId, 'message': text, 'tempId': tempId},
        ack: (dynamic ack) {
          timer.cancel();
          if (!completer.isCompleted) {
            final payload = ack is Map ? Map<String, dynamic>.from(ack) : null;
            completer.complete(payload);
          }
        },
      );

      final ack = await completer.future;
      if (ack != null && ack['success'] == true) {
        final msg = ack['data'] is Map
            ? Map<String, dynamic>.from(ack['data'])
            : null;
        if (msg != null) {
          _replaceTemp(tempId, msg);
          // Register real id in dedup so socket broadcast doesn't duplicate
          final realId = msg['id']?.toString();
          if (realId != null) _processedMsgIds.add('msg_$realId');
          _updateRoomLastMessage(msg);
        }
        return;
      }
      // Socket ACK failed — fall through to HTTP
    }

    // ── HTTP fallback ────────────────────────────────────────────────────────
    try {
      final res = await _api.post(
        '/chat/rooms/$roomId/messages',
        body: {'message': text, 'tempId': tempId},
      );
      if (res['success'] == true) {
        final raw = res['data'];
        Map<String, dynamic>? msg;
        if (raw is Map<String, dynamic>) {
          msg = raw.containsKey('id') ? raw : null;
        } else if (raw is Map) {
          msg = Map<String, dynamic>.from(raw);
        }
        if (msg != null) {
          _replaceTemp(tempId, msg);
          final realId = msg['id']?.toString();
          if (realId != null) _processedMsgIds.add('msg_$realId');
          _updateRoomLastMessage(msg);
        }
      } else {
        _removeTemp(tempId);
      }
    } catch (_) {
      _removeTemp(tempId);
    }
    notifyListeners();
  }

  void _replaceTemp(String tempId, Map<String, dynamic> msg) {
    final idx = _currentMessages.indexWhere(
      (m) => m['id']?.toString() == tempId || m['tempId']?.toString() == tempId,
    );
    if (idx >= 0) {
      final updated = List<dynamic>.from(_currentMessages);
      updated[idx] = msg;
      _currentMessages = updated;
    } else {
      final exists = _currentMessages.any((m) => m['id']?.toString() == msg['id']?.toString());
      if (!exists) _currentMessages = [..._currentMessages, msg];
    }
    notifyListeners();
  }

  void _removeTemp(String tempId) {
    _currentMessages = _currentMessages
        .where((m) => m['id']?.toString() != tempId)
        .toList();
    notifyListeners();
  }

  void emitTyping(bool isTyping) {
    if (_socket?.connected == true && _currentRoomId != null && _activeUserId != null) {
      _socket!.emit('chat:typing', {
        'roomId':   _currentRoomId,
        'userId':   _activeUserId,
        'isTyping': isTyping,
      });
    }
  }

  // ── API Methods ───────────────────────────────────────────────────────────

  Future<void> getMyRooms({bool silent = false}) async {
    if (!silent) {
      _isLoading = true;
      notifyListeners();
    }
    try {
      final res = await _api.get('/chat/rooms');
      if (res['success'] == true) {
        final d = res['data'];
        _rooms = d is List ? d : (d is Map && d['data'] is List ? d['data'] as List : []);
        if (_currentRoomId != null) {
          _rooms = _rooms.map((r) {
            final room = r is Map<String, dynamic> ? r : Map<String, dynamic>.from(r as Map);
            return room['id']?.toString() == _currentRoomId.toString()
                ? <String, dynamic>{...room, 'unreadCount': 0}
                : room;
          }).toList();
        }
        _unreadCount = _rooms.fold(0, (sum, r) => sum + ((r['unreadCount'] ?? 0) as num).toInt());
      } else {
        _error = res['error']?.toString();
      }
    } catch (_) {
      _error = 'Failed to load conversations';
    }
    if (!silent) _isLoading = false;
    notifyListeners();
  }

  Future<List<dynamic>> getAvailableUsers() async {
    try {
      final data = await _api.get('/chat/users');
      if (data['success'] == true) return data['data'] as List<dynamic>? ?? [];
    } catch (_) {}
    return [];
  }

  Future<void> getMessages(int roomId, {bool silent = false}) async {
    // silent=true: background refresh — never wipe visible messages, no spinner.
    // silent=false: first load — show spinner, then populate.
    if (!silent) {
      _isLoading = true;
      // Snapshot current messages so socket events arriving during the API call
      // can be merged back instead of being wiped.
      final preExistingMessages = List<dynamic>.from(_currentMessages);
      _currentMessages = [];
      // Clear dedup cache when loading fresh messages so missed socket events
      // replayed on reconnect are not incorrectly dropped.
      _processedMsgIds.clear();
      notifyListeners();

      try {
        final res = await _api.get('/chat/rooms/$roomId/messages?limit=50');
        if (res['success'] == true) {
          final d = res['data'];
          final fetched = d is List ? d : (d is Map && d['data'] is List ? d['data'] as List : []);

          final fetchedIds = <String>{};
          for (final m in fetched) {
            final id = m['id']?.toString();
            if (id != null) fetchedIds.add(id);
          }
          // Keep any socket-delivered messages that arrived during the fetch
          final extras = preExistingMessages.where((m) {
            final id = m['id']?.toString();
            return id != null && !fetchedIds.contains(id);
          }).toList();

          _currentMessages = [...fetched, ...extras];

          for (final m in _currentMessages) {
            final id = m['id']?.toString();
            if (id != null) _processedMsgIds.add('msg_$id');
          }
          joinRoom(roomId);
          _api.post('/chat/rooms/$roomId/read').catchError((_) => <String, dynamic>{});
          _rooms = _rooms.map((r) {
            final room = r is Map<String, dynamic> ? r : Map<String, dynamic>.from(r as Map);
            return room['id'] == roomId ? <String, dynamic>{...room, 'unreadCount': 0} : room;
          }).toList();
          _unreadCount = _rooms.fold(0, (sum, r) => sum + ((r['unreadCount'] ?? 0) as num).toInt());
        } else {
          _error = res['error']?.toString();
        }
      } catch (_) {
        _error = 'Failed to load messages';
      }
      _isLoading = false;
      notifyListeners();
      return;
    }

    // ── Silent background refresh ─────────────────────────────────────────
    // Fetches latest messages and merges them in without any visible flash.
    try {
      final res = await _api.get('/chat/rooms/$roomId/messages?limit=50');
      if (res['success'] != true) return;

      final d = res['data'];
      final fetched = d is List ? d : (d is Map && d['data'] is List ? d['data'] as List : []);
      if (fetched.isEmpty) return;

      // Build set of IDs already in view
      final existingIds = <String>{};
      for (final m in _currentMessages) {
        final id = m['id']?.toString();
        if (id != null) existingIds.add(id);
      }

      // Only add genuinely new messages — no wipe, no flicker
      final newMessages = <dynamic>[];
      for (final m in fetched) {
        final id = m['id']?.toString();
        if (id == null) continue;
        if (!existingIds.contains(id) && !_processedMsgIds.contains('msg_$id')) {
          newMessages.add(m);
          _processedMsgIds.add('msg_$id');
        }
      }

      // Also update any existing messages whose content changed (edits/deletes)
      // Build O(1) lookup map once — replaces O(n²) firstWhere loop
      final serverById = <String, Map<String, dynamic>>{};
      for (final m in fetched) {
        final id = m['id']?.toString();
        if (id != null) {
          serverById[id] = m is Map<String, dynamic>
              ? m : Map<String, dynamic>.from(m as Map);
        }
      }

      bool anyUpdated = false;
      _currentMessages = _currentMessages.map((m) {
        final msg = m is Map<String, dynamic> ? m : Map<String, dynamic>.from(m as Map);
        final id = msg['id']?.toString();
        if (id == null) return msg;
        final serverMap = serverById[id];
        if (serverMap == null) return msg;
        if (msg['message'] != serverMap['message'] ||
            msg['isEdited'] != serverMap['isEdited'] ||
            msg['isDeleted'] != serverMap['isDeleted'] ||
            msg['deliveryStatus'] != serverMap['deliveryStatus']) {
          anyUpdated = true;
          return serverMap;
        }
        return msg;
      }).toList();

      if (newMessages.isNotEmpty || anyUpdated) {
        _currentMessages = [..._currentMessages, ...newMessages];
        _rooms = _rooms.map((r) {
          final room = r is Map<String, dynamic> ? r : Map<String, dynamic>.from(r as Map);
          return room['id'] == roomId ? <String, dynamic>{...room, 'unreadCount': 0} : room;
        }).toList();
        _unreadCount = _rooms.fold(0, (sum, r) => sum + ((r['unreadCount'] ?? 0) as num).toInt());
        notifyListeners();
      }

      _api.post('/chat/rooms/$roomId/read').catchError((_) => <String, dynamic>{});
    } catch (_) {
      // Silent — never show errors for background refreshes
    }
  }

  Future<int?> createDirectChat(int userId) async {
    try {
      final data = await _api.post('/chat/rooms', body: {
        'type': 'DIRECT',
        'participantIds': [userId],
      });
      if (data['success'] == true) return data['data']['id'] as int?;
    } catch (_) {}
    return null;
  }

  Future<void> getUnreadCount() async {
    try {
      final data = await _api.get('/chat/unread');
      if (data['success'] == true) {
        int count = ((data['data']?['unreadCount'] ?? 0) as num).toInt();
        // If a room is currently open, zero it locally and subtract from server count
        if (_currentRoomId != null) {
          _rooms = _rooms.map((r) {
            final room = r is Map<String, dynamic> ? r : Map<String, dynamic>.from(r as Map);
            return room['id']?.toString() == _currentRoomId.toString()
                ? <String, dynamic>{...room, 'unreadCount': 0}
                : room;
          }).toList();
          // Use rooms-based count (current room is 0)
          _unreadCount = _rooms.fold(0, (sum, r) => sum + ((r['unreadCount'] ?? 0) as num).toInt());
        } else {
          _unreadCount = count;
        }
        notifyListeners();
      }
    } catch (_) {}
  }

  void clearMessages() { _currentMessages = []; notifyListeners(); }
  void clearError()    { _error = null; notifyListeners(); }

  // ── chat:room event handler ───────────────────────────────────────────────
  // Fired by server when: (a) a new room is created for this user, or
  // (b) as the server-side confirmation of a successful chat:join.
  void _handleRoomEvent(dynamic data) {
    if (data == null) return;
    Map<String, dynamic>? payload;
    if (data is Map) {
      final inner = data['data'];
      payload = inner is Map
          ? Map<String, dynamic>.from(inner)
          : Map<String, dynamic>.from(data);
    }
    if (payload == null) return;

    final incomingRoomId = payload['roomId'] is int
        ? payload['roomId'] as int
        : int.tryParse(payload['roomId']?.toString() ?? '');

    // If this is a new room notification (not for the room we're already in),
    // refresh the room list so it shows up immediately.
    if (incomingRoomId != null && incomingRoomId != _currentRoomId) {
      getMyRooms(silent: true);
    }
  }

  // ── Local mutations (called from ChatScreen after HTTP success) ───────────

  void updateMessage(int msgId, String newText) {
    _currentMessages = _currentMessages.map((m) {
      final msg = m is Map<String, dynamic> ? m : Map<String, dynamic>.from(m as Map);
      return msg['id'] == msgId
          ? <String, dynamic>{...msg, 'message': newText, 'isEdited': true}
          : msg;
    }).toList();
    notifyListeners();
  }

  void removeMessage(int msgId) {
    _currentMessages = _currentMessages.where((m) => m['id'] != msgId).toList();
    notifyListeners();
  }

  void markMessageDeletedForEveryone(int msgId) {
    _currentMessages = _currentMessages.map((m) {
      final msg = m is Map<String, dynamic> ? m : Map<String, dynamic>.from(m as Map);
      return msg['id'] == msgId
          ? <String, dynamic>{...msg, 'message': 'Message deleted', 'isDeleted': true}
          : msg;
    }).toList();
    notifyListeners();
  }
}
