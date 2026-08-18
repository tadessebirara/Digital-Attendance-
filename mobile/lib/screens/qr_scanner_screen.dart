// ignore_for_file: use_build_context_synchronously
import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';
import '../providers/attendance_provider.dart';
import '../providers/app_config_provider.dart';
import '../providers/location_provider.dart';
import '../utils/app_theme.dart';
import '../utils/permission_handler.dart';

// ─────────────────────────────────────────────────────────────────────────────
// QR Scanner — clean, fast, GPS-streamed.
//
// GPS streams in the background via LocationProvider (started at login).
// When QR is scanned:
//   1. Read current position from LocationProvider — INSTANT (0 ms wait)
//   2. Check if inside office radius — client-side, also instant
//   3. Outside? → reject immediately, server never called
//   4. Inside?  → POST to server with qrCode + lat/lng → DONE in ~200 ms
//
// No GPS wait. No polling timer inside this screen. Clean.
// ─────────────────────────────────────────────────────────────────────────────

enum _ScanPhase { scanning, checking, submitting, success, error }

class QRScannerScreen extends StatefulWidget {
  final VoidCallback? onBack;
  final ValueNotifier<String?>? intendedActionNotifier;
  const QRScannerScreen({super.key, this.onBack, this.intendedActionNotifier});
  @override
  State<QRScannerScreen> createState() => _QRScannerScreenState();
}

