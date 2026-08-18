import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../providers/announcement_provider.dart';
import '../providers/attendance_provider.dart';
import '../providers/auth_provider.dart';
import '../providers/chat_provider.dart';
import '../services/api_service.dart';
import '../services/offline_service.dart';
import '../utils/app_strings.dart';
import '../utils/app_theme.dart';
import '../utils/ethiopian_calendar.dart';
import '../utils/permission_handler.dart';
import '../widgets/app_widgets.dart';

class DashboardScreen extends StatefulWidget {
  final VoidCallback? onChatTap;
  final ValueChanged<int>? onNavigate;
  /// Shared notifier for communicating the intended QR action to QRScannerScreen.
  final ValueNotifier<String?>? qrActionNotifier;

  const DashboardScreen({super.key, this.onChatTap, this.onNavigate, this.qrActionNotifier});

  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  bool _isOffline = false;
  int _queueCount = 0;

  @override
  void initState() {
    super.initState();
    _checkConnectivity();
  }

  @override
  void dispose() {
    super.dispose();
  }

  Future<void> _checkConnectivity() async {
    final connected = await ApiService.instance.isConnected();
    final count = await OfflineService.instance.getQueueCount();
    if (!mounted) return;
    setState(() {
      _isOffline = !connected;
      _queueCount = count;
    });
  }

