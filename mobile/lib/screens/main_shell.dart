import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import 'dashboard_screen.dart';
import 'attendance/attendance_history_screen.dart';
import 'qr_scanner_screen.dart';
import 'profile/profile_screen.dart';
import 'chat/hr_chat_screen.dart';
import 'leave/leave_management_screen.dart';
import 'alerts_screen.dart';
import 'schedule/schedule_screen.dart';
import '../providers/attendance_provider.dart';
import '../providers/announcement_provider.dart';
import '../providers/chat_provider.dart';
import '../providers/leave_provider.dart';
import '../providers/auth_provider.dart';
import '../providers/schedule_provider.dart';
import '../providers/app_config_provider.dart';
import '../providers/location_provider.dart';
import '../utils/app_strings.dart';
import '../utils/app_theme.dart';
import '../utils/permission_handler.dart';
import '../widgets/app_widgets.dart';

// ── Constants ──────────────────────────────────────────────────────────────────
const double _kNavBarHeight = 72.0;
const double _kFabSize = 60.0;
const double _kNotchCircleRadius = 38.0;
const double _kNotchCenterOffset = 14.0; // circle center above bar top
const double _kSafeAreaBottom = 10.0;
const double _kBarCornerRadius = 26.0;

// ── MainShell ──────────────────────────────────────────────────────────────────

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> with WidgetsBindingObserver {
  int _index = 0;
  late final List<Widget> _pages;
  /// Notifier shared between DashboardScreen and QRScannerScreen.
  /// Dashboard writes the intended action ('CHECK_IN' / 'CHECK_OUT'),
  /// QR scanner reads it to enforce the correct flow.
  final _qrActionNotifier = ValueNotifier<String?>(null);

  @override
  void initState() {
    super.initState();
    _pages = [
      DashboardScreen(onChatTap: () => _onTap(6), onNavigate: _onTap, qrActionNotifier: _qrActionNotifier),
      const AlertsScreen(),
      const LeaveManagementScreen(),
      QRScannerScreen(onBack: () => _onTap(0), intendedActionNotifier: _qrActionNotifier),
      const AttendanceHistoryScreen(),
      const ScheduleScreen(),
      HRChatScreen(onBack: () => _onTap(0)),
      const ProfileScreen(),
    ];
    WidgetsBinding.instance.addObserver(this);
    _refreshData();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // Start background GPS streaming — runs for the entire session
      Provider.of<LocationProvider>(context, listen: false).start();

      final auth = Provider.of<AuthProvider>(context, listen: false);
      final chat = Provider.of<ChatProvider>(context, listen: false);
      final appConfig = Provider.of<AppConfigProvider>(context, listen: false);
      final userId = auth.user?['id'];
      if (userId != null && !chat.socketConnected) {
        chat.setAppConfig(appConfig);
        chat.connectSocket(userId as int);
      }
      Future.delayed(const Duration(milliseconds: 800), () {
        if (mounted) AppPermissionHandler.requestOnStartup(context);
      });
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _qrActionNotifier.dispose();
    // Stop GPS streaming when shell is disposed (logout)
    Provider.of<LocationProvider>(context, listen: false).stop();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      // Silent background refresh — no spinners, no flicker
      final att  = Provider.of<AttendanceProvider>(context, listen: false);
      final ann  = Provider.of<AnnouncementProvider>(context, listen: false);
      final chat = Provider.of<ChatProvider>(context, listen: false);
      att.getTodayStatus();
      att.getMonthStats();
      ann.getAnnouncements(silent: true);
      chat.getUnreadCount();
    }
  }

  void _refreshData() {
    final att      = Provider.of<AttendanceProvider>(context, listen: false);
    final ann      = Provider.of<AnnouncementProvider>(context, listen: false);
    final chat     = Provider.of<ChatProvider>(context, listen: false);
    final leave    = Provider.of<LeaveProvider>(context, listen: false);
    final schedule = Provider.of<ScheduleProvider>(context, listen: false);

    // Critical path — visible on dashboard immediately
    att.getTodayStatus();
    att.getMonthStats();
    ann.getAnnouncements();
    chat.getUnreadCount();

    // Deferred — not visible until user navigates to those tabs
    Future.delayed(const Duration(milliseconds: 800), () {
      if (!mounted) return;
      leave.getMyLeaves();
      leave.getLeaveBalance();
      schedule.getMySchedule();
    });

    chat.registerRealtimeHandlers(
      onAttendanceChanged: () { att.getTodayStatus(); att.getMonthStats(); att.getMyAttendance(refresh: true); },
      onAnnouncementsChanged: ann.getAnnouncements,
      onAnnouncementNew:    ann.onSocketNew,
      onAnnouncementUpdate: ann.onSocketUpdate,
      onLeavesChanged: () { leave.getMyLeaves(); leave.getLeaveBalance(); },
      onScheduleChanged: (payload) => schedule.applySocketSchedule(payload),
    );
  }

  void _onTap(int i) {
    if (i == _index) return;
    HapticFeedback.lightImpact();
    setState(() => _index = i);
    if (i == 6) {
      final chat = Provider.of<ChatProvider>(context, listen: false);
      chat.markCurrentRoomRead();
      if (chat.currentRoomId != null) chat.getMessages(chat.currentRoomId!);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final safeBottom = MediaQuery.of(context).padding.bottom;

    // FAB vertical center: sits inside the notch, elevated above bar top
    final fabCenterFromBottom = safeBottom + _kSafeAreaBottom + _kNavBarHeight - _kNotchCenterOffset;
    final fabBottom = fabCenterFromBottom - (_kFabSize / 2);

    // Total height occupied by nav bar + safe area (for page bottom padding)
    final navTotalHeight = safeBottom + _kSafeAreaBottom + _kNavBarHeight;

    return Scaffold(
      body: Stack(children: [
        // ── Page content (with bottom padding so nothing hides behind nav) ──
        Positioned.fill(
          child: Container(
            decoration: BoxDecoration(
              gradient: isDark
                  ? const LinearGradient(
                      colors: [Color(0xFF0F172A), Color(0xFF111827)],
                      begin: Alignment.topCenter, end: Alignment.bottomCenter)
                  : AppTheme.primaryGradient,
            ),
            child: Column(
              children: [
                // Offline banner — only rebuilds when socketConnected changes, not every message
                Selector<ChatProvider, bool>(
                  selector: (_, chat) => chat.socketConnected,
                  builder: (_, connected, __) => ConnectionBanner(isOffline: !connected),
                ),
                Expanded(
                  child: Padding(
                    padding: EdgeInsets.only(bottom: navTotalHeight + 8),
                    child: IndexedStack(index: _index, children: _pages),
                  ),
                ),
              ],
            ),
          ),
        ),
        // ── Bottom nav bar ──
        Positioned(
          left: 12, right: 12, bottom: _kSafeAreaBottom,
          child: _BottomNav(current: _index, onTap: _onTap, isDark: isDark),
        ),
        // ── Floating QR button ──
        if (_index != 3)
          Positioned(
            left: 0, right: 0, bottom: fabBottom,
            child: Center(
              child: Selector<AttendanceProvider, _QrFabState>(
                selector: (_, att) {
                  if (att.isCheckedOut) return _QrFabState.done;
                  if (!att.checkInWindowOpen && !att.isCheckedIn) return _QrFabState.disabled;
                  if (att.canCheckIn || att.canCheckOut) return _QrFabState.active;
                  return _QrFabState.disabled;
                },
                builder: (_, fabState, __) => _QrFab(
                  state: fabState,
                  onTap: () => _onTap(3),
                ),
              ),
            ),
          ),
      ]),
    );
  }
}

