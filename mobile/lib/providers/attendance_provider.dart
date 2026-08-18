import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import '../services/api_service.dart';
import '../services/offline_service.dart';
import '../utils/response_parser.dart';

class AttendanceProvider with ChangeNotifier {
  AttendanceProvider() {
    if (!kIsWeb) _initConnectivityListener();
  }

  void _initConnectivityListener() {
    // Only runs on native â€” web skipped via constructor guard
    try {
      // ignore: avoid_dynamic_calls
      final connectivity = _getConnectivity();
      if (connectivity == null) return;
    } catch (_) {}
  }

  // Lazy connectivity â€” avoids import issues on web
  dynamic _getConnectivity() => null;

  List<dynamic> _myAttendance = [];
  Map<String, dynamic>? _todayStatus;
  Map<String, dynamic>? _monthStats;
  bool _isLoading = false;
  bool _hasMore = true;
  int _page = 1;
  String? _error;

  List<dynamic> get myAttendance => _myAttendance;
  Map<String, dynamic>? get todayStatus => _todayStatus;
  Map<String, dynamic>? get monthStats => _monthStats;
  bool get isLoading => _isLoading;
  bool get hasMore => _hasMore;
  String? get error => _error;

  int get totalDays => (_monthStats?['totalDays'] ?? 0) as int;
  int get presentDays => (_monthStats?['presentDays'] ?? 0) as int;
  int get lateDays => (_monthStats?['lateDays'] ?? 0) as int;
  int get absentDays => (_monthStats?['absentDays'] ?? 0) as int;
  double get totalHours => ((_monthStats?['totalHours'] ?? 0) as num).toDouble();

  final _api = ApiService.instance;

  /// True when the system auto-marked the employee absent (cron placeholder).
  /// The backend engine will upgrade the record to LATE when they actually check in.
  bool get isAutoAbsent => _todayStatus?['phase'] == 'ABSENT';

  bool get isCheckedIn {
    if (_todayStatus == null) return false;
    // Server now sets isCheckedIn=false for auto-absent placeholders, but
    // also guard on the client side using the phase field for extra safety.
    if (isAutoAbsent) return false;
    // Prefer the server-computed isCheckedIn flag when available.
    final serverFlag = _todayStatus!['isCheckedIn'];
    if (serverFlag is bool) return serverFlag;
    final ci = _todayStatus!['checkInTime'] ?? _todayStatus!['clockInTime'];
    final co = _todayStatus!['checkOutTime'] ?? _todayStatus!['clockOutTime'];
    return ci != null && co == null;
  }

  bool get isCheckedOut {
    if (_todayStatus == null) return false;
    final serverFlag = _todayStatus!['isCheckedOut'];
    if (serverFlag is bool) return serverFlag;
    final co = _todayStatus!['checkOutTime'] ?? _todayStatus!['clockOutTime'];
    return co != null;
  }

  /// True when the employee has an approved leave covering today.
  /// Both check-in and check-out are disabled in this state.
  bool get isOnLeave => _todayStatus?['onLeave'] == true;

  /// The leave type label (e.g. "ANNUAL", "SICK") when on leave.
  String? get leaveType {
    final info = _todayStatus?['leaveInfo'] as Map?;
    return info?['leaveType']?.toString();
  }

  /// True when today is a public holiday (FULL_DAY off).
  bool get isHoliday {
    if (_todayStatus?['isHoliday'] != true) return false;
    final info = _todayStatus?['holidayInfo'] as Map?;
    final offType = info?['offType']?.toString() ?? 'FULL_DAY';
    return offType == 'FULL_DAY';
  }

  /// True when today is a half-day public holiday (employees still check in).
  bool get isHalfDayHoliday {
    if (_todayStatus?['isHoliday'] != true) return false;
    final info = _todayStatus?['holidayInfo'] as Map?;
    return (info?['offType']?.toString() ?? 'FULL_DAY') == 'HALF_DAY';
  }

  /// Holiday name for display.
  String? get holidayName {
    final info = _todayStatus?['holidayInfo'] as Map?;
    return info?['name']?.toString();
  }

  /// True when today is a scheduled off-day (non-working per schedule or holiday).
  bool get isOffDay => _todayStatus?['isOffDay'] == true;

  // â”€â”€ Schedule window helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  Map<String, dynamic>? get _scheduleData =>
      (_todayStatus?['schedule'] as Map?)?.cast<String, dynamic>();

