import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';
import 'package:flutter_jailbreak_detection/flutter_jailbreak_detection.dart';
import '../services/api_service.dart';
import '../utils/crypto_helper.dart';

class AuthProvider with ChangeNotifier {
  Map<String, dynamic>? _user;
  bool _isLoading = false;
  String? _error;
  String? _pendingOtpSessionToken;

  Map<String, dynamic>? get user => _user;
  bool get isLoading => _isLoading;
  String? get error => _error;
  bool get isAuthenticated => _user != null;
  bool get needsDeviceOtp => _pendingOtpSessionToken != null;
  String? get pendingOtpSessionToken => _pendingOtpSessionToken;

  final _api = ApiService.instance;

  Map<String, dynamic> _unwrapPayload(Map<String, dynamic> data) {
    final inner = data['data'];
    if (inner is Map<String, dynamic>) return inner;
    return data;
  }

  Future<void> _provisionDeviceKeyIfEmployee() async {
    final u = _user;
    if (u == null || u['role'] != 'EMPLOYEE') return;
    final deviceId = await _api.getDeviceId();
    if (deviceId == null) return;

    final res = await _api.post('/devices/provision-key', body: {'deviceId': deviceId});
    if (res['success'] != true) return;

    final payload = _unwrapPayload(Map<String, dynamic>.from(res));
    final dk = payload['deviceKey'];
    final dv = payload['deviceVersion'];
    if (dk is String) await CryptoHelper.saveDeviceKey(dk);
    if (dv != null) await CryptoHelper.saveDeviceVersion(int.tryParse(dv.toString()) ?? 0);
  }

  Future<bool> init(VoidCallback onUnauthorized) async {
    _api.onUnauthorized = onUnauthorized;

    // Read stored user + token from secure storage in parallel.
    // Jailbreak check runs concurrently but does NOT block navigation —
    // it's checked after, and only blocks in production release mode.
    final parallel = await Future.wait([
      FlutterJailbreakDetection.jailbroken.catchError((_) => false),
      _api.getUser(),
      _api.getToken(),
    ]);

    final jailbroken = parallel[0] as bool;
    if (jailbroken && !kDebugMode) {
      _error = 'Security Alert: Device integrity compromised.';
      notifyListeners();
      return false;
    }

    _user  = parallel[1] as Map<String, dynamic>?;
    final token = parallel[2] as String?;

    if (_user != null && token != null) {
      // Local JWT check — instant, no network
      if (!_isTokenLocallyValid(token)) {
        await _api.clearAll();
        _user = null;
        notifyListeners();
        return false;
      }

      // Navigate immediately with cached user — don't block splash on network
      notifyListeners();

      // Refresh profile in the background (after splash is gone)
      // Only hits network when token expires soon OR not validated in 1hr
      _refreshProfileInBackground(token);

      return true;
    }

    notifyListeners();
    return false;
  }

  /// Background server validation — called after splash navigates away.
  /// Never blocks the UI. Updates cached user silently.
  Future<void> _refreshProfileInBackground(String token) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final lastValidated   = prefs.getInt('_last_server_validation') ?? 0;
      final expiresInSec    = _tokenExpiresInSeconds(token);
      final hourSinceCheck  =
          DateTime.now().millisecondsSinceEpoch - lastValidated > 3600000;

      // Only hit the server if token expires soon or hasn't been validated recently
      if (expiresInSec >= 120 && !hourSinceCheck) return;

