import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../utils/app_theme.dart';
import '../utils/constants.dart';
import '../widgets/app_widgets.dart';

// ── Validation helpers ────────────────────────────────────────────────────────
bool _isValidEmail(String v) =>
    RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(v.trim());

// ── Validated text field ──────────────────────────────────────────────────────
class _ValidatedField extends StatelessWidget {
  final TextEditingController ctrl;
  final String label;
  final String hint;
  final IconData? prefixIcon;
  final TextInputType keyboardType;
  final bool touched;
  final bool? valid; // null = no validation shown
  final String? errorText;
  final VoidCallback? onChanged;

  const _ValidatedField({
    required this.ctrl,
    required this.label,
    required this.hint,
    this.prefixIcon,
    this.keyboardType = TextInputType.text,
    required this.touched,
    this.valid,
    this.errorText,
    this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final showState = touched && valid != null;
    final isValid = valid ?? false;

    Color borderColor = AppTheme.border;
    Color fillColor = AppTheme.gray100;
    if (showState) {
      borderColor = isValid ? AppTheme.success : AppTheme.danger;
      fillColor = isValid
          ? AppTheme.success.withValues(alpha: 0.06)
          : AppTheme.danger.withValues(alpha: 0.06);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Text(label,
              style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.gray400,
                  letterSpacing: 0.5)),
        ]),
        const SizedBox(height: 6),
        Container(
          decoration: BoxDecoration(
            color: fillColor,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: borderColor, width: showState ? 1.5 : 1),
          ),
          child: TextField(
            controller: ctrl,
            keyboardType: keyboardType,
            decoration: InputDecoration(
              hintText: hint,
              filled: false,
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
              prefixIcon: prefixIcon != null
                  ? Icon(prefixIcon, size: 18,
                      color: showState
                          ? (isValid ? AppTheme.success : AppTheme.danger)
                          : AppTheme.gray400)
                  : null,
              suffixIcon: showState
                  ? Icon(
                      isValid
                          ? Icons.check_circle_rounded
                          : Icons.cancel_rounded,
                      size: 18,
                      color: isValid ? AppTheme.success : AppTheme.danger)
                  : null,
            ),
            onChanged: onChanged != null ? (_) => onChanged!() : null,
          ),
        ),
        if (showState && !isValid && errorText != null) ...[
          const SizedBox(height: 4),
          Row(children: [
            const Icon(Icons.error_outline_rounded,
                size: 12, color: AppTheme.danger),
            const SizedBox(width: 4),
            Text(errorText!,
                style: const TextStyle(
                    fontSize: 11,
                    color: AppTheme.danger,
                    fontWeight: FontWeight.w600)),
          ]),
        ],
        if (showState && isValid) ...[
          const SizedBox(height: 4),
          Row(children: [
            const Icon(Icons.check_circle_outline_rounded,
                size: 12, color: AppTheme.success),
            const SizedBox(width: 4),
            Text('Looks good!',
                style: const TextStyle(
                    fontSize: 11,
                    color: AppTheme.success,
                    fontWeight: FontWeight.w600)),
          ]),
        ],
      ],
    );
  }
}

// ── Validated password field ──────────────────────────────────────────────────
class _ValidatedPasswordField extends StatelessWidget {
  final TextEditingController ctrl;
  final String label;
  final String hint;
  final bool obscure;
  final VoidCallback onToggle;
  final bool touched;
  final bool? valid;
  final String? errorText;
  final String? successText;

  const _ValidatedPasswordField({
    required this.ctrl,
    required this.label,
    required this.hint,
    required this.obscure,
    required this.onToggle,
    required this.touched,
    this.valid,
    this.errorText,
    this.successText,
  });