  Future<void> _refresh() async {
    await _checkConnectivity();
    if (!mounted) return;
    final att  = context.read<AttendanceProvider>();
    final ann  = context.read<AnnouncementProvider>();
    final chat = context.read<ChatProvider>();
    await Future.wait([
      att.getTodayStatus(),
      att.getMonthStats(),
      ann.getAnnouncements(),
      chat.getUnreadCount(),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    // Use select so the dashboard only rebuilds when exactly these fields change
    final userName   = context.select<AuthProvider, String>(
        (a) => a.user?['firstName']?.toString() ?? 'User');
    final attendance = context.watch<AttendanceProvider>();
    final announcements = context.select<AnnouncementProvider, List<dynamic>>(
        (a) => a.announcements);

    final status    = attendance.todayStatus ?? <String, dynamic>{};
    final stats     = attendance.monthStats  ?? <String, dynamic>{};
    final checkedIn  = attendance.isCheckedIn;
    final checkedOut = attendance.isCheckedOut;
    final percentage = _attendancePercent(stats);
    final todayStatusLabel = status['status']?.toString() ?? '';
    final presentDays = (stats['presentDays'] ?? 0) as int;
    final lateDays    = (stats['lateDays']    ?? 0) as int;
    final absentDays  = (stats['absentDays']  ?? 0) as int;
    final s = AppStrings.of(context);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _refresh,
          color: AppTheme.accent,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(18, 10, 18, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _TopStrip(
                  name: userName,
                  onProfile: () => widget.onNavigate?.call(7),
                  strings: s,
                ),
                const SizedBox(height: 18),
                _AnnouncementHero(
                  announcement: announcements.isNotEmpty
                      ? announcements.first as Map<String, dynamic>
                      : null,
                ),
                const SizedBox(height: 18),
                _CurrentSessionCard(
                  percentage: percentage,
                  isOffline: _isOffline,
                  queueCount: _queueCount,
                  checkedIn: checkedIn,
                  checkedOut: checkedOut,
                  locationLabel: checkedIn ? s.locationVerified : s.readyOnSite,
                  todayStatusLabel: todayStatusLabel,
                  presentDays: presentDays,
                  lateDays: lateDays,
                  absentDays: absentDays,
                  onLeave: attendance.isOnLeave,
                  leaveType: attendance.leaveType,
                  isHoliday: attendance.isHoliday,
                  isHalfDayHoliday: attendance.isHalfDayHoliday,
                  holidayName: attendance.holidayName,
                  strings: s,
                ),
                const SizedBox(height: 18),
                Row(
                  children: [
                    _ActionTile(icon: Icons.qr_code_scanner_rounded,    label: s.scanQR,       onTap: () => widget.onNavigate?.call(3)),
                    const SizedBox(width: 14),
                    _ActionTile(icon: Icons.calendar_today_rounded,      label: s.scheduleShort, onTap: () => widget.onNavigate?.call(5)),
                  ],
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    _ActionTile(icon: Icons.event_note_rounded,          label: s.requestLeave, onTap: () => widget.onNavigate?.call(2)),
                    const SizedBox(width: 14),
                    _ActionTile(icon: Icons.history_toggle_off_rounded,   label: s.history,      onTap: () => widget.onNavigate?.call(4)),
                  ],
                ),
                const SizedBox(height: 22),
                // ── Check In / Check Out (hidden on full-day holiday) ──────
                if (attendance.isHoliday)
                  _HolidayBanner(name: attendance.holidayName)
                else if (attendance.isOffDay && !attendance.isCheckedIn && !attendance.isCheckedOut)
                  _OffDayBanner(strings: s)
                else
                _AttendanceActions(
                  attendance: attendance,
                  status: status,
                  isOffline: _isOffline,
                  s: s,
                  onCheckIn: () {
                    if (attendance.isOnLeave)  { _showToast(s.onLeaveToday(attendance.leaveType ?? 'Leave'), false); return; }
                    if (attendance.isOffDay)   { _showToast(s.notAWorkingDay, false); return; }
                    if (attendance.isCheckedIn || attendance.isCheckedOut) { _showToast(s.alreadyCheckedIn, false); return; }
                    if (!attendance.checkInWindowOpen) {
                      final d = attendance.checkInWindowEnd;
                      final label = d != null
                          ? '${d.hour.toString().padLeft(2,'0')}:${d.minute.toString().padLeft(2,'0')}'
                          : '';
                      _showToast('Check-in window closed at $label. You are absent today.', false);
                      return;
                    }
                    if (!attendance.canCheckIn) { _showToast(s.alreadyCompleted, false); return; }
                    widget.qrActionNotifier?.value = 'CHECK_IN';
                    widget.onNavigate?.call(3);
                  },
                  onCheckOut: () {
                    if (attendance.isOnLeave) { _showToast(s.onLeaveToday(attendance.leaveType ?? 'Leave'), false); return; }
                    if (!attendance.isCheckedIn) { _showToast(s.checkInFirst, false); return; }
                    if (!attendance.checkOutWindowOpen) {
                      final t = attendance.earliestCheckoutTime;
                      final label = t != null ? '${t.hour.toString().padLeft(2,'0')}:${t.minute.toString().padLeft(2,'0')}' : '';
                      _showToast(s.checkOutAvailableAt(label), false);
                      return;
                    }
                    if (_isOffline) { _showToast(s.offlineMessage, false); return; }
                    widget.qrActionNotifier?.value = 'CHECK_OUT';
                    widget.onNavigate?.call(3);
                  },
                  checkInLabel: _checkInSubtitle(attendance, status, s),
                  checkOutLabel: _checkOutSubtitle(attendance, status, s),
                ),
                const SizedBox(height: 18),
                AppCard(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          s.nextAction,
                          style: const TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: AppTheme.gray600),
                        ),
                      ),
                      AnimatedSwitcher(
                        duration: AppTheme.normalDuration,
                        switchInCurve: AppTheme.defaultCurve,
                        switchOutCurve: AppTheme.defaultCurve,
                        child: Text(
                          checkedOut
                              ? s.completed
                              : checkedIn
                                  ? s.lunchOut
                                  : s.startShift,
                          key: ValueKey(checkedIn ? 'in' : checkedOut ? 'out' : 'start'),
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                            color: checkedOut ? AppTheme.success : AppTheme.primary,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  double _attendancePercent(Map<String, dynamic> stats) {
    final present = (stats['presentDays'] ?? stats['presentCount'] ?? 0) as num;
    final late = (stats['lateDays'] ?? 0) as num;
    final total = (stats['totalDays'] ?? 0) as num;
    if (total <= 0) return 0;
    return (((present + late) / total) * 100).clamp(0, 100).toDouble();
  }

  String _timeLabel(dynamic value) {
    if (value == null) return 'Tap it';
    try {
      final dt = DateTime.parse(value.toString()).toLocal();
      final ethTime = toEthiopianTime(dt);
      return ethTime.format();
    } catch (_) {
      return 'Done';
    }
  }

  String _checkInSubtitle(AttendanceProvider att, Map<String, dynamic> status, AppStrings s) {
    if (att.isOnLeave)         return s.onLeave;
    if (att.isHalfDayHoliday)  return s.halfDayHoliday;
    // Already checked in — show the recorded time
    if (att.isCheckedIn || att.isCheckedOut) return _timeLabel(status['clockInTime']);
    // Window closed — employee is absent for today
    if (!att.checkInWindowOpen) {
      final deadline = att.checkInWindowEnd;
      if (deadline != null) {
        final hh = deadline.hour.toString().padLeft(2, '0');
        final mm = deadline.minute.toString().padLeft(2, '0');
        return 'Closed at $hh:$mm — Absent';
      }
      return 'Check-in window closed';
    }
    return s.tapToScan;
  }

  String _checkOutSubtitle(AttendanceProvider att, Map<String, dynamic> status, AppStrings s) {
    if (att.isOnLeave)    return s.onLeave;
    if (att.isCheckedOut) return _timeLabel(status['clockOutTime']);
    if (!att.isCheckedIn) return s.checkInFirst;
    // Before shift end — show when checkout opens
    if (!att.checkOutWindowOpen) {
      final t = att.shiftEndTime;
      if (t != null) {
        final hh = t.hour.toString().padLeft(2, '0');
        final mm = t.minute.toString().padLeft(2, '0');
        return s.checkOutAvailableAt('$hh:$mm');
      }
      return s.checkOutTooEarly;
    }
    // Window open — show when it closes (shiftEnd + 2h)
    final end = att.checkoutWindowEnd;
    if (end != null) {
      final hh = end.hour.toString().padLeft(2, '0');
      final mm = end.minute.toString().padLeft(2, '0');
      return s.windowClosesAt('$hh:$mm');
    }
    return s.tapToScan;
  }

  void _showToast(String msg, bool success) {
    showAppSnack(context, msg, isError: !success);
  }
}

class _TopStrip extends StatelessWidget {
  final String name;
  final VoidCallback onProfile;
  final AppStrings strings;

  const _TopStrip({
    required this.name,
    required this.onProfile,
    required this.strings,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                strings.dashboardEyebrow.toUpperCase(),
                style: AppTheme.overline.copyWith(
                  color: isDark ? AppTheme.gray500 : AppTheme.gray400,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                strings.helloName(name),
                style: AppTheme.displaySm.copyWith(
                  color: isDark ? Colors.white : AppTheme.gray900,
                ),
              ),
            ],
          ),
        ),
        // Profile button
        GestureDetector(
          onTap: onProfile,
          child: Container(
            width: 42, height: 42,
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF111827) : AppTheme.surface,
              borderRadius: AppTheme.radiusM,
              border: Border.all(
                color: isDark ? const Color(0xFF1E293B) : AppTheme.border,
              ),
              boxShadow: AppTheme.shadowSm,
            ),
            child: Icon(
              Icons.person_outline_rounded,
              size: 20,
              color: isDark ? AppTheme.gray400 : AppTheme.gray600,
            ),
          ),
        ),
      ],
    );
  }
}

