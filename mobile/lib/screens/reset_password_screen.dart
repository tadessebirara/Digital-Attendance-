import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../utils/app_theme.dart';
import '../widgets/app_widgets.dart';

/// Opened via deep link: alyah://reset-password?token=XYZ
/// The token is passed as a route argument (String).
///
/// Flow:
///   1. On mount → validate token against backend (sends x-device-id header)
///   2. If device mismatch → show "Unauthorized Device" screen
///   3. If valid → show new password + confirm form
///   4. On submit → POST /auth/reset-password with token + newPassword
///   5. On success → navigate to login
class ResetPasswordScreen extends StatefulWidget {
  const ResetPasswordScreen({super.key});

  @override
  State<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends State<ResetPasswordScreen>
    with SingleTickerProviderStateMixin {
  // ── State ────────────────────────────────────────────────────────────────────
  String? _token;
  bool _validating = true;
  bool _tokenValid = false;
  bool _deviceMismatch = false;
  String _tokenEmail = '';
  String _tokenFirstName = '';
  String _tokenExpiry = '';

  final _newPwCtrl = TextEditingController();
  final _confirmPwCtrl = TextEditingController();
  bool _showNew = false;
  bool _showConfirm = false;
  bool _loading = false;
  bool _done = false;
  String? _error;

  late AnimationController _anim;

  // Password strength
  int get _strength {
    final p = _newPwCtrl.text;
    if (p.isEmpty) return 0;
    int s = 0;
    if (p.length >= 8) s++;
    if (RegExp(r'[A-Z]').hasMatch(p)) s++;
    if (RegExp(r'[0-9]').hasMatch(p)) s++;
    if (RegExp(r'[^A-Za-z0-9]').hasMatch(p)) s++;
    return s;
  }

  static const _strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  static const _strengthColors = [
    Colors.transparent,
    AppTheme.danger,
    AppTheme.warning,
    Color(0xFF3B82F6),
    AppTheme.success,
  ];

  @override
  void initState() {
    super.initState();
    _anim = AnimationController(
        duration: const Duration(milliseconds: 500), vsync: this)
      ..forward();
    // Token is passed as route argument — ONLY via deep link
    // If no token is present, this screen was accessed directly (not allowed)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final token = ModalRoute.of(context)?.settings.arguments as String?;
      if (token == null || token.isEmpty) {
        // No token = direct navigation attempt — redirect to login immediately
        Navigator.of(context).pushNamedAndRemoveUntil('/login', (_) => false);
        return;
      }
      _token = token;
      _validateToken(token);
    });
  }

  @override
  void dispose() {
    _newPwCtrl.dispose();
    _confirmPwCtrl.dispose();
    _anim.dispose();
    super.dispose();
  }

  // ── Validate token ────────────────────────────────────────────────────────────
  Future<void> _validateToken(String token) async {
    try {
      final res = await ApiService.instance
          .get('/auth/validate-reset-token?token=${Uri.encodeComponent(token)}');

      if (!mounted) return;

      if (res['success'] == true) {
        final data = res['data'] ?? res;
        setState(() {
          _tokenValid = true;
          _tokenEmail = (data['email'] ?? '').toString();
          _tokenFirstName = (data['firstName'] ?? '').toString();
          _tokenExpiry = (data['expiresAt'] ?? '').toString();
          _validating = false;
        });
      } else if (res['code'] == 'DEVICE_MISMATCH') {
        setState(() {
          _deviceMismatch = true;
          _tokenValid = false;
          _validating = false;
        });
      } else {
        setState(() {
          _tokenValid = false;
          _validating = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _tokenValid = false;
          _validating = false;
        });
      }
    }
  }

  // ── Submit new password ───────────────────────────────────────────────────────
  Future<void> _submit() async {
    final newPw = _newPwCtrl.text.trim();
    final confirm = _confirmPwCtrl.text.trim();

    if (newPw.length < 8) {
      setState(() => _error = 'Password must be at least 8 characters');
      return;
    }
    if (newPw != confirm) {
      setState(() => _error = 'Passwords do not match');
      return;
    }

    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final res = await ApiService.instance.post('/auth/reset-password',
          body: {'token': _token, 'newPassword': newPw});

      if (!mounted) return;

      if (res['success'] == true) {
        setState(() {
          _done = true;
          _loading = false;
        });
        // Auto-navigate to login after 3 seconds
        Future.delayed(const Duration(seconds: 3), () {
          if (mounted) {
            Navigator.of(context)
                .pushNamedAndRemoveUntil('/login', (_) => false);
          }
        });
      } else if (res['code'] == 'DEVICE_MISMATCH') {
        setState(() {
          _deviceMismatch = true;
          _tokenValid = false;
          _loading = false;
        });
      } else {
        setState(() {
          _error = (res['error'] ?? 'Failed to reset password. The link may have expired.').toString();
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _error = 'Network error. Please try again.';
          _loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? AppTheme.gray900 : AppTheme.bg,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded,
              size: 18,
              color: isDark ? Colors.white : AppTheme.primary),
          onPressed: () => Navigator.of(context)
              .pushNamedAndRemoveUntil('/login', (_) => false),
        ),
      ),
      body: FadeTransition(
        opacity: _anim,
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: _buildBody(isDark),
          ),
        ),
      ),
    );
  }

  Widget _buildBody(bool isDark) {
    // Loading / validating
    if (_validating) {
      return Shimmer(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const SizedBox(height: 60),
            const Center(child: ShimmerBox(width: 80, height: 80, radius: 40)),
            const SizedBox(height: 24),
            const Center(child: ShimmerBox(width: 200, height: 22)),
            const SizedBox(height: 10),
            const Center(child: ShimmerBox(width: 260, height: 14)),
            const SizedBox(height: 32),
            ShimmerBox(width: double.infinity, height: 54, radius: 14),
            const SizedBox(height: 14),
            ShimmerBox(width: double.infinity, height: 54, radius: 14),
          ],
        ),
      );
    }

    // ── Device mismatch ───────────────────────────────────────────────────────
    if (_deviceMismatch) {
      return _UnauthorizedDeviceView(
        onBack: () => Navigator.of(context)
            .pushNamedAndRemoveUntil('/login', (_) => false),
      );
    }

    // ── Invalid / expired token ───────────────────────────────────────────────
    if (!_tokenValid) {
      return _InvalidTokenView(
        onRequestNew: () =>
            Navigator.of(context).pushNamed('/forgot-password'),
        onBack: () => Navigator.of(context)
            .pushNamedAndRemoveUntil('/login', (_) => false),
      );
    }

    // ── Success ───────────────────────────────────────────────────────────────
    if (_done) {
      return _SuccessView(
        onLogin: () => Navigator.of(context)
            .pushNamedAndRemoveUntil('/login', (_) => false),
      );
    }

    // ── Reset form ────────────────────────────────────────────────────────────
    return _buildForm(isDark);
  }

  Widget _buildForm(bool isDark) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 8),

        // Icon
        Center(
          child: Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              color: AppTheme.primary.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.lock_reset_rounded,
                size: 40, color: AppTheme.primary),
          ),
        ),
        const SizedBox(height: 24),

        Text(
          'Reset Password',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 26,
            fontWeight: FontWeight.w900,
            color: isDark ? Colors.white : AppTheme.primary,
            letterSpacing: -0.5,
          ),
        ),
        if (_tokenFirstName.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(
            'Hi $_tokenFirstName',
            textAlign: TextAlign.center,
            style: TextStyle(
                fontSize: 15,
                color: isDark ? AppTheme.gray300 : AppTheme.gray600,
                fontWeight: FontWeight.w600),
          ),
        ],
        if (_tokenEmail.isNotEmpty) ...[
          const SizedBox(height: 4),
          Text(
            _tokenEmail,
            textAlign: TextAlign.center,
            style: const TextStyle(
                fontSize: 13,
                color: AppTheme.gray500,
                fontWeight: FontWeight.w500),
          ),
        ],
        if (_tokenExpiry.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(
            '⏱ Expires at ${_formatExpiry(_tokenExpiry)}',
            textAlign: TextAlign.center,
            style: const TextStyle(
                fontSize: 12,
                color: AppTheme.warning,
                fontWeight: FontWeight.w600),
          ),
        ],
        const SizedBox(height: 28),

        // Error
        if (_error != null) ...[
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: AppTheme.danger.withValues(alpha: 0.1),
              borderRadius: AppTheme.radiusM,
            ),
            child: Row(children: [
              const Icon(Icons.error_rounded, color: AppTheme.danger, size: 18),
              const SizedBox(width: 10),
              Expanded(
                  child: Text(_error!,
                      style: const TextStyle(
                          color: AppTheme.danger,
                          fontSize: 13,
                          fontWeight: FontWeight.w600))),
            ]),
          ),
          const SizedBox(height: 20),
        ],

        // New password
        const _FieldLabel('NEW PASSWORD'),
        const SizedBox(height: 8),
        TextFormField(
          controller: _newPwCtrl,
          obscureText: !_showNew,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            hintText: 'Min 8 characters',
            prefixIcon: const Icon(Icons.lock_outline_rounded, size: 18),
            suffixIcon: IconButton(
              icon: Icon(
                  _showNew
                      ? Icons.visibility_off_rounded
                      : Icons.visibility_rounded,
                  size: 18),
              onPressed: () => setState(() => _showNew = !_showNew),
            ),
          ),
        ),
        // Strength bar
        if (_newPwCtrl.text.isNotEmpty) ...[
          const SizedBox(height: 8),
          Row(
            children: List.generate(4, (i) {
              final filled = i < _strength;
              return Expanded(
                child: Container(
                  height: 4,
                  margin: EdgeInsets.only(right: i < 3 ? 4 : 0),
                  decoration: BoxDecoration(
                    color: filled
                        ? _strengthColors[_strength]
                        : AppTheme.gray200,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              );
            }),
          ),
          const SizedBox(height: 4),
          Text(
            _strengthLabels[_strength],
            style: TextStyle(
                fontSize: 12,
                color: _strengthColors[_strength],
                fontWeight: FontWeight.w600),
          ),
        ],
        const SizedBox(height: 20),

        // Confirm password
        const _FieldLabel('CONFIRM PASSWORD'),
        const SizedBox(height: 8),
        TextFormField(
          controller: _confirmPwCtrl,
          obscureText: !_showConfirm,
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            hintText: 'Repeat new password',
            prefixIcon: const Icon(Icons.lock_outline_rounded, size: 18),
            suffixIcon: IconButton(
              icon: Icon(
                  _showConfirm
                      ? Icons.visibility_off_rounded
                      : Icons.visibility_rounded,
                  size: 18),
              onPressed: () => setState(() => _showConfirm = !_showConfirm),
            ),
          ),
        ),
        if (_confirmPwCtrl.text.isNotEmpty &&
            _newPwCtrl.text != _confirmPwCtrl.text) ...[
          const SizedBox(height: 4),
          const Text('Passwords do not match',
              style: TextStyle(
                  fontSize: 12,
                  color: AppTheme.danger,
                  fontWeight: FontWeight.w600)),
        ],
        const SizedBox(height: 32),

        SizedBox(
          height: 56,
          child: ElevatedButton(
            onPressed: _loading ? null : _submit,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primary,
              shape: RoundedRectangleBorder(
                  borderRadius: AppTheme.radiusM),
              elevation: 8,
              shadowColor: AppTheme.primary.withValues(alpha: 0.4),
            ),
            child: _loading
                ? const SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(
                        strokeWidth: 2.5, color: Colors.white))
                : const Text('RESET PASSWORD',
                    style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        letterSpacing: 1)),
          ),
        ),
        const SizedBox(height: 16),
        const Center(
          child: Text(
            'After reset, all active sessions will be signed out.',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 12, color: AppTheme.gray400),
          ),
        ),
        const SizedBox(height: 32),
      ],
    );
  }

  String _formatExpiry(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
    } catch (_) {
      return iso;
    }
  }
}

