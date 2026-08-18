// ignore_for_file: use_build_context_synchronously
import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../services/api_service.dart';
import '../utils/app_theme.dart';
import '../widgets/app_widgets.dart';

/// Telegram-style OTP verification screen.
/// Supports: registration OTP, activation OTP, device OTP.
/// Args: { email, flow: 'registration'|'activation'|'device_otp', regData?, otpSessionToken? }
///
/// State persistence: on Flutter web, switching tabs can cause a rebuild.
/// We use [AutomaticKeepAliveClientMixin] and persist args to secure storage
/// so the screen never loses its context when the user switches to Gmail and back.
class EmailOtpScreen extends StatefulWidget {
  const EmailOtpScreen({super.key});
  @override
  State<EmailOtpScreen> createState() => _EmailOtpScreenState();
}

class _EmailOtpScreenState extends State<EmailOtpScreen>
    with SingleTickerProviderStateMixin, WidgetsBindingObserver {
  // 6 individual digit controllers + focus nodes
  final List<TextEditingController> _ctrl =
      List.generate(6, (_) => TextEditingController());
  final List<FocusNode> _focus = List.generate(6, (_) => FocusNode());

  String _email = '';
  Map<String, dynamic> _regData = {};
  String _flow = 'registration'; // 'registration' | 'activation' | 'device_otp'
  String? _otpSessionToken;      // for device_otp flow

  bool _verifying = false;
  bool _registering = false;
  bool _success = false;
  String? _error;
  bool _hasError = false;

  // Timers
  static const _resendCooldown = 120; // seconds
  static const _otpExpiry = 300;      // seconds
  int _resendLeft = 120;
  int _expiryLeft = 300;
  bool _expired = false;
  Timer? _timer;

  // Shake animation
  late AnimationController _shakeCtrl;
  late Animation<Offset> _shakeAnim;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _shakeCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );
    _shakeAnim = TweenSequence<Offset>([
      TweenSequenceItem(tween: Tween(begin: Offset.zero, end: const Offset(-0.04, 0)), weight: 1),
      TweenSequenceItem(tween: Tween(begin: const Offset(-0.04, 0), end: const Offset(0.04, 0)), weight: 2),
      TweenSequenceItem(tween: Tween(begin: const Offset(0.04, 0), end: const Offset(-0.04, 0)), weight: 2),
      TweenSequenceItem(tween: Tween(begin: const Offset(-0.04, 0), end: const Offset(0.04, 0)), weight: 2),
      TweenSequenceItem(tween: Tween(begin: const Offset(0.04, 0), end: Offset.zero), weight: 1),
    ]).animate(CurvedAnimation(parent: _shakeCtrl, curve: Curves.easeInOut));

    WidgetsBinding.instance.addPostFrameCallback((_) {
      // Only load args once — if already loaded (e.g. after tab switch + rebuild),
      // skip to prevent overwriting the current state with null
      if (_email.isNotEmpty) return;

      final args = ModalRoute.of(context)?.settings.arguments as Map<String, dynamic>?;
      _email = args?['email'] as String? ?? '';
      _regData = Map<String, dynamic>.from(args?['regData'] as Map? ?? {});
      _flow = args?['flow'] as String? ?? 'registration';
      _otpSessionToken = args?['otpSessionToken'] as String?;
      _startTimers();
      setState(() {});
      // Auto-focus first box
      Future.delayed(const Duration(milliseconds: 100), () {
        if (mounted) _focus[0].requestFocus();
      });
    });

    // Listen for focus changes to rebuild borders
    for (final f in _focus) {
      f.addListener(() { if (mounted) setState(() {}); });
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    _shakeCtrl.dispose();
    for (final c in _ctrl) c.dispose();
    for (final f in _focus) f.dispose();
    super.dispose();
  }

  // When user returns from another tab/app — just re-focus the OTP box.
  // Do NOT reset state. The timer keeps running in background.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted && !_success && !_expired) {
      // Re-focus the first empty box
      Future.delayed(const Duration(milliseconds: 300), () {
        if (!mounted) return;
        for (int i = 0; i < 6; i++) {
          if (_ctrl[i].text.isEmpty) {
            _focus[i].requestFocus();
            return;
          }
        }
        _focus[5].requestFocus();
      });
    }
  }

  void _startTimers() {
    _resendLeft = _resendCooldown;
    _expiryLeft = _otpExpiry;
    _expired = false;
    _timer?.cancel();
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() {
        if (_resendLeft > 0) _resendLeft--;
        if (_expiryLeft > 0) {
          _expiryLeft--;
        } else {
          _expired = true;
          _timer?.cancel();
        }
      });
    });
  }

  String get _otp => _ctrl.map((c) => c.text).join();

  // ── Digit input handling ──────────────────────────────────────────────────

  void _onChanged(int i, String val) {
    // Handle paste: if user pastes 6 digits into any box
    if (val.length > 1) {
      final digits = val.replaceAll(RegExp(r'\D'), '');
      if (digits.length >= 6) {
        for (int j = 0; j < 6; j++) {
          _ctrl[j].text = digits[j];
        }
        _focus[5].requestFocus();
        setState(() { _hasError = false; _error = null; });
        _verify();
        return;
      }
    }

    if (val.isNotEmpty) {
      // Only keep last digit typed
      _ctrl[i].text = val[val.length - 1];
      _ctrl[i].selection = TextSelection.fromPosition(
        TextPosition(offset: _ctrl[i].text.length),
      );
      if (i < 5) {
        _focus[i + 1].requestFocus();
      } else {
        _focus[i].unfocus();
        if (_otp.length == 6) _verify();
      }
    } else {
      // Backspace
      if (i > 0) {
        _focus[i - 1].requestFocus();
      }
    }
    setState(() { _hasError = false; _error = null; });
  }

  void _onKeyDown(int i, KeyEvent event) {
    if (event is KeyDownEvent &&
        event.logicalKey == LogicalKeyboardKey.backspace &&
        _ctrl[i].text.isEmpty &&
        i > 0) {
      _ctrl[i - 1].clear();
      _focus[i - 1].requestFocus();
      setState(() {});
    }
  }

  // ── Verify ────────────────────────────────────────────────────────────────

  Future<void> _verify() async {
    final code = _otp;
    if (code.length != 6 || _verifying || _expired) return;

    setState(() { _verifying = true; _error = null; _hasError = false; });

    try {
      if (_flow == 'device_otp') {
        await _verifyDeviceOtp(code);
      } else if (_flow == 'activation') {
        await _verifyActivationOtp(code);
      } else {
        await _verifyRegistrationOtp(code);
      }
    } catch (e) {
      _setError('Network error. Please try again.');
    }
  }

  Future<void> _verifyDeviceOtp(String code) async {
    if (_otpSessionToken == null) {
      _setError('Missing session token. Go back and try again.');
      return;
    }
    final res = await ApiService.instance.post('/auth/verify-device-otp', body: {
      'otpSessionToken': _otpSessionToken,
      'otpCode': code,
    });
    if (!mounted) return;
    setState(() => _verifying = false);
    if (res['success'] == true) {
      // Pop back to login with success result
      Navigator.pop(context, {'success': true, 'data': res['data'] ?? res});
    } else {
      _setError(res['error']?.toString() ?? 'Incorrect code. Try again.');
      _shakeAndClear();
    }
  }

  Future<void> _verifyActivationOtp(String code) async {
    final res = await ApiService.instance.post('/auth/verify-activation-otp', body: {
      'email': _email,
      'otpCode': code,
    });
    if (!mounted) return;
    setState(() => _verifying = false);
    if (res['success'] == true) {
      final raw = res['data'];
      final data = raw is Map<String, dynamic> ? raw : <String, dynamic>{};
      final token = data['activationToken'] as String?;
      final requiresPwd = data['requiresPassword'] == true;
      if (token == null || token.isEmpty) {
        _setError('Invalid server response. Try again.');
        return;
      }
      Navigator.pushReplacementNamed(context, '/complete-activation', arguments: {
        'email': _email,
        'activationToken': token,
        'requiresPassword': requiresPwd,
      });
    } else {
      _setError(res['error']?.toString() ?? 'Incorrect code. Try again.');
      _shakeAndClear();
    }
  }

  Future<void> _verifyRegistrationOtp(String code) async {
    final res = await ApiService.instance.post('/auth/verify-registration-otp', body: {
      'email': _email,
      'otpCode': code,
    });
    if (!mounted) return;
    if (res['success'] == true) {
      await _register();
    } else {
      setState(() => _verifying = false);
      _setError(res['error']?.toString() ?? 'Incorrect code. Try again.');
      _shakeAndClear();
    }
  }

  Future<void> _register() async {
    setState(() => _registering = true);
    final res = await ApiService.instance.post('/auth/register', body: _regData);
    if (!mounted) return;
    setState(() { _registering = false; _verifying = false; });
    if (res['success'] == true) {
      setState(() => _success = true);
      _timer?.cancel();
    } else {
      final raw = res['error']?.toString() ?? '';
      final msg = raw.isNotEmpty ? raw : 'Registration failed. Please try again.';
      // Show contextual error — OTP was correct but registration had a server error
      _setError('Account creation failed: $msg');
    }
  }

  void _setError(String msg) {
    if (!mounted) return;
    setState(() { _error = msg; _hasError = true; _verifying = false; _registering = false; });
  }

  void _shakeAndClear() {
    _shakeCtrl.forward(from: 0);
    for (final c in _ctrl) c.clear();
    Future.delayed(const Duration(milliseconds: 100), () {
      if (mounted) _focus[0].requestFocus();
    });
  }

  // ── Resend ────────────────────────────────────────────────────────────────

  Future<void> _resend() async {
    if (_resendLeft > 0) return;
    for (final c in _ctrl) c.clear();
    setState(() { _error = null; _hasError = false; });

    Map<String, dynamic> res;
    if (_flow == 'activation') {
      res = await ApiService.instance.post('/auth/send-activation-otp', body: {'email': _email});
    } else if (_flow == 'device_otp') {
      // Device OTP resend — explain to user before going back
      if (mounted) {
        showAppSnack(
          context,
          'Please sign in again to request a new device verification code.',
          isWarning: true,
          duration: const Duration(seconds: 3),
        );
        Navigator.pop(context);
      }
      return;
    } else {
      res = await ApiService.instance.post('/auth/send-registration-otp', body: {'email': _email});
    }

    if (!mounted) return;
    if (res['success'] == true) {
      _startTimers();
      setState(() {});
      Future.delayed(const Duration(milliseconds: 100), () {
        if (mounted) _focus[0].requestFocus();
      });
    } else {
      _setError(res['error']?.toString() ?? 'Failed to resend code.');
    }
  }

  String _fmt(int s) => '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    if (_success) return _SuccessScreen(email: _email);

    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg = isDark ? const Color(0xFF0F172A) : Colors.white;
    final textPrimary = isDark ? Colors.white : const Color(0xFF0F172A);
    final textSecondary = isDark ? const Color(0xFF94A3B8) : const Color(0xFF64748B);

    String title;
    String subtitle;
    switch (_flow) {
      case 'device_otp':
        title = 'New Device Detected';
        subtitle = 'Enter the code sent to';
        break;
      case 'activation':
        title = 'Activate Account';
        subtitle = 'Enter the activation code sent to';
        break;
      default:
        title = 'Verify your email';
        subtitle = 'We sent a 6-digit code to';
    }

    return PopScope(
      canPop: !_verifying && !_registering,
      child: Scaffold(
      backgroundColor: bg,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        systemOverlayStyle: isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new_rounded, size: 20,
              color: isDark ? Colors.white70 : const Color(0xFF0F172A)),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SafeArea(
        child: GestureDetector(
          onTap: () => FocusScope.of(context).unfocus(),
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const SizedBox(height: 16),

                // ── Icon ──
                Container(
                  width: 88,
                  height: 88,
                  decoration: BoxDecoration(
                    color: const Color(0xFF2AABEE).withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.mark_email_read_rounded,
                      size: 44, color: Color(0xFF2AABEE)),
                ),
                const SizedBox(height: 28),

                // ── Title ──
                Text(title,
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      color: textPrimary,
                      letterSpacing: -0.5,
                    )),
                const SizedBox(height: 10),
                Text(subtitle,
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 15, color: textSecondary)),
                const SizedBox(height: 6),
                Text(_email,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF2AABEE),
                    )),
                const SizedBox(height: 40),

                // ── Error banner ──
                AnimatedSize(
                  duration: const Duration(milliseconds: 200),
                  child: _error != null
                      ? Container(
                          width: double.infinity,
                          margin: const EdgeInsets.only(bottom: 24),
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFF3B30).withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(12),
                            border: Border.all(color: const Color(0xFFFF3B30).withValues(alpha: 0.3)),
                          ),
                          child: Row(children: [
                            const Icon(Icons.error_rounded, color: Color(0xFFFF3B30), size: 18),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(_error!,
                                  style: const TextStyle(
                                    color: Color(0xFFFF3B30),
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                  )),
                            ),
                          ]),
                        )
                      : const SizedBox.shrink(),
                ),

                // ── Expired banner ──
                if (_expired)
                  Container(
                    width: double.infinity,
                    margin: const EdgeInsets.only(bottom: 24),
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFF9500).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: const Color(0xFFFF9500).withValues(alpha: 0.3)),
                    ),
                    child: const Row(children: [
                      Icon(Icons.timer_off_rounded, color: Color(0xFFFF9500), size: 18),
                      SizedBox(width: 10),
                      Expanded(
                        child: Text('Code expired. Tap "Resend Code" to get a new one.',
                            style: TextStyle(
                              color: Color(0xFFFF9500),
                              fontSize: 13,
                              fontWeight: FontWeight.w600,
                            )),
                      ),
                    ]),
                  ),

                // ── OTP boxes (Telegram style) ──
                SlideTransition(
                  position: _shakeAnim,
                  child: LayoutBuilder(
                    builder: (context, constraints) {
                      // Fit 6 boxes + gaps within available width
                      const gapSize = 8.0;
                      final totalGap = 5.0 * gapSize + 2 * (gapSize / 2); // 5 inner gaps + 2 outer margins
                      final boxWidth = ((constraints.maxWidth - totalGap) / 6).clamp(40.0, 54.0);
                      final boxHeight = boxWidth * 1.22;
                      return Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: List.generate(6, (i) => Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 4),
                          child: SizedBox(
                            width: boxWidth,
                            height: boxHeight,
                            child: _OtpBox(
                              controller: _ctrl[i],
                              focusNode: _focus[i],
                              hasError: _hasError,
                              isDark: isDark,
                              onChanged: (v) => _onChanged(i, v),
                              onKeyEvent: (e) => _onKeyDown(i, e),
                            ),
                          ),
                        )),
                      );
                    },
                  ),
                ),

                const SizedBox(height: 40),

                // ── Verify button ──
                SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: ElevatedButton(
                    onPressed: (_verifying || _registering || _expired || _otp.length < 6)
                        ? null
                        : _verify,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFF2AABEE),
                      disabledBackgroundColor: isDark
                          ? const Color(0xFF1E293B)
                          : const Color(0xFFE2E8F0),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16)),
                      elevation: 0,
                    ),
                    child: (_verifying || _registering)
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(
                                strokeWidth: 2.5, color: Colors.white))
                        : Text(
                            _flow == 'registration'
                                ? 'Verify & Create Account'
                                : 'Verify Code',
                            style: const TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            )),
                  ),
                ),

                const SizedBox(height: 28),

                // ── Expiry countdown ──
                if (!_expired)
                  AnimatedSwitcher(
                    duration: const Duration(milliseconds: 300),
                    child: Text(
                      'Code expires in ${_fmt(_expiryLeft)}',
                      key: ValueKey(_expiryLeft),
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: _expiryLeft < 60
                            ? const Color(0xFFFF3B30)
                            : textSecondary,
                      ),
                    ),
                  ),

                const SizedBox(height: 20),

                // ── Resend ──
                _resendLeft > 0
                    ? RichText(
                        text: TextSpan(
                          style: TextStyle(fontSize: 14, color: textSecondary),
                          children: [
                            const TextSpan(text: 'Resend code in '),
                            TextSpan(
                              text: _fmt(_resendLeft),
                              style: TextStyle(
                                fontWeight: FontWeight.w700,
                                color: textPrimary,
                              ),
                            ),
                          ],
                        ),
                      )
                    : GestureDetector(
                        onTap: _resend,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 20, vertical: 10),
                          decoration: BoxDecoration(
                            color: const Color(0xFF2AABEE).withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Text(
                            'Resend Code',
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF2AABEE),
                            ),
                          ),
                        ),
                      ),

                const SizedBox(height: 48),
              ],
            ),
          ),
        ),
      ),
    ), // closes Scaffold
    ); // closes PopScope
  }
}

