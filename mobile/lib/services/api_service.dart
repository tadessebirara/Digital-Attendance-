import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:flutter/foundation.dart' show VoidCallback, kIsWeb, kReleaseMode;
import 'package:http/http.dart' as http;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:logger/logger.dart';
import 'package:device_info_plus/device_info_plus.dart';
import '../utils/constants.dart';
import '../utils/crypto_helper.dart';

/// TTL cache entry for GET responses.
class _CacheEntry {
  final Map<String, dynamic> data;
  final DateTime fetchedAt;
  const _CacheEntry(this.data, this.fetchedAt);
}

class ApiService {
  ApiService._();
  static final ApiService instance = ApiService._();

  final _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  // ── In-memory GET response cache — keyed by endpoint ────────────────────────
  final Map<String, _CacheEntry> _responseCache = {};

  /// Invalidate all cached responses (call on logout or when data is stale).
  void clearCache() => _responseCache.clear();

  /// Invalidate a specific endpoint cache entry.
  void invalidateCache(String endpoint) => _responseCache.remove(endpoint);

  // ── In-memory auth cache — avoids FlutterSecureStorage on every request ─────
  String? _cachedToken;
  String? _cachedRefreshToken;
  String? _cachedDeviceId;
  // Cached user fields — eliminates getUser()+JSON decode on every API call
  String? _cachedUserRole;
  String? _cachedUserId;

  final _logger = Logger(
    level: kReleaseMode ? Level.warning : Level.debug,
    printer: SimplePrinter(colors: false),
  );

  VoidCallback? onUnauthorized;
  bool _isRefreshing = false;
  Completer<bool>? _refreshCompleter;

  static VoidCallback? sessionExpiredHandler;

  // ── Storage ─────────────────────────────────────────────────────────────────

  Future<void> saveTokens({required String token, required String refreshToken}) async {
    _cachedToken = token;
    _cachedRefreshToken = refreshToken;
    try {
      await Future.wait([
        _storage.write(key: 'token', value: token),
        _storage.write(key: 'refresh_token', value: refreshToken),
      ]);
    } catch (_) {}
  }

  Future<String?> getToken() async {
    if (_cachedToken != null) return _cachedToken;
    try { _cachedToken = await _storage.read(key: 'token'); } catch (_) {}
    return _cachedToken;
  }

  Future<String?> getRefreshToken() async {
    if (_cachedRefreshToken != null) return _cachedRefreshToken;
    try { _cachedRefreshToken = await _storage.read(key: 'refresh_token'); } catch (_) {}
    return _cachedRefreshToken;
  }

  Future<void> saveUser(Map<String, dynamic> user) async {
    // Cache role + id in memory so request() never has to read storage
    _cachedUserRole = user['role'] as String?;
    _cachedUserId   = user['id']?.toString();
    try { await _storage.write(key: 'user', value: json.encode(user)); } catch (_) {}
  }

  Future<Map<String, dynamic>?> getUser() async {
    try {
      final raw = await _storage.read(key: 'user');
      if (raw != null) {
        final u = json.decode(raw) as Map<String, dynamic>?;
        if (u != null) {
          _cachedUserRole ??= u['role'] as String?;
          _cachedUserId   ??= u['id']?.toString();
        }
        return u;
      }
    } catch (_) {}
    return null;
  }

  Future<void> saveDeviceId(String id) async {
    _cachedDeviceId = id;
    try { await _storage.write(key: AppConstants.deviceIdKey, value: id); } catch (_) {}
  }

  Future<void> clearAll() async {
    _cachedToken        = null;
    _cachedRefreshToken = null;
    _cachedDeviceId     = null;
    _cachedUserRole     = null;
    _cachedUserId       = null;
    _responseCache.clear();
    try { await _storage.deleteAll(); } catch (_) {}
  }

  Future<String?> getDeviceId() async {
    if (_cachedDeviceId != null) return _cachedDeviceId;
    try {
      final stored = await _storage.read(key: AppConstants.deviceIdKey);
      if (stored != null && stored.isNotEmpty) {
        _cachedDeviceId = stored;
        return _cachedDeviceId;
      }

      String? hardwareId;
      if (kIsWeb) {
        hardwareId = null;
      } else if (Platform.isAndroid) {
        final info = await DeviceInfoPlugin().androidInfo;
        hardwareId = info.fingerprint.isNotEmpty ? info.fingerprint : info.id;
      } else if (Platform.isIOS) {
        final info = await DeviceInfoPlugin().iosInfo;
        hardwareId = info.identifierForVendor;
      } else if (Platform.isWindows) {
        final info = await DeviceInfoPlugin().windowsInfo;
        hardwareId = info.deviceId;
      } else if (Platform.isMacOS) {
        final info = await DeviceInfoPlugin().macOsInfo;
        hardwareId = info.systemGUID;
      }

      if (hardwareId != null && hardwareId.isNotEmpty) {
        _cachedDeviceId = hardwareId;
        await _storage.write(key: AppConstants.deviceIdKey, value: hardwareId);
        return _cachedDeviceId;
      }
    } catch (_) {}
    return null;
  }