  /// The time (local) at which the check-in window closes (workStart + 5 min).
  /// After this time the button is disabled and the employee is absent.
  DateTime? get checkInWindowEnd {
    // Server sends this as halfDayDeadline for backward compat
    final raw = _scheduleData?['halfDayDeadline']?.toString();
    if (raw == null) return null;
    try { return DateTime.parse(raw).toLocal(); } catch (_) { return null; }
  }

  /// Kept for backward compat â€” same as checkInWindowEnd.
  DateTime? get halfDayDeadline => checkInWindowEnd;

  /// The time (local) at which the check-in window closes (= shift end).
  /// Returns null when no schedule data is available.
  DateTime? get shiftEndTime {
    final raw = _scheduleData?['shiftEndTime']?.toString();
    if (raw == null) return null;
    try { return DateTime.parse(raw).toLocal(); } catch (_) { return null; }
  }

  /// The earliest time (local) the employee may check out (= shift start + halfDayAfterMinutes).
  DateTime? get earliestCheckoutTime {
    final raw = _scheduleData?['earliestCheckoutTime']?.toString();
    if (raw == null) return null;
    try { return DateTime.parse(raw).toLocal(); } catch (_) { return null; }
  }

  /// Grace minutes from schedule (for display purposes).
  int get graceMinutes =>
      ((_scheduleData?['graceMinutes'] ?? 15) as num).toInt();

  /// True when the server says the check-in window is still open.
  bool get checkInWindowOpen =>
      _scheduleData?['checkInWindowOpen'] == true;

  /// The end of the check-out window (= shiftEnd + 2 hours).
  /// After this time checkout is no longer available.
  DateTime? get checkoutWindowEnd {
    final raw = _scheduleData?['checkoutWindowEnd']?.toString();
    if (raw == null) return null;
    try { return DateTime.parse(raw).toLocal(); } catch (_) { return null; }
  }

  /// True when the server says the check-out window is open
  /// (i.e. shift end arrived AND 2hr window not yet expired).
  bool get checkOutWindowOpen =>
      _scheduleData?['checkOutWindowOpen'] == true;

  // â”€â”€ Button gate logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /// Check-in: allowed only within workStart â†’ workStart+5min window.
  /// Once window closes (ABSENT phase) or already checked in â†’ disabled.
  bool get canCheckIn {
    if (isCheckedIn || isCheckedOut) return false;
    if (isOnLeave || isHoliday || isOffDay) return false;
    // Window closed by server (past workStart+5min) â€” no more check-in
    if (_scheduleData != null && !checkInWindowOpen) return false;
    return true;
  }

  /// Check-out: only if checked in AND shift end time has arrived.
  /// No check-in = button permanently disabled even after shift end.
  bool get canCheckOut {
    if (!isCheckedIn) return false;              // must check in first
    if (isCheckedOut || isOnLeave) return false;
    final phase = _todayStatus?['phase']?.toString();
    if (phase == 'CHECKED_OUT' || phase == 'AUTO_CHECKOUT' ||
        phase == 'ABSENT') return false;
    // Only enabled once shift end arrives
    if (_scheduleData != null && !checkOutWindowOpen) return false;
    return true;
  }

  Future<void> getTodayStatus() async {
    try {
      final res = await _api.get('/attendance/today');
      if (ResponseParser.isSuccess(res)) {
        final next = ResponseParser.asMap(ResponseParser.getData(res));
        // Only notify if something actually changed
        if (_todayStatus?.toString() != next?.toString()) {
          _todayStatus = next;
          notifyListeners();
        }
      }
    } catch (_) {}
  }

  Future<void> getMonthStats() async {
    try {
      final now   = DateTime.now();
      final start = DateTime(now.year, now.month, 1).toIso8601String().split('T')[0];
      final end   = now.toIso8601String().split('T')[0];
      final res   = await _api.get('/attendance/stats?startDate=$start&endDate=$end');
      if (ResponseParser.isSuccess(res)) {
        final next = ResponseParser.asMap(ResponseParser.getData(res));
        if (_monthStats?.toString() != next?.toString()) {
          _monthStats = next;
          notifyListeners();
        }
      }
    } catch (_) {}
  }