class _QRScannerScreenState extends State<QRScannerScreen>
    with TickerProviderStateMixin {

  late final MobileScannerController _cam;
  bool _cameraGranted = false;
  bool _permChecked   = false;
  bool _torchOn       = false;

  _ScanPhase _phase     = _ScanPhase.scanning;
  String     _statusMsg = 'Align the QR code inside the frame';
  String?    _errorMsg;
  String     _successMsg = '';
  DateTime?  _lastScan;

  late final AnimationController _scanLine;
  late final AnimationController _pulse;
  late final AnimationController _spinner;

  // ── Haversine distance (metres) ───────────────────────────────────────────
  static double _hav(double lat1, double lon1, double lat2, double lon2) {
    const R = 6371000.0;
    final p1 = lat1 * math.pi / 180, p2 = lat2 * math.pi / 180;
    final dp = (lat2 - lat1) * math.pi / 180;
    final dl = (lon2 - lon1) * math.pi / 180;
    final a  = math.sin(dp/2)*math.sin(dp/2) +
               math.cos(p1)*math.cos(p2)*math.sin(dl/2)*math.sin(dl/2);
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a));
  }

  @override
  void initState() {
    super.initState();
    _cam = MobileScannerController(
      detectionSpeed: DetectionSpeed.noDuplicates,
      facing: CameraFacing.back,
      torchEnabled: false,
      formats: const [BarcodeFormat.qrCode],
    );
    _scanLine = AnimationController(vsync: this, duration: const Duration(seconds: 2))
      ..repeat(reverse: true);
    _pulse   = AnimationController(vsync: this, duration: const Duration(milliseconds: 500));
    _spinner = AnimationController(vsync: this, duration: const Duration(seconds: 1));

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkPermissions();
      widget.intendedActionNotifier?.addListener(_onActionChanged);
    });
  }

  @override
  void dispose() {
    widget.intendedActionNotifier?.removeListener(_onActionChanged);
    _cam.dispose();
    _scanLine.dispose(); _pulse.dispose(); _spinner.dispose();
    super.dispose();
  }

  @override
  void deactivate() {
    _scanLine.stop(); _spinner.stop();
    super.deactivate();
  }

  @override
  void activate() {
    super.activate();
    if (_phase == _ScanPhase.scanning && _cameraGranted) _scanLine.repeat(reverse: true);
    if (_phase == _ScanPhase.submitting) _spinner.repeat();
  }

  void _onActionChanged() {
    if (!mounted) return;
    final a = widget.intendedActionNotifier?.value;
    if (a == null) return;
    final att = Provider.of<AttendanceProvider>(context, listen: false);
    if (a == 'CHECK_OUT' && !att.canCheckOut) {
      setState(() { _errorMsg = 'Please check in first before checking out.'; });
    } else {
      setState(() { _errorMsg = null; _statusMsg = 'Align the QR code inside the frame'; });
    }
  }

  Future<void> _checkPermissions() async {
    final cam = await AppPermissionHandler.requestCameraFlow(context, blocking: true);
    await AppPermissionHandler.requestLocationFlow(context, blocking: true);
    if (mounted) setState(() { _cameraGranted = cam; _permChecked = true; });
  }

  // ── QR detected ──────────────────────────────────────────────────────────
  void _onDetect(BarcodeCapture cap) {
    if (_phase != _ScanPhase.scanning) return;
    final now = DateTime.now();
    if (_lastScan != null && now.difference(_lastScan!) < const Duration(seconds: 3)) return;
    _lastScan = now;
    final code = cap.barcodes.firstOrNull?.rawValue;
    if (code == null || code.isEmpty) return;
    HapticFeedback.mediumImpact();
    _pulse.forward(from: 0);
    _process(code);
  }

  // ── Core scan-process logic ───────────────────────────────────────────────
  Future<void> _process(String qrCode) async {

    // Step 1: QR format sanity check (instant)
    if (!qrCode.contains('static-attendance') && !qrCode.contains('"type"')) {
      _fail('Invalid QR code. Please scan the office attendance QR.');
      return;
    }

    // Step 2: Read GPS from background LocationProvider — INSTANT
    _setPhase(_ScanPhase.checking, 'Checking your location...');

    final locProv = Provider.of<LocationProvider>(context, listen: false);
    final cfg     = Provider.of<AppConfigProvider>(context, listen: false).config;

    // If no fresh GPS yet, show a brief message and wait up to 5s for it
    if (!locProv.hasFreshFix) {
      _setPhase(_ScanPhase.checking, 'Waiting for GPS signal...');
      for (int i = 0; i < 10; i++) {
        await Future.delayed(const Duration(milliseconds: 500));
        if (locProv.hasFreshFix) break;
      }
    }

    if (!locProv.hasFreshFix || locProv.latest == null) {
      _fail('GPS unavailable. Make sure location is enabled and try again.');
      return;
    }

    final pos = locProv.latest!;

    // Step 3: Client-side geofence check — is employee inside office radius?
    if (cfg.hasGeofence) {
      double nearD = double.infinity, nearR = 100;
      String? nearName;

      if (cfg.offices.isNotEmpty) {
        nearR = cfg.offices.first.radiusM;
        nearName = cfg.offices.first.name;
        for (final o in cfg.offices) {
          final d = _hav(pos.latitude, pos.longitude, o.lat, o.lng);
          if (d < nearD) { nearD = d; nearR = o.radiusM; nearName = o.name; }
        }
      } else {
        nearD = _hav(pos.latitude, pos.longitude, cfg.geofenceLat, cfg.geofenceLng);
        nearR = cfg.geofenceRadiusM;
      }

      // Accuracy compensation: don't punish employees at the edge of the radius
      final comp = math.min(pos.accuracy, nearR / 2);
      final effD = math.max(0.0, nearD - comp);

      if (effD > nearR) {
        final name = nearName ?? 'the office area';
        _fail('You are outside $name (${nearD.round()}m away, max ${nearR.round()}m).');
        return;
      }
    }

    // Step 4: GPS valid — submit to server
    _setPhase(_ScanPhase.submitting, 'Inside office — recording attendance...');
    _spinner.repeat();

    final att    = Provider.of<AttendanceProvider>(context, listen: false);
    final forced = widget.intendedActionNotifier?.value;
    final action = (forced != null && forced.isNotEmpty)
        ? forced
        : (att.canCheckOut ? 'CHECK_OUT' : 'CHECK_IN');

    if (action == 'CHECK_OUT' && !att.canCheckOut) {
      _fail('Please check in first before checking out.'); return;
    }
    if (action == 'CHECK_IN' && !att.canCheckIn) {
      _fail(att.isCheckedOut
          ? 'Attendance already completed for today.'
          : 'Already checked in.');
      return;
    }

    ({bool ok, String message}) result;
    try {
      result = await att.qrAttendance(
        qrCode,
        qrPassword: '',
        latitude:    pos.latitude,
        longitude:   pos.longitude,
        gpsAccuracyM: pos.accuracy,
        action:      action,
      );
    } catch (_) {
      _fail('Server unreachable. Check your connection.'); return;
    }

    if (!mounted) return;
    _spinner.stop();

    if (result.ok) {
      HapticFeedback.heavyImpact();
      _setPhase(_ScanPhase.success, result.message);
      setState(() => _successMsg = result.message);
    } else {
      _fail(result.message);
    }
  }

  void _setPhase(_ScanPhase p, String msg) {
    if (!mounted) return;
    setState(() { _phase = p; _statusMsg = msg; _errorMsg = null; });
  }

  void _fail(String msg) {
    if (!mounted) return;
    _spinner.stop();
    HapticFeedback.lightImpact();
    setState(() { _phase = _ScanPhase.error; _errorMsg = msg; });
  }

  void _reset() {
    if (!mounted) return;
    widget.intendedActionNotifier?.value = null;
    setState(() {
      _phase = _ScanPhase.scanning; _errorMsg = null; _successMsg = '';
      _statusMsg = 'Align the QR code inside the frame'; _lastScan = null;
    });
    _scanLine.repeat(reverse: true);
    _cam.stop().then((_) => _cam.start());
  }

  void _toggleTorch() async {
    await _cam.toggleTorch();
    if (mounted) setState(() => _torchOn = !_torchOn);
  }

  // ── Build ─────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    if (!_permChecked) {
      return const Scaffold(backgroundColor: Colors.black,
          body: Center(child: CircularProgressIndicator(color: AppTheme.accent)));
    }
    if (_phase == _ScanPhase.success) {
      return _SuccessView(message: _successMsg, onDone: _reset);
    }

    final size  = MediaQuery.of(context).size;
    final bSide = size.width * 0.70;
    final isProc = _phase == _ScanPhase.checking || _phase == _ScanPhase.submitting;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(children: [

        // Camera
        Positioned.fill(child: _cameraGranted
          ? MobileScanner(controller: _cam, onDetect: _onDetect,
              errorBuilder: (_, __, ___) => const _NoCam())
          : const _NoCam()),

        // Dark overlay + cutout
        Positioned.fill(child: CustomPaint(
          painter: _OverlayPainter(boxSide: bSide, alpha: isProc ? 0.85 : 0.72),
        )),

        // Scan line
        if (_cameraGranted && _phase == _ScanPhase.scanning)
          Positioned(
            left:  (size.width - bSide) / 2 + 4,
            right: (size.width - bSide) / 2 + 4,
            top:   (size.height - bSide) / 2,
            child: AnimatedBuilder(
              animation: _scanLine,
              builder: (_, __) => Transform.translate(
                offset: Offset(0, _scanLine.value * (bSide - 8)),
                child: Container(height: 2.5,
                  decoration: BoxDecoration(
                    gradient: LinearGradient(colors: [
                      Colors.transparent, AppTheme.accent,
                      AppTheme.accent.withValues(alpha: 0.6), Colors.transparent,
                    ]),
                    boxShadow: [BoxShadow(
                      color: AppTheme.accent.withValues(alpha: 0.7), blurRadius: 10)],
                  )),
              ),
            ),
          ),

        // Corner brackets
        _Brackets(
          size: size, bSide: bSide, pulse: _pulse,
          color: _phase == _ScanPhase.error ? AppTheme.danger
              : _phase == _ScanPhase.scanning ? Colors.white70 : AppTheme.accent,
        ),

        // Spinner ring while processing
        if (isProc)
          Positioned(
            left:  (size.width - bSide) / 2 - 10,
            top:   (size.height - bSide) / 2 - 10,
            child: AnimatedBuilder(
              animation: _spinner,
              builder: (_, __) => Transform.rotate(
                angle: _spinner.value * 2 * math.pi,
                child: SizedBox(width: bSide + 20, height: bSide + 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 3,
                    color: AppTheme.accent.withValues(alpha: 0.85))),
              ),
            ),
          ),

        // Top bar
        SafeArea(child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          child: Row(children: [
            _IconBtn(icon: Icons.arrow_back_ios_new_rounded,
              onTap: () => widget.onBack != null
                  ? widget.onBack!() : Navigator.maybePop(context)),
            const SizedBox(width: 12),
            const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('QR Attendance',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w900,
                    color: Colors.white, letterSpacing: 0.3)),
              Text('Scan to check in or check out',
                style: TextStyle(fontSize: 11, color: Colors.white60)),
            ])),
            _IconBtn(
              icon: _torchOn ? Icons.flashlight_on_rounded : Icons.flashlight_off_rounded,
              onTap: _cameraGranted ? _toggleTorch : null,
              active: _torchOn,
            ),
          ]),
        )),

        // Live GPS banner — reads from LocationProvider, no polling needed
        Consumer2<LocationProvider, AppConfigProvider>(
          builder: (_, loc, cfgProv, __) => _GpsBanner(
            loc: loc,
            cfg: cfgProv.config,
            size: size,
            bSide: bSide,
          ),
        ),

        // Bottom panel
        Positioned(
          bottom: 0, left: 0, right: 0,
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                _StatusPill(msg: _statusMsg, phase: _phase),
                if (_phase == _ScanPhase.error && _errorMsg != null) ...[
                  const SizedBox(height: 14),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                    decoration: BoxDecoration(
                      color: AppTheme.danger.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: AppTheme.danger.withValues(alpha: 0.4)),
                    ),
                    child: Row(children: [
                      const Icon(Icons.error_rounded, color: AppTheme.danger, size: 18),
                      const SizedBox(width: 10),
                      Expanded(child: Text(_errorMsg!, maxLines: 3,
                        style: const TextStyle(color: Color(0xFFFF8080),
                            fontSize: 12, fontWeight: FontWeight.w600))),
                      const SizedBox(width: 8),
                      GestureDetector(onTap: _reset,
                        child: const Icon(Icons.close_rounded, color: AppTheme.danger, size: 16)),
                    ]),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(width: double.infinity, height: 52,
                    child: ElevatedButton.icon(
                      onPressed: _reset,
                      icon: const Icon(Icons.qr_code_scanner_rounded, size: 20),
                      label: const Text('Scan Again',
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.accent,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(16))),
                    )),
                ],
              ]),
            ),
          ),
        ),
      ]),
    );
  }
}

