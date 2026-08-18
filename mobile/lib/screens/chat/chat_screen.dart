import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'dart:async';
import '../../providers/auth_provider.dart';
import '../../providers/chat_provider.dart';
import '../../services/api_service.dart';
import '../../utils/app_theme.dart';
import '../../widgets/app_widgets.dart';

class ChatScreen extends StatefulWidget {
  final int? roomId;
  final String? roomName;
  final VoidCallback? onBack;
  const ChatScreen({super.key, this.roomId, this.roomName, this.onBack});
  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _ctrl       = TextEditingController();
  final _scrollCtrl = ScrollController();
  final _focusNode  = FocusNode();

  int?   _roomId;
  String _roomName = 'Chat';
  bool   _sending  = false;

  // Edit state
  int?   _editingMsgId;
  String _editingOriginal = '';

  // Track message count to auto-scroll when new messages arrive
  int _prevMessageCount = 0;

  // Polling fallback — fires every 5s when socket is disconnected,
  // and every 30s as a safety-net even when socket IS connected
  // (catches silently missed events from non-persisted emits).
  Timer? _pollTimer;
  Timer? _safetyNetTimer;
  bool   _wasSocketConnected = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final args = ModalRoute.of(context)?.settings.arguments as Map<String, dynamic>?;
      _roomId   = widget.roomId   ?? (args?['roomId']   as int?);
      _roomName = widget.roomName ?? (args?['roomName'] as String?) ?? 'Chat';

