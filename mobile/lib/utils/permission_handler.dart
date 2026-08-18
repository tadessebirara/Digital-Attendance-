// ignore_for_file: use_build_context_synchronously
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:geolocator/geolocator.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'app_theme.dart';

/// Full permission flow:
/// 1. On app start → request camera + location ONCE (OS dialog fires only once)
/// 2. Subsequent startups skip OS dialogs if already granted
/// 3. If "While using" granted → silently accept (no "Always" upgrade nagging)
/// 4. If denied → show a clean in-app dialog once per session
/// 5. If permanently denied → send to app settings
/// 6. If GPS toggle is off → show a snackbar to enable
/// 7. On QR / check-in / check-out → re-check, only dialog if truly blocked
class AppPermissionHandler {
  static const _kLocationAskedKey = 'perm_location_asked';
  static const _kCameraAskedKey   = 'perm_camera_asked';

  // ── Entry points ─────────────────────────────────────────────────────────────

  /// Called once on login / app start. Requests both permissions.
  /// Non-blocking — only shows OS dialog on the very first run.
  static Future<void> requestOnStartup(BuildContext context) async {
    await requestCameraFlow(context, blocking: false);
    await requestLocationFlow(context, blocking: false);
  }

  /// Called before check-in, check-out, or QR scan.
  /// BLOCKING — keeps showing the dialog until both are granted.
  /// Returns true when both are ready.
  static Future<bool> requireForAttendance(BuildContext context) async {
    final camOk = await requestCameraFlow(context, blocking: true);
    if (!camOk) return false;
    return requestLocationFlow(context, blocking: true);
  }

  // ── Camera flow ───────────────────────────────────────────────────────────────

  static Future<bool> requestCameraFlow(BuildContext context, {bool blocking = true}) async {
    PermissionStatus status = await Permission.camera.status;

    // Already granted
    if (status.isGranted) return true;

    // First-time ask → trigger OS dialog (only once, tracked in prefs)
    if (status.isDenied) {
      final prefs = await SharedPreferences.getInstance();
      final alreadyAsked = prefs.getBool(_kCameraAskedKey) ?? false;
      if (!alreadyAsked) {
        await prefs.setBool(_kCameraAskedKey, true);
        status = await Permission.camera.request();
        if (status.isGranted) return true;
      }
    }

    if (!context.mounted) return false;

    // Permanently denied → must go to app settings
    if (status.isPermanentlyDenied) {
      if (blocking) {
        await _showBlockingDialog(
          context,
          icon: Icons.camera_alt_rounded,
          iconColor: AppTheme.accent,
          title: 'Camera Access Required',
          message:
              'Camera permission is blocked. Tap "Open Settings", enable Camera, then come back.',
          actionLabel: 'Open Settings',
          onAction: () async {
            await openAppSettings();
            await Future.delayed(const Duration(seconds: 1));
          },
        );
        return await Permission.camera.status == PermissionStatus.granted;
      } else {
        _showSettingsSnack(context, 'Camera access blocked. Go to Settings → Apps → Alyah → Permissions.');
        return false;
      }
    }

    // Denied — show explanation once if blocking
    if (blocking && context.mounted) {
      final retry = await _showExplanationDialog(
        context,
        icon: Icons.camera_alt_rounded,
        iconColor: AppTheme.accent,
        title: 'Camera Needed for QR Scan',
        message: 'Alyah uses camera to scan QR codes for attendance. Please tap Allow.',
        actionLabel: 'Allow Camera',
      );
      if (retry) {
        status = await Permission.camera.request();
        return status.isGranted;
      }
    }
    return false;
  }

  // ── Location flow ─────────────────────────────────────────────────────────────

  static Future<bool> requestLocationFlow(BuildContext context, {bool blocking = true}) async {
    // Step 1: check if GPS service is on
    bool serviceOn = await Geolocator.isLocationServiceEnabled();
    if (!serviceOn) {
      if (!context.mounted) return false;
      if (blocking) {
        await _showBlockingDialog(
          context,
          icon: Icons.location_on_rounded,
          iconColor: AppTheme.warning,
          title: 'Turn On Location',
          message: 'Your GPS is off. Alyah needs GPS to verify your check-in location.',
          actionLabel: 'Enable GPS',
          onAction: () async {
            await Geolocator.openLocationSettings();
            await Future.delayed(const Duration(seconds: 2));
          },
        );
        serviceOn = await Geolocator.isLocationServiceEnabled();
        if (!serviceOn) return false;
      } else {
        if (context.mounted) _showGpsBanner(context);
        return false;
      }
    }

    if (!context.mounted) return false;

    // Step 2: check/request permission
    LocationPermission perm = await Geolocator.checkPermission();

    if (perm == LocationPermission.denied) {
      final prefs = await SharedPreferences.getInstance();
      final alreadyAsked = prefs.getBool(_kLocationAskedKey) ?? false;
      if (!alreadyAsked) {
        await prefs.setBool(_kLocationAskedKey, true);
        perm = await Geolocator.requestPermission();
      }
    }

    if (!context.mounted) return false;

    // "While using" is sufficient — no forced "Always" upgrade dialog
    if (perm == LocationPermission.always || perm == LocationPermission.whileInUse) {
      return true;
    }

    // Permanently denied
    if (perm == LocationPermission.deniedForever) {
      if (blocking) {
        await _showBlockingDialog(
          context,
          icon: Icons.location_off_rounded,
          iconColor: AppTheme.danger,
          title: 'Location Access Blocked',
          message:
              'Location permission is blocked. Tap "Open Settings" → Permissions → Location → Allow.',
          actionLabel: 'Open Settings',
          onAction: () async {
            await openAppSettings();
            await Future.delayed(const Duration(seconds: 1));
          },
        );
        final after = await Geolocator.checkPermission();
        return after == LocationPermission.always || after == LocationPermission.whileInUse;
      } else {
        if (context.mounted) {
          _showSettingsSnack(context, 'Location blocked. Go to Settings → Apps → Alyah → Permissions → Location.');
        }
        return false;
      }
    }

    // Denied but not permanently — show one explanation dialog if blocking
    if (perm == LocationPermission.denied && blocking && context.mounted) {
      final retry = await _showExplanationDialog(
        context,
        icon: Icons.location_on_rounded,
        iconColor: AppTheme.accent,
        title: 'Location Needed',
        message: 'Alyah needs your location to verify you are on-site when checking in.',
        actionLabel: 'Allow Location',
      );
      if (retry) {
        perm = await Geolocator.requestPermission();
        return perm == LocationPermission.always || perm == LocationPermission.whileInUse;
      }
    }

    return false;
  }

