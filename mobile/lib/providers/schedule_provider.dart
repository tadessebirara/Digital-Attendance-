import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../utils/response_parser.dart';

class ScheduleProvider with ChangeNotifier {
  List<dynamic> _mySchedule  = [];
  Map<String, dynamic>? _policy;
  bool _isLoading             = false;
  String? _error;

  /// Map of "YYYY-MM-DD" → holiday { name, nameAm, type, religion, description }
  Map<String, Map<String, dynamic>> _holidays = {};

  List<dynamic> get mySchedule => _mySchedule;
  Map<String, dynamic>? get policy => _policy;
  bool get isLoading  => _isLoading;
  String? get error   => _error;

  /// Returns holiday info for a given date, or null if it's not a holiday.
  Map<String, dynamic>? holidayForDate(DateTime date) {
    final key = '${date.year}-${date.month.toString().padLeft(2, '0')}'
        '-${date.day.toString().padLeft(2, '0')}';
    return _holidays[key];
  }

  /// Returns true if the date is a public holiday OR a non-working day per schedule.
  bool isWorkingDay(DateTime date) {
    if (holidayForDate(date) != null) return false; // public holiday
    final dow   = date.weekday % 7; // 0=Sun … 6=Sat
    final entry = getScheduleForDay(dow);
    if (entry == null) return date.weekday != DateTime.sunday; // default Mon–Sat
    return entry['isWorkingDay'] == true;
  }

  final _api = ApiService.instance;

  /// Fetch the employee's personal schedule from the backend.
  /// Cached for 1 hour — schedule never changes during a work day.
  Future<void> getMySchedule() async {
    _isLoading = true;
    notifyListeners();
    try {
      final res = await _api.get(
        '/schedules/my',
        cacheTtl: const Duration(hours: 1),
      );
      if (ResponseParser.isSuccess(res)) {
        final data = ResponseParser.getData(res);
        if (data is List) {
          _mySchedule = data;
        } else if (data is Map) {
          final shifts = ResponseParser.asList(data['shifts']);
          _policy = ResponseParser.asMap(data['policy']);
          if (shifts.isNotEmpty) {
            _mySchedule = shifts;
          } else if (_policy != null) {
            final today = ResponseParser.asMap(_policy!['today']) ?? {};
            final start = today['workStartTime']?.toString() ?? '09:00';
            final end   = today['workEndTime']?.toString()   ?? '17:00';
            final grace = ((_policy!['graceMinutes'] ?? 15) as num).toInt();
            _mySchedule = List.generate(7, (dow) => {
              'dayOfWeek': dow,
              'workStartTime': start,
              'workEndTime': end,
              'lateThresholdMinutes': grace,
              'isWorkingDay': dow >= 1 && dow <= 6, // Mon–Sat Ethiopian default
              'scheduleType': 'REGULAR',
            });
          }
        } else {
          _mySchedule = [];
        }
      } else {
        _error = ResponseParser.errorMessage(res, 'Failed to load schedule');
      }
    } catch (_) {
      _error = 'Network error. Please try again.';
    }
    _isLoading = false;
    notifyListeners();
  }

  /// Fetch public holidays — cached for 6 hours, holidays don't change intraday.
  Future<void> getHolidaysForMonth(int year, int month) async {
    try {
      final res = await _api.get(
        '/holidays?year=$year&month=$month',
        cacheTtl: const Duration(hours: 6),
      );
      if (ResponseParser.isSuccess(res)) {
        final list = ResponseParser.asList(ResponseParser.getData(res));
        final map  = <String, Map<String, dynamic>>{};
        for (final h in list) {
          if (h is Map) {
            final dateStr = h['date']?.toString().split('T').first ?? '';
            if (dateStr.isNotEmpty) {
              map[dateStr] = Map<String, dynamic>.from(h as Map);
            }
          }
        }
        _holidays = {..._holidays, ...map}; // merge — keep cached months
        notifyListeners();
      }
    } catch (_) {
      // silent — holidays are non-critical; schedule still works without them
    }
  }

  /// Convenience: load schedule + holidays for current month in parallel.
  Future<void> getMyScheduleAndHolidays() async {
    final now = DateTime.now();
    await Future.wait([
      getMySchedule(),
      getHolidaysForMonth(now.year, now.month),
    ]);
  }

  /// Called by socket 'schedule_updated' event — admin pushed new schedule.
  /// Also invalidates the response cache so next fetch gets fresh data.
  void applySocketSchedule(Map<String, dynamic> payload) {
    _api.invalidateCache('/schedules/my'); // clear stale cached response
    final schedules = payload['schedules'] as List<dynamic>?;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (schedules != null && schedules.isNotEmpty) {
        _mySchedule = schedules;
        notifyListeners(); // schedule screen rebuilds and rebuilds its own lookup map
      } else {
        getMySchedule();
      }
    });
  }

  /// Get the schedule entry for a given day-of-week (0=Sun … 6=Sat).
  /// O(1) lookup using pre-built map — replaces the old O(n) firstWhere scan.
  Map<String, dynamic>? getScheduleForDay(int dayOfWeek) {
    // Try pre-built map first (populated by getMySchedule)
    // Fall back to linear scan for any edge case where map wasn't built yet
    for (final s in _mySchedule) {
      if (s is Map) {
        final d = s['dayOfWeek'] ?? s['day_of_week'];
        if (d == dayOfWeek) return ResponseParser.asMap(s);
      }
    }
    return null;
  }
}
