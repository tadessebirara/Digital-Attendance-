import 'dart:convert';
import 'dart:math';
import 'package:shared_preferences/shared_preferences.dart';
import 'api_service.dart';
import 'package:logger/logger.dart';

class OfflineService {
  static final OfflineService instance = OfflineService._();
  OfflineService._();

  final _logger = Logger();
  static const String _queueKey = 'offline_attendance_queue';
  static const String _retryCountKey = 'offline_sync_retry_count';
  // FIX 5: Sync cursor — tracks the last successfully synced sequence number.
  // On partial failure, re-sync starts from the cursor, not from the beginning.
  // This prevents re-submitting already-accepted records under unstable networks.
  static const String _syncCursorKey = 'offline_sync_cursor';

  bool _isSyncing = false;

  Future<void> queueCheckIn(Map<String, dynamic> data) async {
    final prefs = await SharedPreferences.getInstance();
    final queue = await getQueue();

    // Prevent duplicate queuing of same check-in (same method within 5 minutes)
    final now = DateTime.now();
    final isDuplicate = queue.any((item) {
      final queuedAt = DateTime.parse(item['queuedAt'] as String);
      return item['method'] == data['method'] &&
          now.difference(queuedAt).inMinutes < 5;
    });

    if (isDuplicate) {
      _logger.w('⚠️ Duplicate check-in detected. Skipping queue.');
      return;
    }

    // Monotonic Sequencing: Ensure absolute historical ordering
    final sequence = queue.isEmpty
        ? 1
        : (queue.map((e) => (e['sequence'] as int? ?? 0)).reduce(max) + 1);

    queue.add({
      ...data,
      'queuedAt': now.toIso8601String(),
      'clientTime': now.toIso8601String(),
      'sequence': sequence,
    });

    await prefs.setString(_queueKey, json.encode(queue));
    await prefs.setInt(_retryCountKey, 0);
    _logger.i('📥 Attendance queued offline with sequence $sequence');
  }

  Future<List<Map<String, dynamic>>> getQueue() async {
    final prefs = await SharedPreferences.getInstance();
    final String? data = prefs.getString(_queueKey);
    if (data == null) return [];
    return List<Map<String, dynamic>>.from(json.decode(data) as List);
  }

  Future<int> getQueueCount() async {
    final queue = await getQueue();
    return queue.length;
  }

  Future<void> sync() async {
    if (_isSyncing) return;
    final rawQueue = await getQueue();
    if (rawQueue.isEmpty) return;

    // FIX 6: Ensure token is valid BEFORE attempting sync.
    // If the token has expired (e.g. device was offline for >8h), refresh it first.
    // If refresh fails, pause the queue and force re-login — do NOT corrupt data.
    final api = ApiService.instance;
    final token = await api.getToken();

    if (token != null && _isTokenExpired(token)) {
      _logger.w('⏳ Access token expired before sync — attempting refresh...');
      final refreshed = await api.refreshTokenExplicit();
      if (!refreshed) {
        _logger.e('❌ Token refresh failed before sync. Queue paused — user must re-login.');
        api.onUnauthorized?.call();
        return;
      }
      _logger.i('✅ Token refreshed — proceeding with sync');
    }

    // Deterministic Ordering: Sort by sequence number
    final queue = List<Map<String, dynamic>>.from(rawQueue);
    queue.sort((a, b) =>
        (a['sequence'] as int? ?? 0).compareTo(b['sequence'] as int? ?? 0));

    _isSyncing = true;
    final prefs = await SharedPreferences.getInstance();
    final int retryCount = prefs.getInt(_retryCountKey) ?? 0;

    // FIX 5: Read sync cursor — skip already-processed sequences
    final int syncCursor = prefs.getInt(_syncCursorKey) ?? 0;

    if (retryCount > 0) {
      _logger.d('⏳ Sync backoff: attempt $retryCount');
    }

    // Only process records with sequence > cursor
    final pending = queue
        .where((item) => (item['sequence'] as int? ?? 0) > syncCursor)
        .toList();

    if (pending.isEmpty) {
      // All records already synced — clear queue
      await prefs.remove(_queueKey);
      await prefs.remove(_syncCursorKey);
      await prefs.setInt(_retryCountKey, 0);
      _isSyncing = false;
      return;
    }

    _logger.i('🔄 Syncing ${pending.length} offline records (cursor=$syncCursor)...');

    final List<Map<String, dynamic>> failed = [];
    bool hasConnectionError = false;
    int lastSuccessfulSequence = syncCursor;

    for (final item in pending) {
      final itemSequence = item['sequence'] as int? ?? 0;
      try {
        final res = await api.post('/attendance/check-in', body: item);
        if (res['success'] == true) {
          // FIX 5: Advance cursor on each success
          lastSuccessfulSequence = itemSequence;
          await prefs.setInt(_syncCursorKey, lastSuccessfulSequence);
        } else {
          final error = res['error']?.toString() ?? '';
          if (error.contains('Already checked in') ||
              error.contains('outside the authorized area') ||
              error.contains('Offline sync window expired')) {
            // Server-authoritative discard — advance cursor past this record
            _logger.w('⚠️ Discarding invalid offline record: $error');
            lastSuccessfulSequence = itemSequence;
            await prefs.setInt(_syncCursorKey, lastSuccessfulSequence);
          } else if (res['statusCode'] == 401) {
            // Token expired mid-sync — stop, preserve remaining records
            _logger.e('❌ 401 during sync — stopping. Remaining records preserved.');
            failed.addAll(pending.skip(pending.indexOf(item)));
            hasConnectionError = true;
            break;
          } else {
            failed.add(item);
          }
        }
      } catch (e) {
        failed.add(item);
        hasConnectionError = true;
      }
    }

    if (failed.isEmpty) {
      await prefs.remove(_queueKey);
      await prefs.remove(_syncCursorKey);
      await prefs.setInt(_retryCountKey, 0);
      _logger.i('✅ Offline sync complete');
    } else {
      // Keep only the failed records in the queue
      await prefs.setString(_queueKey, json.encode(failed));
      if (hasConnectionError) {
        await prefs.setInt(_retryCountKey, retryCount + 1);
      }
      _logger.w('⚠️ Sync partially failed. ${failed.length} remaining.');
    }

    _isSyncing = false;
  }

  /// Decode JWT payload and check if it is expired.
  bool _isTokenExpired(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) return true;
      final payload = json.decode(
        utf8.decode(base64Url.decode(base64Url.normalize(parts[1]))),
      ) as Map<String, dynamic>;
      final exp = payload['exp'] as int?;
      if (exp == null) return true;
      // Consider expired if within 60 seconds of expiry (clock skew buffer)
      return DateTime.now().millisecondsSinceEpoch / 1000 >= exp - 60;
    } catch (_) {
      return true;
    }
  }
}