// ── QR Floating Action Button ──────────────────────────────────────────────────

enum _QrFabState { active, disabled, done }

class _QrFab extends StatelessWidget {
  final VoidCallback onTap;
  final _QrFabState state;
  const _QrFab({required this.onTap, required this.state});

  @override
  Widget build(BuildContext context) {
    final isActive   = state == _QrFabState.active;
    final isDone     = state == _QrFabState.done;
    final isDisabled = state == _QrFabState.disabled;

    return GestureDetector(
      // Still tappable even when disabled — QR screen will explain the reason
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutCubic,
        width: _kFabSize,
        height: _kFabSize,
        decoration: BoxDecoration(
          gradient: isActive
              ? AppTheme.accentGradient
              : isDone
                  ? AppTheme.successGradient
                  : null,
          color: isDisabled ? AppTheme.gray300 : null,
          shape: BoxShape.circle,
          border: Border.all(
            color: isActive
                ? Colors.white.withValues(alpha: 0.20)
                : isDisabled
                    ? AppTheme.gray200
                    : Colors.white.withValues(alpha: 0.25),
            width: 1.5,
          ),
          boxShadow: isActive
              ? AppTheme.shadowAccent(AppTheme.accent)
              : isDone
                  ? AppTheme.shadowAccent(AppTheme.success)
                  : AppTheme.shadowSm,
        ),
        child: Stack(
          alignment: Alignment.center,
          children: [
            Icon(
              isDone
                  ? Icons.check_circle_rounded
                  : Icons.qr_code_scanner_rounded,
              color: isDisabled ? AppTheme.gray400 : Colors.white,
              size: 26,
            ),
            // Disabled lock badge
            if (isDisabled)
              Positioned(
                right: 8, top: 8,
                child: Container(
                  width: 14, height: 14,
                  decoration: const BoxDecoration(
                    color: AppTheme.gray500,
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.lock_rounded, color: Colors.white, size: 8),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ── Bottom Navigation Bar ──────────────────────────────────────────────────────

class _BottomNav extends StatelessWidget {
  final int current;
  final ValueChanged<int> onTap;
  final bool isDark;

  const _BottomNav({required this.current, required this.onTap, required this.isDark});

  @override
  Widget build(BuildContext context) {
    final bgColor = isDark ? const Color(0xFF0F172A) : Colors.white;
    final s = AppStrings.of(context);
    // Notch visible width at bar top edge ≈ 2 * sqrt(r² - offset²)
    final notchVisibleWidth = 2.0 * math.sqrt(
      _kNotchCircleRadius * _kNotchCircleRadius - _kNotchCenterOffset * _kNotchCenterOffset,
    );

    return SizedBox(
      height: _kNavBarHeight,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          // ── Notched background shape ──
          Positioned.fill(
            child: CustomPaint(
              painter: _NotchedNavPainter(
                color: bgColor,
                notchCircleRadius: _kNotchCircleRadius,
                notchCenterOffset: _kNotchCenterOffset,
                isDark: isDark,
              ),
            ),
          ),
          // ── Navigation items ──
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6),
            child: Row(children: [
              // ── Left group (3 items) ──
              Expanded(
                flex: 3,
                child: Row(children: [
                  Expanded(child: _NavItem(icon: Icons.space_dashboard_rounded, label: s.navHome,     index: 0, current: current, onTap: onTap, isDark: isDark)),
                  Expanded(child: _NavItem(icon: Icons.notifications_none_rounded, label: s.navAlerts, index: 1, current: current, onTap: onTap, isDark: isDark)),
                  Expanded(child: _NavItem(icon: Icons.event_note_rounded,         label: s.navLeave,  index: 2, current: current, onTap: onTap, isDark: isDark)),
                ]),
              ),
              // ── Center notch gap ──
              SizedBox(width: notchVisibleWidth + 12),
              // ── Right group (4 items) ──
              Expanded(
                flex: 4,
                child: Row(children: [
                  Expanded(child: _NavItem(icon: Icons.history_rounded,          label: s.navHistory,  index: 4, current: current, onTap: onTap, isDark: isDark)),
                  Expanded(child: _NavItem(icon: Icons.calendar_month_rounded,   label: s.navSchedule, index: 5, current: current, onTap: onTap, isDark: isDark)),
                  Expanded(child: _NavItem(
                    icon: Icons.chat_bubble_outline_rounded,
                    label: s.navChat,
                    index: 6,
                    current: current,
                    onTap: onTap,
                    isDark: isDark,
                    badge: Consumer<ChatProvider>(
                      builder: (_, chat, __) => chat.unreadCount > 0
                          ? Container(
                              width: 16, height: 16,
                              decoration: const BoxDecoration(color: AppTheme.coral, shape: BoxShape.circle),
                              child: Center(
                                child: Text(
                                  chat.unreadCount > 9 ? '9+' : '${chat.unreadCount}',
                                  style: const TextStyle(color: Colors.white, fontSize: 8, fontWeight: FontWeight.w900),
                                ),
                              ),
                            )
                          : const SizedBox.shrink(),
                    ),
                  )),
                  Expanded(child: _NavItem(icon: Icons.person_outline_rounded,   label: s.navProfile,  index: 7, current: current, onTap: onTap, isDark: isDark)),
                ]),
              ),
            ]),
          ),
        ],
      ),
    );
  }
}

// ── Navigation Item ────────────────────────────────────────────────────────────

class _NavItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final int index;
  final int current;
  final ValueChanged<int> onTap;
  final bool isDark;
  final Widget? badge;

  const _NavItem({
    required this.icon,
    required this.label,
    required this.index,
    required this.current,
    required this.onTap,
    required this.isDark,
    this.badge,
  });

  @override
  Widget build(BuildContext context) {
    final active = current == index;
    final activeBg = isDark
        ? AppTheme.accent.withValues(alpha: 0.12)
        : AppTheme.tealSoft;
    const activeColor = AppTheme.accent;
    final inactiveColor = isDark ? AppTheme.gray500 : AppTheme.gray400;

    return GestureDetector(
      onTap: () => onTap(index),
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOutCubic,
        transform: active
            ? (Matrix4.identity()..scale(1.05))
            : Matrix4.identity(),
        transformAlignment: Alignment.center,
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Stack(
                clipBehavior: Clip.none,
                children: [
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 220),
                    curve: Curves.easeOutCubic,
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                    decoration: BoxDecoration(
                      color: active ? activeBg : Colors.transparent,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Icon(
                      icon,
                      size: 22,
                      color: active ? activeColor : inactiveColor,
                    ),
                  ),
                  if (badge != null)
                    Positioned(top: -3, right: -4, child: badge!),
                ],
              ),
              const SizedBox(height: 2),
              // Label: FittedBox ensures text shrinks instead of truncating
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  label,
                  maxLines: 1,
                  softWrap: false,
                  overflow: TextOverflow.visible,
                  style: TextStyle(
                    fontSize: 10.5,
                    fontWeight: active ? FontWeight.w700 : FontWeight.w500,
                    color: active ? activeColor : inactiveColor,
                    letterSpacing: 0.1,
                    height: 1.2,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Notched Navigation Bar Painter ─────────────────────────────────────────────

class _NotchedNavPainter extends CustomPainter {
  final Color color;
  final double notchCircleRadius;
  final double notchCenterOffset;
  final bool isDark;

  const _NotchedNavPainter({
    required this.color,
    required this.notchCircleRadius,
    required this.notchCenterOffset,
    required this.isDark,
  });

  @override
  void paint(Canvas canvas, Size size) {
    final barRadius = Radius.circular(_kBarCornerRadius);
    final centerX = size.width / 2;
    // Circle center sits above bar top, creating a smooth U-notch
    final circleCenterY = -notchCenterOffset;

    // ── Main bar shape (rounded rect) ──
    final barPath = Path()
      ..addRRect(RRect.fromRectAndRadius(
        Rect.fromLTWH(0, 0, size.width, size.height),
        barRadius,
      ));

    // ── Smooth circle cutout for the notch ──
    final notchPath = Path()
      ..addOval(Rect.fromCircle(
        center: Offset(centerX, circleCenterY),
        radius: notchCircleRadius,
      ));

    // Subtract notch from bar
    final shapePath = Path.combine(PathOperation.difference, barPath, notchPath);

    // ── Layer 1: Wide soft shadow (depth) ──
    final softShadowPath = Path()
      ..addRRect(RRect.fromRectAndRadius(
        Rect.fromLTWH(0, 4, size.width, size.height),
        barRadius,
      ));
    canvas.drawPath(softShadowPath, Paint()
      ..color = Colors.black.withValues(alpha: isDark ? 0.25 : 0.06)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 28));

    // ── Layer 2: Tight shadow (definition) ──
    final tightShadowPath = Path()
      ..addRRect(RRect.fromRectAndRadius(
        Rect.fromLTWH(0, 2, size.width, size.height),
        barRadius,
      ));
    canvas.drawPath(tightShadowPath, Paint()
      ..color = Colors.black.withValues(alpha: isDark ? 0.18 : 0.04)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10));

    // ── Fill the bar ──
    canvas.drawPath(shapePath, Paint()..color = color);

    // ── Subtle top highlight (glass effect) ──
    final highlightPaint = Paint()
      ..shader = LinearGradient(
        colors: [
          Colors.white.withValues(alpha: isDark ? 0.03 : 0.6),
          Colors.white.withValues(alpha: 0),
        ],
        begin: Alignment.topCenter,
        end: Alignment.center,
      ).createShader(Rect.fromLTWH(0, 0, size.width, size.height * 0.5));
    canvas.drawPath(shapePath, highlightPaint);

    // ── Subtle border stroke ──
    final borderColor = isDark
        ? const Color(0xFF263244)
        : Colors.black.withValues(alpha: 0.06);
    canvas.drawPath(shapePath, Paint()
      ..color = borderColor
      ..style = PaintingStyle.stroke
      ..strokeWidth = 0.8);
  }

  @override
  bool shouldRepaint(_NotchedNavPainter o) =>
      o.color != color || o.notchCircleRadius != notchCircleRadius ||
      o.notchCenterOffset != notchCenterOffset || o.isDark != isDark;
}