// ── Unauthorized Device View ──────────────────────────────────────────────────
class _UnauthorizedDeviceView extends StatelessWidget {
  final VoidCallback onBack;
  const _UnauthorizedDeviceView({required this.onBack});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 40),
        Center(
          child: Container(
            width: 90,
            height: 90,
            decoration: BoxDecoration(
              color: AppTheme.danger.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.phonelink_erase_rounded,
                size: 48, color: AppTheme.danger),
          ),
        ),
        const SizedBox(height: 28),
        const Text(
          'Unauthorized Device',
          textAlign: TextAlign.center,
          style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w900,
              color: AppTheme.primary,
              letterSpacing: -0.5),
        ),
        const SizedBox(height: 14),
        const Text(
          'This password reset link was sent to a different device. '
          'For security, it can only be used on the device that requested it.\n\n'
          'Please open the reset link on your original device, or request a new reset link from this device.',
          textAlign: TextAlign.center,
          style: TextStyle(
              fontSize: 14, color: AppTheme.gray500, height: 1.6),
        ),
        const SizedBox(height: 32),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppTheme.danger.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
                color: AppTheme.danger.withValues(alpha: 0.2)),
          ),
          child: const Row(
            children: [
              Icon(Icons.security_rounded,
                  color: AppTheme.danger, size: 20),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  'Password change blocked — device not authorized.',
                  style: TextStyle(
                      color: AppTheme.danger,
                      fontWeight: FontWeight.w700,
                      fontSize: 13),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 32),
        ElevatedButton(
          onPressed: () =>
              Navigator.of(context).pushNamed('/forgot-password'),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppTheme.primary,
            padding: const EdgeInsets.symmetric(vertical: 16),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14)),
          ),
          child: const Text('Request New Reset Link',
              style: TextStyle(
                  fontWeight: FontWeight.w800, fontSize: 15)),
        ),
        const SizedBox(height: 12),
        OutlinedButton(
          onPressed: onBack,
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 16),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14)),
          ),
          child: const Text('Back to Sign In',
              style: TextStyle(
                  fontWeight: FontWeight.w700, fontSize: 15)),
        ),
        const SizedBox(height: 32),
      ],
    );
  }
}

