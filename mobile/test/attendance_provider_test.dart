import 'package:flutter_test/flutter_test.dart';
import 'package:alyah_smart_attendance/providers/attendance_provider.dart';

void main() {
  late AttendanceProvider provider;

  setUp(() {
    provider = AttendanceProvider();
  });

  group('AttendanceProvider Logic Tests', () {
    test('Initial state should be empty', () {
      expect(provider.myAttendance, isEmpty);
      expect(provider.isLoading, false);
    });

    test('isLate getter should handle null monthStats', () {
      expect(provider.lateDays, 0);
    });

    test('UI guards should return correct states based on todayStatus', () {
      // Logic only test, no network
      expect(provider.canCheckIn, true);
    });
  });
}
