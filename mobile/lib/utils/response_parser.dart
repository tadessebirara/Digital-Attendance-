library;

/// Safe response parsing utilities for Flutter web compatibility.
/// The backend standardize middleware wraps all responses in:
/// { success: bool, data: any, message?: string, error?: string }
/// But `data` can be Map, List, String, or null — never assume the type.

class ResponseParser {
  /// Safely extract a Map from response data.
  /// Returns null if data is not a Map.
  static Map<String, dynamic>? asMap(dynamic data) {
    if (data == null) return null;
    if (data is Map<String, dynamic>) return data;
    if (data is Map) {
      try { return Map<String, dynamic>.from(data); } catch (_) { return null; }
    }
    return null;
  }

  /// Safely extract a List from response data.
  /// Returns empty list if data is not a List.
  static List<dynamic> asList(dynamic data) {
    if (data == null) return [];
    if (data is List) return data;
    return [];
  }

  /// Safely extract a String from a value.
  static String? asString(dynamic value) {
    if (value == null) return null;
    if (value is String) return value;
    if (value is List || value is Map) return null;
    return value.toString();
  }

  /// Check if response is successful.
  static bool isSuccess(Map<String, dynamic> res) {
    return res['success'] == true;
  }

  /// Get error message from response.
  static String errorMessage(Map<String, dynamic> res, [String fallback = 'An error occurred']) {
    final err = res['error'];
    final msg = res['message'];
    if (err is String && err.isNotEmpty) return err;
    if (msg is String && msg.isNotEmpty) return msg;
    return fallback;
  }

  /// Get the data field safely — unwraps nested { data: { data: [...] } } if needed.
  static dynamic getData(Map<String, dynamic> res) {
    final d = res['data'];
    // Backend standardize middleware sometimes double-wraps
    if (d is Map && d.containsKey('data') && !d.containsKey('id')) {
      return d['data'];
    }
    return d;
  }
}
