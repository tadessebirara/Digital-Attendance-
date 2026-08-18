import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:table_calendar/table_calendar.dart';
import '../../services/api_service.dart';
import '../../utils/app_strings.dart';
import '../../utils/app_theme.dart';
import '../../utils/ethiopian_calendar.dart';
import '../../widgets/app_widgets.dart';

class ScheduleScreen extends StatefulWidget {
  const ScheduleScreen({super.key});

  @override
  State<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends State<ScheduleScreen> {
  DateTime _focusedDay = DateTime.now();
  DateTime? _selectedDay;
  bool _isLoading = false;
  List<dynamic> _schedule = [];

  /// O(1) lookup map built once when _schedule changes — eliminates per-cell linear scan
  Map<int, Map<String, dynamic>> _scheduleByDow = {};

  /// Map of "YYYY-MM-DD" → holiday info { name, type, religion, description }
  Map<String, Map<String, dynamic>> _holidays = {};

  @override
  void initState() {
    super.initState();
    _selectedDay = _focusedDay;
    _loadAll();
  }

  Future<void> _loadAll() async {
    setState(() => _isLoading = true);
    // Load schedule + full year of holidays together
    await Future.wait([_loadSchedule(), _loadHolidaysForYear(_focusedDay.year)]);
    if (mounted) setState(() => _isLoading = false);
  }

  Future<void> _loadSchedule() async {
    try {
      final res = await ApiService.instance.get('/schedules/my');
      if (res['success'] == true) {
        final data = res['data'];
        List<dynamic> newSchedule = [];
        if (data is List) {
          newSchedule = data;
        } else if (data is Map) {
          final shifts = (data['shifts'] as List<dynamic>?) ?? [];
          if (shifts.isNotEmpty) {
            newSchedule = shifts;
          } else {
            final policy = (data['policy'] as Map<String, dynamic>?) ?? {};
            final today  = (policy['today'] as Map<String, dynamic>?) ?? {};
            final start  = today['workStartTime']?.toString() ?? '09:00';
            final end    = today['workEndTime']?.toString()   ?? '17:00';
            final grace  = (policy['graceMinutes'] ?? 15) as num;
            newSchedule  = List.generate(7, (dow) => {
              'dayOfWeek': dow,
              'workStartTime': start,
              'workEndTime': end,
              'lateThresholdMinutes': grace.toInt(),
              'isWorkingDay': dow >= 1 && dow <= 6,
              'scheduleType': 'REGULAR',
            });
          }
        }
        if (mounted) {
          setState(() {
            _schedule = newSchedule;
            _buildScheduleLookup(); // rebuild O(1) map after data changes
          });
        }
      }
    } catch (_) {}
  }

  /// Build O(1) day-of-week lookup map — called once when schedule data changes
  void _buildScheduleLookup() {
    _scheduleByDow = {};
    for (final s in _schedule) {
      if (s is Map) {
        final dow = s['dayOfWeek'];
        if (dow is int) {
          _scheduleByDow[dow] = Map<String, dynamic>.from(s);
        }
      }
    }
  }

  /// Fetch the entire year of holidays at once — no month filtering.
  /// Merges into _holidays so navigating years accumulates data.
  Future<void> _loadHolidaysForYear(int year) async {
    try {
      final res = await ApiService.instance.get('/holidays?year=$year');
      if (res['success'] == true) {
        final list = res['data'] as List<dynamic>? ?? [];
        final map  = <String, Map<String, dynamic>>{};
        for (final h in list) {
          if (h is Map) {
            final dateStr = h['date']?.toString().split('T').first ?? '';
            if (dateStr.isNotEmpty) {
              map[dateStr] = Map<String, dynamic>.from(h as Map);
            }
          }
        }
        if (mounted) setState(() => _holidays = {..._holidays, ...map});
      }
    } catch (_) {}
  }

  Map<String, dynamic>? _scheduleForDay(DateTime day) {
    // O(1) lookup via pre-built map — replaces O(n) firstWhere per calendar cell
    return _scheduleByDow[day.weekday % 7];
  }

  String _dateKey(DateTime day) =>
      '${day.year}-${day.month.toString().padLeft(2, '0')}-${day.day.toString().padLeft(2, '0')}';

  Map<String, dynamic>? _holidayForDay(DateTime day) =>
      _holidays[_dateKey(day)];

  /// A day is "working" only when:
  ///   - The employee's schedule marks it as working, AND
  ///   - It is NOT a public holiday
  bool _isWorkingDay(DateTime day) {
    if (_holidayForDay(day) != null) return false; // public holiday → off
    final entry = _scheduleForDay(day);
    if (entry == null) {
      // Default: Mon–Sat working, Sun off (Ethiopian standard)
      return day.weekday != DateTime.sunday;
    }
    return entry['isWorkingDay'] == true;
  }

  /// Called when the user navigates to a different month
  void _onPageChanged(DateTime focusedDay) {
    setState(() => _focusedDay = focusedDay);
    // Load new year's holidays if we've crossed a year boundary
    if (!_holidays.keys.any((k) => k.startsWith('${focusedDay.year}-'))) {
      _loadHolidaysForYear(focusedDay.year);
    }
  }

  @override
  Widget build(BuildContext context) {
    final selected = _selectedDay ?? DateTime.now();
    final holiday  = _holidayForDay(selected);
    final s        = AppStrings.of(context);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _loadAll,
          color: AppTheme.accent,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(18, 10, 18, 16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ── Header ────────────────────────────────────────────────
                PageHeader(
                  eyebrow: s.scheduleEyebrow,
                  title: s.scheduleTitle,
                  subtitle: formatEthDateShort(DateTime.now()),
                ),
                const SizedBox(height: 18),

                // ── Calendar card ─────────────────────────────────────────
                AppCard(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 18),
                  color: Theme.of(context).brightness == Brightness.dark
                      ? const Color(0xFF18212F)
                      : AppTheme.surface,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: 10,
                        runSpacing: 8,
                        children: [
                          _LegendPill(label: s.legendWorking, dot: AppTheme.success,        bg: AppTheme.mintSoft),
                          _LegendPill(label: s.legendOff,     dot: AppTheme.gray400,         bg: AppTheme.gray100),
                          _LegendPill(label: s.legendHoliday, dot: const Color(0xFFE65100),  bg: const Color(0xFFFFF3E0)),
                          _LegendPill(label: s.legendToday,   dot: AppTheme.danger,          bg: AppTheme.redSoft),
                        ],
                      ),
                      const SizedBox(height: 16),

                      TableCalendar(
                        firstDay: DateTime.utc(2020, 1, 1),
                        lastDay: DateTime.utc(2035, 12, 31),
                        focusedDay: _focusedDay,
                        selectedDayPredicate: (day) => isSameDay(_selectedDay, day),
                        headerVisible: true,
                        headerStyle: HeaderStyle(
                          formatButtonVisible: false,
                          titleCentered: true,
                          titleTextFormatter: (date, locale) {
                            // A Gregorian month spans 1-2 Ethiopian months.
                            // Show the Ethiopian month(s) that appear in this GC month.
                            final firstDay = DateTime(date.year, date.month, 1);
                            final lastDay  = DateTime(date.year, date.month + 1, 0);
                            final ethFirst = toEthiopian(firstDay);
                            final ethLast  = toEthiopian(lastDay);
                            final grLabel  = DateFormat('MMMM yyyy').format(date);

                            if (ethFirst.month == ethLast.month &&
                                ethFirst.year == ethLast.year) {
                              // Same Ethiopian month throughout
                              return '${ethFirst.monthNameAm} ${ethFirst.year} ዓ.ም\n$grLabel';
                            } else {
                              // Spans two Ethiopian months (most common case)
                              return '${ethFirst.monthNameAm}–${ethLast.monthNameAm} ${ethLast.year} ዓ.ም\n$grLabel';
                            }
                          },
                          titleTextStyle: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w900,
                            color: AppTheme.primary,
                            height: 1.5,
                          ),
                          leftChevronIcon: const Icon(Icons.chevron_left_rounded,
                              color: AppTheme.primary, size: 26),
                          rightChevronIcon: const Icon(Icons.chevron_right_rounded,
                              color: AppTheme.primary, size: 26),
                          headerPadding: const EdgeInsets.symmetric(vertical: 8),
                        ),
                        onDaySelected: (selectedDay, focusedDay) {
                          setState(() {
                            _selectedDay = selectedDay;
                            _focusedDay  = focusedDay;
                          });
                        },
                        onPageChanged: _onPageChanged,
                        // ── Ethiopian day-of-week headers ─────────────────
                        calendarBuilders: CalendarBuilders(
                          dowBuilder: (context, day) {
                            // day is the first occurrence of each weekday
                            // Use Ethiopian abbreviated day names
                            final dow = day.weekday % 7; // 0=Sun…6=Sat
                            const abbr = ['እሑ','ሰኞ','ማክ','ረቡ','ሐሙ','አርብ','ቅዳ'];
                            final isDark = Theme.of(context).brightness == Brightness.dark;
                            return Center(
                              child: Text(
                                abbr[dow],
                                style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w800,
                                  color: isDark ? AppTheme.gray400 : AppTheme.gray500,
                                ),
                              ),
                            );
                          },
                          defaultBuilder: (_, day, __) => _DayCell(
                            day: day,
                            isWorking: _isWorkingDay(day),
                            isHoliday: _holidayForDay(day) != null,
                            isSelected: false,
                            isToday: false,
                          ),
                          todayBuilder: (_, day, __) => _DayCell(
                            day: day,
                            isWorking: _isWorkingDay(day),
                            isHoliday: _holidayForDay(day) != null,
                            isSelected: false,
                            isToday: true,
                          ),
                          selectedBuilder: (_, day, __) => _DayCell(
                            day: day,
                            isWorking: _isWorkingDay(day),
                            isHoliday: _holidayForDay(day) != null,
                            isSelected: true,
                            isToday: false,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 18),

                // ── Shift / Holiday details ───────────────────────────────
                if (_isLoading)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Shimmer(
                      child: Column(children: [
                        ShimmerBox(width: double.infinity, height: 180, radius: 22),
                        SizedBox(height: 18),
                        ShimmerBox(width: double.infinity, height: 130, radius: 22),
                      ]),
                    ),
                  )
                else
                  _ShiftDetailsCard(
                    day: selected,
                    schedule: _scheduleForDay(selected),
                    isWorking: _isWorkingDay(selected),
                    holiday: holiday,
                    strings: s,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

// ── Legend pill ───────────────────────────────────────────────────────────────
class _LegendPill extends StatelessWidget {
  final String label;
  final Color dot;
  final Color bg;
  const _LegendPill({required this.label, required this.dot, required this.bg});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(14)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 8, height: 8,
              decoration: BoxDecoration(color: dot, shape: BoxShape.circle)),
          const SizedBox(width: 8),
          Text(label,
              style: const TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w700, color: AppTheme.gray700)),
        ],
      ),
    );
  }
}