class _AnnouncementHero extends StatelessWidget {
  final Map<String, dynamic>? announcement;

  const _AnnouncementHero({this.announcement});

  static _HeroStyle _resolveStyle(Map<String, dynamic>? a) {
    if (a == null) {
      return _HeroStyle(gradient: AppTheme.navyGradient, badge: 'ANNOUNCEMENT', icon: Icons.campaign_outlined);
    }
    final priority = (a['priority'] ?? '').toString().toUpperCase();
    final type     = (a['type']     ?? '').toString().toUpperCase();

    if (priority == 'CRITICAL' || type == 'EMERGENCY') {
      return _HeroStyle(
        gradient: AppTheme.alertGradient,
        badge: 'CRITICAL',
        icon: Icons.emergency_rounded,
      );
    }
    if (priority == 'URGENT' || priority == 'HIGH' || type == 'URGENT') {
      return _HeroStyle(
        gradient: const LinearGradient(
          colors: [Color(0xFFF59E0B), Color(0xFFD97706)],
          begin: Alignment.topLeft, end: Alignment.bottomRight,
        ),
        badge: 'URGENT',
        icon: Icons.warning_amber_rounded,
      );
    }
    if (priority == 'LOW' || type == 'INFO') {
      return _HeroStyle(
        gradient: AppTheme.successGradient,
        badge: 'INFO',
        icon: Icons.info_outline_rounded,
      );
    }
    return _HeroStyle(gradient: AppTheme.navyGradient, badge: 'ANNOUNCEMENT', icon: Icons.campaign_outlined);
  }