// ── Live GPS Banner ───────────────────────────────────────────────────────────
class _GpsBanner extends StatelessWidget {
  final LocationProvider loc;
  final AppConfig        cfg;
  final Size             size;
  final double           bSide;

  const _GpsBanner({
    required this.loc, required this.cfg,
    required this.size, required this.bSide,
  });

  static double _hav(double lat1, double lon1, double lat2, double lon2) {
    const R = 6371000.0;
    final p1 = lat1 * math.pi / 180, p2 = lat2 * math.pi / 180;
    final dp = (lat2 - lat1) * math.pi / 180;
    final dl = (lon2 - lon1) * math.pi / 180;
    final a  = math.sin(dp/2)*math.sin(dp/2) +
               math.cos(p1)*math.cos(p2)*math.sin(dl/2)*math.sin(dl/2);
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a));
  }

  @override
  Widget build(BuildContext context) {
    if (!cfg.hasGeofence) return const SizedBox.shrink();

    final top = (size.height - bSide) / 2 + bSide + 12;
    final pos = loc.latest;

    Widget content;
    if (pos == null) {
      content = Row(mainAxisAlignment: MainAxisAlignment.center, children: const [
        SizedBox(width: 14, height: 14,
          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white70)),
        SizedBox(width: 8),
        Text('Getting GPS...', style: TextStyle(color: Colors.white70, fontSize: 12)),
      ]);
    } else {
      // Find nearest office
      double nearD = double.infinity, nearR = 100;
      String? nearName;
      if (cfg.offices.isNotEmpty) {
        nearR = cfg.offices.first.radiusM; nearName = cfg.offices.first.name;
        for (final o in cfg.offices) {
          final d = _hav(pos.latitude, pos.longitude, o.lat, o.lng);
          if (d < nearD) { nearD = d; nearR = o.radiusM; nearName = o.name; }
        }
      } else {
        nearD = _hav(pos.latitude, pos.longitude, cfg.geofenceLat, cfg.geofenceLng);
        nearR = cfg.geofenceRadiusM;
      }

      final comp   = math.min(pos.accuracy, nearR / 2);
      final effD   = math.max(0.0, nearD - comp);
      final inside = effD <= nearR;
      final color  = inside ? const Color(0xFF4ADE80) : const Color(0xFFFF6B6B);
      final label  = nearName ?? 'Office';
      final pct    = ((1 - (effD / (nearR * 1.5)).clamp(0.0, 1.0)) * 100).round();

      content = Column(mainAxisSize: MainAxisSize.min, children: [
        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(inside ? Icons.location_on_rounded : Icons.location_off_rounded,
              color: color, size: 14),
          const SizedBox(width: 6),
          Flexible(child: Text(
            inside
                ? '✓ Inside $label'
                : '${nearD.round()}m from $label (need ${nearR.round()}m)',
            style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w700),
          )),
        ]),
        const SizedBox(height: 6),
        ClipRRect(
          borderRadius: BorderRadius.circular(4),
          child: LinearProgressIndicator(
            value: pct / 100,
            backgroundColor: Colors.white12,
            valueColor: AlwaysStoppedAnimation(color),
            minHeight: 4,
          ),
        ),
        const SizedBox(height: 4),
        Text('GPS ±${pos.accuracy.round()}m',
            style: const TextStyle(color: Colors.white38, fontSize: 10)),
      ]);
    }

    return Positioned(
      top: top, left: (size.width - bSide) / 2, width: bSide,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.75),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
        ),
        child: content,
      ),
    );
  }
}

