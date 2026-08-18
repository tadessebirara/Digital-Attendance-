import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../providers/attendance_provider.dart';
import '../../utils/app_strings.dart';
import '../../utils/app_theme.dart';
import '../../utils/ethiopian_calendar.dart';
import '../../widgets/app_widgets.dart';

class AttendanceHistoryScreen extends StatefulWidget {
  const AttendanceHistoryScreen({super.key});

  @override
  State<AttendanceHistoryScreen> createState() =>
      _AttendanceHistoryScreenState();
}

class _AttendanceHistoryScreenState extends State<AttendanceHistoryScreen>
    with TickerProviderStateMixin {
  int _tab = 2; // 0=Daily, 1=Weekly, 2=Monthly
  late AnimationController _listController;

  // ── Memoized filter — recomputed only when tab or record count changes ─────
  List<dynamic>? _cachedFiltered;
  int _lastTab = -1;
  int _lastRecordCount = -1;

  @override
  void initState() {
    super.initState();
    _listController = AnimationController(
      duration: const Duration(milliseconds: 500),
      vsync: this,
    );
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _listController.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    await Provider.of<AttendanceProvider>(context, listen: false)
        .getMyAttendance(refresh: true);
    _listController.forward(from: 0);
  }

  /// Memoized — only re-runs the O(n) filter when tab or data actually changes.
  /// Eliminates redundant DateTime.parse on every provider notification.
  List<dynamic> _getFiltered(List<dynamic> all) {
    if (_cachedFiltered != null &&
        _lastTab == _tab &&
        _lastRecordCount == all.length) {
      return _cachedFiltered!;
    }
    _lastTab = _tab;
    _lastRecordCount = all.length;
    _cachedFiltered = _computeFilter(all);
    return _cachedFiltered!;
  }

  List<dynamic> _computeFilter(List<dynamic> all) {
    final now = DateTime.now();
    return all.where((r) {
      try {
        final d = DateTime.parse(r['date'] ?? r['clockInTime'] ?? '');
        if (_tab == 0) {
          return d.year == now.year && d.month == now.month && d.day == now.day;
        }
        if (_tab == 1) {
          final weekStart = now.subtract(Duration(days: now.weekday - 1));
          return d.isAfter(weekStart.subtract(const Duration(days: 1)));
        }
        return d.year == now.year && d.month == now.month;
      } catch (_) {
        return false;
      }
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final s = AppStrings.of(context);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: Consumer<AttendanceProvider>(
          builder: (_, att, __) {
            final filtered = _getFiltered(att.myAttendance);

            return Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
                  child: PageHeader(eyebrow: s.historyEyebrow, title: s.historyTitle),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(18, 0, 18, 14),
                  child: AppSegmentedBar(
                    labels: [s.daily, s.weekly, s.monthly],
                    selected: _tab,
                    onChanged: (i) {
                      setState(() { _tab = i; _cachedFiltered = null; });
                      _listController.forward(from: 0);
                    },
                  ),
                ),
                if (!att.isLoading && filtered.isNotEmpty)
                  _SummaryStrip(records: filtered, isDark: isDark, strings: s),
                Expanded(
                  child: RefreshIndicator(
                    onRefresh: _load,
                    color: AppTheme.accent,
                    child: att.isLoading && filtered.isEmpty
                        ? const _AttendanceSkeleton()
                        : filtered.isEmpty
                            ? ListView(children: [
                                const SizedBox(height: 60),
                                AppEmptyState(
                                  icon: Icons.history_toggle_off_rounded,
                                  title: s.noRecords,
                                  subtitle: s.noRecordsSub,
                                ),
                              ])
                            : ListView.builder(
                                physics: const AlwaysScrollableScrollPhysics(),
                                padding: const EdgeInsets.fromLTRB(18, 4, 18, 40),
                                itemCount: filtered.length,
                                itemBuilder: (context, index) {
                                  final delay = index * 0.08;
                                  final anim = CurvedAnimation(
                                    parent: _listController,
                                    curve: Interval(
                                      delay.clamp(0.0, 1.0),
                                      (delay + 0.5).clamp(0.0, 1.0),
                                      curve: Curves.easeOutCubic,
                                    ),
                                  );
                                  return FadeSlideIn(
                                    animation: anim,
                                    child: _TimelineItem(
                                      filtered[index] as Map<String, dynamic>,
                                      isLast: index == filtered.length - 1,
                                    ),
                                  );
                                },
                              ),
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary strip
// ─────────────────────────────────────────────────────────────────────────────

class _SummaryStrip extends StatelessWidget {
  final List<dynamic> records;
  final bool isDark;
  final AppStrings strings;

  const _SummaryStrip({required this.records, required this.isDark, required this.strings});

  @override
  Widget build(BuildContext context) {
    int present = 0, late = 0, absent = 0;
    for (final r in records) {
      final s = (r['status'] ?? '').toString().toUpperCase();
      if (s == 'PRESENT' || s == 'CHECKED_OUT' || s == 'AUTO_CHECKOUT') present++;
      else if (s == 'LATE' || s == 'HALF_DAY' || s == 'MISSED_CHECKOUT') late++;
      else if (s == 'ABSENT') absent++;
    }
    return Padding(
      padding: const EdgeInsets.fromLTRB(18, 0, 18, 14),
      child: Row(children: [
        StatPill(label: strings.present, value: present, color: AppTheme.success),
        const SizedBox(width: 8),
        StatPill(label: strings.late,    value: late,    color: AppTheme.warning),
        const SizedBox(width: 8),
        StatPill(label: strings.absent,  value: absent,  color: AppTheme.danger),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Skeleton loader
// ─────────────────────────────────────────────────────────────────────────────

class _AttendanceSkeleton extends StatelessWidget {
  const _AttendanceSkeleton();

  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 0, 18, 40),
        child: Column(
          children: List.generate(5, (i) {
            return Padding(
              padding: const EdgeInsets.only(bottom: 20),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Column(children: [
                    ShimmerBox(width: 16, height: 16, radius: 8),
                    if (i < 4)
                      ShimmerBox(width: 2, height: 80, radius: 0),
                  ]),
                  const SizedBox(width: 16),
                  Expanded(
                    child: ShimmerBox(
                        width: double.infinity, height: 96, radius: 20),
                  ),
                ],
              ),
            );
          }),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Timeline Item
// ─────────────────────────────────────────────────────────────────────────────

class _TimelineItem extends StatelessWidget {
  final Map<String, dynamic> r;
  final bool isLast;

  const _TimelineItem(this.r, {required this.isLast});

  @override
  Widget build(BuildContext context) {
    final status = r['status'] ?? 'PRESENT';
    final bool isAbsent = status == 'ABSENT';
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final Color color =
        status == 'PRESENT' ||
                status == 'CHECKED_OUT' ||
                status == 'AUTO_CHECKOUT'
            ? AppTheme.success
            : status == 'LATE' ||
                    status == 'HALF_DAY' ||
                    status == 'MISSED_CHECKOUT'
                ? AppTheme.warning
                : AppTheme.danger;

    DateTime? clockIn, clockOut;
    if (!isAbsent) {
      try {
        clockIn = DateTime.parse(r['clockInTime'] ?? '');
      } catch (_) {}
      try {
        clockOut = DateTime.parse(r['clockOutTime'] ?? '');
      } catch (_) {}
    }

    DateTime? recordDate;
    try {
      recordDate =
          DateTime.parse(r['date'] ?? r['clockInTime'] ?? '');
    } catch (_) {}

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Timeline spine ────────────────────────────────────────────
          Column(
            children: [
              Container(
                width: 16,
                height: 16,
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF0F172A) : Colors.white,
                  shape: BoxShape.circle,
                  border: Border.all(color: color, width: 3.5),
                ),
              ),
              if (!isLast)
                Expanded(
                  child: Container(
                    width: 2,
                    color: isDark ? AppTheme.gray700 : AppTheme.gray200,
                  ),
                ),
            ],
          ),
          const SizedBox(width: 14),

          // ── Record card ───────────────────────────────────────────────
          Expanded(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 20),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF18212F) : AppTheme.surface,
                  borderRadius: AppTheme.radiusM,
                  boxShadow: [AppTheme.cardShadow],
                  border: Border.all(
                    color: isDark ? Colors.white10 : AppTheme.border,
                  ),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                recordDate != null
                                    ? '🇪🇹 ${ethDayNameAm(recordDate.weekday)}, ${toEthiopian(recordDate).formatAm()}'
                                    : clockIn != null
                                        ? '🇪🇹 ${ethDayNameAm(clockIn.weekday)}, ${toEthiopian(clockIn).formatAm()}'
                                        : 'Record',
                                style: const TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w800,
                                  color: Color(0xFFBF360C),
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                recordDate != null
                                    ? DateFormat('EEEE, MMM d').format(recordDate)
                                    : clockIn != null
                                        ? DateFormat('EEEE, MMM d').format(clockIn)
                                        : '',
                                style: TextStyle(
                                  fontSize: 11,
                                  color: isDark ? AppTheme.gray400 : AppTheme.gray500,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ],
                          ),
                        ),
                        StatusBadge(label: status, color: color),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Row(
                      children: [
                        _CheckTime(
                          label: 'CHECK IN',
                          time: clockIn != null
                              ? toEthiopianTime(clockIn).format()
                              : '--:--',
                          icon: Icons.login_rounded,
                          color: AppTheme.success,
                        ),
                        Container(
                          height: 32,
                          width: 1,
                          margin: const EdgeInsets.symmetric(horizontal: 16),
                          color: isDark ? AppTheme.gray700 : AppTheme.gray200,
                        ),
                        _CheckTime(
                          label: 'CHECK OUT',
                          time: clockOut != null
                              ? toEthiopianTime(clockOut).format()
                              : '--:--',
                          icon: Icons.logout_rounded,
                          color: AppTheme.danger,
                        ),
                      ],
                    ),
                    if (r['clockInLocation'] != null) ...[
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          Icon(Icons.location_on_rounded,
                              size: 12,
                              color: isDark
                                  ? AppTheme.gray500
                                  : AppTheme.gray400),
                          const SizedBox(width: 4),
                          Text(
                            _formatLocation(r['clockInLocation']),
                            style: TextStyle(
                              fontSize: 11,
                              color: isDark
                                  ? AppTheme.gray500
                                  : AppTheme.gray400,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatLocation(dynamic location) {
    if (location is Map) {
      final lat = num.tryParse(location['latitude']?.toString() ?? '');
      final lon = num.tryParse(location['longitude']?.toString() ?? '');
      if (lat != null && lon != null) {
        return '${lat.toStringAsFixed(5)}, ${lon.toStringAsFixed(5)}';
      }
    }
    if (location is String && location.isNotEmpty) return location;
    return 'Office';
  }
}

class _CheckTime extends StatelessWidget {
  final String label;
  final String time;
  final IconData icon;
  final Color color;

  const _CheckTime({
    required this.label,
    required this.time,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(icon, size: 11, color: color.withValues(alpha: 0.7)),
            const SizedBox(width: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 9,
                fontWeight: FontWeight.w800,
                color: isDark ? AppTheme.gray400 : AppTheme.gray400,
                letterSpacing: 0.5,
              ),
            ),
          ],
        ),
        const SizedBox(height: 3),
        Text(
          time,
          style: TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w900,
            color: isDark ? Colors.white : AppTheme.primary,
          ),
        ),
      ],
    );
  }
}