  @override
  Widget build(BuildContext context) {
    final showState = touched && valid != null;
    final isValid = valid ?? false;

    Color borderColor = AppTheme.border;
    Color fillColor = AppTheme.gray100;
    if (showState) {
      borderColor = isValid ? AppTheme.success : AppTheme.danger;
      fillColor = isValid
          ? AppTheme.success.withValues(alpha: 0.06)
          : AppTheme.danger.withValues(alpha: 0.06);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: const TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w700,
                color: AppTheme.gray400,
                letterSpacing: 0.5)),
        const SizedBox(height: 6),
        Container(
          decoration: BoxDecoration(
            color: fillColor,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: borderColor, width: showState ? 1.5 : 1),
          ),
          child: TextField(
            controller: ctrl,
            obscureText: obscure,
            decoration: InputDecoration(
              hintText: hint,
              filled: false,
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              contentPadding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
              prefixIcon: Icon(Icons.lock_outline_rounded,
                  size: 18,
                  color: showState
                      ? (isValid ? AppTheme.success : AppTheme.danger)
                      : AppTheme.gray400),
              suffixIcon: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (showState)
                    Icon(
                        isValid
                            ? Icons.check_circle_rounded
                            : Icons.cancel_rounded,
                        size: 18,
                        color: isValid ? AppTheme.success : AppTheme.danger),
                  IconButton(
                    icon: Icon(
                        obscure
                            ? Icons.visibility_outlined
                            : Icons.visibility_off_outlined,
                        size: 18,
                        color: AppTheme.gray400),
                    onPressed: onToggle,
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(minWidth: 36),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (showState && !isValid && errorText != null) ...[
          const SizedBox(height: 4),
          Row(children: [
            const Icon(Icons.error_outline_rounded,
                size: 12, color: AppTheme.danger),
            const SizedBox(width: 4),
            Text(errorText!,
                style: const TextStyle(
                    fontSize: 11,
                    color: AppTheme.danger,
                    fontWeight: FontWeight.w600)),
          ]),
        ],
        if (showState && isValid && successText != null) ...[
          const SizedBox(height: 4),
          Row(children: [
            const Icon(Icons.check_circle_outline_rounded,
                size: 12, color: AppTheme.success),
            const SizedBox(width: 4),
            Text(successText!,
                style: const TextStyle(
                    fontSize: 11,
                    color: AppTheme.success,
                    fontWeight: FontWeight.w600)),
          ]),
        ],
      ],
    );
  }
}