// ── Status pill ───────────────────────────────────────────────────────────────
class _StatusPill extends StatelessWidget {
  final String     msg;
  final _ScanPhase phase;
  const _StatusPill({required this.msg, required this.phase});

  @override
  Widget build(BuildContext context) {
    final Color dot;
    switch (phase) {
      case _ScanPhase.scanning:   dot = AppTheme.accent; break;
      case _ScanPhase.checking:   dot = AppTheme.warning; break;
      case _ScanPhase.submitting: dot = AppTheme.warning; break;
      case _ScanPhase.success:    dot = AppTheme.success; break;
      case _ScanPhase.error:      dot = AppTheme.danger; break;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: Colors.white.withValues(alpha: 0.18)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Container(width: 7, height: 7,
          decoration: BoxDecoration(color: dot, shape: BoxShape.circle)),
        const SizedBox(width: 8),
        Flexible(child: Text(msg, overflow: TextOverflow.ellipsis, maxLines: 1,
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
            color: phase == _ScanPhase.error
                ? const Color(0xFFFF8080) : Colors.white))),
      ]),
    );
  }
}

// ── Success view ──────────────────────────────────────────────────────────────
class _SuccessView extends StatefulWidget {
  final String message;
  final VoidCallback onDone;
  const _SuccessView({required this.message, required this.onDone});
  @override State<_SuccessView> createState() => _SuccessViewState();
}