  Future<void> getMyAttendance({bool refresh = false}) async {
    if (_isLoading && !refresh) return;
    if (refresh) { _page = 1; _hasMore = true; _myAttendance = []; }
    if (!_hasMore && !refresh) return;

    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final res = await _api.get('/attendance/me?page=$_page&limit=30');
      if (ResponseParser.isSuccess(res)) {
        final records = ResponseParser.asList(ResponseParser.getData(res));
        final meta = ResponseParser.asMap(res['meta']);
        if (refresh) {
          _myAttendance = records;
        } else {
          _myAttendance = [..._myAttendance, ...records];
        }
        _hasMore = meta?['hasNext'] == true;
        _page++;
      } else {
        _error = ResponseParser.errorMessage(res, 'Failed to load attendance history');
      }
    } catch (_) {
      _error = 'Connection issue. Please retry.';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<({bool ok, String message})> checkIn({double? latitude, double? longitude}) async {
    if (_isLoading) return (ok: false, message: 'Request already in progress...');
    if (!canCheckIn) return (ok: false, message: isCheckedIn ? 'Already checked in' : 'Already completed for today');

    _isLoading = true;
    notifyListeners();

    double? lat = latitude;
    double? lon = longitude;
    double? accuracyM;

    if (lat == null || lon == null) {
      try {
        final serviceEnabled = await Geolocator.isLocationServiceEnabled();
        if (!serviceEnabled) {
          _isLoading = false; notifyListeners();
          return (ok: false, message: 'GPS services are disabled.');
        }
        LocationPermission perm = await Geolocator.checkPermission();
        if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
        if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
          _isLoading = false; notifyListeners();
          return (ok: false, message: 'Location permissions denied.');
        }
        // Hard 10s timeout â€” same as QR path â€” prevents indefinite block
        final pos = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.high,
          timeLimit: const Duration(seconds: 5),
        );
        lat = pos.latitude;
        lon = pos.longitude;
        accuracyM = pos.accuracy;
      } catch (_) {
        // GPS timed out or failed â€” proceed without location (backend will enforce)
      }
    }

    final body = <String, dynamic>{
      if (lat != null) 'latitude': lat,
      if (lon != null) 'longitude': lon,
      if (accuracyM != null) 'gpsAccuracyM': accuracyM,
      'method': 'GPS',
    };

