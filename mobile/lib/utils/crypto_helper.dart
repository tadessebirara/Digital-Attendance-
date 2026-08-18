import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

// ── Per-device HMAC key from `POST /devices/provision-key`
class CryptoHelper {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );
  static const _deviceKeyStorageKey = 'device_signing_key';
  static const _deviceVersionKey = 'device_version_int';

  // ── In-memory cache — eliminates Keystore reads on every API request ─────────
  static String? _cachedDeviceKey;
  static int? _cachedDeviceVersion;

  // All storage calls wrapped in try/catch — Android 11 Keystore can throw
  // PlatformException on first install before any keys have been written.

  static Future<void> saveDeviceKey(String key) async {
    _cachedDeviceKey = key; // update memory cache immediately
    try { await _storage.write(key: _deviceKeyStorageKey, value: key); } catch (_) {}
  }

  static Future<String?> getDeviceKey() async {
    if (_cachedDeviceKey != null) return _cachedDeviceKey; // memory hit
    try { _cachedDeviceKey = await _storage.read(key: _deviceKeyStorageKey); } catch (_) {}
    return _cachedDeviceKey;
  }

  static Future<void> saveDeviceVersion(int version) async {
    _cachedDeviceVersion = version; // update memory cache immediately
    try { await _storage.write(key: _deviceVersionKey, value: version.toString()); } catch (_) {}
  }

  static Future<int?> getDeviceVersion() async {
    if (_cachedDeviceVersion != null) return _cachedDeviceVersion; // memory hit
    try {
      final s = await _storage.read(key: _deviceVersionKey);
      if (s == null) return null;
      _cachedDeviceVersion = int.tryParse(s);
    } catch (_) {}
    return _cachedDeviceVersion;
  }

  /// HMAC over `deviceId:userId:deviceVersion` when version is known (matches backend).
  static Future<String?> signDeviceId(String deviceId, int userId) async {
    try {
      final deviceKey = await getDeviceKey();
      if (deviceKey == null) return null;

      final version = await getDeviceVersion();
      final payload = version != null
          ? '$deviceId:$userId:$version'
          : '$deviceId:$userId';

      final key     = utf8.encode(deviceKey);
      final message = utf8.encode(payload);
      final hmac    = Hmac(sha256, key);
      return hmac.convert(message).toString();
    } catch (_) { return null; }
  }

  static Future<void> clearDeviceKey() async {
    _cachedDeviceKey = null;    // clear memory cache
    _cachedDeviceVersion = null;
    try {
      await _storage.delete(key: _deviceKeyStorageKey);
      await _storage.delete(key: _deviceVersionKey);
    } catch (_) {}
  }
}