// ── Invalid Token View ────────────────────────────────────────────────────────
class _InvalidTokenView extends StatelessWidget {
  final VoidCallback onRequestNew;
  final VoidCallback onBack;
  const _InvalidTokenView(
      {required this.onRequestNew, required this.onBack});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 40),
        Center(
          child: Container(
            width: 90,
            height: 90,
            decoration: BoxDecoration(
              color: AppTheme.warning.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.link_off_rounded,
                size: 48, color: AppTheme.warning),
          ),
        ),
        const SizedBox(height: 28),
        const Text(
          'Link Expired or Invalid',
          textAlign: TextAlign.center,
          style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w900,
              color: AppTheme.primary,
              letterSpacing: -0.5),
        ),
        const SizedBox(height: 14),
        const Text(
          'This password reset link is invalid or has expired. '
          'Reset links are valid for 1 hour and can only be used once.',
          textAlign: TextAlign.center,
          style: TextStyle(
              fontSize: 14, color: AppTheme.gray500, height: 1.6),
        ),
        const SizedBox(height: 32),
        ElevatedButton(
          onPressed: onRequestNew,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppTheme.primary,
            padding: const EdgeInsets.symmetric(vertical: 16),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14)),
          ),
          child: const Text('Request New Link',
              style: TextStyle(
                  fontWeight: FontWeight.w800, fontSize: 15)),
        ),
        const SizedBox(height: 12),
        OutlinedButton(
          onPressed: onBack,
          style: OutlinedButton.styleFrom(
            padding: const EdgeInsets.symmetric(vertical: 16),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14)),
          ),
          child: const Text('Back to Sign In',
              style: TextStyle(
                  fontWeight: FontWeight.w700, fontSize: 15)),
        ),
        const SizedBox(height: 32),
      ],
    );
  }
}