    try {
      final connected = await _api.isConnected();
      if (!connected) {
        await OfflineService.instance.queueCheckIn(body);
        _isLoading = false; notifyListeners();
        return (ok: true, message: 'Saved offline. Will sync when online.');
      }

      final res = await _api.post('/attendance/check-in', body: body);
      if (ResponseParser.isSuccess(res)) {
        HapticFeedback.mediumImpact();
        // Optimistically update local state so UI responds immediately
        _todayStatus = {
          ...(_todayStatus ?? {}),
          'isCheckedIn': true,
          'isCheckedOut': false,
          'checkInTime': DateTime.now().toIso8601String(),
        };
        _isLoading = false;
        notifyListeners();
        // Refresh data in background â€” don't block the success response
        Future.wait([getTodayStatus(), getMonthStats(), getMyAttendance(refresh: true)])
            .catchError((_) {});
        return (ok: true, message: ResponseParser.asString(res['message']) ?? 'Checked in successfully!');
      }
      HapticFeedback.lightImpact();
      return (ok: false, message: ResponseParser.errorMessage(res, 'Check-in failed'));
    } catch (_) {
      await OfflineService.instance.queueCheckIn(body);
      return (ok: true, message: 'Network issue. Saved offline for sync.');
    } finally {
      _isLoading = false; notifyListeners();
    }
  }

  Future<({bool ok, String message})> checkOut({double? latitude, double? longitude}) async {
    if (_isLoading) return (ok: false, message: 'Request already in progress...');
    if (!canCheckOut) return (ok: false, message: 'Not checked in yet');

    _isLoading = true; notifyListeners();

    double? lat = latitude;
    double? lon = longitude;
    double? accuracyM;

    // Always acquire a fresh GPS fix for checkout â€” geofence is enforced on checkout too.
    try {
      final serviceEnabled = await Geolocator.isLocationServiceEnabled();
      if (!serviceEnabled) {
        _isLoading = false; notifyListeners();
        return (ok: false, message: 'GPS services are disabled. Enable location and try again.');
      }
      LocationPermission perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied) perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
        _isLoading = false; notifyListeners();
        return (ok: false, message: 'Location permissions denied.');
      }
      // Hard 10s timeout â€” prevents indefinite block on slow GPS fix
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 5),
      );
      lat = pos.latitude;
      lon = pos.longitude;
      accuracyM = pos.accuracy;
    } catch (_) {
      // GPS timed out or failed â€” proceed; backend will enforce
    }

    try {
      final res = await _api.post('/attendance/check-out', body: {
        if (lat != null) 'latitude': lat,
        if (lon != null) 'longitude': lon,
        if (accuracyM != null) 'gpsAccuracyM': accuracyM,
      });
      if (ResponseParser.isSuccess(res)) {
        HapticFeedback.heavyImpact();
        // Optimistically update local state so UI responds immediately
        _todayStatus = {
          ...(_todayStatus ?? {}),
          'isCheckedIn': false,
          'isCheckedOut': true,
          'checkOutTime': DateTime.now().toIso8601String(),
        };
        _isLoading = false;
        notifyListeners();
        // Refresh in background â€” don't block the success response
        Future.wait([getTodayStatus(), getMonthStats(), getMyAttendance(refresh: true)])
            .catchError((_) {});
        return (ok: true, message: ResponseParser.asString(res['message']) ?? 'Checked out successfully!');
      }
      HapticFeedback.lightImpact();
      return (ok: false, message: ResponseParser.errorMessage(res, 'Check-out failed'));
    } catch (_) {
      return (ok: false, message: 'Network error. Please try again.');
    } finally {
      _isLoading = false; notifyListeners();
    }
  }

  Future<({bool ok, String message})> qrAttendance(
    String qrData, {
    required String qrPassword,
    double? latitude,
    double? longitude,
    double? gpsAccuracyM,
    String action = 'CHECK_IN',
  }) async {
    if (_isLoading) return (ok: false, message: 'Request already in progress...');
    _isLoading = true; notifyListeners();

    try {
      final res = await _api.post('/attendance/qr-attendance', body: {
        'qrData': qrData,
        'qrPassword': qrPassword,
        'action': action,
        if (latitude != null) 'latitude': latitude,
        if (longitude != null) 'longitude': longitude,
        if (gpsAccuracyM != null) 'gpsAccuracyM': gpsAccuracyM,
      });
      if (ResponseParser.isSuccess(res)) {
        // Optimistically mark checked in/out immediately, refresh in background
        final isCheckOut = action.toUpperCase() == 'CHECK_OUT';
        _todayStatus = {
          ...(_todayStatus ?? {}),
          'isCheckedIn': !isCheckOut,
          'isCheckedOut': isCheckOut,
          if (!isCheckOut) 'checkInTime': DateTime.now().toIso8601String(),
          if (isCheckOut) 'checkOutTime': DateTime.now().toIso8601String(),
        };
        _isLoading = false;
        notifyListeners();
        Future.wait([getTodayStatus(), getMonthStats(), getMyAttendance(refresh: true)])
            .catchError((_) {});
        return (ok: true, message: ResponseParser.asString(res['message']) ?? 'Attendance recorded.');
      }
      // Return the actual server error message (QR_INVALID_SIG, GEOFENCE_VIOLATION, etc.)
      final errMsg = ResponseParser.errorMessage(res, 'QR attendance failed');
      return (ok: false, message: errMsg);
    } on Exception catch (e) {
      final msg = e.toString();
      if (msg.contains('unreachable') || msg.contains('SocketException') || msg.contains('timed out')) {
        return (ok: false, message: 'Server unreachable. Check your connection.');
      }
      return (ok: false, message: 'Server unreachable. Check your connection.');
    } finally {
      _isLoading = false; notifyListeners();
    }
  }

  Future<({bool ok, String message})> qrCheckIn(String qrData, {double? latitude, double? longitude, String? qrPassword}) async {
    if (qrPassword != null && qrPassword.isNotEmpty) {
      return qrAttendance(qrData, qrPassword: qrPassword, latitude: latitude, longitude: longitude);
    }
    if (_isLoading) return (ok: false, message: 'Request already in progress...');
    _isLoading = true; notifyListeners();

    try {
      final res = await _api.post('/attendance/qr-check-in', body: {
        'qrData': qrData,
        if (latitude != null) 'latitude': latitude,
        if (longitude != null) 'longitude': longitude,
      });
      if (ResponseParser.isSuccess(res)) {
        _todayStatus = {
          ...(_todayStatus ?? {}),
          'isCheckedIn': true,
          'isCheckedOut': false,
          'checkInTime': DateTime.now().toIso8601String(),
        };
        _isLoading = false;
        notifyListeners();
        Future.wait([getTodayStatus(), getMonthStats(), getMyAttendance(refresh: true)])
            .catchError((_) {});
        return (ok: true, message: ResponseParser.asString(res['message']) ?? 'QR validation successful!');
      }
      return (ok: false, message: ResponseParser.errorMessage(res, 'QR validation failed'));
    } catch (_) {
      return (ok: false, message: 'Network error. Please try again.');
    } finally {
      _isLoading = false; notifyListeners();
    }
  }

  void clearError() { _error = null; notifyListeners(); }
}
