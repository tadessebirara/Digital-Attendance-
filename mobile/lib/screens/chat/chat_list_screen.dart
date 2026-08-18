import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'dart:async';
import '../../providers/chat_provider.dart';
import '../../providers/auth_provider.dart';
import '../../utils/app_theme.dart';
import '../../widgets/app_widgets.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});
  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
    // Auto-refresh room list only when socket is disconnected
    _refreshTimer = Timer.periodic(const Duration(seconds: 15), (_) {
      if (!mounted) return;
      final chat = Provider.of<ChatProvider>(context, listen: false);
      if (!chat.socketConnected) _load();
    });
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _load() async {
    await Provider.of<ChatProvider>(context, listen: false).getMyRooms();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surface = isDark ? const Color(0xFF18212F) : AppTheme.surface;
    final textPrimary = isDark ? Colors.white : AppTheme.gray900;

    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF111827) : AppTheme.bg,
      appBar: AppBar(
        backgroundColor: surface,
        elevation: 0,
        title: Text('Messages',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: textPrimary)),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Divider(height: 1, color: isDark ? Colors.white10 : AppTheme.border),
        ),
        actions: [
          IconButton(
            icon: Icon(Icons.edit_square, color: isDark ? AppTheme.accent : AppTheme.primary),
            onPressed: _showNewChat,
          ),
        ],
      ),
      body: Consumer<ChatProvider>(
        builder: (_, chat, __) {
          if (chat.isLoading && chat.rooms.isEmpty) {
            return const _ChatListSkeleton();
          }
          if (chat.rooms.isEmpty) {
            return AppEmptyState(
              icon: Icons.chat_bubble_outline_rounded,
              title: 'No conversations yet',
              subtitle: 'Start a conversation with HR or a colleague.',
              actionLabel: 'New Chat',
              onAction: _showNewChat,
            );
          }
          return RefreshIndicator(
            onRefresh: _load,
            color: AppTheme.accent,
            child: ListView.separated(
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: chat.rooms.length,
              separatorBuilder: (_, __) => Divider(
                  height: 1,
                  indent: 72,
                  color: isDark ? Colors.white10 : AppTheme.border),
              itemBuilder: (_, i) => _RoomTile(room: chat.rooms[i]),
            ),
          );
        },
      ),
    );
  }

  void _showNewChat() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _NewChatSheet(),
    ).then((_) => _load());
  }
}

class _RoomTile extends StatelessWidget {
  final Map<String, dynamic> room;
  const _RoomTile({required this.room});

  @override
  Widget build(BuildContext context) {
    final isDark     = Theme.of(context).brightness == Brightness.dark;
    final myId       = Provider.of<AuthProvider>(context, listen: false).user?['id'];
    final parts      = room['participants'] as List<dynamic>? ?? [];
    final other      = parts.firstWhere((p) => p['id'] != myId, orElse: () => null);
    final name       = room['type'] == 'DIRECT' && other != null
        ? (other['fullName']?.toString() ?? 'Unknown')
        : (room['name']?.toString() ?? 'Group Chat');
    final role       = other?['role']?.toString() ?? '';
    final initials   = name.isNotEmpty ? name[0].toUpperCase() : '?';
    final unread     = (room['unreadCount'] ?? 0) as int;
    final lastMsg    = room['lastMessage']?.toString() ?? 'No messages yet';
    final lastAt     = room['lastMessageAt'] != null
        ? _fmt(DateTime.parse(room['lastMessageAt'].toString()).toLocal())
        : '';

    final roleColor = role == 'HR'
        ? const Color(0xFF0EA5E9)
        : role == 'ADMIN'
            ? const Color(0xFF8B5CF6)
            : const Color(0xFF10B981);

    final textPrimary   = isDark ? Colors.white : AppTheme.gray900;
    final textSecondary = isDark ? AppTheme.gray400 : AppTheme.gray400;

    return ListTile(
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      leading: Stack(
        children: [
          CircleAvatar(
            radius: 26,
            backgroundColor: isDark
                ? const Color(0xFF1E3A34)
                : AppTheme.primaryFade,
            child: Text(initials,
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: isDark ? AppTheme.accent : AppTheme.primary)),
          ),
          if (unread > 0)
            Positioned(
              right: 0, top: 0,
              child: Container(
                width: 18, height: 18,
                decoration: const BoxDecoration(color: AppTheme.danger, shape: BoxShape.circle),
                child: Center(
                    child: Text('$unread',
                        style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.w800))),
              ),
            ),
        ],
      ),
      title: Row(
        children: [
          Expanded(
            child: Text(name,
                style: TextStyle(
                    fontSize: 15,
                    fontWeight: unread > 0 ? FontWeight.w700 : FontWeight.w600,
                    color: textPrimary)),
          ),
          if (role.isNotEmpty) ...[
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: roleColor.withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Text(role,
                  style: TextStyle(
                      fontSize: 9, fontWeight: FontWeight.w800, color: roleColor, letterSpacing: 0.3)),
            ),
          ],
        ],
      ),
      subtitle: Text(lastMsg,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: TextStyle(
              fontSize: 13,
              color: unread > 0
                  ? (isDark ? Colors.white70 : AppTheme.gray700)
                  : textSecondary,
              fontWeight: unread > 0 ? FontWeight.w500 : FontWeight.normal)),
      trailing: Text(lastAt,
          style: TextStyle(
              fontSize: 11,
              color: unread > 0
                  ? (isDark ? AppTheme.accent : AppTheme.primary)
                  : textSecondary)),
      onTap: () => Navigator.pushNamed(context, '/chat',
          arguments: {'roomId': room['id'], 'roomName': name}),
    );
  }

  String _fmt(DateTime t) {
    final now = DateTime.now();
    if (t.year == now.year && t.month == now.month && t.day == now.day) {
      return DateFormat('hh:mm a').format(t);
    }
    if (t.year == now.year && t.month == now.month && t.day == now.day - 1) {
      return 'Yesterday';
    }
    return DateFormat('MMM d').format(t);
  }
}