class _SuccessViewState extends State<_SuccessView> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _scale, _fade;

  @override
  void initState() {
    super.initState();
    _ctrl  = AnimationController(vsync: this, duration: const Duration(milliseconds: 600))..forward();
    _scale = CurvedAnimation(parent: _ctrl, curve: Curves.elasticOut);
    _fade  = CurvedAnimation(parent: _ctrl, curve: const Interval(0.3, 1.0));
    Future.delayed(const Duration(milliseconds: 2500), () { if (mounted) widget.onDone(); });
  }

  @override void dispose() { _ctrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) => Scaffold(
    backgroundColor: Colors.black,
    body: Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
      ScaleTransition(scale: _scale,
        child: Container(width: 90, height: 90,
          decoration: BoxDecoration(
            color: AppTheme.success.withValues(alpha: 0.15), shape: BoxShape.circle,
            border: Border.all(color: AppTheme.success.withValues(alpha: 0.4), width: 2)),
          child: const Icon(Icons.check_rounded, color: AppTheme.success, size: 52))),
      const SizedBox(height: 24),
      FadeTransition(opacity: _fade, child: Column(children: [
        const Text('Done!', style: TextStyle(color: Colors.white,
            fontSize: 28, fontWeight: FontWeight.w900)),
        const SizedBox(height: 10),
        Padding(padding: const EdgeInsets.symmetric(horizontal: 40),
          child: Text(widget.message, textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.white70, fontSize: 15))),
      ])),
    ])),
  );
}

// ── No camera placeholder ─────────────────────────────────────────────────────
class _NoCam extends StatelessWidget {
  const _NoCam();
  @override
  Widget build(BuildContext context) => Container(
    color: Colors.black,
    child: const Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
      Icon(Icons.no_photography_rounded, color: Colors.white30, size: 56),
      SizedBox(height: 16),
      Text('Camera permission required',
          style: TextStyle(color: Colors.white54, fontSize: 14)),
    ])),
  );
}

