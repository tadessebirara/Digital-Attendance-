// ignore_for_file: avoid_print
import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';
import 'package:socket_io_client/socket_io_client.dart' as sio;
import '../services/api_service.dart';
import '../utils/constants.dart';

/// Singleton GPS streaming provider.
///
/// Starts after login — polls GPS every 10 s and emits [location:update]
/// to the server via Socket.IO. Admin/HR can see live employee dots.
///
/// QR scanner reads [latest] directly — instant, 0 ms wait.
class LocationProvider with ChangeNotifier {
  // ── State ─────────────────────────────────────────────────────────────────
  Position? _latest;
  DateTime? _latestAt;
  bool _streaming = false;
  bool _socketConnected = false;

  Position?  get latest          => _latest;
  DateTime?  get latestAt        => _latestAt;
  bool       get streaming       => _streaming;
  bool       get socketConnected => _socketConnected;

  /// True when we have a fresh fix (< 15 s old, < 80 m accuracy).
  bool get hasFreshFix {
    if (_latest == null || _latestAt == null) return false;
    final age = DateTime.now().difference(_latestAt!).inSeconds;
    return age < 15 && _latest!.accuracy < 80;
  }

  // ── Internals ─────────────────────────────────────────────────────────────
  sio.Socket? _socket;
  Timer?      _pollTimer;
  Timer?      _reconnectTimer;
  bool        _disposed = false;

  static const _pollIntervalSec   = 10;   // how often we re-acquire GPS
  static const _emitIntervalSec   = 10;   // how often we push to server
  static const _reconnectDelaySec = 5;

  // ── Start / Stop ──────────────────────────────────────────────────────────

  /// Call from MainShell (after login).
  Future<void> start() async {
    if (_streaming) return;
    _streaming = true;
    _disposed  = false;
    notifyListeners();

    await _connectSocket();
    await _tick(); // immediate first fix
    _pollTimer = Timer.periodic(
      const Duration(seconds: _pollIntervalSec),
      (_) => _tick(),
    );
  }

  /// Call on logout.
  void stop() {
    _streaming = false;
    _pollTimer?.cancel();
    _reconnectTimer?.cancel();
    _pollTimer = null;
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _socketConnected = false;
    _latest  = null;
    _latestAt = null;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    stop();
    super.dispose();
  }

  // ── GPS polling ───────────────────────────────────────────────────────────

  Future<void> _tick() async {
    if (_disposed) return;
    final pos = await _getFix();
    if (pos == null) return;
    _latest   = pos;
    _latestAt = DateTime.now();
    notifyListeners();
    _emitLocation(pos);
  }

  Future<Position?> _getFix() async {
    try {
      final svcOn = await Geolocator.isLocationServiceEnabled();
      if (!svcOn) return null;
      final perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) return null;
      return await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 8),
      );
    } catch (_) {
      // Timeout or service failure — try last known
      try { return await Geolocator.getLastKnownPosition(); } catch (_) { return null; }
    }
  }

  // ── Socket connection ─────────────────────────────────────────────────────

  Future<void> _connectSocket() async {
    if (_disposed) return;
    try {
      final token = await ApiService.instance.getToken();
      if (token == null) return;

      _socket?.dispose();

      final base = ApiConstants.baseUrl
          .replaceFirst('/api', '')     // strip /api path prefix
          .replaceFirst('https://', 'wss://')
          .replaceFirst('http://', 'ws://');

      _socket = sio.io(
        base,
        sio.OptionBuilder()
            .setTransports(['websocket'])
            .enableAutoConnect()
            .enableReconnection()
            .setReconnectionDelay(3000)
            .setAuth({'token': token})
            .build(),
      );

      _socket!.onConnect((_) {
        if (_disposed) return;
        _socketConnected = true;
        notifyListeners();
      });

      _socket!.onDisconnect((_) {
        if (_disposed) return;
        _socketConnected = false;
        notifyListeners();
        _scheduleReconnect();
      });

      _socket!.onConnectError((_) {
        if (_disposed) return;
        _socketConnected = false;
        _scheduleReconnect();
      });

      _socket!.connect();
    } catch (e) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (_disposed || !_streaming) return;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(
      const Duration(seconds: _reconnectDelaySec),
      () => _connectSocket(),
    );
  }

  void _emitLocation(Position pos) {
    if (_socket == null || !_socketConnected) return;
    _socket!.emit('location:update', {
      'latitude':   pos.latitude,
      'longitude':  pos.longitude,
      'accuracy':   pos.accuracy,
      'timestamp':  DateTime.now().toIso8601String(),
    });
  }
}