  @override
  Widget build(BuildContext context) {
    final title = announcement?['title']?.toString() ?? 'Company Update';
    final content = announcement?['content']?.toString() ??
        'No announcements yet. Check back soon.';
    final style = _resolveStyle(announcement);

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: style.gradient,
        borderRadius: AppTheme.radiusL,
        boxShadow: AppTheme.shadowMd,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.18),
                  borderRadius: AppTheme.radiusXS,
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(style.icon, size: 11, color: Colors.white),
                  const SizedBox(width: 5),
                  Text(
                    style.badge,
                    style: const TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                      color: Colors.white,
                      letterSpacing: 1.0,
                    ),
                  ),
                ]),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            title,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w800,
              color: Colors.white,
              height: 1.25,
              letterSpacing: -0.3,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            content,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(
              fontSize: 13,
              height: 1.5,
              color: Colors.white.withValues(alpha: 0.75),
            ),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.14),
                  borderRadius: AppTheme.radiusS,
                  border: Border.all(
                    color: Colors.white.withValues(alpha: 0.22),
                  ),
                ),
                child: const Text(
                  'Read more',
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: Colors.white,
                    letterSpacing: 0.2,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _HeroStyle {
  final Gradient gradient;
  final String badge;
  final IconData icon;
  const _HeroStyle({required this.gradient, required this.badge, required this.icon});
}

// ── Live clock — only this widget rebuilds every second ──────────────────────
class _LiveClock extends StatefulWidget {
  const _LiveClock();
  @override State<_LiveClock> createState() => _LiveClockState();
}

class _LiveClockState extends State<_LiveClock> {
  late Timer _t;
  DateTime _now = DateTime.now();

  @override
  void initState() {
    super.initState();
    _t = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _now = DateTime.now());
    });
  }

  @override
  void dispose() { _t.cancel(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          toEthiopianTime(_now).formatCompact(),
          style: const TextStyle(
            fontSize: 36, height: 1.0, fontWeight: FontWeight.w800,
            letterSpacing: -1, color: AppTheme.gray900,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          '${toEthiopianTime(_now).period}  •  🇪🇹 ${toEthiopian(_now).formatShortAm()}',
          style: const TextStyle(
            fontSize: 12, fontWeight: FontWeight.w600,
            color: Color(0xFFE65100),
          ),
        ),
      ],
    );
  }
}

class _CurrentSessionCard extends StatelessWidget {
  final double percentage;
  final bool isOffline;
  final int queueCount;
  final bool checkedIn;
  final bool checkedOut;
  final String locationLabel;
  final String todayStatusLabel;
  final int presentDays;
  final int lateDays;
  final int absentDays;
  final bool onLeave;
  final String? leaveType;
  final bool isHoliday;
  final bool isHalfDayHoliday;
  final String? holidayName;
  final AppStrings strings;

  const _CurrentSessionCard({
    required this.percentage,
    required this.isOffline,
    required this.queueCount,
    required this.checkedIn,
    required this.checkedOut,
    required this.locationLabel,
    required this.todayStatusLabel,
    required this.presentDays,
    required this.lateDays,
    required this.absentDays,
    required this.strings,
    this.onLeave = false,
    this.leaveType,
    this.isHoliday = false,
    this.isHalfDayHoliday = false,
    this.holidayName,
  });

