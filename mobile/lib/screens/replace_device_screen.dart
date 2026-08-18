import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../utils/app_theme.dart';

/// Shown when login returns SINGLE_DEVICE_ENFORCED.
/// Two-step flow:
///   Step 1 — enter email + password → backend sends OTP to registered email
///   Step 2 — enter 6-digit OTP → backend swaps primary device + issues session
class ReplaceDeviceScreen extends StatefulWidget {
  const ReplaceDeviceScreen({super.key});

  @override
  State<ReplaceDeviceScreen> createState() => _ReplaceDeviceScreenState();
}

class _ReplaceDeviceScreenState extends State<ReplaceDeviceScreen>
    with SingleTickerProviderStateMixin {
  // ── Step 1 ──────────────────────────────────────────────────────────────────
  final _step1Key = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passCtrl = TextEditingController();
  bool _obscure = true;

  // ── Step 2 ──────────────────────────────────────────────────────────────────
  final _otpCtrl = TextEditingController();

  // ── State ────────────────────────────────────────────────────────────────────
  int _step = 1;
  bool _loading = false;
  String? _error;
  String? _replacementSessionToken;

  late AnimationController _anim;

  @override
  void initState() {
    super.initState();
    _anim = AnimationController(
      duration: const Duration(milliseconds: 500),
      vsync: this,
    )..forward();
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passCtrl.dispose();
    _otpCtrl.dispose();
    _anim.dispose();
    super.dispose();
  }

  // ── Step 1: request OTP ──────────────────────────────────────────────────────
  Future<void> _requestOtp() async {
    if (!_step1Key.currentState!.validate()) return;
    setState(() { _loading = true; _error = null; });

    final auth = context.read<AuthProvider>();
    final result = await auth.requestDeviceReplacement(
      email: _emailCtrl.text.trim().toLowerCase(),
      password: _passCtrl.text,
    );

    if (!mounted) return;
    if (result.ok) {
      setState(() {
        _replacementSessionToken = result.sessionToken;
        _step = 2;
        _loading = false;
      });
    } else {
      setState(() { _error = result.message; _loading = false; });
    }
  }

  // ── Step 2: resend OTP (goes back to step 1 and re-submits) ─────────────────
  Future<void> _resendOtp() async {
    setState(() { _step = 1; _otpCtrl.clear(); _error = null; _loading = false; });
    // Small delay so the UI renders step 1 before we fire the request
    await Future.delayed(const Duration(milliseconds: 80));
    if (mounted) await _requestOtp();
  }

  // ── Step 2: confirm OTP ──────────────────────────────────────────────────────
  Future<void> _confirmOtp() async {
    final code = _otpCtrl.text.trim();
    if (code.length != 6) {
      setState(() => _error = 'Enter the 6-digit code from your email');
      return;
    }
    if (_replacementSessionToken == null) return;

    setState(() { _loading = true; _error = null; });

    final auth = context.read<AuthProvider>();
    final ok = await auth.confirmDeviceReplacement(
      replacementSessionToken: _replacementSessionToken!,
      otpCode: code,
    );

    if (!mounted) return;
    if (ok) {
      // Login succeeded — navigate to home
      Navigator.of(context).pushReplacementNamed('/home');
    } else {
      setState(() { _error = auth.error ?? 'Invalid code. Please try again.'; _loading = false; });
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
          icon: Icon(Icons.arrow_back_ios_new_rounded, size: 18,
              color: isDark ? Colors.white : AppTheme.primary),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: FadeTransition(
        opacity: _anim,
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28),
            child: _step == 1 ? _buildStep1(isDark) : _buildStep2(isDark),
          ),
        ),
      ),
    );
  }

  // ── Step 1 UI ────────────────────────────────────────────────────────────────
  Widget _buildStep1(bool isDark) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 16),

        // Icon
        Center(
          child: Container(
            width: 80, height: 80,
            decoration: BoxDecoration(
              color: AppTheme.warning.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.phonelink_setup_rounded,
                size: 40, color: AppTheme.warning),
          ),
        ),
        const SizedBox(height: 24),

        Text('Replace Device',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 26, fontWeight: FontWeight.w900,
            color: isDark ? Colors.white : AppTheme.primary,
            letterSpacing: -0.5,
          ),
        ),
        const SizedBox(height: 10),
        Text(
          'Lost or replaced your phone? Verify your identity and we\'ll send a code to your registered email to activate this device.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 14, color: isDark ? AppTheme.gray400 : AppTheme.gray500, height: 1.5),
        ),
        const SizedBox(height: 32),

        // Error banner
        if (_error != null) ...[
          _ErrorBanner(message: _error!),
          const SizedBox(height: 20),
        ],

        Form(
          key: _step1Key,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _FieldLabel('EMAIL ADDRESS'),
              const SizedBox(height: 8),
              TextFormField(
                controller: _emailCtrl,
                keyboardType: TextInputType.emailAddress,
                decoration: const InputDecoration(
                  hintText: 'name@company.com',
                  prefixIcon: Icon(Icons.alternate_email_rounded, size: 18),
                ),
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return 'Required';
                  if (!RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(v.trim())) return 'Invalid email';
                  return null;
                },
              ),
              const SizedBox(height: 20),
              _FieldLabel('PASSWORD'),
              const SizedBox(height: 8),
              TextFormField(
                controller: _passCtrl,
                obscureText: _obscure,
                decoration: InputDecoration(
                  hintText: '••••••••',
                  prefixIcon: const Icon(Icons.lock_outline_rounded, size: 18),
                  suffixIcon: IconButton(
                    icon: Icon(_obscure ? Icons.visibility_rounded : Icons.visibility_off_rounded, size: 18),
                    onPressed: () => setState(() => _obscure = !_obscure),
                  ),
                ),
                validator: (v) => (v == null || v.isEmpty) ? 'Required' : null,
              ),
              const SizedBox(height: 32),

              SizedBox(
                height: 56,
                child: ElevatedButton(
                  onPressed: _loading ? null : _requestOtp,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.warning,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: AppTheme.radiusM),
                    elevation: 6,
                    shadowColor: AppTheme.warning.withValues(alpha: 0.4),
                  ),
                  child: _loading
                      ? const SizedBox(width: 24, height: 24,
                          child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                      : const Text('SEND VERIFICATION CODE',
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, letterSpacing: 0.8)),
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 24),
        // Info note
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: AppTheme.gray100,
            borderRadius: AppTheme.radiusM,
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(Icons.info_outline_rounded, size: 16, color: AppTheme.gray500),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'After verification, your old device will be deactivated and all existing sessions will be signed out for security.',
                  style: const TextStyle(fontSize: 12, color: AppTheme.gray500, height: 1.5),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 32),
      ],
    );
  }

  // ── Step 2 UI ────────────────────────────────────────────────────────────────
  Widget _buildStep2(bool isDark) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SizedBox(height: 16),

        Center(
          child: Container(
            width: 80, height: 80,
            decoration: BoxDecoration(
              color: AppTheme.accent.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.mark_email_read_rounded,
                size: 40, color: AppTheme.accent),
          ),
        ),
        const SizedBox(height: 24),

        Text('Check Your Email',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 26, fontWeight: FontWeight.w900,
            color: isDark ? Colors.white : AppTheme.primary,
            letterSpacing: -0.5,
          ),
        ),
        const SizedBox(height: 10),
        Text(
          'We sent a 6-digit code to ${_emailCtrl.text.trim()}. Enter it below to activate this device.',
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 14, color: isDark ? AppTheme.gray400 : AppTheme.gray500, height: 1.5),
        ),
        const SizedBox(height: 36),

        if (_error != null) ...[
          _ErrorBanner(message: _error!),
          const SizedBox(height: 20),
        ],

        // OTP input
        TextField(
          controller: _otpCtrl,
          keyboardType: TextInputType.number,
          maxLength: 6,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 36, fontWeight: FontWeight.w900,
            letterSpacing: 12,
            color: isDark ? Colors.white : AppTheme.primary,
          ),
          decoration: InputDecoration(
            counterText: '',
            hintText: '000000',
            hintStyle: TextStyle(
              fontSize: 36, fontWeight: FontWeight.w300,
              letterSpacing: 12,
              color: isDark ? AppTheme.gray600 : AppTheme.gray300,
            ),
            fillColor: isDark ? const Color(0xFF1F2937) : AppTheme.gray100,
          ),
          onChanged: (v) {
            if (v.length == 6) _confirmOtp();
          },
        ),
        const SizedBox(height: 32),

        SizedBox(
          height: 56,
          child: ElevatedButton(
            onPressed: _loading ? null : _confirmOtp,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppTheme.primary,
              shape: RoundedRectangleBorder(borderRadius: AppTheme.radiusM),
              elevation: 8,
              shadowColor: AppTheme.primary.withValues(alpha: 0.4),
            ),
            child: _loading
                ? const SizedBox(width: 24, height: 24,
                    child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                : const Text('ACTIVATE THIS DEVICE',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, letterSpacing: 1)),
          ),
        ),
        const SizedBox(height: 16),

        // Resend
        Center(
          child: TextButton(
            onPressed: _loading ? null : _resendOtp,
            child: const Text('Resend Code',
              style: TextStyle(color: AppTheme.accent, fontWeight: FontWeight.w700, fontSize: 14)),
          ),
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
    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w800,
        color: AppTheme.gray400, letterSpacing: 1));
}

class _ErrorBanner extends StatelessWidget {
  final String message;
  const _ErrorBanner({required this.message});
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: AppTheme.danger.withValues(alpha: 0.1),
      borderRadius: AppTheme.radiusM,
    ),
    child: Row(children: [
      const Icon(Icons.error_rounded, color: AppTheme.danger, size: 18),
      const SizedBox(width: 10),
      Expanded(child: Text(message,
        style: const TextStyle(color: AppTheme.danger, fontSize: 13, fontWeight: FontWeight.w600))),
    ]),
  );
}