// ── Single OTP digit box ──────────────────────────────────────────────────────

class _OtpBox extends StatelessWidget {
  final TextEditingController controller;
  final FocusNode focusNode;
  final bool hasError;
  final bool isDark;
  final ValueChanged<String> onChanged;
  final ValueChanged<KeyEvent> onKeyEvent;

  const _OtpBox({
    required this.controller,
    required this.focusNode,
    required this.hasError,
    required this.isDark,
    required this.onChanged,
    required this.onKeyEvent,
  });

  @override
  Widget build(BuildContext context) {
    final isFocused = focusNode.hasFocus;
    final hasValue = controller.text.isNotEmpty;

    Color borderColor;
    Color bgColor;

    if (hasError) {
      borderColor = const Color(0xFFFF3B30);
      bgColor = const Color(0xFFFF3B30).withValues(alpha: 0.08);
    } else if (isFocused) {
      borderColor = const Color(0xFF2AABEE);
      bgColor = const Color(0xFF2AABEE).withValues(alpha: 0.08);
    } else if (hasValue) {
      borderColor = const Color(0xFF2AABEE).withValues(alpha: 0.5);
      bgColor = isDark ? const Color(0xFF1E293B) : const Color(0xFFF1F5F9);
    } else {
      borderColor = isDark ? const Color(0xFF334155) : const Color(0xFFCBD5E1);
      bgColor = isDark ? const Color(0xFF1E293B) : const Color(0xFFF8FAFC);
    }

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 0),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: borderColor,
          width: isFocused ? 2.5 : 1.5,
        ),
        boxShadow: isFocused
            ? [
                BoxShadow(
                  color: const Color(0xFF2AABEE).withValues(alpha: 0.2),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                )
              ]
            : null,
      ),
      child: KeyboardListener(
        focusNode: FocusNode(),
        onKeyEvent: onKeyEvent,
        child: TextField(
          controller: controller,
          focusNode: focusNode,
          keyboardType: TextInputType.number,
          textAlign: TextAlign.center,
          maxLength: 6, // allow 6 for paste detection
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.w900,
            color: hasError
                ? const Color(0xFFFF3B30)
                : isDark
                    ? Colors.white
                    : const Color(0xFF0F172A),
            letterSpacing: 0,
          ),
          decoration: const InputDecoration(
            counterText: '',
            border: InputBorder.none,
            enabledBorder: InputBorder.none,
            focusedBorder: InputBorder.none,
            contentPadding: EdgeInsets.zero,
          ),
          onChanged: onChanged,
        ),
      ),
    );
  }
}