      final res = await _api.get('/auth/me');
      if (res['success'] == true) {
        final payload = _unwrapPayload(Map<String, dynamic>.from(res));
        final profile = payload['user'] as Map<String, dynamic>?;
        if (profile != null) {
          _user = profile;
          await _api.saveUser(_user!);
          notifyListeners();
        }
        await prefs.setInt(
            '_last_server_validation',
            DateTime.now().millisecondsSinceEpoch);
      } else {
        // Token rejected by server — force logout
        await _api.clearAll();
        _user = null;
        notifyListeners();
        ApiService.sessionExpiredHandler?.call();
      }
    } catch (_) {
      // Network unavailable — cached user is fine, no action needed
    }
  }

  /// Validate JWT expiry locally — no network, no Keystore, instant.
  bool _isTokenLocallyValid(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) return false;
      final payload = jsonDecode(
        utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
      ) as Map<String, dynamic>;
      final exp = payload['exp'] as int?;
      if (exp == null) return false;
      return DateTime.now().millisecondsSinceEpoch ~/ 1000 < exp;
    } catch (_) {
      return false;
    }
  }

  /// Returns seconds until token expiry (negative if already expired).
  int _tokenExpiresInSeconds(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) return -1;
      final payload = jsonDecode(
        utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
      ) as Map<String, dynamic>;
      final exp = payload['exp'] as int?;
      if (exp == null) return -1;
      return exp - (DateTime.now().millisecondsSinceEpoch ~/ 1000);
    } catch (_) {
      return -1;
    }
  }

  Future<bool> login(String email, String password) async {
    _isLoading = true;
    _error = null;
    _pendingOtpSessionToken = null;
    notifyListeners();

    try {
      // On Flutter web, flutter_secure_storage doesn't persist across sessions
      // reliably. Use a stable device ID: try to get the saved one first,
      // and only generate a new UUID if none exists — then save it immediately.
      String? deviceId = await _api.getDeviceId();
      if (deviceId == null || deviceId.isEmpty) {
        deviceId = const Uuid().v4();
        await _api.saveDeviceId(deviceId);
      }

      final data = await _api.post('/auth/login', body: {
        'email': email.trim().toLowerCase(),
        'password': password,
        'deviceId': deviceId,
      });

      if (data['success'] == true) {
        final payload = _unwrapPayload(Map<String, dynamic>.from(data));

        if (payload['accountStatus'] == 'PENDING_APPROVAL') {
          _error = 'PENDING_APPROVAL';
          _isLoading = false;
          notifyListeners();
          return false;
        }

        if (payload['deviceStatus'] == 'DEVICE_OTP_REQUIRED') {
          _pendingOtpSessionToken = payload['otpSessionToken'] as String?;
          if (_pendingOtpSessionToken == null) {
            _error = 'Missing verification session. Try again.';
            _isLoading = false;
            notifyListeners();
            return false;
          }
          _error = 'New device. OTP required.';
          _isLoading = false;
          notifyListeners();
          return false;
        }

        final at = payload['accessToken'] as String?;
        final rt = payload['refreshToken'] as String?;
        final u = payload['user'] as Map<String, dynamic>?;
        if (at == null || rt == null || u == null) {
          _error = 'Invalid login response.';
          _isLoading = false;
          notifyListeners();
          return false;
        }
        await _api.saveTokens(token: at, refreshToken: rt);
        _user = u;
        await _api.saveUser(_user!);
        await _provisionDeviceKeyIfEmployee();

        _isLoading = false;
        notifyListeners();
        return true;
      } else {
        final code = data['code']?.toString();
        if (code == 'PENDING_APPROVAL') {
          _error = 'PENDING_APPROVAL';
        } else if (code == 'PENDING_ACTIVATION') {
          _error = 'PENDING_ACTIVATION';
        } else if (code == 'EMAIL_NOT_VERIFIED') {
          _error = 'EMAIL_NOT_VERIFIED';
        } else if (code == 'ACCOUNT_SUSPENDED') {
          _error = 'ACCOUNT_SUSPENDED';
        } else {
          final err = data['error'];
          final msg = data['message'];
          _error = (err is String && err.isNotEmpty) ? err
                 : (msg is String && msg.isNotEmpty) ? msg
                 : 'Login failed';
        }
      }
    } catch (e) {
      _error = 'Network error. Please try again.';
    }

    _isLoading = false;
    notifyListeners();
    return false;
  }

  Future<bool> verifyDeviceOtp(String otpCode) async {
    if (_pendingOtpSessionToken == null) return false;
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final data = await _api.post('/auth/verify-device-otp', body: {
        'otpSessionToken': _pendingOtpSessionToken,
        'otpCode': otpCode,
      });

      if (data['success'] == true) {
        final payload = _unwrapPayload(Map<String, dynamic>.from(data));
        final at = payload['accessToken'] as String?;
        final rt = payload['refreshToken'] as String?;
        final u = payload['user'] as Map<String, dynamic>?;
        if (at == null || rt == null || u == null) {
          _error = 'Invalid verification response.';
          _isLoading = false;
          notifyListeners();
          return false;
        }
        await _api.saveTokens(token: at, refreshToken: rt);
        _user = u;
        await _api.saveUser(_user!);
        _pendingOtpSessionToken = null;
        _error = null;
        await _provisionDeviceKeyIfEmployee();
        _isLoading = false;
        notifyListeners();
        return true;
      } else {
        _error = data['error'] ?? data['message'] ?? 'Invalid OTP code';
      }
    } catch (_) {
      _error = 'Network error. Please try again.';
    }

    _isLoading = false;
    notifyListeners();
    return false;
  }

  Future<bool> register(String email, String password, String firstName, String lastName,
      {String? phone, String? department, String? position}) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final data = await _api.post('/auth/register', body: {
        'email': email.trim().toLowerCase(),
        'password': password,
        'firstName': firstName.trim(),
        'lastName': lastName.trim(),
        if (phone != null && phone.isNotEmpty) 'phone': phone,
        if (department != null && department.isNotEmpty) 'department': department,
        if (position != null && position.isNotEmpty) 'position': position,
      });

      if (data['success'] == true) {
        _isLoading = false;
        notifyListeners();
        return true;
      }
      // Safely extract error — never cast List to String
      final err = data['error'];
      final msg = data['message'];
      _error = (err is String && err.isNotEmpty) ? err
             : (msg is String && msg.isNotEmpty) ? msg
             : 'Registration failed';
    } catch (e) {
      _error = 'Registration failed: ${e.toString().split('\n').first}';
    }

    _isLoading = false;
    notifyListeners();
    return false;
  }

  // ── Device replacement ────────────────────────────────────────────────────────

  /// Step 1: verify credentials → backend sends OTP to registered email.
  /// Returns (ok, sessionToken, message).
  Future<({bool ok, String? sessionToken, String message})> requestDeviceReplacement({
    required String email,
    required String password,
  }) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final deviceId = await _api.getDeviceId() ?? const Uuid().v4();
      await _api.saveDeviceId(deviceId);

      final data = await _api.post('/auth/request-device-replacement', body: {
        'email': email,
        'password': password,
        'newDeviceId': deviceId,
        'deviceInfo': {'platform': 'mobile'},
      });

      if (data['success'] == true) {
        final payload = _unwrapPayload(Map<String, dynamic>.from(data));
        final token = payload['replacementSessionToken'] as String?;
        _isLoading = false;
        notifyListeners();
        return (ok: true, sessionToken: token, message: 'Verification code sent to your email.');
      }

      final err = data['error'] ?? data['message'] ?? 'Request failed';
      _error = err is String ? err : 'Request failed';
      _isLoading = false;
      notifyListeners();
      return (ok: false, sessionToken: null, message: _error!);
    } catch (_) {
      _error = 'Network error. Please try again.';
      _isLoading = false;
      notifyListeners();
      return (ok: false, sessionToken: null, message: _error!);
    }
  }

  /// Step 2: verify OTP → backend swaps primary device + issues full session.
  Future<bool> confirmDeviceReplacement({
    required String replacementSessionToken,
    required String otpCode,
  }) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final data = await _api.post('/auth/confirm-device-replacement', body: {
        'replacementSessionToken': replacementSessionToken,
        'otpCode': otpCode,
      });

      if (data['success'] == true) {
        final payload = _unwrapPayload(Map<String, dynamic>.from(data));
        final at = payload['accessToken'] as String?;
        final rt = payload['refreshToken'] as String?;
        final u = payload['user'] as Map<String, dynamic>?;
        if (at == null || rt == null || u == null) {
          _error = 'Invalid response from server.';
          _isLoading = false;
          notifyListeners();
          return false;
        }
        await _api.saveTokens(token: at, refreshToken: rt);
        _user = u;
        await _api.saveUser(_user!);
        await _provisionDeviceKeyIfEmployee();
        _isLoading = false;
        notifyListeners();
        return true;
      }

      final err = data['error'] ?? data['message'] ?? 'Verification failed';
      _error = err is String ? err : 'Verification failed';
      _isLoading = false;
      notifyListeners();
      return false;
    } catch (_) {
      _error = 'Network error. Please try again.';
      _isLoading = false;
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    try {
      final rt = await _api.getRefreshToken();
      final body = rt != null ? {'refreshToken': rt} : <String, dynamic>{};
      await _api.post('/auth/logout', body: body);
    } catch (_) {}

    await CryptoHelper.clearDeviceKey();
    await _api.clearAll();
    _user = null;
    _error = null;
    _pendingOtpSessionToken = null;
    notifyListeners();
  }

  void clearError() {
    _error = null;
    notifyListeners();
  }

  /// Called after the OTP screen returns a verified session directly.
  Future<void> applyVerifiedSession({
    required String accessToken,
    required String refreshToken,
    required Map<String, dynamic> user,
  }) async {
    await _api.saveTokens(token: accessToken, refreshToken: refreshToken);
    _user = user;
    await _api.saveUser(_user!);
    _pendingOtpSessionToken = null;
    _error = null;
    await _provisionDeviceKeyIfEmployee();
    notifyListeners();
  }

  void updateUser(Map<String, dynamic> updated) {
    _user = updated;
    _api.saveUser(updated);
    notifyListeners();
  }
}
