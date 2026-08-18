import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'dart:io' show Platform;

/// Debug mode  → uses local network IP (phone on same WiFi as your PC)
/// Release mode → uses Render production backend
///
/// Override at build time:
///   flutter run  --dart-define=API_BASE_URL=http://192.168.x.x:5000/api
///   flutter build apk --dart-define=API_BASE_URL=https://your-server.com/api
class ApiConstants {
  // ── Production ────────────────────────────────────────────────────────────
  static const String _productionUrl =
      'https://attendance.alyahsoftware.com/api';

  // ── Local server — PC's WiFi IP (phone must be on same network) ──────────
  // Update this when your PC's IP changes: run `ipconfig` → IPv4 Address
  static const String _localNetworkUrl = 'http://192.168.1.9:5000/api';

  // ── Localhost fallback — Flutter web / Android emulator / desktop ─────────
  static const String _localUrl = 'http://localhost:5000/api';

  static String get baseUrl {
    // 1. Build-time override always wins
    const override = String.fromEnvironment('API_BASE_URL', defaultValue: '');
    if (override.isNotEmpty) return override;

    // 2. Flutter web on localhost machine
    if (kIsWeb) return _localUrl;

    // 3. Release / profile → production
    if (!kDebugMode) return _productionUrl;

    // 4. Debug on a real Android/iOS device → use WiFi IP so the phone can
    //    actually reach the backend running on this machine.
    //    Android emulator uses 10.0.2.2, not localhost.
    try {
      if (Platform.isAndroid || Platform.isIOS) {
        return _localNetworkUrl;
      }
    } catch (_) {}

    // 5. Desktop debug (Windows/macOS/Linux) → localhost is fine
    return _localUrl;
  }

  static String get socketUrl {
    final api = baseUrl;
    if (api.endsWith('/api')) {
      return api.substring(0, api.length - 4);
    }
    return api.replaceFirst(RegExp(r'/api/?$'), '');
  }

  static const Duration timeout        = Duration(seconds: 12);
  static const Duration connectTimeout = Duration(seconds: 8);

  static const String login         = '/auth/login';
  static const String register      = '/auth/register';
  static const String me            = '/auth/me';
  static const String attendance    = '/attendance';
  static const String leaves        = '/leaves';
  static const String chat          = '/chat';
  static const String announcements = '/announcements';
  static const String dashboard     = '/dashboard';
}

class AppConstants {
  static const String appName = 'Alyah Smart Attendance';
  static const String appVersion = '1.0.0';

  static const String tokenKey = 'auth_token';
  static const String userKey = 'user_data';
  static const String deviceIdKey = 'device_id';

  static const Duration shortAnimation = Duration(milliseconds: 200);
  static const Duration mediumAnimation = Duration(milliseconds: 300);
  static const Duration longAnimation = Duration(milliseconds: 500);
}

class LeaveTypes {
  static const String sick = 'SICK';
  static const String vacation = 'VACATION';
  static const String personal = 'PERSONAL';
  static const String emergency = 'EMERGENCY';
  static const String maternity = 'MATERNITY';
  static const String paternity = 'PATERNITY';

  static const Map<String, String> labels = {
    sick: 'Sick Leave',
    vacation: 'Vacation',
    personal: 'Personal',
    emergency: 'Emergency',
    maternity: 'Maternity',
    paternity: 'Paternity',
  };

  static const Map<String, Color> colors = {
    sick: Color(0xFFEF4444),
    vacation: Color(0xFF10B981),
    personal: Color(0xFF3B82F6),
    emergency: Color(0xFFF59E0B),
    maternity: Color(0xFFEC4899),
    paternity: Color(0xFF8B5CF6),
  };
}

class AttendanceStatus {
  static const String present = 'PRESENT';
  static const String absent = 'ABSENT';
  static const String late = 'LATE';
  static const String halfDay = 'HALF_DAY';

  static const Map<String, String> labels = {
    present: 'Present',
    absent: 'Absent',
    late: 'Late',
    halfDay: 'Half Day',
  };
}