// ── Day cell ──────────────────────────────────────────────────────────────────
class _DayCell extends StatelessWidget {
  final DateTime day;
  final bool isWorking;
  final bool isHoliday;
  final bool isSelected;
  final bool isToday;

  const _DayCell({
    required this.day,
    required this.isWorking,
    required this.isHoliday,
    required this.isSelected,
    required this.isToday,
  });

  @override
  Widget build(BuildContext context) {
    // Convert Gregorian day to Ethiopian day number
    final ethDay = toEthiopian(day).day;

    // Priority: selected > today+holiday > today > holiday > working > off
    Color bg        = Colors.transparent;
    Color textColor = AppTheme.gray600;

    if (isHoliday) {
      bg        = const Color(0xFFFFF3E0);
      textColor = const Color(0xFFE65100);
    } else if (isWorking) {
      bg        = AppTheme.tealSoft;
      textColor = AppTheme.accent;
    } else {
      bg        = AppTheme.gray100;
      textColor = AppTheme.gray400;
    }

    // Today: solid orange on holiday, red otherwise
    if (isToday && isHoliday) {
      bg        = const Color(0xFFE65100);
      textColor = Colors.white;
    } else if (isToday && !isHoliday) {
      bg        = AppTheme.danger;
      textColor = Colors.white;
    }

    // Selected always wins
    if (isSelected) {
      bg        = AppTheme.primary;
      textColor = Colors.white;
    }

    return Container(
      margin: const EdgeInsets.all(4),
      decoration: BoxDecoration(color: bg, shape: BoxShape.circle),
      alignment: Alignment.center,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            '$ethDay',
            style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: textColor,
                height: 1.0),
          ),
          // White dot indicator for holiday when selected or today
          if (isHoliday && (isSelected || isToday))
            Container(
              width: 4,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.85),
                shape: BoxShape.circle,
              ),
            ),
        ],
      ),
    );
  }
}