      if (_roomId != null) {
        final chat = Provider.of<ChatProvider>(context, listen: false);
        if (widget.roomId != null) {
          // Embedded mode — HRChatScreen already loaded messages, just join socket room
          chat.joinRoom(_roomId!);
        } else {
          // Route navigation mode — load messages fresh
          chat.getMessages(_roomId!);
        }
      }
      setState(() {});
    });

    // Polling fallback — fires every 3s when socket is disconnected
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (!mounted || _roomId == null) return;
      final chat = Provider.of<ChatProvider>(context, listen: false);
      if (!chat.socketConnected) {
        // Offline fallback — silent merge, no flicker
        chat.getMessages(_roomId!, silent: true);
      }
    });

    // Safety-net timer — reloads messages every 8s even when socket is
    // connected, to catch any silently missed real-time events.
    _safetyNetTimer = Timer.periodic(const Duration(seconds: 8), (_) {
      if (!mounted || _roomId == null) return;
      final chat = Provider.of<ChatProvider>(context, listen: false);
      if (chat.socketConnected) {
        chat.getMessages(_roomId!, silent: true);
      }
    });
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _safetyNetTimer?.cancel();
    _ctrl.dispose();
    _scrollCtrl.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          0,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  // ── Send / Edit ─────────────────────────────────────────────────────────────

  Future<void> _send() async {
    final text = _ctrl.text.trim();
    if (text.isEmpty || _roomId == null || _sending) return;

    setState(() => _sending = true);
    _ctrl.clear();

    if (_editingMsgId != null) {
      // Edit existing message via HTTP
      await _editMessage(_editingMsgId!, text);
      setState(() {
        _editingMsgId = null;
        _editingOriginal = '';
      });
    } else {
      // Send new message — provider handles optimistic UI + HTTP
      final chat = Provider.of<ChatProvider>(context, listen: false);
      await chat.sendMessage(_roomId!, text);
      _scrollToBottom();
    }

    setState(() => _sending = false);
  }

  Future<void> _editMessage(int msgId, String newText) async {
    try {
      final res = await ApiService.instance.request(
        'PUT', '/chat/rooms/$_roomId/messages/$msgId',
        body: {'message': newText},
      );
      if (res['success'] == true) {
        if (mounted) {
          Provider.of<ChatProvider>(context, listen: false)
              .updateMessage(msgId, newText);
        }
      } else {
        _showSnack(res['error']?.toString() ?? 'Edit failed', isError: true);
      }
    } catch (_) {
      _showSnack('Network error', isError: true);
    }
  }

  Future<void> _deleteMessageWithScope(int msgId, String scope) async {
    try {
      final res = await ApiService.instance.request(
        'DELETE', '/chat/rooms/$_roomId/messages/$msgId?scope=$scope',
      );
      if (res['success'] == true) {
        if (mounted) {
          final chat = Provider.of<ChatProvider>(context, listen: false);
          if (scope == 'ME') {
            chat.removeMessage(msgId);
          } else {
            chat.markMessageDeletedForEveryone(msgId);
          }
        }
      } else {
        _showSnack(res['error']?.toString() ?? 'Delete failed', isError: true);
      }
    } catch (_) {
      _showSnack('Network error', isError: true);
    }
  }

  void _startEdit(Map<String, dynamic> msg) {
    setState(() {
      _editingMsgId    = msg['id'] as int;
      _editingOriginal = msg['message'] as String? ?? '';
      _ctrl.text       = _editingOriginal;
    });
    _focusNode.requestFocus();
  }

  void _cancelEdit() {
    setState(() {
      _editingMsgId = null;
      _editingOriginal = '';
    });
    _ctrl.clear();
  }

  void _showMsgOptions(BuildContext ctx, Map<String, dynamic> msg, bool isMe) {
    showModalBottomSheet(
      context: ctx,
      backgroundColor: Colors.transparent,
      builder: (_) {
        final isDark = Theme.of(ctx).brightness == Brightness.dark;
        final surface = isDark ? const Color(0xFF1E293B) : Colors.white;
        return Container(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          decoration: BoxDecoration(
            color: surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40, height: 4,
                decoration: BoxDecoration(
                  color: AppTheme.gray300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 16),
              _OptionTile(
                icon: Icons.copy_rounded,
                label: 'Copy',
                color: AppTheme.info,
                onTap: () {
                  Navigator.pop(ctx);
                  Clipboard.setData(ClipboardData(text: msg['message'] ?? ''));
                  _showSnack('Copied');
                },
              ),
              if (isMe) ...[
                _OptionTile(
                  icon: Icons.edit_rounded,
                  label: 'Edit',
                  color: AppTheme.warning,
                  onTap: () {
                    Navigator.pop(ctx);
                    _startEdit(msg);
                  },
                ),
                if (msg['canDeleteForEveryone'] == true)
                  _OptionTile(
                    icon: Icons.delete_rounded,
                    label: 'Delete for everyone',
                    color: AppTheme.danger,
                    onTap: () {
                      Navigator.pop(ctx);
                      _deleteMessageWithScope(msg['id'] as int, 'EVERYONE');
                    },
                  ),
                _OptionTile(
                  icon: Icons.remove_circle_outline_rounded,
                  label: 'Delete for me',
                  color: AppTheme.warning,
                  onTap: () {
                    Navigator.pop(ctx);
                    _deleteMessageWithScope(msg['id'] as int, 'ME');
                  },
                ),
              ],
            ],
          ),
        );
      },
    );
  }

  void _showSnack(String msg, {bool isError = false}) {
    if (!mounted) return;
    showAppSnack(context, msg, isError: isError);
  }

  // ── Header builders ────────────────────────────────────────────────────────

  /// Slim inline header for embedded (shell tab) mode — no back button.
  PreferredSizeWidget _buildEmbeddedHeader(
      ChatProvider chat, bool isDark, Color surface, Color textPrimary) {
    return PreferredSize(
      preferredSize: const Size.fromHeight(60),
      child: Container(
        color: surface,
        child: SafeArea(
          bottom: false,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            child: Row(
              children: [
                Container(
                  width: 38, height: 38,
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                        colors: [Color(0xFF0EA5E9), Color(0xFF38BDF8)]),
                    shape: BoxShape.circle,
                  ),
                  child: Center(
                    child: Text(
                      _roomName.isNotEmpty ? _roomName[0].toUpperCase() : 'H',
                      style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                          fontSize: 15),
                    ),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(child: _buildChatTitle(chat, isDark, textPrimary)),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildChatTitle(ChatProvider chat, bool isDark, Color textPrimary) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          _roomName,
          style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w800,
              color: textPrimary),
        ),
        Row(children: [
          Container(
            width: 6, height: 6,
            decoration: BoxDecoration(
              color: chat.socketConnected ? AppTheme.success : AppTheme.warning,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 4),
          Text(
            chat.typingUsers.isNotEmpty
                ? 'Typing...'
                : (chat.socketConnected ? 'Connected' : 'Reconnecting...'),
            style: TextStyle(
              fontSize: 10,
              color: isDark ? AppTheme.gray400 : AppTheme.gray500,
            ),
          ),
        ]),
      ],
    );
  }

  // ── Build ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final chat     = Provider.of<ChatProvider>(context);
    final myId     = Provider.of<AuthProvider>(context, listen: false).user?['id'];
    final messages = chat.currentMessages.reversed.toList();
    final isDark   = Theme.of(context).brightness == Brightness.dark;
    final bg       = isDark ? const Color(0xFF0F172A) : AppTheme.bg;
    final surface  = isDark ? const Color(0xFF1E293B) : Colors.white;
    final textPrimary = isDark ? Colors.white : AppTheme.primary;

    // Detect socket reconnection → silent background merge
    if (!_wasSocketConnected && chat.socketConnected && _roomId != null) {
      _wasSocketConnected = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _roomId != null) {
          Provider.of<ChatProvider>(context, listen: false).getMessages(_roomId!, silent: true);
        }
      });
    } else if (!chat.socketConnected) {
      _wasSocketConnected = false;
    }

    // Auto-scroll when new messages arrive
    if (messages.length != _prevMessageCount) {
      _prevMessageCount = messages.length;
      _scrollToBottom();
    }

    return Scaffold(
      backgroundColor: bg,
      // ── In embedded mode (shell tab) use a slim inline header ─────────────
      // In route mode (pushed via Navigator) use a standard AppBar with back.
      appBar: widget.onBack != null
          ? _buildEmbeddedHeader(chat, isDark, surface, textPrimary)
          : AppBar(
              backgroundColor: surface,
              foregroundColor: textPrimary,
              elevation: 0,
              leading: IconButton(
                icon: Icon(Icons.arrow_back_ios_new_rounded, size: 18, color: textPrimary),
                onPressed: () {
                  if (Navigator.canPop(context)) Navigator.pop(context);
                },
              ),
              title: _buildChatTitle(chat, isDark, textPrimary),
              bottom: PreferredSize(
                preferredSize: const Size.fromHeight(1),
                child: Divider(height: 1, color: isDark ? Colors.white10 : AppTheme.border),
              ),
            ),
      body: Column(
        children: [
          // ── Messages ─────────────────────────────────────────────────────
          Expanded(
            child: _roomId == null
                ? const Center(child: CircularProgressIndicator(color: AppTheme.accent))
                : chat.isLoading && messages.isEmpty
                    ? const ChatSkeleton()
                    : messages.isEmpty
                        ? Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.chat_bubble_outline_rounded,
                                  size: 52,
                                  color: isDark ? AppTheme.gray600 : AppTheme.gray300,
                                ),
                                const SizedBox(height: 12),
                                Text(
                                  'No messages yet. Say hello! 👋',
                                  style: TextStyle(
                                    color: isDark ? AppTheme.gray400 : AppTheme.gray500,
                                    fontSize: 14,
                                  ),
                                ),
                              ],
                            ),
                          )
                        : ListView.builder(
                            controller: _scrollCtrl,
                            reverse: true,
                            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
                            itemCount: messages.length,
                            itemBuilder: (_, i) {
                              final m   = messages[i] as Map<String, dynamic>;
                              final isMe = m['senderId'].toString() == myId.toString();
                              final isTemp = m['_temp'] == true;
                              return _Bubble(
                                msg: m,
                                isMe: isMe,
                                isDark: isDark,
                                isTemp: isTemp,
                                onLongPress: isTemp
                                    ? null
                                    : () => _showMsgOptions(context, m, isMe),
                              );
                            },
                          ),
          ),

          // ── Edit banner ───────────────────────────────────────────────────
          if (_editingMsgId != null)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: AppTheme.warning.withValues(alpha: 0.1),
              child: Row(children: [
                const Icon(Icons.edit_rounded, size: 16, color: AppTheme.warning),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    'Editing: $_editingOriginal',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppTheme.warning,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
                GestureDetector(
                  onTap: _cancelEdit,
                  child: const Icon(Icons.close_rounded, size: 16, color: AppTheme.warning),
                ),
              ]),
            ),

          // ── Input ─────────────────────────────────────────────────────────
          Container(
            padding: EdgeInsets.fromLTRB(12, 10, 12,
                12 + MediaQuery.of(context).viewInsets.bottom),
            decoration: BoxDecoration(
              color: surface,
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.06),
                  blurRadius: 12,
                  offset: const Offset(0, -4),
                ),
              ],
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Expanded(
                  child: Container(
                    constraints: const BoxConstraints(maxHeight: 120),
                    decoration: BoxDecoration(
                      color: isDark ? const Color(0xFF0F172A) : AppTheme.gray100,
                      borderRadius: BorderRadius.circular(24),
                    ),
                    child: TextField(
                      controller: _ctrl,
                      focusNode: _focusNode,
                      maxLines: null,
                      textCapitalization: TextCapitalization.sentences,
                      onChanged: (value) {
                        Provider.of<ChatProvider>(context, listen: false)
                            .emitTyping(value.trim().isNotEmpty);
                      },
                      style: TextStyle(
                        fontSize: 14,
                        color: isDark ? Colors.white : AppTheme.primary,
                      ),
                      decoration: InputDecoration(
                        hintText: _editingMsgId != null
                            ? 'Edit message...'
                            : 'Type a message...',
                        hintStyle: TextStyle(
                          color: isDark ? AppTheme.gray500 : AppTheme.gray400,
                          fontSize: 14,
                        ),
                        border: InputBorder.none,
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 18,
                          vertical: 12,
                        ),
                      ),
                      onSubmitted: (_) => _send(),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                GestureDetector(
                  onTap: _sending ? null : _send,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 150),
                    width: 44, height: 44,
                    decoration: BoxDecoration(
                      gradient: _sending
                          ? null
                          : const LinearGradient(
                              colors: [Color(0xFF0EA5E9), Color(0xFF38BDF8)],
                            ),
                      color: _sending ? AppTheme.gray300 : null,
                      shape: BoxShape.circle,
                    ),
                    child: _sending
                        ? const Center(
                            child: SizedBox(
                              width: 18, height: 18,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: Colors.white,
                              ),
                            ),
                          )
                        : Icon(
                            _editingMsgId != null
                                ? Icons.check_rounded
                                : Icons.send_rounded,
                            color: Colors.white,
                            size: 20,
                          ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Message Bubble ────────────────────────────────────────────────────────────

class _Bubble extends StatelessWidget {
  final Map<String, dynamic> msg;
  final bool isMe;
  final bool isDark;
  final bool isTemp;
  final VoidCallback? onLongPress;

  const _Bubble({
    required this.msg,
    required this.isMe,
    required this.isDark,
    required this.isTemp,
    required this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    DateTime? dt;
    try {
      dt = DateTime.parse(msg['createdAt'].toString()).toLocal();
    } catch (_) {}
    final isEdited  = msg['isEdited'] == true;
    final isDeleted = msg['isDeleted'] == true;

    return Opacity(
      opacity: isTemp ? 0.6 : 1.0,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(
          mainAxisAlignment: isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            if (!isMe) ...[
              CircleAvatar(
                radius: 15,
                backgroundColor: AppTheme.accent.withValues(alpha: 0.15),
                child: Text(
                  (msg['sender']?['firstName'] as String? ?? '?')[0].toUpperCase(),
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: AppTheme.accent,
                  ),
                ),
              ),
              const SizedBox(width: 8),
            ],
            Flexible(
              child: GestureDetector(
                onLongPress: isDeleted ? null : onLongPress,
                child: Column(
                  crossAxisAlignment:
                      isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
                  children: [
                    if (!isMe)
                      Padding(
                        padding: const EdgeInsets.only(left: 4, bottom: 3),
                        child: Text(
                          msg['sender']?['firstName'] as String? ?? 'User',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: isDark ? AppTheme.gray400 : AppTheme.gray500,
                          ),
                        ),
                      ),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 14,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color: isDeleted
                            ? (isDark ? const Color(0xFF1E293B) : AppTheme.gray100)
                            : (isMe
                                ? AppTheme.primary
                                : (isDark ? const Color(0xFF1E293B) : Colors.white)),
                        borderRadius: BorderRadius.only(
                          topLeft: const Radius.circular(18),
                          topRight: const Radius.circular(18),
                          bottomLeft: Radius.circular(isMe ? 18 : 4),
                          bottomRight: Radius.circular(isMe ? 4 : 18),
                        ),
                        border: isDeleted
                            ? Border.all(color: AppTheme.gray300.withValues(alpha: 0.5))
                            : null,
                        boxShadow: isDeleted ? null : [AppTheme.cardShadow],
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (isDeleted) ...[
                            Icon(Icons.block_rounded, size: 13,
                                color: isDark ? AppTheme.gray500 : AppTheme.gray400),
                            const SizedBox(width: 6),
                          ],
                          Flexible(
                            child: Text(
                              isDeleted
                                  ? 'Message deleted'
                                  : (msg['message'] as String? ?? ''),
                              style: TextStyle(
                                color: isDeleted
                                    ? (isDark ? AppTheme.gray500 : AppTheme.gray400)
                                    : (isMe
                                        ? Colors.white
                                        : (isDark ? Colors.white : AppTheme.gray900)),
                                fontSize: 14,
                                height: 1.4,
                                fontStyle: isDeleted ? FontStyle.italic : FontStyle.normal,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 3),
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (isEdited && !isDeleted) ...[
                          Text(
                            'edited',
                            style: TextStyle(
                              fontSize: 9,
                              color: isDark ? AppTheme.gray600 : AppTheme.gray400,
                              fontStyle: FontStyle.italic,
                            ),
                          ),
                          const SizedBox(width: 4),
                        ],
                        if (isTemp)
                          Icon(
                            Icons.access_time_rounded,
                            size: 10,
                            color: isDark ? AppTheme.gray600 : AppTheme.gray400,
                          )
                        else
                          Text(
                            dt != null ? DateFormat('hh:mm a').format(dt) : '',
                            style: TextStyle(
                              fontSize: 9,
                              color: isDark ? AppTheme.gray600 : AppTheme.gray400,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        if (isMe && !isTemp && !isDeleted) ...[
                          const SizedBox(width: 3),
                          Icon(
                            msg['deliveryStatus'] == 'SEEN'
                                ? Icons.done_all_rounded
                                : Icons.done_rounded,
                            size: 12,
                            color: msg['deliveryStatus'] == 'SEEN'
                                ? AppTheme.accent
                                : (isDark ? AppTheme.gray500 : AppTheme.gray400),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
            ),
            if (isMe) const SizedBox(width: 8),
          ],
        ),
      ),
    );
  }
}

class _OptionTile extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _OptionTile({
    required this.icon,
    required this.label,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: color, size: 18),
      ),
      title: Text(
        label,
        style: TextStyle(fontWeight: FontWeight.w700, color: color),
      ),
      onTap: onTap,
    );
  }
}
