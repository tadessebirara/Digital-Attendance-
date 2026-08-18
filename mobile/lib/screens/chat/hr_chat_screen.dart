// ignore_for_file: use_build_context_synchronously
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/chat_provider.dart';
import '../../providers/auth_provider.dart';
import '../../utils/app_theme.dart';
import 'chat_screen.dart';

/// Embedded HR chat screen — lives inside the IndexedStack tab.
/// Finds or creates a direct chat with HR and shows it inline.
class HRChatScreen extends StatefulWidget {
  final VoidCallback? onBack;
  const HRChatScreen({super.key, this.onBack});
  @override
  State<HRChatScreen> createState() => _HRChatScreenState();
}

class _HRChatScreenState extends State<HRChatScreen> {
  bool _loading = true;
  String? _error;
  int? _roomId;
  String _roomName = 'HR';

  // Polling fallback — only fires when socket is disconnected (2s).
  // Safety-net fires every 60s when connected — socket missed-event replay
  // handles gaps; this is just a last-resort backstop.
  Timer? _pollTimer;
  Timer? _safetyNetTimer;
  bool _wasSocketConnected = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _openHRChat());
    // Polling fallback — fires every 3s when socket is disconnected,
    // and every 8s as a safety-net even when socket IS connected
    // (catches silently missed events — network blips, server restarts).
    _pollTimer = Timer.periodic(const Duration(seconds: 3), (_) {
      if (!mounted || _roomId == null) return;
      final chat = Provider.of<ChatProvider>(context, listen: false);
      if (!chat.socketConnected) {
        chat.getMessages(_roomId!, silent: true);
      }
    });
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
    super.dispose();
  }

  Future<void> _openHRChat() async {
    if (!mounted) return;
    setState(() { _loading = true; _error = null; });

    try {
      final chat = Provider.of<ChatProvider>(context, listen: false);
      final myId = Provider.of<AuthProvider>(context, listen: false).user?['id'];

      // Use already-loaded rooms if available — skip network round trip
      List<dynamic> rooms = chat.rooms;
      if (rooms.isEmpty) {
        await chat.getMyRooms();
        rooms = chat.rooms;
      }

      // Find existing room with hr@company.com specifically
      Map<String, dynamic>? hrRoom;
      for (final room in rooms) {
        final parts = room['participants'] as List<dynamic>? ?? [];
        final others = parts.where((p) => p['id']?.toString() != myId?.toString()).toList();
        // Must be a direct room with exactly one other person who is hr@company.com
        final hasRealHR = others.length == 1 &&
            others.first['email']?.toString() == 'hr@company.com';
        if (hasRealHR) { hrRoom = room as Map<String, dynamic>; break; }
      }

      if (hrRoom != null) {
        final parts = hrRoom['participants'] as List<dynamic>? ?? [];
        final other = parts.firstWhere(
          (p) => p['id']?.toString() != myId?.toString(), orElse: () => null);
        final roomId = hrRoom['id'] as int;

        // Show chat shell immediately — don't wait for messages
        chat.joinRoom(roomId);
        setState(() {
          _roomId   = roomId;
          _roomName = other?['fullName']?.toString() ?? 'HR Manager';
          _loading  = false;
        });

        // Load messages in background — silent if we already have some
        final alreadyHasMessages = chat.currentMessages.isNotEmpty;
        chat.getMessages(roomId, silent: alreadyHasMessages);
        return;
      }

      // No existing room — find hr@company.com and create one
      final users = await chat.getAvailableUsers();
      final hrUser = users.firstWhere(
        (u) => u['email']?.toString() == 'hr@company.com',
        orElse: () => null,
      );

      if (hrUser == null) {
        setState(() { _loading = false; _error = 'No HR staff available at this time.\nPlease try again later.'; });
        return;
      }

      final roomId = await chat.createDirectChat(hrUser['id'] as int);
      if (roomId != null) {
        setState(() {
          _roomId   = roomId;
          _roomName = hrUser['fullName']?.toString() ?? 'HR Manager';
          _loading  = false;
        });
        chat.getMessages(roomId); // new room, no existing messages
      } else {
        setState(() { _loading = false; _error = 'Could not open chat. Try again.'; });
      }
    } catch (_) {
      setState(() { _loading = false; _error = 'Network error. Try again.'; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFF0F172A) : AppTheme.bg;
    final onBack = widget.onBack; // capture before Consumer

    return Consumer<ChatProvider>(
      builder: (ctx, chat, __) {
        // Detect socket reconnection → silent background merge only
        if (!_wasSocketConnected && chat.socketConnected && _roomId != null && !_loading) {
          _wasSocketConnected = true;
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted && _roomId != null) chat.getMessages(_roomId!, silent: true);
          });
        } else if (!chat.socketConnected) {
          _wasSocketConnected = false;
        }

        if (_loading) {
          return Scaffold(
            backgroundColor: bg,
            body: Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(
                width: 64, height: 64,
                decoration: const BoxDecoration(
                  gradient: LinearGradient(colors: [Color(0xFF0EA5E9), Color(0xFF38BDF8)]),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.chat_rounded, size: 28, color: Colors.white),
              ),
              const SizedBox(height: 16),
              Text('Connecting to HR...',
                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700,
                    color: isDark ? Colors.white : AppTheme.primary)),
              const SizedBox(height: 20),
              const CircularProgressIndicator(color: AppTheme.accent, strokeWidth: 3),
            ])),
          );
        }

        if (_error != null) {
          return Scaffold(
            backgroundColor: bg,
            body: Center(child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Container(
                  width: 64, height: 64,
                  decoration: BoxDecoration(
                    color: AppTheme.danger.withValues(alpha: 0.1), shape: BoxShape.circle),
                  child: const Icon(Icons.chat_bubble_outline_rounded, size: 28, color: AppTheme.danger),
                ),
                const SizedBox(height: 16),
                Text(_error!, textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 14, color: isDark ? Colors.white : AppTheme.primary)),
                const SizedBox(height: 20),
                ElevatedButton.icon(
                  onPressed: _openHRChat,
                  icon: const Icon(Icons.refresh_rounded),
                  label: const Text('Try Again'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primary, foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                ),
              ]),
            )),
          );
        }

        return ChatScreen(roomId: _roomId, roomName: _roomName, onBack: onBack);
      },
    );
  }
}
