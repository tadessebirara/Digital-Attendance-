// ignore_for_file: use_build_context_synchronously
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../main.dart' show navigatorKey;
import '../services/api_service.dart';
import '../providers/auth_provider.dart';
import '../providers/chat_provider.dart';
import '../providers/app_config_provider.dart';
import '../utils/app_theme.dart';

// ─── Auth Shell — shared tab switcher wrapping Sign In + Sign Up ──────────────
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tab;

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: 2, vsync: this);
    // Only rebuild the tab indicator, NOT the whole screen
    // This prevents TextEditingControllers from resetting on tab switch
    _tab.addListener(() {
      if (_tab.indexIsChanging) setState(() {});
    });
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final brandColor = context.select<AppConfigProvider, Color>(
      (c) => c.config.primaryColor == const Color(0xFF0F172A)
          ? AppTheme.accent   // default navy → use accent blue for logo
          : c.config.primaryColor,
    );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      value: const SystemUiOverlayStyle(
        statusBarColor: Colors.transparent,
        statusBarIconBrightness: Brightness.dark,
      ),
      child: Scaffold(
        backgroundColor: AppTheme.bg,
        body: Column(
          children: [
            // ── Header — light background matching sign-up style ──────────
            Container(
              decoration: const BoxDecoration(
                color: AppTheme.surface,
              ),
              child: SafeArea(
                bottom: false,
                child: Column(
                  children: [
                    const SizedBox(height: 24),

                    // ── Logo / Brand ───────────────────────────────────────
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Row(
                        children: [
                          // Logo mark — uses admin primary color
                          Container(
                            width: 40, height: 40,
                            decoration: BoxDecoration(
                              gradient: LinearGradient(
                                colors: [brandColor, Color.lerp(brandColor, Colors.black, 0.18) ?? brandColor],
                                begin: Alignment.topLeft,
                                end: Alignment.bottomRight,
                              ),
                              borderRadius: BorderRadius.circular(12),
                              boxShadow: AppTheme.shadowAccent(brandColor),
                            ),
                            child: _buildLogoContent(context, brandColor),
                          ),
                          const SizedBox(width: 12),
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                context.select<AppConfigProvider, String>(
                                  (c) => c.config.companyName.isNotEmpty
                                      ? c.config.companyName.split(' ').first.toUpperCase()
                                      : 'ALYAH',
                                ),
                                style: TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w900,
                                  color: brandColor,
                                  letterSpacing: 2.0,
                                ),
                              ),
                              const Text(
                                'SMART ATTENDANCE',
                                style: TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w700,
                                  color: AppTheme.gray400,
                                  letterSpacing: 1.8,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 24),

                    // ── Tab pill ───────────────────────────────────────────
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: ListenableBuilder(
                        listenable: _tab,
                        builder: (context, _) => Container(
                          height: 48,
                          decoration: BoxDecoration(
                            color: AppTheme.gray100,
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: AppTheme.border),
                          ),
                          child: Stack(
                            children: [
                              AnimatedAlign(
                                duration: const Duration(milliseconds: 220),
                                curve: Curves.easeInOutCubic,
                                alignment: _tab.index == 0
                                    ? Alignment.centerLeft
                                    : Alignment.centerRight,
                                child: FractionallySizedBox(
                                  widthFactor: 0.5,
                                  child: Container(
                                    margin: const EdgeInsets.all(4),
                                    decoration: BoxDecoration(
                                      gradient: LinearGradient(
                                        colors: [brandColor, Color.lerp(brandColor, Colors.black, 0.15) ?? brandColor],
                                        begin: Alignment.topLeft,
                                        end: Alignment.bottomRight,
                                      ),
                                      borderRadius: BorderRadius.circular(999),
                                      boxShadow: AppTheme.shadowAccent(brandColor),
                                    ),
                                  ),
                                ),
                              ),
                              Row(
                                children: [
                                  Expanded(
                                    child: GestureDetector(
                                      onTap: () { HapticFeedback.selectionClick(); _tab.animateTo(0); },
                                      behavior: HitTestBehavior.opaque,
                                      child: Center(
                                        child: Text(
                                          'Sign In',
                                          style: TextStyle(
                                            fontSize: 14,
                                            fontWeight: FontWeight.w700,
                                            color: _tab.index == 0
                                                ? Colors.white
                                                : AppTheme.gray400,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                  Expanded(
                                    child: GestureDetector(
                                      onTap: () { HapticFeedback.selectionClick(); _tab.animateTo(1); },
                                      behavior: HitTestBehavior.opaque,
                                      child: Center(
                                        child: Text(
                                          'Sign Up',
                                          style: TextStyle(
                                            fontSize: 14,
                                            fontWeight: FontWeight.w700,
                                            color: _tab.index == 1
                                                ? Colors.white
                                                : AppTheme.gray400,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),

                    const SizedBox(height: 20),
                    Divider(height: 1, color: AppTheme.border),
                  ],
                ),
              ),
            ),

            // ── Tab content ───────────────────────────────────────────────
            Expanded(
              child: TabBarView(
                controller: _tab,
                physics: const NeverScrollableScrollPhysics(),
                children: const [
                  _SignInTab(),
                  _SignUpTab(),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  // Builds logo content: custom logo if set, else app icon asset
  Widget _buildLogoContent(BuildContext context, Color brandColor) {
    final logoUrl = context.select<AppConfigProvider, String>(
      (c) => c.config.logoUrl,
    );
    if (logoUrl.isNotEmpty) {
      if (logoUrl.startsWith('data:')) {
        try {
          return ClipRRect(
            borderRadius: BorderRadius.circular(12),
            child: Image.memory(
              Uri.parse(logoUrl).data!.contentAsBytes(),
              fit: BoxFit.contain,
              errorBuilder: (_, __, ___) => ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Image.asset('assets/icons/icon.png', fit: BoxFit.contain),
              ),
            ),
          );
        } catch (_) {}
      } else {
        return ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Image.network(
            logoUrl, fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.asset('assets/icons/icon.png', fit: BoxFit.contain),
            ),
          ),
        );
      }
    }
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: Image.asset('assets/icons/icon.png', fit: BoxFit.contain),
    );
  }
}

// ─── Sign In Tab ──────────────────────────────────────────────────────────────
class _SignInTab extends StatefulWidget {
  const _SignInTab();
  @override
  State<_SignInTab> createState() => _SignInTabState();
}

class _SignInTabState extends State<_SignInTab>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;
  final _formKey   = GlobalKey<FormState>();
  final _emailCtrl = TextEditingController();
  final _passCtrl  = TextEditingController();
  bool _obscure = true;

  @override
  void initState() {
    super.initState();
  }

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;
    final auth = Provider.of<AuthProvider>(context, listen: false);
    auth.clearError();

    final ok = await auth.login(_emailCtrl.text.trim(), _passCtrl.text);
    if (!mounted) return;

    if (ok) {
      _afterLogin(auth);
    } else if (auth.needsDeviceOtp) {
      _showOtpScreen(auth);
    } else if (auth.error != null &&
        (auth.error!.contains('SINGLE_DEVICE_ENFORCED') ||
         auth.error!.toLowerCase().contains('locked to its first registered device'))) {
      Navigator.pushNamed(context, '/replace-device');
    } else if (auth.error != null && auth.error!.contains('PENDING_APPROVAL')) {
      Navigator.pushNamed(context, '/pending-approval');
    } else if (auth.error != null && auth.error!.contains('PENDING_ACTIVATION')) {
      // Admin-created account: guide user through email OTP → set password flow
      Navigator.pushNamed(context, '/email-otp', arguments: {
        'email': _emailCtrl.text.trim().toLowerCase(),
        'flow': 'activation',
      });
    } else if (auth.error != null && auth.error!.contains('EMAIL_NOT_VERIFIED')) {
      // Self-registered but somehow email_verified is false — send them to activation OTP
      Navigator.pushNamed(context, '/email-otp', arguments: {
        'email': _emailCtrl.text.trim().toLowerCase(),
        'flow': 'activation',
      });
    }
  }

  void _afterLogin(AuthProvider auth) {
    // sessionExpiredHandler is already registered globally in main()
    // Just pass it as the onUnauthorized callback
    auth.init(ApiService.sessionExpiredHandler ?? () {
      navigatorKey.currentState?.pushNamedAndRemoveUntil('/login', (_) => false);
    });
    final userId = auth.user?['id'];
    if (userId != null) {
      Provider.of<ChatProvider>(context, listen: false).connectSocket(userId as int);
    }
    Navigator.of(context).pushReplacementNamed('/home');
  }

  Future<void> _showOtpScreen(AuthProvider auth) async {
    // Navigate to the full-screen Telegram-style OTP screen
    final result = await Navigator.pushNamed(
      context,
      '/email-otp',
      arguments: {
        'email': _emailCtrl.text.trim().toLowerCase(),
        'flow': 'device_otp',
        'otpSessionToken': auth.pendingOtpSessionToken,
      },
    );

    if (!mounted) return;

    // Result is { success: true, data: { accessToken, refreshToken, user } }
    if (result is Map && result['success'] == true) {
      final data = result['data'] as Map<String, dynamic>? ?? {};
      final at = data['accessToken'] as String?;
      final rt = data['refreshToken'] as String?;
      final u  = data['user'] as Map<String, dynamic>?;
      if (at != null && rt != null && u != null) {
        await auth.applyVerifiedSession(accessToken: at, refreshToken: rt, user: u);
        if (mounted) _afterLogin(auth);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context); // required for AutomaticKeepAliveClientMixin
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 28, 24, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Sign in to your account',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppTheme.primary)),
          const SizedBox(height: 6),
          const Text('Enter your email and password to access the app',
              style: TextStyle(fontSize: 13, color: AppTheme.gray500, height: 1.4)),
          const SizedBox(height: 28),

          Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Email
                _AuthField(
                  key: const ValueKey('signin_email'),
                  controller: _emailCtrl,
                  hint: 'Email',
                  keyboardType: TextInputType.emailAddress,
                  validator: (v) => (v == null || v.isEmpty)
                      ? 'Email is required'
                      : !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(v.trim())
                          ? 'Enter a valid email address'
                          : null,
                ),
                const SizedBox(height: 14),

                // Password
                _AuthField(
                  key: const ValueKey('signin_password'),
                  controller: _passCtrl,
                  hint: 'Password',
                  obscure: _obscure,
                  onToggleObscure: () => setState(() => _obscure = !_obscure),
                  validator: (v) => (v == null || v.length < 8) ? 'Min 8 characters' : null,
                ),
                const SizedBox(height: 8),

                // Forgot password
                Align(
                  alignment: Alignment.centerRight,
                  child: TextButton(
                    onPressed: () => Navigator.pushNamed(context, '/forgot-password'),
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
                      minimumSize: Size.zero,
                      tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                    ),
                    child: const Text('Forgot Password?',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.accent)),
                  ),
                ),
                const SizedBox(height: 20),

                // Error
                Consumer<AuthProvider>(
                  builder: (_, auth, __) {
                    // Translate raw backend codes into human-readable messages
                    bool _isLocked(String? raw) =>
                        raw != null && (raw.contains('ACCOUNT_LOCKED') || raw.toLowerCase().contains('too many failed'));

                    String? _friendlyError(String? raw) {
                      if (raw == null) return null;
                      if (_isLocked(raw)) {
                        final match = RegExp(r'(\d+)\s*minute').firstMatch(raw);
                        final mins = match?.group(1);
                        return mins != null
                            ? 'Account locked for $mins minute${mins == "1" ? "" : "s"} due to too many failed attempts.'
                            : 'Account temporarily locked. Too many failed attempts.';
                      }
                      if (raw.contains('ACCOUNT_REJECTED')) return 'Your registration was not approved. Contact HR.';
                      if (raw.contains('PENDING_APPROVAL')) return 'Your account is pending HR approval.';
                      if (raw.contains('PENDING_ACTIVATION')) return 'Account not yet activated. Check your email.';
                      if (raw.contains('EMAIL_NOT_VERIFIED')) return 'Please verify your email before signing in.';
                      if (raw.contains('DEVICE_BLOCKED')) return 'This device has been blocked. Contact HR.';
                      if (raw.contains('Cannot reach server') || raw.contains('timed out') || raw.contains('unreachable')) {
                        return 'Cannot reach server. Check your internet connection and try again.';
                      }
                      if (raw.contains('SINGLE_DEVICE_ENFORCED')) return null; // handled by routing
                      return raw;
                    }

                    final msg      = _friendlyError(auth.error);
                    final isLocked = _isLocked(auth.error);

                    return Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (msg != null && !auth.needsDeviceOtp) ...[
                          Container(
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: AppTheme.danger.withValues(alpha: 0.08),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: AppTheme.danger.withValues(alpha: 0.2)),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(children: [
                                  const Icon(Icons.lock_outline_rounded, color: AppTheme.danger, size: 16),
                                  const SizedBox(width: 8),
                                  Expanded(child: Text(msg,
                                      style: const TextStyle(color: AppTheme.danger, fontSize: 13, fontWeight: FontWeight.w600))),
                                ]),
                                // Actionable CTA for locked accounts
                                if (isLocked) ...[
                                  const SizedBox(height: 10),
                                  const Divider(height: 1, color: Color(0x22EF4444)),
                                  const SizedBox(height: 10),
                                  Row(children: [
                                    Expanded(
                                      child: Text(
                                        'You can reset your password to unlock your account immediately.',
                                        style: TextStyle(
                                          color: AppTheme.danger.withValues(alpha: 0.8),
                                          fontSize: 12,
                                        ),
                                      ),
                                    ),
                                  ]),
                                  const SizedBox(height: 8),
                                  SizedBox(
                                    width: double.infinity,
                                    child: OutlinedButton.icon(
                                      onPressed: () {
                                        // Pre-fill email and navigate to forgot password
                                        Navigator.pushNamed(
                                          context,
                                          '/forgot-password',
                                          arguments: _emailCtrl.text.trim(),
                                        );
                                      },
                                      icon: const Icon(Icons.lock_reset_rounded, size: 15),
                                      label: const Text('Reset Password to Unlock'),
                                      style: OutlinedButton.styleFrom(
                                        foregroundColor: AppTheme.danger,
                                        side: BorderSide(color: AppTheme.danger.withValues(alpha: 0.5)),
                                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                                        padding: const EdgeInsets.symmetric(vertical: 10),
                                        textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
                                      ),
                                    ),
                                  ),
                                ],
                              ],
                            ),
                          ),
                          const SizedBox(height: 6),
                        ],

                      // Sign In button
                      SizedBox(
                        height: 56,
                        child: Consumer<AppConfigProvider>(
                          builder: (_, cfg, __) {
                            final brandColor = cfg.config.primaryColor == const Color(0xFF0F172A)
                                ? AppTheme.accent
                                : cfg.config.primaryColor;
                            return ElevatedButton(
                              onPressed: auth.isLoading ? null : _login,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: brandColor,
                                foregroundColor: Colors.white,
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                                elevation: 0,
                              ),
                              child: auth.isLoading
                                  ? const SizedBox(width: 22, height: 22,
                                      child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                                  : const Text('Sign In',
                                      style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, letterSpacing: 0.2)),
                            );
                          },
                        ),
                      ),
                    ],
                  );
                  },
                ),

                const SizedBox(height: 12),
                Center(
                  child: TextButton.icon(
                    onPressed: () => Navigator.pushNamed(context, '/replace-device'),
                    icon: const Icon(Icons.phonelink_setup_rounded, size: 15, color: AppTheme.gray400),
                    label: const Text('Replace / Lost Device?',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w500, color: AppTheme.gray400)),
                    style: TextButton.styleFrom(padding: EdgeInsets.zero),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Department / Position data ───────────────────────────────────────────────
const _kDepartments = [
  'Engineering', 'Human Resources', 'Finance', 'Marketing',
  'Operations', 'Sales', 'IT', 'Legal', 'Design', 'Other',
];

const _kPositionsByDept = {
  'Engineering':     ['Software Engineer', 'Senior Engineer', 'Tech Lead', 'DevOps Engineer', 'QA Engineer', 'Other'],
  'Human Resources': ['HR Manager', 'HR Officer', 'Recruiter', 'HR Assistant', 'Other'],
  'Finance':         ['Accountant', 'Finance Manager', 'Financial Analyst', 'Bookkeeper', 'Other'],
  'Marketing':       ['Marketing Manager', 'Marketing Specialist', 'Content Creator', 'SEO Specialist', 'Other'],
  'Operations':      ['Operations Manager', 'Operations Analyst', 'Coordinator', 'Other'],
  'Sales':           ['Sales Manager', 'Sales Representative', 'Account Executive', 'Other'],
  'IT':              ['IT Manager', 'System Administrator', 'Network Engineer', 'IT Support', 'Other'],
  'Legal':           ['Legal Counsel', 'Paralegal', 'Compliance Officer', 'Other'],
  'Design':          ['UI/UX Designer', 'Graphic Designer', 'Product Designer', 'Other'],
  'Other':           ['Other'],
};

// ─── Sign Up Tab ──────────────────────────────────────────────────────────────
class _SignUpTab extends StatefulWidget {
  const _SignUpTab();
  @override
  State<_SignUpTab> createState() => _SignUpTabState();
}

class _SignUpTabState extends State<_SignUpTab>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;
  final _nameCtrl  = TextEditingController();
  final _emailCtrl = TextEditingController();
  final _passCtrl  = TextEditingController();
  final _confCtrl  = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _deptOtherCtrl = TextEditingController();
  final _posOtherCtrl  = TextEditingController();

  bool _obscurePass = true;
  bool _obscureConf = true;
  bool _sendingOtp  = false;

  String? _selectedDept;
  String? _selectedPos;

  bool _nameTouched  = false;
  bool _emailTouched = false;
  bool _passTouched  = false;
  bool _confTouched  = false;
  bool _phoneTouched = false;

  String? _otpError;

  @override
  void initState() {
    super.initState();
    for (final c in [_nameCtrl, _emailCtrl, _passCtrl, _confCtrl, _phoneCtrl]) {
      c.addListener(() => setState(() {}));
    }
  }

  @override
  void dispose() {
    for (final c in [_nameCtrl, _emailCtrl, _passCtrl, _confCtrl, _phoneCtrl, _deptOtherCtrl, _posOtherCtrl]) {
      c.dispose();
    }
    super.dispose();
  }

  bool get _nameValid  => _nameCtrl.text.trim().length >= 2;
  bool get _emailValid => RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(_emailCtrl.text.trim());
  bool get _passValid  => _passCtrl.text.length >= 8;
  bool get _confValid  => _confCtrl.text == _passCtrl.text && _confCtrl.text.isNotEmpty;
  bool get _phoneValid => _phoneCtrl.text.trim().length >= 7 &&
      RegExp(r'^\+?[\d\s\-\(\)]{7,20}$').hasMatch(_phoneCtrl.text.trim());

  String get _effectiveDept => _selectedDept == 'Other'
      ? _deptOtherCtrl.text.trim()
      : _selectedDept ?? '';

  String get _effectivePos => _selectedPos == 'Other'
      ? _posOtherCtrl.text.trim()
      : _selectedPos ?? '';

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

  Future<void> _sendOtpAndProceed() async {
    setState(() {
      _nameTouched  = true;
      _emailTouched = true;
      _passTouched  = true;
      _confTouched  = true;
      _phoneTouched = true;
      _otpError     = null;
    });
    if (!_nameValid || !_emailValid || !_passValid || !_confValid || !_phoneValid) return;

    setState(() => _sendingOtp = true);

    final res = await ApiService.instance.post('/auth/send-registration-otp', body: {
      'email': _emailCtrl.text.trim().toLowerCase(),
    });

    if (!mounted) return;
    setState(() => _sendingOtp = false);

    if (res['success'] == true) {
      final parts = _nameCtrl.text.trim().split(RegExp(r'\s+'));
      final firstName = parts.first;
      final lastName  = parts.length > 1 ? parts.sublist(1).join(' ') : parts.first;

      Navigator.pushNamed(context, '/email-otp', arguments: {
        'email': _emailCtrl.text.trim().toLowerCase(),
        'regData': {
          'email':      _emailCtrl.text.trim().toLowerCase(),
          'password':   _passCtrl.text,
          'firstName':  firstName,
          'lastName':   lastName,
          'phone':      _phoneCtrl.text.trim(),
          if (_effectiveDept.isNotEmpty) 'department': _effectiveDept,
          if (_effectivePos.isNotEmpty)  'position':   _effectivePos,
        },
      });
    } else {
      setState(() => _otpError = res['error'] ?? 'Failed to send verification code. Try again.');
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context); // required for AutomaticKeepAliveClientMixin
    final positions = _selectedDept != null
        ? (_kPositionsByDept[_selectedDept] ?? ['Other'])
        : <String>[];

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(24, 28, 24, 32),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Create your account',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: AppTheme.primary)),
          const SizedBox(height: 6),
          const Text('Join the Alyah Smart Attendance ecosystem',
              style: TextStyle(fontSize: 13, color: AppTheme.gray500)),
          const SizedBox(height: 24),

          // Full name
          _AuthField(
            key: const ValueKey('signup_name'),
            controller: _nameCtrl,
            hint: 'Full Name',
            prefixIcon: Icons.person_outline_rounded,
            touched: _nameTouched,
            isValid: _nameTouched ? _nameValid : null,
            errorText: 'Enter your full name',
            onChanged: () => setState(() => _nameTouched = true),
          ),
          const SizedBox(height: 12),

          // Email
          _AuthField(
            key: const ValueKey('signup_email'),
            controller: _emailCtrl,
            hint: 'Email Address',
            keyboardType: TextInputType.emailAddress,
            prefixIcon: Icons.alternate_email_rounded,
            touched: _emailTouched,
            isValid: _emailTouched ? _emailValid : null,
            errorText: 'Enter a valid email address',
            onChanged: () => setState(() => _emailTouched = true),
          ),
          const SizedBox(height: 12),

          // Phone
          _AuthField(
            key: const ValueKey('signup_phone'),
            controller: _phoneCtrl,
            hint: '+251 912 345 678',
            keyboardType: TextInputType.phone,
            prefixIcon: Icons.phone_outlined,
            touched: _phoneTouched,
            isValid: _phoneTouched ? _phoneValid : null,
            errorText: 'Enter a valid phone number',
            onChanged: () => setState(() => _phoneTouched = true),
          ),
          const SizedBox(height: 12),

          // Password
          _AuthField(
            key: const ValueKey('signup_password'),
            controller: _passCtrl,
            hint: 'Password (min 8 characters)',
            obscure: _obscurePass,
            onToggleObscure: () => setState(() => _obscurePass = !_obscurePass),
            touched: _passTouched,
            isValid: _passTouched ? _passValid : null,
            errorText: 'Password must be at least 8 characters',
            onChanged: () => setState(() => _passTouched = true),
          ),
          if (_passCtrl.text.isNotEmpty) ...[
            const SizedBox(height: 8),
            Row(children: List.generate(4, (i) => Expanded(
              child: Container(
                height: 4,
                margin: EdgeInsets.only(right: i < 3 ? 4 : 0),
                decoration: BoxDecoration(
                  color: i < _strength ? _strengthColors[_strength] : AppTheme.gray200,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ))),
            const SizedBox(height: 4),
            Text(_strengthLabels[_strength],
                style: TextStyle(fontSize: 11, color: _strengthColors[_strength], fontWeight: FontWeight.w700)),
          ],
          const SizedBox(height: 12),

          // Confirm password
          _AuthField(
            key: const ValueKey('signup_confirm'),
            controller: _confCtrl,
            hint: 'Confirm Password',
            obscure: _obscureConf,
            onToggleObscure: () => setState(() => _obscureConf = !_obscureConf),
            touched: _confTouched,
            isValid: _confTouched ? _confValid : null,
            errorText: _confCtrl.text.isEmpty ? 'Please confirm your password' : 'Passwords do not match',
            onChanged: () => setState(() => _confTouched = true),
          ),
          const SizedBox(height: 16),

          // Department dropdown
          _DropdownField(
            label: 'Department (optional)',
            icon: Icons.apartment_rounded,
            value: _selectedDept,
            items: _kDepartments,
            onChanged: (v) => setState(() {
              _selectedDept = v;
              _selectedPos  = null; // reset position when dept changes
            }),
          ),
          if (_selectedDept == 'Other') ...[
            const SizedBox(height: 8),
            _AuthField(controller: _deptOtherCtrl, hint: 'Enter your department'),
          ],
          const SizedBox(height: 12),

          // Position dropdown (filtered by dept)
          if (_selectedDept != null) ...[
            _DropdownField(
              label: 'Position (optional)',
              icon: Icons.work_outline_rounded,
              value: _selectedPos,
              items: positions,
              onChanged: (v) => setState(() => _selectedPos = v),
            ),
            if (_selectedPos == 'Other') ...[
              const SizedBox(height: 8),
              _AuthField(controller: _posOtherCtrl, hint: 'Enter your position'),
            ],
            const SizedBox(height: 12),
          ],

          const SizedBox(height: 12),

          // OTP error
          if (_otpError != null) ...[
            Container(
              margin: const EdgeInsets.only(bottom: 14),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppTheme.danger.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(children: [
                const Icon(Icons.error_rounded, color: AppTheme.danger, size: 16),
                const SizedBox(width: 8),
                Expanded(child: Text(_otpError!, style: const TextStyle(color: AppTheme.danger, fontSize: 13))),
              ]),
            ),
          ],

          // Submit — sends OTP first
          SizedBox(
            height: 56,
            child: Consumer<AppConfigProvider>(
              builder: (_, cfg, __) {
                final brandColor = cfg.config.primaryColor == const Color(0xFF0F172A)
                    ? AppTheme.accent : cfg.config.primaryColor;
                return ElevatedButton(
                  onPressed: _sendingOtp ? null : _sendOtpAndProceed,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: brandColor,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    elevation: 0,
                  ),
                  child: _sendingOtp
                      ? const SizedBox(width: 22, height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
                      : const Text('Continue',
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, letterSpacing: 0.2)),
                );
              },
            ),
          ),
          const SizedBox(height: 12),
          const Center(
            child: Text(
              'We\'ll send a verification code to your email',
              style: TextStyle(fontSize: 12, color: AppTheme.gray400),
            ),
          ),
        ],
      ),
    );
  }
}

// ─── Dropdown field ───────────────────────────────────────────────────────────
class _DropdownField extends StatelessWidget {
  final String label;
  final IconData icon;
  final String? value;
  final List<String> items;
  final ValueChanged<String?> onChanged;

  const _DropdownField({
    required this.label,
    required this.icon,
    required this.value,
    required this.items,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppTheme.gray50,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.gray200),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: value,
          hint: Row(children: [
            const SizedBox(width: 16),
            Icon(icon, size: 18, color: AppTheme.gray400),
            const SizedBox(width: 10),
            Text(label, style: const TextStyle(color: AppTheme.gray400, fontSize: 14)),
          ]),
          isExpanded: true,
          borderRadius: BorderRadius.circular(14),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
          icon: const Icon(Icons.keyboard_arrow_down_rounded, color: AppTheme.gray400),
          dropdownColor: Colors.white,
          items: items.map((item) => DropdownMenuItem(
            value: item,
            child: Text(item, style: const TextStyle(fontSize: 14, color: AppTheme.primary)),
          )).toList(),
          onChanged: onChanged,
          style: const TextStyle(fontSize: 14, color: AppTheme.primary, fontFamily: 'Inter'),
        ),
      ),
    );
  }
}

// ─── Shared auth field ────────────────────────────────────────────────────────
class _AuthField extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final TextInputType keyboardType;
  final bool? obscure;
  final VoidCallback? onToggleObscure;
  final IconData? prefixIcon;
  final bool touched;
  final bool? isValid;
  final String? errorText;
  final VoidCallback? onChanged;
  final FormFieldValidator<String>? validator;

  const _AuthField({
    super.key,
    required this.controller,
    required this.hint,
    this.keyboardType = TextInputType.text,
    this.obscure,
    this.onToggleObscure,
    this.prefixIcon,
    this.touched = false,
    this.isValid,
    this.errorText,
    this.onChanged,
    this.validator,
  });

  @override
  Widget build(BuildContext context) {
    final showState = touched && isValid != null;
    final valid = isValid ?? false;

    Color border = AppTheme.gray200;
    Color fill   = AppTheme.gray50;
    if (showState) {
      border = valid ? AppTheme.success : AppTheme.danger;
      fill   = valid
          ? AppTheme.success.withValues(alpha: 0.04)
          : AppTheme.danger.withValues(alpha: 0.04);
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          decoration: BoxDecoration(
            color: fill,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: border, width: showState ? 1.5 : 1),
          ),
          child: TextFormField(
            controller: controller,
            keyboardType: keyboardType,
            obscureText: obscure ?? false,
            validator: validator,
            onChanged: onChanged != null ? (_) => onChanged!() : null,
            style: const TextStyle(
              color: AppTheme.primary,
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
            decoration: InputDecoration(
              hintText: hint,
              hintStyle: const TextStyle(color: AppTheme.gray400, fontSize: 14),
              filled: false,
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              errorBorder: InputBorder.none,
              focusedErrorBorder: InputBorder.none,
              errorStyle: const TextStyle(height: 0, fontSize: 0),
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 15),
              prefixIcon: prefixIcon != null
                  ? Icon(prefixIcon, size: 18,
                      color: showState
                          ? (valid ? AppTheme.success : AppTheme.danger)
                          : AppTheme.gray400)
                  : null,
              suffixIcon: obscure != null
                  ? IconButton(
                      icon: Icon(
                        obscure! ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                        size: 18,
                        color: AppTheme.gray400,
                      ),
                      onPressed: onToggleObscure,
                      padding: EdgeInsets.zero,
                    )
                  : (showState
                      ? Icon(
                          valid ? Icons.check_circle_rounded : Icons.cancel_rounded,
                          size: 18,
                          color: valid ? AppTheme.success : AppTheme.danger,
                        )
                      : null),
            ),
          ),
        ),
        if (showState && !valid && errorText != null) ...[
          const SizedBox(height: 4),
          Row(children: [
            const Icon(Icons.error_outline_rounded, size: 12, color: AppTheme.danger),
            const SizedBox(width: 4),
            Text(errorText!,
                style: const TextStyle(fontSize: 11, color: AppTheme.danger, fontWeight: FontWeight.w600)),
          ]),
        ],
      ],
    );
  }
}
