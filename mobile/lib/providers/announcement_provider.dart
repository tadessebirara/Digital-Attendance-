import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../utils/response_parser.dart';

class AnnouncementProvider with ChangeNotifier {
  List<dynamic> _announcements = [];
  bool _isLoading = false;
  String? _error;

  List<dynamic> get announcements => _announcements;
  bool get isLoading => _isLoading;
  String? get error => _error;

  final _api = ApiService.instance;

  /// Full fetch — called on startup, resume, and pull-to-refresh.
  /// Silent if data already exists (background refresh — no loading spinner).
  Future<void> getAnnouncements({bool silent = false}) async {
    if (!silent || _announcements.isEmpty) {
      _isLoading = true;
      notifyListeners();
    }
    try {
      // Announcements cached for 5 min — new ones arrive via socket anyway
      final res = await _api.get(
        '/announcements?limit=50',
        cacheTtl: const Duration(minutes: 5),
      );
      if (ResponseParser.isSuccess(res)) {
        final next = ResponseParser.asList(ResponseParser.getData(res));
        // O(n) id-based diffing instead of O(n * content_size) toString() comparison
        if (_announcementsChanged(_announcements, next)) {
          _announcements = next;
          _isLoading = false;
          notifyListeners();
          return;
        }
      } else {
        _error = ResponseParser.errorMessage(res);
      }
    } catch (_) {
      _error = 'Failed to load announcements';
    }
    _isLoading = false;
    notifyListeners();
  }

  /// Called by the socket 'announcement:new' event with the payload.
  /// Inserts the new announcement at position 0 (top) immediately —
  /// no waiting for a full HTTP refresh.
  void onSocketNew(dynamic data) {
    if (data == null) { getAnnouncements(); return; }
    try {
      Map<String, dynamic> ann;
      if (data is Map) {
        final inner = data['data'];
        ann = Map<String, dynamic>.from(
          inner is Map ? inner : data,
        );
      } else {
        getAnnouncements(); return;
      }
      // Remove stale copy if already present (avoid duplicate)
      final id = ann['id']?.toString();
      if (id != null) {
        _announcements = _announcements
            .where((a) => a['id']?.toString() != id)
            .toList();
      }
      // Prepend — newest always on top
      _announcements = [ann, ..._announcements];
      notifyListeners();
    } catch (_) {
      // Fallback to full refresh on any parse error
      getAnnouncements();
    }
  }

  /// Called by the socket 'announcement:update' event.
  /// Updates in-place or re-fetches if not already in the list.
  void onSocketUpdate(dynamic data) {
    if (data == null) { getAnnouncements(); return; }
    try {
      Map<String, dynamic> ann;
      if (data is Map) {
        final inner = data['data'];
        ann = Map<String, dynamic>.from(inner is Map ? inner : data);
      } else {
        getAnnouncements(); return;
      }
      final id = ann['id']?.toString();
      if (id == null) { getAnnouncements(); return; }
      final idx = _announcements.indexWhere((a) => a['id']?.toString() == id);
      if (idx >= 0) {
        final updated = List<dynamic>.from(_announcements);
        // Merge new fields into existing record
        updated[idx] = <String, dynamic>{
          ...Map<String, dynamic>.from(_announcements[idx] as Map),
          ...ann,
        };
        _announcements = updated;
        notifyListeners();
      } else {
        // Not in list yet (e.g. just published from scheduled) — full refresh
        getAnnouncements();
      }
    } catch (_) {
      getAnnouncements();
    }
  }

  void clearError() { _error = null; notifyListeners(); }

  /// O(n) check — compare by id + length only, not full content serialization
  static bool _announcementsChanged(List<dynamic> a, List<dynamic> b) {
    if (a.length != b.length) return true;
    for (var i = 0; i < a.length; i++) {
      if (a[i]['id']?.toString() != b[i]['id']?.toString()) return true;
      if (a[i]['updatedAt']?.toString() != b[i]['updatedAt']?.toString()) return true;
    }
    return false;
  }
}