  @override
  Widget build(BuildContext context) {
    final s = strings;
    final statusLabel = checkedOut
        ? s.completed
        : checkedIn
            ? s.onTrack
            : s.pendingStatus;
    final statusColor = checkedOut
        ? AppTheme.success
        : checkedIn
            ? AppTheme.accent
            : AppTheme.warning;

    return AppCard(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header: time + status pill ──────────────────────────────────
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'CURRENT SESSION',
                      style: AppTheme.overline,
                    ),
                    const SizedBox(height: 6),
                    // Clock in its own widget — only it rebuilds every second
                    const _LiveClock(),
                  ],
                ),
              ),
              // Status pill
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.10),
                  borderRadius: AppTheme.radiusFull,
                  border: Border.all(color: statusColor.withValues(alpha: 0.25)),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 6, height: 6,
                      decoration: BoxDecoration(
                        color: statusColor, shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      statusLabel,
                      style: TextStyle(
                        fontSize: 11, fontWeight: FontWeight.w700,
                        color: statusColor,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),

          // ── Alerts strip ────────────────────────────────────────────────
          if (isOffline || queueCount > 0) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
              decoration: BoxDecoration(
                color: isOffline
                    ? AppTheme.warningBg
                    : AppTheme.tealSoft,
                borderRadius: AppTheme.radiusS,
                border: Border.all(
                  color: isOffline
                      ? AppTheme.warning.withValues(alpha: 0.3)
                      : AppTheme.accent.withValues(alpha: 0.3),
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    isOffline ? Icons.wifi_off_rounded : Icons.sync_rounded,
                    size: 14,
                    color: isOffline ? AppTheme.warning : AppTheme.accent,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    isOffline
                        ? 'Offline — $queueCount pending'
                        : '$queueCount queued to sync',
                    style: TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w600,
                      color: isOffline ? AppTheme.warning : AppTheme.accent,
                    ),
                  ),
                ],
              ),
            ),
          ],

          if (onLeave) ...[
            const SizedBox(height: 12),
            InfoBanner(
              icon: Icons.beach_access_rounded,
              text: s.approvedLeaveToday(leaveType ?? ''),
              color: AppTheme.info,
            ),
          ],

          if (todayStatusLabel.isNotEmpty) ...[
            const SizedBox(height: 16),
            Row(
              children: [
                Text(
                  'Today',
                  style: AppTheme.labelSm.copyWith(color: AppTheme.gray400),
                ),
                const SizedBox(width: 8),
                StatusBadge(
                  label: todayStatusLabel,
                  color: _statusColor(todayStatusLabel),
                ),
              ],
            ),
          ],

          const SizedBox(height: 18),
          // ── Monthly stats ───────────────────────────────────────────────
          Row(
            children: [
              MiniStat(label: s.present, value: presentDays, color: AppTheme.success),
              MiniStat(label: s.late,    value: lateDays,    color: AppTheme.warning),
              MiniStat(label: s.absent,  value: absentDays,  color: AppTheme.danger),
            ],
          ),
          const SizedBox(height: 14),
          // Progress bar
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Text(
                          s.monthlyAttendance,
                          style: AppTheme.bodySm.copyWith(color: AppTheme.gray500),
                        ),
                        Text(
                          '${percentage.toStringAsFixed(0)}%',
                          style: TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w800,
                            color: percentage >= 80
                                ? AppTheme.success
                                : percentage >= 60
                                    ? AppTheme.warning
                                    : AppTheme.danger,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    ClipRRect(
                      borderRadius: AppTheme.radiusFull,
                      child: LinearProgressIndicator(
                        value: percentage / 100,
                        minHeight: 6,
                        backgroundColor: AppTheme.gray100,
                        valueColor: AlwaysStoppedAnimation(
                          percentage >= 80
                              ? AppTheme.success
                              : percentage >= 60
                                  ? AppTheme.warning
                                  : AppTheme.danger,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Premium Action Grid ────────────────────────────────────────────────────────

class _ActionTile extends StatefulWidget {
  final IconData icon;
  final String label;
  final Color? color;
  final VoidCallback onTap;

  const _ActionTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.color,
  });

  @override
  State<_ActionTile> createState() => _ActionTileState();
}

class _ActionTileState extends State<_ActionTile> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final tileColor = widget.color ?? AppTheme.accent;

    return Expanded(
      child: GestureDetector(
        onTapDown: (_) => setState(() => _pressed = true),
        onTapUp: (_) { setState(() => _pressed = false); widget.onTap(); },
        onTapCancel: () => setState(() => _pressed = false),
        child: AnimatedScale(
          scale: _pressed ? 0.96 : 1.0,
          duration: AppTheme.fastDuration,
          curve: AppTheme.defaultCurve,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 12),
            decoration: BoxDecoration(
              color: isDark ? const Color(0xFF111827) : AppTheme.surface,
              borderRadius: AppTheme.radiusM,
              boxShadow: AppTheme.shadowSm,
              border: Border.all(
                color: isDark ? const Color(0xFF1E293B) : AppTheme.border,
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 42, height: 42,
                  decoration: BoxDecoration(
                    color: tileColor.withValues(alpha: 0.10),
                    borderRadius: AppTheme.radiusS,
                  ),
                  child: Icon(widget.icon, size: 20, color: tileColor),
                ),
                const SizedBox(height: 10),
                Text(
                  widget.label,
                  textAlign: TextAlign.center,
                  maxLines: 1,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: isDark ? AppTheme.gray300 : AppTheme.gray700,
                    letterSpacing: 0.2,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Premium Attendance Actions ────────────────────────────────────────────────

class _AttendanceActions extends StatelessWidget {
  final AttendanceProvider attendance;
  final Map<String, dynamic> status;
  final bool isOffline;
  final AppStrings s;
  final VoidCallback onCheckIn;
  final VoidCallback onCheckOut;
  final String checkInLabel;
  final String checkOutLabel;

  const _AttendanceActions({
    required this.attendance,
    required this.status,
    required this.isOffline,
    required this.s,
    required this.onCheckIn,
    required this.onCheckOut,
    required this.checkInLabel,
    required this.checkOutLabel,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final canIn  = attendance.canCheckIn  && !attendance.isLoading && !isOffline;
    final canOut = attendance.canCheckOut && !attendance.isLoading && !isOffline;

    return Row(
      children: [
        // ── Check In ───────────────────────────────────────────────────────
        Expanded(
          child: _AttendanceButton(
            icon: Icons.login_rounded,
            label: s.checkInTitle,
            sublabel: checkInLabel,
            gradient: canIn
                ? const LinearGradient(
                    colors: [Color(0xFF10B981), Color(0xFF059669)],
                    begin: Alignment.topLeft, end: Alignment.bottomRight)
                : null,
            disabledColor: isDark
                ? const Color(0xFF1A2535)
                : const Color(0xFFF1F5F9),
            enabled: canIn,
            done: attendance.isCheckedIn || attendance.isCheckedOut,
            onTap: onCheckIn,
          ),
        ),
        const SizedBox(width: 12),
        // ── Check Out ──────────────────────────────────────────────────────
        Expanded(
          child: _AttendanceButton(
            icon: Icons.logout_rounded,
            label: s.checkOutTitle,
            sublabel: checkOutLabel,
            gradient: canOut
                ? const LinearGradient(
                    colors: [Color(0xFF3B82F6), Color(0xFF2563EB)],
                    begin: Alignment.topLeft, end: Alignment.bottomRight)
                : null,
            disabledColor: isDark
                ? const Color(0xFF1A2535)
                : const Color(0xFFF1F5F9),
            enabled: canOut,
            done: attendance.isCheckedOut,
            onTap: onCheckOut,
          ),
        ),
      ],
    );
  }
}

class _AttendanceButton extends StatefulWidget {
  final IconData icon;
  final String label;
  final String sublabel;
  final LinearGradient? gradient;
  final Color? disabledColor;
  final bool enabled;
  final bool done;
  final VoidCallback onTap;

  const _AttendanceButton({
    required this.icon,
    required this.label,
    required this.sublabel,
    required this.enabled,
    required this.done,
    required this.onTap,
    this.gradient,
    this.disabledColor,
  });

  @override
  State<_AttendanceButton> createState() => _AttendanceButtonState();
}

class _AttendanceButtonState extends State<_AttendanceButton> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    // Color logic
    final Color textColor = widget.enabled
        ? Colors.white
        : (isDark ? AppTheme.gray500 : AppTheme.gray400);
    final Color sublabelColor = widget.enabled
        ? Colors.white.withValues(alpha: 0.75)
        : (isDark ? AppTheme.gray600 : AppTheme.gray300);

    return GestureDetector(
      onTapDown: widget.enabled ? (_) => setState(() => _pressed = true) : null,
      onTapUp: widget.enabled ? (_) { setState(() => _pressed = false); widget.onTap(); } : null,
      onTapCancel: widget.enabled ? () => setState(() => _pressed = false) : null,
      onTap: widget.enabled ? widget.onTap : null,
      child: AnimatedScale(
        scale: _pressed ? 0.97 : 1.0,
        duration: AppTheme.fastDuration,
        curve: AppTheme.defaultCurve,
        child: AnimatedContainer(
          duration: AppTheme.normalDuration,
          curve: AppTheme.defaultCurve,
          padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
          decoration: BoxDecoration(
            gradient: widget.enabled ? widget.gradient : null,
            color: widget.enabled ? null : widget.disabledColor,
            borderRadius: AppTheme.radiusL,
            boxShadow: widget.enabled && widget.gradient != null
                ? AppTheme.shadowAccent(widget.gradient!.colors.first)
                : AppTheme.shadowSm,
            border: widget.enabled
                ? null
                : Border.all(
                    color: isDark
                        ? const Color(0xFF1E293B)
                        : AppTheme.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Icon row
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Container(
                    width: 36, height: 36,
                    decoration: BoxDecoration(
                      color: widget.enabled
                          ? Colors.white.withValues(alpha: 0.20)
                          : (isDark
                              ? Colors.white.withValues(alpha: 0.06)
                              : Colors.black.withValues(alpha: 0.05)),
                      borderRadius: AppTheme.radiusS,
                    ),
                    child: Icon(
                      widget.done && !widget.enabled
                          ? Icons.check_rounded
                          : widget.icon,
                      color: textColor,
                      size: 18,
                    ),
                  ),
                  if (widget.enabled)
                    Icon(
                      Icons.arrow_forward_ios_rounded,
                      size: 12,
                      color: Colors.white.withValues(alpha: 0.6),
                    ),
                ],
              ),
              const SizedBox(height: 14),
              // Label
              Text(
                widget.label,
                style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: textColor,
                  letterSpacing: -0.2,
                ),
              ),
              const SizedBox(height: 3),
              // Sublabel
              Text(
                widget.sublabel,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: sublabelColor,
                  letterSpacing: 0.1,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

Color _statusColor(String s) {
  switch (s.toUpperCase()) {
    case 'PRESENT':
    case 'CHECKED_OUT':
    case 'AUTO_CHECKOUT':
      return AppTheme.success;
    case 'LATE':
    case 'HALF_DAY':
    case 'MISSED_CHECKOUT':
      return AppTheme.warning;
    case 'ABSENT':
    case 'ABSENT_NO_CHECKOUT':
      return AppTheme.danger;
    default:
      return AppTheme.gray400;
  }
}

/// Off-day banner
class _OffDayBanner extends StatelessWidget {
  final AppStrings strings;
  const _OffDayBanner({required this.strings});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: AppTheme.navyGradient,
        borderRadius: AppTheme.radiusL,
        boxShadow: AppTheme.shadowMd,
      ),
      child: Row(
        children: [
          Container(
            width: 48, height: 48,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.10),
              borderRadius: AppTheme.radiusM,
            ),
            child: const Center(
              child: Text('😴', style: TextStyle(fontSize: 22)),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'REST DAY',
                  style: TextStyle(
                    fontSize: 10, fontWeight: FontWeight.w800,
                    color: Colors.white54, letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 2),
                const Text(
                  'Today is your day off',
                  style: TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  strings.noAttendanceRequired,
                  style: TextStyle(
                    fontSize: 11, color: Colors.white.withValues(alpha: 0.6),
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

/// Holiday banner
class _HolidayBanner extends StatelessWidget {
  final String? name;
  const _HolidayBanner({this.name});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFBF360C), Color(0xFFE65100)],
          begin: Alignment.topLeft, end: Alignment.bottomRight,
        ),
        borderRadius: AppTheme.radiusL,
        boxShadow: AppTheme.shadowAccent(const Color(0xFFE65100)),
      ),
      child: Row(
        children: [
          Container(
            width: 48, height: 48,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.15),
              borderRadius: AppTheme.radiusM,
            ),
            child: const Center(
              child: Text('🎉', style: TextStyle(fontSize: 22)),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'PUBLIC HOLIDAY',
                  style: TextStyle(
                    fontSize: 10, fontWeight: FontWeight.w800,
                    color: Colors.white60, letterSpacing: 1.2,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  name ?? 'Today is a Holiday',
                  style: const TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white,
                  ),
                ),
                const SizedBox(height: 2),
                const Text(
                  'No attendance required today',
                  style: TextStyle(
                    fontSize: 11, color: Colors.white70,
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
