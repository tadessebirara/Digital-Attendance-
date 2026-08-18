import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../utils/app_theme.dart';
import '../widgets/app_widgets.dart';

/// Final step of enterprise activation: set password (if required) and go to login.
class CompleteActivationScreen extends StatefulWidget {
  const CompleteActivationScreen({super.key});

  @override
  State<CompleteActivationScreen> createState() => _CompleteActivationScreenState();
}

class _CompleteActivationScreenState extends State<CompleteActivationScreen>
    with WidgetsBindingObserver {
  String _email = '';
  String _activationToken = '';
  bool _requiresPassword = true;

  final _pw1 = TextEditingController();
  final _pw2 = TextEditingController();
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // Only load args once — guard against null args on Flutter web rebuild
      if (_activationToken.isNotEmpty) return;
      final args = ModalRoute.of(context)?.settings.arguments as Map<String, dynamic>?;
      if (args == null) return;
      setState(() {
        _email = args['email'] as String? ?? '';
        _activationToken = args['activationToken'] as String? ?? '';
        _requiresPassword = args['requiresPassword'] as bool? ?? true;
      });
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _pw1.dispose();
    _pw2.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Nothing — just keep the screen alive. Don't redirect on resume.
  }

  Future<void> _submit() async {
    if (_activationToken.isEmpty) {
      setState(() => _error = 'Missing activation session. Open the link from your email again.');
      return;
    }

    final p1 = _pw1.text;
    final p2 = _pw2.text;

    if (_requiresPassword) {
      if (p1.length < 8) {
        setState(() => _error = 'Password must be at least 8 characters.');
        return;
      }
      if (p1 != p2) {
        setState(() => _error = 'Passwords do not match.');
        return;
      }
    } else if (p1.isNotEmpty || p2.isNotEmpty) {
      if (p1.length < 8) {
        setState(() => _error = 'Password must be at least 8 characters.');
        return;
      }
      if (p1 != p2) {
        setState(() => _error = 'Passwords do not match.');
        return;
      }
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    final body = <String, dynamic>{
      'activationToken': _activationToken,
      if (_requiresPassword || p1.isNotEmpty) 'newPassword': p1,
    };

    final res = await ApiService.instance.post('/auth/complete-employee-activation', body: body);

    if (!mounted) return;
    setState(() => _loading = false);

    if (res['success'] == true) {
      showAppSnack(context, 'Account activated! You can now sign in.');
      Navigator.of(context).pushNamedAndRemoveUntil('/login', (_) => false);
    } else {
      setState(() => _error = res['error']?.toString() ?? 'Activation failed.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? AppTheme.gray900 : AppTheme.bg,
      appBar: AppBar(
        title: const Text('Set password'),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(28),
          children: [
            const SizedBox(height: 16),
            // Icon
            Center(
              child: Container(
                width: 80, height: 80,
                decoration: BoxDecoration(
                  color: AppTheme.accent.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.lock_open_rounded, size: 40, color: AppTheme.accent),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              _requiresPassword ? 'Set Your Password' : 'Complete Activation',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 26,
                fontWeight: FontWeight.w900,
                color: isDark ? Colors.white : AppTheme.primary,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _requiresPassword
                  ? 'Choose a secure password for your account.'
                  : 'You can sign in with your existing password, or set a new one.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: isDark ? AppTheme.gray400 : AppTheme.gray500, height: 1.5),
            ),
            if (_email.isNotEmpty) ...[
              const SizedBox(height: 8),
              Center(
                child: Text(
                  _email,
                  style: const TextStyle(fontWeight: FontWeight.w700, color: AppTheme.accent, fontSize: 13),
                ),
              ),
            ],
            const SizedBox(height: 28),
            if (_error != null) ...[
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: AppTheme.danger.withValues(alpha: 0.1),
                  borderRadius: AppTheme.radiusM,
                  border: Border.all(color: AppTheme.danger.withValues(alpha: 0.3)),
                ),
                child: Row(children: [
                  const Icon(Icons.error_rounded, color: AppTheme.danger, size: 16),
                  const SizedBox(width: 8),
                  Expanded(child: Text(_error!, style: const TextStyle(color: AppTheme.danger, fontSize: 13, fontWeight: FontWeight.w600))),
                ]),
              ),
              const SizedBox(height: 20),
            ],
            TextField(
              controller: _pw1,
              obscureText: true,
              style: TextStyle(color: isDark ? Colors.white : AppTheme.primary),
              decoration: InputDecoration(
                labelText: _requiresPassword ? 'New password' : 'New password (optional)',
                prefixIcon: const Icon(Icons.lock_outline_rounded, size: 18),
                border: OutlineInputBorder(borderRadius: AppTheme.radiusM),
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _pw2,
              obscureText: true,
              style: TextStyle(color: isDark ? Colors.white : AppTheme.primary),
              decoration: InputDecoration(
                labelText: _requiresPassword ? 'Confirm password' : 'Confirm (optional)',
                prefixIcon: const Icon(Icons.lock_outline_rounded, size: 18),
                border: OutlineInputBorder(borderRadius: AppTheme.radiusM),
              ),
            ),
            const SizedBox(height: 32),
            SizedBox(
              width: double.infinity,
              height: 54,
              child: ElevatedButton(
                onPressed: _loading ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppTheme.primary,
                  shape: RoundedRectangleBorder(borderRadius: AppTheme.radiusM),
                  elevation: 0,
                ),
                child: _loading
                    ? const SizedBox(width: 22, height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Complete Activation',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
