import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/api_service.dart';
import '../utils/response_parser.dart';

class LeaveProvider with ChangeNotifier {
  List<dynamic> _myLeaves = [];
  List<dynamic> _leaveBalance = [];
  bool _isLoading = false;
  String? _error;

  List<dynamic> get myLeaves => _myLeaves;
  List<dynamic> get leaveBalance => _leaveBalance;
  bool get isLoading => _isLoading;
  String? get error => _error;

  final _api = ApiService.instance;

  Future<void> getMyLeaves() async {
    _isLoading = true;
    notifyListeners();
    try {
      final res = await _api.get('/leaves/my?limit=50');
      if (ResponseParser.isSuccess(res)) {
        _myLeaves = ResponseParser.asList(ResponseParser.getData(res));
      } else {
        _error = ResponseParser.errorMessage(res, 'Failed to load leaves');
      }
    } catch (_) {
      _error = 'Network error. Pull to refresh.';
    }
    _isLoading = false;
    notifyListeners();
  }

  Future<void> getLeaveBalance() async {
    try {
      final res = await _api.get('/leaves/balance');
      if (ResponseParser.isSuccess(res)) {
        _leaveBalance = ResponseParser.asList(ResponseParser.getData(res));
        notifyListeners();
      }
    } catch (_) {}
  }

  Future<({bool ok, String message})> applyLeave({
    required String leaveType,
    required DateTime startDate,
    required DateTime endDate,
    required String reason,
    required String documentUrl,
    String? description,
  }) async {
    _isLoading = true;
    notifyListeners();
    try {
      final res = await _api.post('/leaves', body: {
        'leaveType':   leaveType,
        'startDate':   startDate.toIso8601String().split('T')[0],
        'endDate':     endDate.toIso8601String().split('T')[0],
        'reason':      reason,
        'documentUrl': documentUrl,
        if (description != null && description.isNotEmpty) 'description': description,
      });
      if (ResponseParser.isSuccess(res)) {
        HapticFeedback.mediumImpact(); // confirmation on leave request submitted
        await Future.wait([getMyLeaves(), getLeaveBalance()]);
        _isLoading = false; notifyListeners();
        return (ok: true, message: 'Leave request submitted successfully!');
      }
      _isLoading = false; notifyListeners();
      return (ok: false, message: ResponseParser.errorMessage(res, 'Failed to apply leave'));
    } catch (_) {
      _isLoading = false; notifyListeners();
      return (ok: false, message: 'Network error. Please try again.');
    }
  }

  Future<({bool ok, String message})> cancelLeave(dynamic leaveId) async {
    try {
      final res = await _api.post('/leaves/$leaveId/cancel');
      if (ResponseParser.isSuccess(res)) {
        await getMyLeaves();
        return (ok: true, message: 'Leave request cancelled.');
      }
      return (ok: false, message: ResponseParser.errorMessage(res, 'Failed to cancel'));
    } catch (_) {
      return (ok: false, message: 'Network error.');
    }
  }

  void clearError() { _error = null; notifyListeners(); }
}