// ── Chat list skeleton ────────────────────────────────────────────────────────
class _ChatListSkeleton extends StatelessWidget {
  const _ChatListSkeleton();

  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: ListView.separated(
        padding: const EdgeInsets.symmetric(vertical: 8),
        itemCount: 6,
        separatorBuilder: (_, __) => const Divider(height: 1, indent: 72),
        itemBuilder: (_, __) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Row(children: [
            ShimmerBox(width: 52, height: 52, radius: 26),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              ShimmerBox(width: 140, height: 14),
              const SizedBox(height: 6),
              ShimmerBox(width: 200, height: 12),
            ])),
            const SizedBox(width: 8),
            ShimmerBox(width: 36, height: 10),
          ]),
        ),
      ),
    );
  }
}

class _NewChatSheet extends StatefulWidget {
  const _NewChatSheet();
  @override
  State<_NewChatSheet> createState() => _NewChatSheetState();
}

class _NewChatSheetState extends State<_NewChatSheet> {
  List<dynamic> _users = [];
  bool _loading = true;
  String _search = '';

  @override
  void initState() {
    super.initState();
    _loadUsers();
  }

  Future<void> _loadUsers() async {
    final users = await Provider.of<ChatProvider>(context, listen: false).getAvailableUsers();
    if (mounted) setState(() { _users = users; _loading = false; });
  }

  Future<void> _start(Map<String, dynamic> user) async {
    final chat   = Provider.of<ChatProvider>(context, listen: false);
    final roomId = await chat.createDirectChat(user['id'] as int);
    if (!mounted) return;
    Navigator.pop(context);
    if (roomId != null) {
      Navigator.pushNamed(context, '/chat', arguments: {'roomId': roomId, 'roomName': user['fullName']});
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final surface = isDark ? const Color(0xFF18212F) : AppTheme.surface;
    final textPrimary = isDark ? Colors.white : AppTheme.gray900;

    final filtered = _users.where((u) =>
        _search.isEmpty ||
        (u['fullName']?.toString().toLowerCase().contains(_search.toLowerCase()) ?? false))
        .toList();

    return Container(
      height: MediaQuery.of(context).size.height * 0.75,
      decoration: BoxDecoration(
        color: surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: Column(
        children: [
          const SizedBox(height: 8),
          Container(
            width: 40, height: 4,
            decoration: BoxDecoration(
                color: isDark ? Colors.white24 : AppTheme.gray200,
                borderRadius: BorderRadius.circular(2))),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            child: Row(children: [
              Text('New Message',
                  style: TextStyle(
                      fontSize: 18, fontWeight: FontWeight.w800, color: textPrimary)),
              const Spacer(),
              IconButton(
                  icon: Icon(Icons.close,
                      color: isDark ? AppTheme.gray400 : AppTheme.gray500),
                  onPressed: () => Navigator.pop(context)),
            ]),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: TextField(
              onChanged: (v) => setState(() => _search = v),
              style: TextStyle(color: isDark ? Colors.white : AppTheme.primary),
              decoration: InputDecoration(
                hintText: 'Search contacts...',
                prefixIcon: const Icon(Icons.search, size: 18),
                filled: true,
                fillColor: isDark ? const Color(0xFF223042) : AppTheme.gray100,
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none),
                contentPadding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Expanded(
            child: _loading
                ? Shimmer(
                    child: ListView.builder(
                      itemCount: 5,
                      itemBuilder: (_, __) => Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                        child: Row(children: [
                          ShimmerBox(width: 44, height: 44, radius: 22),
                          const SizedBox(width: 12),
                          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            ShimmerBox(width: 130, height: 13),
                            const SizedBox(height: 6),
                            ShimmerBox(width: 80, height: 11),
                          ])),
                        ]),
                      ),
                    ),
                  )
                : filtered.isEmpty
                    ? AppEmptyState(
                        icon: Icons.person_search_rounded,
                        title: 'No contacts found',
                        subtitle: 'Try a different search term.',
                      )
                    : ListView.builder(
                        itemCount: filtered.length,
                        itemBuilder: (_, i) {
                          final u = filtered[i] as Map<String, dynamic>;
                          final name = u['fullName']?.toString() ?? 'Unknown';
                          final role = u['role']?.toString() ?? '';
                          return ListTile(
                            leading: CircleAvatar(
                              backgroundColor: isDark
                                  ? const Color(0xFF1E3A34)
                                  : AppTheme.primaryFade,
                              child: Text(
                                name.isNotEmpty ? name[0].toUpperCase() : '?',
                                style: TextStyle(
                                    color: isDark ? AppTheme.accent : AppTheme.primary,
                                    fontWeight: FontWeight.w700),
                              ),
                            ),
                            title: Text(name,
                                style: TextStyle(
                                    fontWeight: FontWeight.w600,
                                    color: textPrimary)),
                            subtitle: Text(role,
                                style: const TextStyle(
                                    fontSize: 12, color: AppTheme.gray400)),
                            onTap: () => _start(u),
                          );
                        },
                      ),
          ),
        ],
      ),
    );
  }
}