  // ── Network ─────────────────────────────────────────────────────────────────

  // Cache connectivity result for 3 seconds to avoid repeated checks
  bool? _lastConnected;
  DateTime? _lastConnectivityCheck;

  Future<bool> isConnected() async {
    if (kIsWeb) return true;
    final now = DateTime.now();
    if (_lastConnected != null &&
        _lastConnectivityCheck != null &&
        now.difference(_lastConnectivityCheck!).inSeconds < 3) {
      return _lastConnected!;
    }
    try {
      final dynamic r = await Connectivity().checkConnectivity();
      final result = r is List ? !r.contains(ConnectivityResult.none) : r != ConnectivityResult.none;
      _lastConnected = result;
      _lastConnectivityCheck = now;
      return result;
    } catch (_) {
      return true;
    }
  }

  // ── Core Request with Exponential Backoff ───────────────────────────────────

  /// GET with optional TTL cache. Pass [cacheTtl] to skip network when a fresh
  /// cached response exists. Cache is keyed by endpoint string.
  Future<Map<String, dynamic>> get(String endpoint, {Duration? cacheTtl}) async {
    if (cacheTtl != null) {
      final hit = _responseCache[endpoint];
      if (hit != null &&
          DateTime.now().difference(hit.fetchedAt) < cacheTtl) {
        return hit.data; // serve from memory — no network, no token overhead
      }
    }
    final result = await request('GET', endpoint);
    if (cacheTtl != null && result['success'] == true) {
      _responseCache[endpoint] = _CacheEntry(result, DateTime.now());
    }
    return result;
  }

  Future<Map<String, dynamic>> post(String endpoint, {Map<String, dynamic>? body}) => request('POST', endpoint, body: body);
  Future<Map<String, dynamic>> put(String endpoint, {Map<String, dynamic>? body}) => request('PUT', endpoint, body: body);
  Future<Map<String, dynamic>> delete(String endpoint) => request('DELETE', endpoint);

  /// Upload a file as multipart/form-data.
  /// Returns the server response (expects { success, data: { url } }).
  Future<Map<String, dynamic>> uploadFile(
    String endpoint, {
    required List<int> fileBytes,
    required String fileName,
    String fieldName = 'file',
  }) async {
    try {
      final token = await getToken();
      final deviceId = await getDeviceId();
      final url = Uri.parse('${ApiConstants.baseUrl}$endpoint');

      final req = http.MultipartRequest('POST', url);
      if (token != null) req.headers['Authorization'] = 'Bearer $token';
      if (deviceId != null) req.headers['x-device-id'] = deviceId;

      req.files.add(http.MultipartFile.fromBytes(
        fieldName,
        fileBytes,
        filename: fileName,
      ));

      final streamed = await req.send().timeout(const Duration(seconds: 60));
      final res = await http.Response.fromStream(streamed);
      final Map<String, dynamic> data = json.decode(res.body) as Map<String, dynamic>;
      data['statusCode'] = res.statusCode;
      if (data['success'] == null) {
        data['success'] = res.statusCode >= 200 && res.statusCode < 300;
      }
      return data;
    } catch (e) {
      return {'success': false, 'error': 'Upload failed: $e', 'statusCode': -1};
    }
  }