// ── Success View ──────────────────────────────────────────────────────────────
class _SuccessView extends StatelessWidget {
  final VoidCallback onLogin;
  const _SuccessView({required this.onLogin});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 48),
        Center(
          child: Container(
            width: 90,
            height: 90,
            decoration: BoxDecoration(
              color: AppTheme.success.withValues(alpha: 0.1),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.check_circle_rounded,
                size: 52, color: AppTheme.success),
          ),
        ),
        const SizedBox(height: 28),
        const Text(
          'Password Reset!',
          textAlign: TextAlign.center,
          style: TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w900,
              color: AppTheme.primary,
              letterSpacing: -0.5),
        ),
        const SizedBox(height: 12),
        const Text(
          'Your password has been updated. All active sessions have been signed out for security.',
          textAlign: TextAlign.center,
          style: TextStyle(
              fontSize: 14, color: AppTheme.gray500, height: 1.6),
        ),
        const SizedBox(height: 8),
        const Text(
          'Redirecting to sign in…',
          textAlign: TextAlign.center,
          style: TextStyle(
              fontSize: 12,
              color: AppTheme.gray400,
              fontStyle: FontStyle.italic),
        ),
        const SizedBox(height: 40),
        ElevatedButton(
          onPressed: onLogin,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppTheme.primary,
            padding: const EdgeInsets.symmetric(vertical: 16),
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(14)),
            elevation: 8,
            shadowColor: AppTheme.primary.withValues(alpha: 0.4),
          ),
          child: const Text('SIGN IN NOW',
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1)),
        ),
        const SizedBox(height: 32),
      ],
    );
  }
}

class _FieldLabel extends StatelessWidget {
  final String text;
  const _FieldLabel(this.text);
  @override
  Widget build(BuildContext context) => Text(text,
      style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w800,
          color: AppTheme.gray400,
          letterSpacing: 1));
}