// ── Register Screen ───────────────────────────────────────────────────────────
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _nameCtrl  = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passCtrl  = TextEditingController();
  final _confCtrl  = TextEditingController();
  final _phoneCtrl = TextEditingController(text: '+251');
  final _deptCtrl  = TextEditingController();
  final _posCtrl   = TextEditingController();

  bool _obscurePass = true;
  bool _obscureConf = true;
  bool _sendingOtp  = false;
  String? _deviceId;

  // Touched state — only show validation after user interacts
  bool _nameTouched  = false;
  bool _emailTouched = false;
  bool _passTouched  = false;
  bool _confTouched  = false;
  bool _phoneTouched = false;

  @override
  void initState() {
    super.initState();
    _loadDeviceId();
    // Listen for changes to trigger rebuild
    for (final c in [_nameCtrl, _emailCtrl, _passCtrl, _confCtrl, _phoneCtrl]) {
      c.addListener(() => setState(() {}));
    }
  }

  Future<void> _loadDeviceId() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() => _deviceId = prefs.getString(AppConstants.deviceIdKey));
  }

  @override
  void dispose() {
    for (final c in [_nameCtrl, _emailCtrl, _passCtrl, _confCtrl, _phoneCtrl, _deptCtrl, _posCtrl]) {
      c.dispose();
    }
    super.dispose();
  }

  // ── Validation ────────────────────────────────────────────────────────────
  bool get _nameValid  => _nameCtrl.text.trim().isNotEmpty && _nameCtrl.text.trim().length >= 2;
  bool get _emailValid => _isValidEmail(_emailCtrl.text);
  bool get _passValid  => _passCtrl.text.length >= 8;
  bool get _confValid  => _confCtrl.text == _passCtrl.text && _confCtrl.text.isNotEmpty;
  bool get _phoneValid => _phoneCtrl.text.trim().length >= 10 &&
      RegExp(r'^\+251[\d\s\-]{8,12}$').hasMatch(_phoneCtrl.text.trim());

  // Password strength
  int get _strength {
    final p = _passCtrl.text;
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

  Future<void> _register() async {
    // Mark all as touched to show all errors
    setState(() {
      _nameTouched  = true;
      _emailTouched = true;
      _passTouched  = true;
      _confTouched  = true;
      _phoneTouched = true;
    });

    if (!_nameValid || !_emailValid || !_passValid || !_confValid || !_phoneValid) {
      return;
    }

    final parts = _nameCtrl.text.trim().split(RegExp(r'\s+'));
    final firstName = parts.first;
    final lastName  = parts.length > 1 ? parts.sublist(1).join(' ') : '';

    // Step 1: Send registration OTP to email first
    final auth = Provider.of<AuthProvider>(context, listen: false);
    auth.clearError();

    setState(() => _sendingOtp = true);

    final email = _emailCtrl.text.trim().toLowerCase();
    final res = await ApiService.instance.post(
      '/auth/send-registration-otp',
      body: {'email': email},
    );

    setState(() => _sendingOtp = false);

    if (!mounted) return;

    if (res['success'] != true) {
      final err = res['error'] ?? res['message'] ?? 'Failed to send verification code';
      if (mounted) showAppSnack(context, err.toString(), isError: true);
      return;
    }

    // Step 2: Navigate to OTP screen with all registration data
    Navigator.pushNamed(
      context,
      '/email-otp',
      arguments: {
        'email': email,
        'flow': 'registration',
        'regData': {
          'email': email,
          'password': _passCtrl.text,
          'firstName': firstName,
          'lastName': lastName,
          if (_phoneCtrl.text.trim().isNotEmpty) 'phone': _phoneCtrl.text.trim(),
          if (_deptCtrl.text.trim().isNotEmpty) 'department': _deptCtrl.text.trim(),
          if (_posCtrl.text.trim().isNotEmpty) 'position': _posCtrl.text.trim(),
        },
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppTheme.bg,
      body: SafeArea(
        child: Column(
          children: [
            // Top bar
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 16, 0),
              child: Row(children: [
                IconButton(
                  icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
                  onPressed: () => Navigator.pop(context),
                ),
                const Expanded(
                  child: Text('Create Account',
                      style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: AppTheme.primary)),
                ),
              ]),
            ),

            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const SizedBox(height: 4),
                    const Text('Join the Alyah Smart Attendance ecosystem.',
                        style: TextStyle(fontSize: 13, color: AppTheme.gray500)),
                    const SizedBox(height: 20),

                    // Form card
                    Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: AppTheme.surface,
                        borderRadius: BorderRadius.circular(20),
                        boxShadow: [AppTheme.cardShadow],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Full name
                          _ValidatedField(
                            ctrl: _nameCtrl,
                            label: 'FULL NAME',
                            hint: 'First and Last name',
                            prefixIcon: Icons.person_outline_rounded,
                            touched: _nameTouched,
                            valid: _nameTouched ? _nameValid : null,
                            errorText: 'Enter your full name',
                            onChanged: () => setState(() => _nameTouched = true),
                          ),
                          const SizedBox(height: 14),

                          // Email
                          _ValidatedField(
                            ctrl: _emailCtrl,
                            label: 'EMAIL ADDRESS',
                            hint: 'name@gmail.com',
                            prefixIcon: Icons.alternate_email_rounded,
                            keyboardType: TextInputType.emailAddress,
                            touched: _emailTouched,
                            valid: _emailTouched ? _emailValid : null,
                            errorText: 'Enter a valid email address',
                            onChanged: () => setState(() => _emailTouched = true),
                          ),
                          const SizedBox(height: 14),

                          // Password
                          _ValidatedPasswordField(
                            ctrl: _passCtrl,
                            label: 'PASSWORD',
                            hint: 'Min 8 characters',
                            obscure: _obscurePass,
                            onToggle: () => setState(() => _obscurePass = !_obscurePass),
                            touched: _passTouched,
                            valid: _passTouched ? _passValid : null,
                            errorText: 'Password must be at least 8 characters',
                            successText: 'Strong enough',
                          ),
                          // Strength bar
                          if (_passCtrl.text.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            Row(
                              children: List.generate(4, (i) {
                                final filled = i < _strength;
                                return Expanded(
                                  child: Container(
                                    height: 4,
                                    margin: EdgeInsets.only(right: i < 3 ? 4 : 0),
                                    decoration: BoxDecoration(
                                      color: filled ? _strengthColors[_strength] : AppTheme.gray200,
                                      borderRadius: BorderRadius.circular(2),
                                    ),
                                  ),
                                );
                              }),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              _strengthLabels[_strength],
                              style: TextStyle(
                                  fontSize: 11,
                                  color: _strengthColors[_strength],
                                  fontWeight: FontWeight.w700),
                            ),
                          ],
                          const SizedBox(height: 14),

                          // Confirm password
                          _ValidatedPasswordField(
                            ctrl: _confCtrl,
                            label: 'CONFIRM PASSWORD',
                            hint: 'Repeat your password',
                            obscure: _obscureConf,
                            onToggle: () => setState(() => _obscureConf = !_obscureConf),
                            touched: _confTouched,
                            valid: _confTouched ? _confValid : null,
                            errorText: _confCtrl.text.isEmpty
                                ? 'Please confirm your password'
                                : 'Passwords do not match',
                            successText: 'Passwords match ✓',
                          ),
                          const SizedBox(height: 14),

                          // Phone (mandatory — must start with +251)
                          _ValidatedField(
                            ctrl: _phoneCtrl,
                            label: 'PHONE NUMBER',
                            hint: '+251 912 345 678',
                            prefixIcon: Icons.phone_outlined,
                            keyboardType: TextInputType.phone,
                            touched: _phoneTouched,
                            valid: _phoneTouched ? _phoneValid : null,
                            errorText: 'Enter a valid Ethiopian phone number (+251...)',
                            onChanged: () => setState(() => _phoneTouched = true),
                          ),
                          const SizedBox(height: 14),

                          // Department & Position (optional, no validation)
                          Row(children: [
                            Expanded(child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('DEPARTMENT',
                                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                                        color: AppTheme.gray400, letterSpacing: 0.5)),
                                const SizedBox(height: 6),
                                TextField(
                                  controller: _deptCtrl,
                                  decoration: const InputDecoration(
                                    hintText: 'e.g. Engineering',
                                    prefixIcon: Icon(Icons.apartment_rounded, size: 18),
                                  ),
                                ),
                              ],
                            )),
                            const SizedBox(width: 12),
                            Expanded(child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                const Text('POSITION',
                                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                                        color: AppTheme.gray400, letterSpacing: 0.5)),
                                const SizedBox(height: 6),
                                TextField(
                                  controller: _posCtrl,
                                  decoration: const InputDecoration(
                                    hintText: 'e.g. Developer',
                                    prefixIcon: Icon(Icons.work_outline_rounded, size: 18),
                                  ),
                                ),
                              ],
                            )),
                          ]),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),

                    // Device notice
                    if (_deviceId != null)
                      Container(
                        padding: const EdgeInsets.all(14),
                        decoration: BoxDecoration(
                          color: AppTheme.primaryFade,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(color: AppTheme.primary.withValues(alpha: 0.2)),
                        ),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Icon(Icons.devices_rounded, color: AppTheme.primary, size: 18),
                            const SizedBox(width: 10),
                            Expanded(
                              child: RichText(
                                text: TextSpan(
                                  style: const TextStyle(fontSize: 12, color: AppTheme.gray600),
                                  children: [
                                    const TextSpan(text: 'Your device (ID: '),
                                    TextSpan(
                                      text: _deviceId!.substring(0, 16).toUpperCase(),
                                      style: const TextStyle(fontWeight: FontWeight.w700, color: AppTheme.danger),
                                    ),
                                    const TextSpan(text: ') will be submitted for HR approval.'),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    const SizedBox(height: 20),

                    // Submit
                    Consumer<AuthProvider>(
                      builder: (_, auth, __) => Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (auth.error != null)
                            Container(
                              margin: const EdgeInsets.only(bottom: 12),
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                              decoration: BoxDecoration(
                                color: AppTheme.danger.withValues(alpha: 0.08),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Row(children: [
                                const Icon(Icons.error_rounded, color: AppTheme.danger, size: 16),
                                const SizedBox(width: 8),
                                Expanded(child: Text(auth.error!,
                                    style: const TextStyle(color: AppTheme.danger, fontSize: 13))),
                              ]),
                            ),
                          SizedBox(
                            height: 52,
                            child: ElevatedButton(
                              onPressed: _sendingOtp ? null : _register,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppTheme.primary,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                              ),
                              child: _sendingOtp
                                  ? const SizedBox(width: 22, height: 22,
                                      child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                                  : const Text('Continue',
                                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 32),
                  ],
                ),
              ),
            ),

            // Bottom tab bar
            Container(
              decoration: BoxDecoration(
                color: AppTheme.surface,
                boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 12, offset: const Offset(0, -4))],
              ),
              child: SafeArea(
                child: Row(children: [
                  Expanded(child: TextButton.icon(
                    onPressed: () => Navigator.pop(context),
                    icon: const Icon(Icons.login_rounded, size: 18),
                    label: const Text('LOGIN', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
                    style: TextButton.styleFrom(foregroundColor: AppTheme.gray400, padding: const EdgeInsets.symmetric(vertical: 14)),
                  )),
                  Expanded(child: Container(
                    color: AppTheme.primaryFade,
                    child: TextButton.icon(
                      onPressed: () {},
                      icon: const Icon(Icons.person_add_rounded, size: 18),
                      label: const Text('REGISTER', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 0.5)),
                      style: TextButton.styleFrom(foregroundColor: AppTheme.primary, padding: const EdgeInsets.symmetric(vertical: 14)),
                    ),
                  )),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// end of file