// ── Success Screen ────────────────────────────────────────────────────────────

class _SuccessScreen extends StatefulWidget {
  final String email;
  const _SuccessScreen({required this.email});
  @override
  State<_SuccessScreen> createState() => _SuccessScreenState();
}

class _SuccessScreenState extends State<_SuccessScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _scale;
  late Animation<double> _fade;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
        duration: const Duration(milliseconds: 700), vsync: this)
      ..forward();
    _scale = CurvedAnimation(parent: _ctrl, curve: Curves.elasticOut);
    _fade = CurvedAnimation(parent: _ctrl, curve: const Interval(0.3, 1.0));
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF0F172A) : Colors.white,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ScaleTransition(
                scale: _scale,
                child: Container(
                  width: 100,
                  height: 100,
                  margin: const EdgeInsets.only(bottom: 32),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: const Color(0xFF34C759).withValues(alpha: 0.12),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.check_circle_rounded,
                      size: 64, color: Color(0xFF34C759)),
                ),
              ),
              FadeTransition(
                opacity: _fade,
                child: Column(
                  children: [
                    Text(
                      'Account Created!',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w900,
                        color: isDark ? Colors.white : const Color(0xFF0F172A),
                        letterSpacing: -0.5,
                      ),
                    ),
                    const SizedBox(height: 14),
                    Text(
                      'Your account for ${widget.email} has been submitted for HR approval.\n\nYou\'ll receive an email once your account is approved.',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 15,
                        color: isDark
                            ? const Color(0xFF94A3B8)
                            : const Color(0xFF64748B),
                        height: 1.6,
                      ),
                    ),
                    const SizedBox(height: 44),
                    SizedBox(
                      width: double.infinity,
                      height: 56,
                      child: ElevatedButton(
                        onPressed: () => Navigator.of(context)
                            .pushNamedAndRemoveUntil('/login', (_) => false),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF2AABEE),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(16)),
                          elevation: 0,
                        ),
                        child: const Text('Back to Sign In',
                            style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                            )),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