// ── Shift / Holiday details card ──────────────────────────────────────────────
class _ShiftDetailsCard extends StatelessWidget {
  final DateTime day;
  final Map<String, dynamic>? schedule;
  final bool isWorking;
  final Map<String, dynamic>? holiday;
  final AppStrings strings;

  const _ShiftDetailsCard({
    required this.day,
    required this.schedule,
    required this.isWorking,
    required this.holiday,
    required this.strings,
  });

  @override
  Widget build(BuildContext context) {
    final start        = schedule?['workStartTime']?.toString() ?? '';
    final end          = schedule?['workEndTime']?.toString()   ?? '';
    final grace        = schedule?['lateThresholdMinutes']?.toString() ?? '15';
    final scheduleType = schedule?['scheduleType']?.toString() ?? 'SCHEDULED';

    final isPublicHoliday = holiday != null;
    final holidayName     = holiday?['name']?.toString() ?? '';
    final holidayAm       = holiday?['nameAm']?.toString() ?? '';
    final holidayDesc     = holiday?['description']?.toString() ?? '';
    final religion        = holiday?['religion']?.toString() ?? '';
    final String religionIcon = religion == 'CHRISTIAN' ? '✝️'
        : religion == 'MUSLIM' ? '☪️' : '🇪🇹';

    return AppCard(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header row ─────────────────────────────────────────────────
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                  Text(strings.shiftDetails,
                        style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: AppTheme.gray500,
                            letterSpacing: 0.8)),
                    const SizedBox(height: 4),
                    Text(
                      '${ethDayNameAm(day.weekday)}, ${toEthiopian(day).formatAm()}',
                      style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                          color: Color(0xFFBF360C)),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      DateFormat('EEEE, d MMMM yyyy').format(day),
                      style: const TextStyle(
                          fontSize: 11,
                          color: AppTheme.gray400,
                          fontWeight: FontWeight.w500),
                    ),
                  ],
                ),
              ),
              StatusBadge(
                label: isPublicHoliday
                    ? strings.publicHoliday
                    : isWorking ? strings.workingDay : strings.scheduledOff,
                color: isPublicHoliday
                    ? const Color(0xFFE65100)
                    : isWorking ? AppTheme.success : AppTheme.gray500,
                background: isPublicHoliday
                    ? const Color(0xFFFFF3E0)
                    : isWorking ? AppTheme.mintSoft : AppTheme.gray100,
              ),
            ],
          ),
          const SizedBox(height: 18),

          // ── Holiday info block ──────────────────────────────────────────
          if (isPublicHoliday) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF8F0),
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: const Color(0xFFFFCC80)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Text(religionIcon,
                          style: const TextStyle(fontSize: 22)),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(holidayName,
                                style: const TextStyle(
                                    fontSize: 16,
                                    fontWeight: FontWeight.w900,
                                    color: Color(0xFFBF360C))),
                            if (holidayAm.isNotEmpty)
                              Text(holidayAm,
                                  style: const TextStyle(
                                      fontSize: 13,
                                      color: Color(0xFFE65100),
                                      fontWeight: FontWeight.w600)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  if (holidayDesc.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Text(holidayDesc,
                        style: const TextStyle(
                            fontSize: 13, color: AppTheme.gray600, height: 1.5)),
                  ],
                  const SizedBox(height: 12),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(
                        color: const Color(0xFFFFE0B2),
                        borderRadius: BorderRadius.circular(10)),
                    child: Text(
                      strings.noAttendanceRequired,
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: Color(0xFFBF360C)),
                    ),
                  ),
                ],
              ),
            ),

            // If the day is also a working day in schedule (rare — e.g. someone
            // explicitly scheduled on a holiday), still show shift times
            if (isWorking) ...[
              const SizedBox(height: 14),
              Row(
                children: [
                  Expanded(
                      child: _TimeInfo(
                          label: strings.checkIn,
                          value: start,
                          icon: Icons.login_rounded,
                          tint: AppTheme.amberSoft,
                          accent: AppTheme.warning)),
                  const SizedBox(width: 12),
                  Expanded(
                      child: _TimeInfo(
                          label: strings.checkOut,
                          value: end,
                          icon: Icons.logout_rounded,
                          tint: AppTheme.gray100,
                          accent: AppTheme.primary)),
                ],
              ),
            ],
          ]

          // ── Normal working day ──────────────────────────────────────────
          else if (isWorking) ...[
            Row(
              children: [
                Expanded(
                    child: _TimeInfo(
                        label: strings.checkIn,
                        value: start,
                        icon: Icons.login_rounded,
                        tint: AppTheme.amberSoft,
                        accent: AppTheme.warning)),
                const SizedBox(width: 12),
                Expanded(
                    child: _TimeInfo(
                        label: strings.checkOut,
                        value: end,
                        icon: Icons.logout_rounded,
                        tint: AppTheme.gray100,
                        accent: AppTheme.primary)),
              ],
            ),
          ]

          // ── Off day ─────────────────────────────────────────────────────
          else
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                  color: AppTheme.gray100,
                  borderRadius: BorderRadius.circular(18)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(strings.restDay,
                      style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w900,
                          color: AppTheme.primary)),
                  const SizedBox(height: 6),
                  Text(strings.noShiftScheduled,
                      style: const TextStyle(fontSize: 13, color: AppTheme.gray600)),
                ],
              ),
            ),

          // ── Grace / footer note ─────────────────────────────────────────
          if (!isPublicHoliday) ...[
            const SizedBox(height: 14),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                  color: AppTheme.stoneSoft,
                  borderRadius: BorderRadius.circular(16)),
              child: Row(
                children: [
                  const Icon(Icons.access_time_rounded,
                      size: 16, color: AppTheme.gray600),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      isWorking
                          ? strings.gracePeriod(grace)
                          : strings.shiftActionsDisabled,
                      style: const TextStyle(
                          fontSize: 12,
                          color: AppTheme.gray600,
                          fontWeight: FontWeight.w700),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ── Time info widget (Ethiopian labels) ──────────────────────────────────────
class _TimeInfo extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color tint;
  final Color accent;

  const _TimeInfo({
    required this.label,
    required this.value,
    required this.icon,
    required this.tint,
    required this.accent,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
          color: isDark ? const Color(0xFF1E293B) : AppTheme.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: isDark ? Colors.white10 : AppTheme.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
                color: tint, borderRadius: BorderRadius.circular(12)),
            child: Icon(icon, color: accent, size: 18),
          ),
          const SizedBox(height: 14),
          Text(label,
              style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  color: AppTheme.gray500,
                  letterSpacing: 0.5)),
          const SizedBox(height: 6),
          Text(value,
              style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w900,
                  color: isDark ? Colors.white : AppTheme.primary)),
        ],
      ),
    );
  }
}