// ── Icon button ───────────────────────────────────────────────────────────────
class _IconBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback? onTap;
  final bool active;
  const _IconBtn({required this.icon, this.onTap, this.active = false});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      width: 40, height: 40,
      decoration: BoxDecoration(
        color: active
            ? AppTheme.accent.withValues(alpha: 0.25)
            : Colors.white.withValues(alpha: 0.12),
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
      ),
      child: Icon(icon, color: active ? AppTheme.accent : Colors.white, size: 20),
    ),
  );
}

// ── Corner brackets ───────────────────────────────────────────────────────────
class _Brackets extends StatelessWidget {
  final Size size;
  final double bSide;
  final AnimationController pulse;
  final Color color;
  const _Brackets({required this.size, required this.bSide,
      required this.pulse, required this.color});

  @override
  Widget build(BuildContext context) {
    final l = (size.width  - bSide) / 2;
    final t = (size.height - bSide) / 2;
    const arm = 24.0, thick = 3.0, r = 6.0;

    return AnimatedBuilder(
      animation: pulse,
      builder: (_, __) {
        final s = 1 + pulse.value * 0.03;
        return Stack(children: [
          Positioned(left: l, top: t, child: Transform.scale(scale: s, alignment: Alignment.topLeft,
            child: _Corner(color: color, arm: arm, thick: thick, r: r,
                flipX: false, flipY: false))),
          Positioned(right: l, top: t, child: Transform.scale(scale: s, alignment: Alignment.topRight,
            child: _Corner(color: color, arm: arm, thick: thick, r: r,
                flipX: true, flipY: false))),
          Positioned(left: l, bottom: t, child: Transform.scale(scale: s, alignment: Alignment.bottomLeft,
            child: _Corner(color: color, arm: arm, thick: thick, r: r,
                flipX: false, flipY: true))),
          Positioned(right: l, bottom: t, child: Transform.scale(scale: s, alignment: Alignment.bottomRight,
            child: _Corner(color: color, arm: arm, thick: thick, r: r,
                flipX: true, flipY: true))),
        ]);
      },
    );
  }
}

class _Corner extends StatelessWidget {
  final Color color;
  final double arm, thick, r;
  final bool flipX, flipY;
  const _Corner({required this.color, required this.arm,
      required this.thick, required this.r,
      required this.flipX, required this.flipY});

  @override
  Widget build(BuildContext context) => Transform(
    alignment: Alignment.center,
    transform: Matrix4.diagonal3Values(flipX ? -1 : 1, flipY ? -1 : 1, 1),
    child: SizedBox(width: arm, height: arm,
      child: CustomPaint(painter: _CornerPainter(color, thick, r))),
  );
}

class _CornerPainter extends CustomPainter {
  final Color color;
  final double thick, r;
  const _CornerPainter(this.color, this.thick, this.r);

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = color..strokeWidth = thick
        ..style = PaintingStyle.stroke..strokeCap = StrokeCap.round;
    final path = Path()
      ..moveTo(0, size.height * 0.55)
      ..lineTo(0, r)
      ..arcToPoint(Offset(r, 0), radius: Radius.circular(r))
      ..lineTo(size.width * 0.55, 0);
    canvas.drawPath(path, p);
  }

  @override
  bool shouldRepaint(_CornerPainter o) => o.color != color;
}

// ── Dark overlay with cutout ──────────────────────────────────────────────────
class _OverlayPainter extends CustomPainter {
  final double boxSide, alpha;
  const _OverlayPainter({required this.boxSide, required this.alpha});

  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2, cy = size.height / 2;
    final rect = Rect.fromCenter(center: Offset(cx, cy),
        width: boxSide, height: boxSide);
    final full = Rect.fromLTWH(0, 0, size.width, size.height);
    final path = Path()
      ..addRect(full)
      ..addRRect(RRect.fromRectAndRadius(rect, const Radius.circular(16)))
      ..fillType = PathFillType.evenOdd;
    canvas.drawPath(path,
        Paint()..color = Colors.black.withValues(alpha: alpha));
  }

  @override
  bool shouldRepaint(_OverlayPainter o) =>
      o.boxSide != boxSide || o.alpha != alpha;
}