  // ── Quick checks ─────────────────────────────────────────────────────────────

  static Future<bool> isLocationReady() async {
    final serviceOn = await Geolocator.isLocationServiceEnabled();
    if (!serviceOn) return false;
    final perm = await Geolocator.checkPermission();
    return perm == LocationPermission.always || perm == LocationPermission.whileInUse;
  }

  static Future<bool> isCameraReady() async {
    return await Permission.camera.status == PermissionStatus.granted;
  }

  // ── Dialog helpers ────────────────────────────────────────────────────────────

  static Future<void> _showBlockingDialog(
    BuildContext context, {
    required IconData icon,
    required Color iconColor,
    required String title,
    required String message,
    required String actionLabel,
    required Future<void> Function() onAction,
  }) async {
    if (!context.mounted) return;
    await showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => WillPopScope(
        onWillPop: () async => false,
        child: AlertDialog(
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
          contentPadding: const EdgeInsets.fromLTRB(24, 28, 24, 0),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 72, height: 72,
                decoration: BoxDecoration(
                  color: iconColor.withValues(alpha: 0.10),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: iconColor, size: 34),
              ),
              const SizedBox(height: 18),
              Text(title,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontSize: 17, fontWeight: FontWeight.w800, color: AppTheme.primary)),
              const SizedBox(height: 10),
              Text(message,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontSize: 13, color: AppTheme.gray600, height: 1.6)),
            ],
          ),
          actionsAlignment: MainAxisAlignment.center,
          actionsPadding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
          actions: [
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: iconColor,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 15),
                  elevation: 0,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                ),
                onPressed: () async {
                  Navigator.pop(ctx);
                  await onAction();
                },
                child: Text(actionLabel,
                    style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
              ),
            ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Not now',
                  style: TextStyle(color: AppTheme.gray400, fontSize: 13)),
            ),
          ],
        ),
      ),
    );
  }

  static Future<bool> _showExplanationDialog(
    BuildContext context, {
    required IconData icon,
    required Color iconColor,
    required String title,
    required String message,
    required String actionLabel,
  }) async {
    if (!context.mounted) return false;
    final result = await showDialog<bool>(
      context: context,
      barrierDismissible: true,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        contentPadding: const EdgeInsets.fromLTRB(24, 28, 24, 0),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 72, height: 72,
              decoration: BoxDecoration(
                color: iconColor.withValues(alpha: 0.10),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, color: iconColor, size: 34),
            ),
            const SizedBox(height: 18),
            Text(title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    fontSize: 17, fontWeight: FontWeight.w800, color: AppTheme.primary)),
            const SizedBox(height: 10),
            Text(message,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    fontSize: 13, color: AppTheme.gray600, height: 1.6)),
          ],
        ),
        actionsAlignment: MainAxisAlignment.center,
        actionsPadding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
        actions: [
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: iconColor,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 15),
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
              ),
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(actionLabel,
                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15)),
            ),
          ),
          const SizedBox(height: 8),
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Skip for now',
                style: TextStyle(color: AppTheme.gray400, fontSize: 13)),
          ),
        ],
      ),
    );
    return result ?? false;
  }

  static void _showSettingsSnack(BuildContext context, String message) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: AppTheme.warning,
      behavior: SnackBarBehavior.floating,
      duration: const Duration(seconds: 5),
      action: SnackBarAction(
        label: 'Settings',
        textColor: Colors.white,
        onPressed: openAppSettings,
      ),
    ));
  }

  static void _showGpsBanner(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: const Text('GPS is off — tap to enable for check-in'),
      backgroundColor: AppTheme.warning,
      behavior: SnackBarBehavior.floating,
      duration: const Duration(seconds: 5),
      action: SnackBarAction(
        label: 'Turn On',
        textColor: Colors.white,
        onPressed: () => Geolocator.openLocationSettings(),
      ),
    ));
  }

  // ── Legacy compatibility ──────────────────────────────────────────────────────
  static Future<bool> requestAllPermissions(BuildContext context) =>
      requireForAttendance(context);

  static Future<bool> requestCameraPermission(BuildContext context) =>
      requestCameraFlow(context, blocking: true);

  static Future<bool> requestLocationPermission(BuildContext context) =>
      requestLocationFlow(context, blocking: true);

  static void showGpsDisabledDialog(BuildContext context) {
    _showBlockingDialog(
      context,
      icon: Icons.location_on_rounded,
      iconColor: AppTheme.warning,
      title: 'Turn On Location',
      message: 'GPS is off on your device. Tap "Enable GPS" to turn it on.',
      actionLabel: 'Enable GPS',
      onAction: () async {
        await Geolocator.openLocationSettings();
        await Future.delayed(const Duration(seconds: 2));
      },
    );
  }
}
