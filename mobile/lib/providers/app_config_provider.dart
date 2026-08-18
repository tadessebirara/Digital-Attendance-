import 'package:flutter/material.dart';
import '../services/api_service.dart';

/// A single office location used for geofencing.
class OfficeLocation {
  final int id;
  final String name;
  final double lat;
  final double lng;
  final double radiusM;

  const OfficeLocation({
    required this.id,
    required this.name,
    required this.lat,
    required this.lng,
    required this.radiusM,
  });

  factory OfficeLocation.fromJson(Map<String, dynamic> j) => OfficeLocation(
    id:      (j['id'] as num).toInt(),
    name:    j['name'] as String? ?? 'Office',
    lat:     (j['lat'] as num).toDouble(),
    lng:     (j['lng'] as num).toDouble(),
    radiusM: (j['radiusM'] as num?)?.toDouble() ?? 200,
  );
}

/// Loaded once at startup from GET /admin/public-config (no auth required).
/// Provides dynamic branding, QR toggle, and GPS accuracy thresholds.
class AppConfig {
  final String companyName;
  final String logoUrl;
  final Color primaryColor;
  final bool qrEnabled;
  final bool qrAttendancePasswordRequired;
  final int qrExpirySeconds;
  final double gpsAccuracyWarnM;
  final double gpsAccuracyMaxM;
  // Legacy single geofence (fallback when no offices configured)
  final double geofenceLat;
  final double geofenceLng;
  final double geofenceRadiusM;
  // Multi-office geofencing
  final List<OfficeLocation> offices;

  const AppConfig({
    required this.companyName,
    required this.logoUrl,
    required this.primaryColor,
    required this.qrEnabled,
    required this.qrAttendancePasswordRequired,
    required this.qrExpirySeconds,
    required this.gpsAccuracyWarnM,
    required this.gpsAccuracyMaxM,
    required this.geofenceLat,
    required this.geofenceLng,
    required this.geofenceRadiusM,
    required this.offices,
  });

  static const AppConfig defaults = AppConfig(
    companyName:                  'Alyah Smart Attendance',
    logoUrl:                      '',
    primaryColor:                 Color(0xFF0F172A),
    qrEnabled:                    true,
    qrAttendancePasswordRequired: false,
    qrExpirySeconds:              60,
    gpsAccuracyWarnM:             50,
    gpsAccuracyMaxM:              100,
    geofenceLat:                  0,
    geofenceLng:                  0,
    geofenceRadiusM:              100,
    offices:                      [],
  );

  /// Returns true if any geofence is configured (offices or legacy global).
  bool get hasGeofence {
    if (offices.isNotEmpty) return true;
    return geofenceLat != 0.0 || geofenceLng != 0.0;
  }

  factory AppConfig.fromJson(Map<String, dynamic> j) {
    Color color = const Color(0xFF0F172A);
    final raw = j['primaryColor'] as String? ?? '';
    if (raw.startsWith('#') && raw.length == 7) {
      try { color = Color(int.parse('FF${raw.substring(1)}', radix: 16)); } catch (_) {}
    }
    final geo = j['geofence'] as Map<String, dynamic>? ?? {};
    final officeList = (j['offices'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(OfficeLocation.fromJson)
        .toList();
    return AppConfig(
      companyName:                  j['companyName']                  as String?  ?? defaults.companyName,
      logoUrl:                      j['logoUrl']                      as String?  ?? defaults.logoUrl,
      primaryColor:                 color,
      qrEnabled:                    j['qrEnabled']                    as bool?    ?? defaults.qrEnabled,
      qrAttendancePasswordRequired: j['qrAttendancePasswordRequired'] as bool?    ?? defaults.qrAttendancePasswordRequired,
      qrExpirySeconds:              (j['qrExpirySeconds']  as num?)?.toInt()    ?? defaults.qrExpirySeconds,
      gpsAccuracyWarnM:             (j['gpsAccuracyWarnM'] as num?)?.toDouble() ?? defaults.gpsAccuracyWarnM,
      gpsAccuracyMaxM:              (j['gpsAccuracyMaxM']  as num?)?.toDouble() ?? defaults.gpsAccuracyMaxM,
      geofenceLat:                  (geo['lat']     as num?)?.toDouble() ?? defaults.geofenceLat,
      geofenceLng:                  (geo['lng']     as num?)?.toDouble() ?? defaults.geofenceLng,
      geofenceRadiusM:              (geo['radiusM'] as num?)?.toDouble() ?? defaults.geofenceRadiusM,
      offices:                      officeList,
    );
  }
}

class AppConfigProvider with ChangeNotifier {
  AppConfig _config = AppConfig.defaults;
  bool _loaded = false;

  AppConfig get config => _config;
  bool get loaded => _loaded;

  /// Call once from SplashScreen before navigating.
  /// Pass [forceRefresh: true] when called from a socket event to bypass the TTL cache.
  Future<void> load({bool forceRefresh = false}) async {
    try {
      // Invalidate cache on forced refresh so the socket-triggered reload
      // actually hits the network instead of returning stale data.
      if (forceRefresh) {
        ApiService.instance.invalidateCache('/admin/public-config');
      }
      final data = await ApiService.instance.get(
        '/admin/public-config',
        cacheTtl: const Duration(hours: 6),
      );
      if (data['success'] == true && data['data'] is Map<String, dynamic>) {
        _config = AppConfig.fromJson(data['data'] as Map<String, dynamic>);
      }
    } catch (_) {
      // Network failure — use current config, app still works
    } finally {
      _loaded = true;
      notifyListeners();
    }
  }
}