  Future<Map<String, dynamic>> request(
    String method,
    String endpoint, {
    Map<String, dynamic>? body,
    int retryCount = 0,
    int maxRetries = 3,
  }) async {
    if (!await isConnected()) {
      return {'success': false, 'error': 'No internet connection', 'statusCode': -1};
    }

    try {
      // Fetch token + deviceId in parallel — user role/id served from memory cache
      final results = await Future.wait([
        getToken(),
        getDeviceId(),
        CryptoHelper.getDeviceVersion(),
      ]);

      final token         = results[0] as String?;
      final deviceId      = results[1] as String?;
      final deviceVersion = results[2] as int?;
      // Use cached role/id — never reads storage on the hot request path
      final userRole = _cachedUserRole;
      final userId   = _cachedUserId;

      final Map<String, String> headers = {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
        if (deviceId != null) 'x-device-id': deviceId,
        if (deviceVersion != null) 'x-device-version': deviceVersion.toString(),
      };

      if (deviceId != null && userId != null && (userRole == 'EMPLOYEE' || userRole == null)) {
        final signature = await CryptoHelper.signDeviceId(deviceId, int.parse(userId));
        if (signature != null) headers['x-device-signature'] = signature;
      }

      final url = Uri.parse('${ApiConstants.baseUrl}$endpoint');
      if (!kReleaseMode) _logger.d('📡 $method $endpoint');

      // GET uses the short timeout; POST/PUT mutations get extra headroom on slow networks
      final mutationTimeout = const Duration(seconds: 15);
      final getTimeout      = ApiConstants.timeout; // 6s

      http.Response res;
      switch (method.toUpperCase()) {
        case 'POST':
          res = await http.post(url, headers: headers, body: json.encode(body)).timeout(mutationTimeout);
          break;
        case 'PUT':
          res = await http.put(url, headers: headers, body: json.encode(body)).timeout(mutationTimeout);
          break;
        case 'DELETE':
          res = await http.delete(url, headers: headers).timeout(getTimeout);
          break;
        default:
          res = await http.get(url, headers: headers).timeout(getTimeout);
      }

      if (res.statusCode == 401 && retryCount == 0) {
        final refreshed = await _attemptTokenRefresh();
        if (refreshed) {
          return request(method, endpoint, body: body, retryCount: 1);
        } else {
          _triggerUnauthorizedIfSafe();
          return {'success': false, 'error': 'Session expired', 'statusCode': 401};
        }
      }

      final Map<String, dynamic> data;
      final ct = res.headers['content-type'] ?? '';
      if (!ct.contains('application/json') && res.body.trimLeft().startsWith('<')) {
        // HTML returned — wrong port, nginx proxy error, etc.
        _logger.e('Non-JSON from $endpoint — status ${res.statusCode}');
        return {
          'success': false,
          'error': 'Cannot reach server. Check your connection and try again.',
          'statusCode': res.statusCode,
        };
      }
      try {
        data = json.decode(res.body) as Map<String, dynamic>;
      } catch (_) {
        return {
          'success': false,
          'error': 'Unexpected server response. Please try again.',
          'statusCode': res.statusCode,
        };
      }
      data['statusCode'] = res.statusCode;
      if (data['success'] == null) {
        data['success'] = res.statusCode >= 200 && res.statusCode < 300;
      }
      return data;

    } on SocketException {
      if (retryCount < maxRetries) {
        await _exponentialBackoff(retryCount);
        return request(method, endpoint, body: body, retryCount: retryCount + 1);
      }
      return {'success': false, 'error': 'Server unreachable', 'statusCode': -1};
    } on TimeoutException {
      // Retry on timeout — mobile networks often succeed on second attempt
      if (retryCount < maxRetries) {
        await _exponentialBackoff(retryCount);
        return request(method, endpoint, body: body, retryCount: retryCount + 1);
      }
      return {'success': false, 'error': 'Request timed out', 'statusCode': -1};
    } catch (e) {
      _logger.e('API Error: $e');
      final msg = e.toString().contains('XMLHttpRequest') || e.toString().contains('Failed to fetch')
          ? 'Cannot reach server. Check your connection.'
          : 'Error: $e';
      return {'success': false, 'error': msg, 'statusCode': -1};
    }
  }

  Future<void> _exponentialBackoff(int retryCount) async {
    final waitMillis = pow(2, retryCount) * 1000 + Random().nextInt(1000);
    await Future.delayed(Duration(milliseconds: waitMillis.toInt()));
  }

  void _triggerUnauthorizedIfSafe() {
    // Use the route-aware handler if set, otherwise fall back to onUnauthorized
    final handler = ApiService.sessionExpiredHandler ?? onUnauthorized;
    handler?.call();
  }

  /// FIX 6: Public method so OfflineService can explicitly trigger a refresh
  /// before starting a sync batch.
  Future<bool> refreshTokenExplicit() => _attemptTokenRefresh();

  Future<bool> _attemptTokenRefresh() async {
    if (_isRefreshing) return _refreshCompleter?.future ?? Future.value(false);
    _isRefreshing = true;
    _refreshCompleter = Completer<bool>();

    try {
      final rt = await getRefreshToken();
      final deviceId = await getDeviceId();
      if (rt == null) throw Exception('Missing refresh token');

      final res = await http.post(
        Uri.parse('${ApiConstants.baseUrl}/auth/refresh'),
        headers: {
          'Content-Type': 'application/json',
          if (deviceId != null) 'x-device-id': deviceId,
        },
        body: json.encode({'refreshToken': rt, if (deviceId != null) 'deviceId': deviceId}),
      ).timeout(ApiConstants.timeout);

      if (res.statusCode == 200) {
        final body = json.decode(res.body) as Map<String, dynamic>;
        // FIX 5: Backend returns { success, data: { accessToken, refreshToken } }
        if (body['success'] == true) {
          final data = body['data'] as Map<String, dynamic>?;
          final newAccessToken = data?['accessToken'] as String?;
          final newRefreshToken = data?['refreshToken'] as String?;
          if (newAccessToken != null && newRefreshToken != null) {
            await saveTokens(token: newAccessToken, refreshToken: newRefreshToken);
            _refreshCompleter!.complete(true);
            _logger.i('🔑 Token refreshed successfully');
            return true;
          }
        }
      }
      _logger.w('🔄 Refresh failed: status=${res.statusCode}');
    } catch (e) {
      _logger.e('🔄 Refresh Failed: $e');
    } finally {
      if (!_refreshCompleter!.isCompleted) _refreshCompleter!.complete(false);
      _isRefreshing = false;
    }
    return false;
  }
}
