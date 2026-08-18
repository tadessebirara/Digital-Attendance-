// ignore_for_file: use_build_context_synchronously
import 'dart:convert';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/theme_provider.dart';
import '../../services/api_service.dart';
import '../../services/biometric_service.dart';
import '../../utils/app_theme.dart';
import '../../widgets/app_widgets.dart';

// --- Page enum ---------------------------------------------------------------

enum _Page { home, account, security, appearance, about }

// --- ProfileScreen ------------------------------------------------------------

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  _Page _page = _Page.home;

  void _go(_Page p) => setState(() => _page = p);
  void _back() => setState(() => _page = _Page.home);

  @override
  Widget build(BuildContext context) {
    return switch (_page) {
      _Page.home => _ProfileHome(onNav: _go),
      _Page.account => _AccountPage(onBack: _back),
      _Page.security => _SecurityPage(onBack: _back),
      _Page.appearance => _AppearancePage(onBack: _back),
      _Page.about => _AboutPage(onBack: _back),
    };
  }
}

// --- Helpers -----------------------------------------------------------------

void _toast(BuildContext ctx, String msg, {bool error = false}) =>
    showAppSnack(ctx, msg, isError: error);

String _initials(Map<String, dynamic>? user) {
  if (user == null) return '?';
  final f = (user['firstName'] as String? ?? '').trim();
  final l = (user['lastName'] as String? ?? '').trim();
  if (f.isEmpty && l.isEmpty) return '?';
  return '${f.isNotEmpty ? f[0] : ''}${l.isNotEmpty ? l[0] : ''}'.toUpperCase();
}

String _fullName(Map<String, dynamic>? user) {
  if (user == null) return 'Unknown';
  final f = user['firstName'] as String? ?? '';
  final l = user['lastName'] as String? ?? '';
  return '$f $l'.trim();
}

// --- Profile Home -------------------------------------------------------------

class _ProfileHome extends StatefulWidget {
  final void Function(_Page) onNav;
  const _ProfileHome({required this.onNav});

  @override
  State<_ProfileHome> createState() => _ProfileHomeState();
}

class _ProfileHomeState extends State<_ProfileHome> {
  bool _uploading = false;

  Future<void> _pickAndUploadAvatar() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.image,
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    final bytes = result.files.first.bytes;
    if (bytes == null) return;

    setState(() => _uploading = true);
    try {
      final b64 = base64Encode(bytes);
      final ext = result.files.first.extension ?? 'jpg';
      final res = await ApiService.instance.post(
        '/users/profile/avatar-base64',
        body: {'imageData': 'data:image/$ext;base64,$b64'},
      );
      if (!mounted) return;
      if (res['success'] == true) {
        final auth = context.read<AuthProvider>();
        final updated = Map<String, dynamic>.from(auth.user ?? {});
        final data = res['data'];
        if (data is Map && data['avatarUrl'] != null) {
          updated['avatarUrl'] = data['avatarUrl'];
        }
        auth.updateUser(updated);
        _toast(context, 'Profile photo updated');
      } else {
        _toast(context, res['error'] ?? 'Upload failed', error: true);
      }
    } catch (e) {
      if (mounted) _toast(context, 'Upload failed: $e', error: true);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _logout() async {
    final confirmed = await showConfirmDialog(
      context,
      title: 'Sign Out',
      message: 'Are you sure you want to sign out of your account?',
      confirmLabel: 'Sign Out',
      cancelLabel: 'Cancel',
      isDestructive: true,
    );
    if (!confirmed) return;
    await context.read<AuthProvider>().logout();
    if (mounted) Navigator.pushNamedAndRemoveUntil(context, '/login', (_) => false);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user;
    final avatarUrl = user?['avatarUrl'] as String?;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textPrimary = isDark ? Colors.white : AppTheme.gray900;
    final textSecondary = isDark ? AppTheme.gray400 : AppTheme.gray600;
    final bgColor = isDark ? const Color(0xFF111827) : AppTheme.bg;

    return Scaffold(
      backgroundColor: bgColor,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
          child: Column(
            children: [
              // -- Avatar + name --
              Center(
                child: Column(
                  children: [
                    GestureDetector(
                      onTap: _uploading ? null : _pickAndUploadAvatar,
                      child: Stack(
                        children: [
                          Container(
                            width: 88,
                            height: 88,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: AppTheme.accent.withValues(alpha: 0.15),
                              border: Border.all(color: AppTheme.accent, width: 2.5),
                            ),
                            child: ClipOval(
                              child: avatarUrl != null && avatarUrl.isNotEmpty
                                  ? Image.network(avatarUrl, fit: BoxFit.cover,
                                      errorBuilder: (_, __, ___) => _AvatarFallback(initials: _initials(user)))
                                  : _AvatarFallback(initials: _initials(user)),
                            ),
                          ),
                          Positioned(
                            bottom: 0,
                            right: 0,
                            child: Container(
                              width: 26,
                              height: 26,
                              decoration: BoxDecoration(
                                color: AppTheme.accent,
                                shape: BoxShape.circle,
                                border: Border.all(color: bgColor, width: 2),
                              ),
                              child: _uploading
                                  ? const Padding(
                                      padding: EdgeInsets.all(4),
                                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                                    )
                                  : const Icon(Icons.camera_alt_rounded, size: 13, color: Colors.white),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      _fullName(user),
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: textPrimary),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      user?['position'] as String? ?? user?['role'] as String? ?? '',
                      style: TextStyle(fontSize: 13, color: textSecondary),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        // Employee ID badge
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: isDark ? const Color(0xFF1E2D3D) : AppTheme.gray100,
                            borderRadius: BorderRadius.circular(999),
                            border: Border.all(color: AppTheme.border),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.badge_outlined, size: 12, color: textSecondary),
                              const SizedBox(width: 4),
                              Text(
                                user?['employeeId'] as String? ?? 'N/A',
                                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: textSecondary),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        // Status badge
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppTheme.success.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Container(
                                width: 6,
                                height: 6,
                                decoration: const BoxDecoration(color: AppTheme.success, shape: BoxShape.circle),
                              ),
                              const SizedBox(width: 5),
                              const Text(
                                'ACTIVE',
                                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800, color: AppTheme.success, letterSpacing: 0.6),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 28),

              // -- Nav cards --
              _NavCard(
                icon: Icons.person_outline_rounded,
                title: 'Account',
                subtitle: 'Personal info & edit profile',
                color: AppTheme.accent,
                onTap: () => widget.onNav(_Page.account),
              ),
              const SizedBox(height: 12),
              _NavCard(
                icon: Icons.lock_outline_rounded,
                title: 'Security',
                subtitle: 'Password & biometric login',
                color: AppTheme.warning,
                onTap: () => widget.onNav(_Page.security),
              ),
              const SizedBox(height: 12),
              _NavCard(
                icon: Icons.folder_outlined,
                title: 'My Documents',
                subtitle: 'View documents uploaded by HR',
                color: const Color(0xFF059669),
                onTap: () => Navigator.pushNamed(context, '/documents'),
              ),
              const SizedBox(height: 12),
              _NavCard(
                icon: Icons.palette_outlined,
                title: 'Appearance',
                subtitle: 'Theme, language & display',
                color: const Color(0xFF7C3AED),
                onTap: () => widget.onNav(_Page.appearance),
              ),
              const SizedBox(height: 12),
              _NavCard(
                icon: Icons.info_outline_rounded,
                title: 'About',
                subtitle: 'App info, terms & support',
                color: AppTheme.info,
                onTap: () => widget.onNav(_Page.about),
              ),

              // -- Admin section (only shown to ADMIN role) --
              if ((user?['role'] as String?) == 'ADMIN') ...[
                const SizedBox(height: 24),
                const _SectionTitle('ADMIN'),
                const SizedBox(height: 10),
                _NavCard(
                  icon: Icons.location_city_rounded,
                  title: 'Office Locations',
                  subtitle: 'Manage geofence locations & radius',
                  color: AppTheme.accent,
                  onTap: () => Navigator.pushNamed(context, '/admin/offices'),
                ),
              ],

              const SizedBox(height: 24),

              // -- Logout --
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: _logout,
                  icon: Icon(Icons.logout_rounded, color: AppTheme.danger, size: 18),
                  label: Text('Sign Out', style: TextStyle(color: AppTheme.danger, fontWeight: FontWeight.w700)),
                  style: OutlinedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    side: BorderSide(color: AppTheme.danger.withValues(alpha: 0.4)),
                    shape: RoundedRectangleBorder(borderRadius: AppTheme.radiusM),
                  ),
                ),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }
}

class _AvatarFallback extends StatelessWidget {
  final String initials;
  const _AvatarFallback({required this.initials});

  @override
  Widget build(BuildContext context) {
    return Container(
      color: AppTheme.accent.withValues(alpha: 0.15),
      alignment: Alignment.center,
      child: Text(
        initials,
        style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: AppTheme.accent),
      ),
    );
  }
}

class _NavCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final Color color;
  final VoidCallback onTap;

  const _NavCard({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return AppCard(
      padding: EdgeInsets.zero,
      color: isDark ? const Color(0xFF18212F) : AppTheme.surface,
      child: InkWell(
        onTap: onTap,
        borderRadius: AppTheme.radiusL,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.12),
                  borderRadius: AppTheme.radiusM,
                ),
                child: Icon(icon, color: color, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: isDark ? Colors.white : AppTheme.gray900,
                        )),
                    const SizedBox(height: 2),
                    Text(subtitle,
                        style: TextStyle(
                          fontSize: 12,
                          color: isDark ? AppTheme.gray400 : AppTheme.gray500,
                        )),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: isDark ? AppTheme.gray400 : AppTheme.gray400),
            ],
          ),
        ),
      ),
    );
  }
}


// --- Shared widgets -----------------------------------------------------------

class _SubPageShell extends StatelessWidget {
  final String title;
  final VoidCallback onBack;
  final Widget child;
  const _SubPageShell({required this.title, required this.onBack, required this.child});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: isDark ? const Color(0xFF111827) : AppTheme.bg,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 18),
          onPressed: onBack,
        ),
        title: Text(title),
        backgroundColor: isDark ? const Color(0xFF18212F) : AppTheme.surface,
        elevation: 0,
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Divider(height: 1, color: isDark ? Colors.white10 : AppTheme.border),
        ),
      ),
      body: child,
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String text;
  const _SectionTitle(this.text);
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Text(text,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w700,
            color: isDark ? AppTheme.gray400 : AppTheme.gray600,
            letterSpacing: 0.4,
          )),
    );
  }
}


void _showToast(BuildContext ctx, String msg, {bool error = false}) =>
    showAppSnack(ctx, msg, isError: error);

// --- Account Page -------------------------------------------------------------

class _AccountPage extends StatefulWidget {
  final VoidCallback onBack;
  const _AccountPage({required this.onBack});
  @override
  State<_AccountPage> createState() => _AccountPageState();
}

class _AccountPageState extends State<_AccountPage> {
  bool _editing = false;
  bool _saving = false;
  late TextEditingController _firstCtrl;
  late TextEditingController _lastCtrl;
  late TextEditingController _phoneCtrl;

  // -- Email change state -----------------------------------------------------
  // 0 = idle, 1 = enter new email, 2 = enter OTP
  int _emailStep = 0;
  bool _emailBusy = false;
  String? _emailError;
  String? _emailSuccess;
  final _newEmailCtrl = TextEditingController();
  final _otpCtrl      = TextEditingController();

  @override
  void initState() {
    super.initState();
    final user = context.read<AuthProvider>().user ?? {};
    _firstCtrl = TextEditingController(text: user['firstName'] as String? ?? '');
    _lastCtrl  = TextEditingController(text: user['lastName']  as String? ?? '');
    _phoneCtrl = TextEditingController(text: user['phone']     as String? ?? '');
  }

  @override
  void dispose() {
    _firstCtrl.dispose();
    _lastCtrl.dispose();
    _phoneCtrl.dispose();
    _newEmailCtrl.dispose();
    _otpCtrl.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() => _saving = true);
    final res = await ApiService.instance.request('PUT', '/users/profile/me', body: {
      'firstName': _firstCtrl.text.trim(),
      'lastName':  _lastCtrl.text.trim(),
      'phone':     _phoneCtrl.text.trim(),
    });
    if (!mounted) return;
    if (res['success'] == true) {
      final auth = context.read<AuthProvider>();
      final updated = Map<String, dynamic>.from(auth.user ?? {});
      updated['firstName'] = _firstCtrl.text.trim();
      updated['lastName']  = _lastCtrl.text.trim();
      updated['phone']     = _phoneCtrl.text.trim();
      updated['fullName']  = '${_firstCtrl.text.trim()} ${_lastCtrl.text.trim()}'.trim();
      auth.updateUser(updated);
      setState(() { _editing = false; _saving = false; });
      _showToast(context, 'Profile updated successfully');
    } else {
      setState(() => _saving = false);
      _showToast(context, res['error'] ?? 'Failed to update profile', error: true);
    }
  }

  // -- Email change handlers --------------------------------------------------
  Future<void> _requestEmailChange() async {
    final email = _newEmailCtrl.text.trim().toLowerCase();
    final emailRegex = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
    if (!emailRegex.hasMatch(email)) {
      setState(() => _emailError = 'Please enter a valid email address.');
      return;
    }
    setState(() { _emailBusy = true; _emailError = null; _emailSuccess = null; });
    final res = await ApiService.instance.post(
      '/users/profile/request-email-change',
      body: {'newEmail': email},
    );
    if (!mounted) return;
    if (res['success'] == true) {
      setState(() {
        _emailBusy = false;
        _emailStep = 2;
        _otpCtrl.clear();
        _emailSuccess = res['message'] ?? 'Verification code sent to $email';
        _emailError = null;
      });
    } else {
      setState(() {
        _emailBusy = false;
        _emailError = res['error'] ?? 'Failed to send verification code.';
      });
    }
  }

  Future<void> _confirmEmailChange() async {
    final otp = _otpCtrl.text.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(otp)) {
      setState(() => _emailError = 'Please enter the 6-digit code.');
      return;
    }
    setState(() { _emailBusy = true; _emailError = null; });
    final res = await ApiService.instance.post(
      '/users/profile/confirm-email-change',
      body: {'otpCode': otp},
    );
    if (!mounted) return;
    if (res['success'] == true) {
      // Update local user cache with new email
      final auth = context.read<AuthProvider>();
      final updated = Map<String, dynamic>.from(auth.user ?? {});
      final newEmail = res['data']?['email'] as String? ?? _newEmailCtrl.text.trim();
      updated['email'] = newEmail;
      auth.updateUser(updated);
      setState(() {
        _emailBusy = false;
        _emailStep = 0;
        _emailError = null;
        _emailSuccess = null;
        _newEmailCtrl.clear();
        _otpCtrl.clear();
      });
      _showToast(context, 'Email updated. Please sign in again with your new email.');
    } else {
      setState(() {
        _emailBusy = false;
        _emailError = res['error'] ?? 'Incorrect code. Please try again.';
      });
    }
  }

  void _cancelEmailChange() {
    setState(() {
      _emailStep = 0;
      _emailError = null;
      _emailSuccess = null;
      _newEmailCtrl.clear();
      _otpCtrl.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user ?? {};
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final cardColor = isDark ? const Color(0xFF18212F) : AppTheme.surface;

    final rows = [
      if (user['email'] != null)      _InfoRow(icon: Icons.email_outlined,    label: 'Email',       value: user['email'] as String),
      if (user['phone'] != null)      _InfoRow(icon: Icons.phone_outlined,     label: 'Phone',       value: user['phone'] as String),
      if (user['department'] != null) _InfoRow(icon: Icons.business_outlined,  label: 'Department',  value: user['department'] as String),
      if (user['position'] != null)   _InfoRow(icon: Icons.work_outline,       label: 'Position',    value: user['position'] as String),
      if (user['employeeId'] != null) _InfoRow(icon: Icons.badge_outlined,     label: 'Employee ID', value: user['employeeId'] as String),
    ];

    return _SubPageShell(
      title: 'Account',
      onBack: widget.onBack,
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [

            // -- Profile overview card --------------------------------------
            Container(
              decoration: BoxDecoration(color: cardColor, borderRadius: AppTheme.radiusL, border: Border.all(color: AppTheme.border)),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('Profile Overview',
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700,
                              color: isDark ? Colors.white : AppTheme.gray900)),
                      TextButton(
                        onPressed: () => setState(() => _editing = !_editing),
                        child: Text(_editing ? 'Cancel' : 'Edit',
                            style: TextStyle(color: AppTheme.accent, fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  ...rows,
                ],
              ),
            ),

            // -- Edit form --------------------------------------------------
            if (_editing) ...[
              const SizedBox(height: 16),
              Container(
                decoration: BoxDecoration(color: cardColor, borderRadius: AppTheme.radiusL, border: Border.all(color: AppTheme.border)),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Edit Information',
                        style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700,
                            color: isDark ? Colors.white : AppTheme.gray900)),
                    const SizedBox(height: 16),
                    _Field(label: 'First Name', controller: _firstCtrl),
                    const SizedBox(height: 12),
                    _Field(label: 'Last Name', controller: _lastCtrl),
                    const SizedBox(height: 12),
                    _Field(label: 'Phone Number', controller: _phoneCtrl, keyboardType: TextInputType.phone),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _saving ? null : _save,
                        child: _saving
                            ? const SizedBox(width: 20, height: 20,
                                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                            : const Text('Save Changes'),
                      ),
                    ),
                  ],
                ),
              ),
            ],

            const SizedBox(height: 16),

            // -- Change Email card ------------------------------------------
            Container(
              decoration: BoxDecoration(
                color: cardColor,
                borderRadius: AppTheme.radiusL,
                border: Border.all(color: _emailStep > 0 ? AppTheme.accent.withValues(alpha: 0.5) : AppTheme.border),
              ),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Header row
                  Row(
                    children: [
                      Container(
                        width: 36, height: 36,
                        decoration: BoxDecoration(
                          color: AppTheme.accent.withValues(alpha: 0.12),
                          borderRadius: AppTheme.radiusS,
                        ),
                        child: const Icon(Icons.email_outlined, color: AppTheme.accent, size: 18),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Email Address',
                                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700,
                                    color: isDark ? Colors.white : AppTheme.gray900)),
                            Text(user['email'] as String? ?? '',
                                style: TextStyle(fontSize: 12,
                                    color: isDark ? AppTheme.gray400 : AppTheme.gray500),
                                overflow: TextOverflow.ellipsis),
                          ],
                        ),
                      ),
                      if (_emailStep == 0)
                        TextButton(
                          onPressed: () => setState(() { _emailStep = 1; _emailError = null; }),
                          style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: Size.zero),
                          child: const Text('Change', style: TextStyle(color: AppTheme.accent, fontWeight: FontWeight.w700)),
                        ),
                    ],
                  ),

                  // Step 1: enter new email
                  if (_emailStep == 1) ...[
                    const SizedBox(height: 16),
                    Text('New Email Address',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                            color: isDark ? AppTheme.gray400 : AppTheme.gray600)),
                    const SizedBox(height: 6),
                    TextField(
                      controller: _newEmailCtrl,
                      keyboardType: TextInputType.emailAddress,
                      autofocus: true,
                      onChanged: (_) => setState(() => _emailError = null),
                      decoration: const InputDecoration(
                        hintText: 'new@example.com',
                        prefixIcon: Icon(Icons.alternate_email_rounded, size: 18),
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text('A 6-digit verification code will be sent to this address.',
                        style: TextStyle(fontSize: 11, color: isDark ? AppTheme.gray500 : AppTheme.gray400)),
                    if (_emailError != null) ...[
                      const SizedBox(height: 8),
                      _ErrorBanner(message: _emailError!),
                    ],
                    const SizedBox(height: 14),
                    Row(children: [
                      Expanded(
                        child: ElevatedButton(
                          onPressed: _emailBusy ? null : _requestEmailChange,
                          child: _emailBusy
                              ? const SizedBox(width: 18, height: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : const Text('Send Code'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      OutlinedButton(
                        onPressed: _cancelEmailChange,
                        child: const Text('Cancel'),
                      ),
                    ]),
                  ],

                  // Step 2: enter OTP
                  if (_emailStep == 2) ...[
                    const SizedBox(height: 16),
                    if (_emailSuccess != null)
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
                        margin: const EdgeInsets.only(bottom: 12),
                        decoration: BoxDecoration(
                          color: AppTheme.success.withValues(alpha: 0.1),
                          borderRadius: AppTheme.radiusM,
                          border: Border.all(color: AppTheme.success.withValues(alpha: 0.3)),
                        ),
                        child: Row(children: [
                          const Icon(Icons.check_circle_outline_rounded, size: 14, color: AppTheme.success),
                          const SizedBox(width: 8),
                          Expanded(child: Text(_emailSuccess!,
                              style: const TextStyle(fontSize: 12, color: AppTheme.success))),
                        ]),
                      ),
                    Text('Verification Code',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                            color: isDark ? AppTheme.gray400 : AppTheme.gray600)),
                    Text('Sent to ${_newEmailCtrl.text.trim()}',
                        style: TextStyle(fontSize: 11, color: isDark ? AppTheme.gray500 : AppTheme.gray400)),
                    const SizedBox(height: 10),
                    TextField(
                      controller: _otpCtrl,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      autofocus: true,
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: 10),
                      onChanged: (_) => setState(() => _emailError = null),
                      decoration: const InputDecoration(
                        hintText: '------',
                        counterText: '',
                      ),
                    ),
                    if (_emailError != null) ...[
                      const SizedBox(height: 8),
                      _ErrorBanner(message: _emailError!),
                    ],
                    const SizedBox(height: 6),
                    Wrap(
                      spacing: 6,
                      children: [
                        TextButton(
                          onPressed: () => setState(() {
                            _emailStep = 1;
                            _otpCtrl.clear();
                            _emailError = null;
                            _emailSuccess = null;
                          }),
                          style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: Size.zero),
                          child: const Text('Use a different email',
                              style: TextStyle(fontSize: 12, color: AppTheme.accent)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Row(children: [
                      Expanded(
                        child: ElevatedButton(
                          onPressed: (_emailBusy || _otpCtrl.text.length != 6) ? null : _confirmEmailChange,
                          style: ElevatedButton.styleFrom(backgroundColor: AppTheme.success),
                          child: _emailBusy
                              ? const SizedBox(width: 18, height: 18,
                                  child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                              : const Text('Verify & Update Email'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      OutlinedButton(
                        onPressed: _cancelEmailChange,
                        child: const Text('Cancel'),
                      ),
                    ]),
                  ],
                ],
              ),
            ),

            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

// -- Small error banner widget --------------------------------------------------
class _ErrorBanner extends StatelessWidget {
  final String message;
  const _ErrorBanner({required this.message});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: AppTheme.danger.withValues(alpha: 0.08),
        borderRadius: AppTheme.radiusS,
        border: Border.all(color: AppTheme.danger.withValues(alpha: 0.3)),
      ),
      child: Row(children: [
        const Icon(Icons.error_outline_rounded, size: 14, color: AppTheme.danger),
        const SizedBox(width: 6),
        Expanded(child: Text(message,
            style: const TextStyle(fontSize: 12, color: AppTheme.danger))),
      ]),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  const _InfoRow({required this.icon, required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Icon(icon, size: 16, color: isDark ? AppTheme.gray400 : AppTheme.gray500),
          const SizedBox(width: 10),
          SizedBox(
            width: 100,
            child: Text(label, style: TextStyle(fontSize: 12, color: isDark ? AppTheme.gray400 : AppTheme.gray500)),
          ),
          Expanded(
            child: Text(value,
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: isDark ? Colors.white : AppTheme.gray900)),
          ),
        ],
      ),
    );
  }
}

class _Field extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final TextInputType? keyboardType;
  const _Field({required this.label, required this.controller, this.keyboardType});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.gray600)),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          decoration: InputDecoration(hintText: label),
        ),
      ],
    );
  }
}

// --- Security Page ------------------------------------------------------------

class _SecurityPage extends StatefulWidget {
  final VoidCallback onBack;
  const _SecurityPage({required this.onBack});
  @override
  State<_SecurityPage> createState() => _SecurityPageState();
}

class _SecurityPageState extends State<_SecurityPage> {
  final _currentCtrl = TextEditingController();
  final _newCtrl     = TextEditingController();
  final _confirmCtrl = TextEditingController();
  bool _showCurrent = false, _showNew = false, _showConfirm = false;
  bool _savingPw = false;
  String? _pwError;

  bool _twoFA = false;
  String _twoFAMethod = 'email';
  bool _saving2FA = false;
  bool _sendingOtp = false;
  final _otpCtrl = TextEditingController();

  bool _biometric = false;
  bool _savingBio = false;
  bool _bioAvailable = false;

  @override
  void initState() {
    super.initState();
    _loadFromServer();
    _checkBiometric();
  }

  @override
  void dispose() {
    _currentCtrl.dispose();
    _newCtrl.dispose();
    _confirmCtrl.dispose();
    _otpCtrl.dispose();
    super.dispose();
  }

  Future<void> _loadFromServer() async {
    final res = await ApiService.instance.get('/users/profile/me');
    if (!mounted) return;
    if (res['success'] == true) {
      final data = (res['data'] ?? res) as Map<String, dynamic>;
      setState(() {
        _twoFA       = data['twoFactorEnabled'] as bool? ?? false;
        _twoFAMethod = data['twoFactorMethod']  as String? ?? 'email';
        _biometric   = data['biometricEnabled'] as bool? ?? false;
      });
    }
  }

  Future<void> _checkBiometric() async {
    final avail = await BiometricService.instance.isAvailable();
    if (mounted) setState(() => _bioAvailable = avail);
  }

  // -- Send 2FA OTP ------------------------------------------------------------
  Future<void> _sendOtp() async {
    setState(() => _sendingOtp = true);
    final res = await ApiService.instance.post('/auth/send-2fa-otp');
    if (!mounted) return;
    setState(() => _sendingOtp = false);
    if (res['success'] == true) {
      _showToast(context, res['message'] ?? 'Verification code sent');
      _showOtpDialog();
    } else {
      _showToast(context, res['error'] ?? 'Failed to send code', error: true);
    }
  }

  // -- Verify 2FA OTP dialog ---------------------------------------------------
  void _showOtpDialog() {
    _otpCtrl.clear();
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDlg) {
          bool verifying = false;
          String? dlgError;

          Future<void> verify() async {
            if (_otpCtrl.text.length != 6) {
              setDlg(() => dlgError = 'Enter the 6-digit code');
              return;
            }
            setDlg(() { verifying = true; dlgError = null; });
            final res = await ApiService.instance.post('/auth/verify-2fa-otp',
                body: {'otpCode': _otpCtrl.text.trim()});
            if (!ctx.mounted) return;
            setDlg(() => verifying = false);
            if (res['success'] == true) {
              Navigator.pop(ctx);
              _showToast(context, '2FA verification successful ?');
            } else {
              setDlg(() => dlgError = res['error'] ?? 'Incorrect code');
            }
          }

          return AlertDialog(
            shape: RoundedRectangleBorder(borderRadius: AppTheme.radiusL),
            title: const Text('Enter Verification Code',
                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16)),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _twoFAMethod == 'sms'
                      ? 'Enter the 6-digit code sent to your phone.'
                      : 'Enter the 6-digit code sent to your email.',
                  style: const TextStyle(fontSize: 13, color: AppTheme.gray600),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _otpCtrl,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      fontSize: 28, fontWeight: FontWeight.w900, letterSpacing: 12),
                  decoration: InputDecoration(
                    counterText: '',
                    hintText: '------',
                    hintStyle: const TextStyle(color: AppTheme.gray300, letterSpacing: 12),
                    errorText: dlgError,
                  ),
                  onChanged: (_) => setDlg(() => dlgError = null),
                ),
              ],
            ),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(ctx),
                  child: const Text('Cancel')),
              ElevatedButton(
                onPressed: verifying ? null : verify,
                child: verifying
                    ? const SizedBox(
                        width: 18, height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Text('Verify'),
              ),
            ],
          );
        },
      ),
    );
  }

  int get _strength {
    final p = _newCtrl.text;
    if (p.isEmpty) return 0;
    int s = 0;
    if (p.length >= 8) s++;
    if (p.contains(RegExp(r'[A-Z]'))) s++;
    if (p.contains(RegExp(r'[0-9]'))) s++;
    if (p.contains(RegExp(r'[^A-Za-z0-9]'))) s++;
    return s;
  }

  Future<void> _changePassword() async {
    setState(() { _pwError = null; });
    if (_newCtrl.text == _currentCtrl.text) { setState(() => _pwError = 'New password must differ from current'); return; }
    if (_newCtrl.text.length < 8) { setState(() => _pwError = 'Password must be at least 8 characters'); return; }
    if (_newCtrl.text != _confirmCtrl.text) { setState(() => _pwError = 'Passwords do not match'); return; }
    setState(() => _savingPw = true);
    final res = await ApiService.instance.post('/auth/change-password', body: {
      'currentPassword': _currentCtrl.text,
      'newPassword': _newCtrl.text,
    });
    if (!mounted) return;
    setState(() => _savingPw = false);
    if (res['success'] == true) {
      _currentCtrl.clear(); _newCtrl.clear(); _confirmCtrl.clear();
      _showToast(context, 'Password updated. Please log in again on all devices.');
    } else {
      setState(() => _pwError = res['error'] ?? 'Failed to update password');
    }
  }

  Future<void> _toggle2FA(bool val) async {
    setState(() => _saving2FA = true);
    final res = await ApiService.instance.request('PUT', '/users/profile/two-factor', body: {
      'enabled': val,
      'method': _twoFAMethod,
    });
    if (!mounted) return;
    setState(() => _saving2FA = false);
    if (res['success'] == true) {
      setState(() => _twoFA = val);
      _showToast(context, val ? 'Two-factor authentication enabled' : '2FA disabled');
    } else {
      _showToast(context, res['error'] ?? 'Failed to update 2FA', error: true);
    }
  }

  Future<void> _set2FAMethod(String method) async {
    setState(() => _saving2FA = true);
    final res = await ApiService.instance.request('PUT', '/users/profile/two-factor', body: {
      'enabled': _twoFA,
      'method': method,
    });
    if (!mounted) return;
    setState(() => _saving2FA = false);
    if (res['success'] == true) {
      setState(() => _twoFAMethod = method);
      _showToast(context, '2FA method set to ${method.toUpperCase()}');
    } else {
      _showToast(context, res['error'] ?? 'Failed to update method', error: true);
    }
  }

  Future<void> _toggleBiometric(bool val) async {
    setState(() => _savingBio = true);
    final res = await ApiService.instance.request('PUT', '/users/profile/biometric', body: {'enabled': val});
    if (!mounted) return;
    setState(() => _savingBio = false);
    if (res['success'] == true) {
      setState(() => _biometric = val);
      _showToast(context, val ? 'Biometric login enabled' : 'Biometric login disabled');
    } else {
      _showToast(context, res['error'] ?? 'Failed to update biometric', error: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final cardColor = isDark ? const Color(0xFF18212F) : AppTheme.surface;
    final strengthColors = [Colors.transparent, AppTheme.danger, AppTheme.warning, AppTheme.info, AppTheme.success];
    final strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];

    return _SubPageShell(
      title: 'Security',
      onBack: widget.onBack,
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Change Password
            Container(
              decoration: BoxDecoration(color: cardColor, borderRadius: AppTheme.radiusL, border: Border.all(color: AppTheme.border)),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _SectionTitle('Change Password'),
                  _PwField(label: 'Current Password', controller: _currentCtrl, show: _showCurrent, onToggle: () => setState(() => _showCurrent = !_showCurrent)),
                  const SizedBox(height: 12),
                  _PwField(label: 'New Password', controller: _newCtrl, show: _showNew, onToggle: () => setState(() => _showNew = !_showNew),
                    onChanged: (_) => setState(() {})),
                  if (_newCtrl.text.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Row(children: List.generate(4, (i) => Expanded(
                      child: Container(
                        height: 4,
                        margin: EdgeInsets.only(right: i < 3 ? 4 : 0),
                        decoration: BoxDecoration(
                          color: i < _strength ? strengthColors[_strength] : (isDark ? Colors.white12 : AppTheme.gray200),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ))),
                    const SizedBox(height: 4),
                    Text(strengthLabels[_strength],
                        style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: strengthColors[_strength])),
                  ],
                  const SizedBox(height: 12),
                  _PwField(label: 'Confirm New Password', controller: _confirmCtrl, show: _showConfirm, onToggle: () => setState(() => _showConfirm = !_showConfirm)),
                  if (_pwError != null) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                      decoration: BoxDecoration(color: AppTheme.danger.withValues(alpha: 0.1), borderRadius: AppTheme.radiusS),
                      child: Row(children: [
                        Icon(Icons.error_outline, size: 14, color: AppTheme.danger),
                        const SizedBox(width: 6),
                        Expanded(child: Text(_pwError!, style: TextStyle(fontSize: 12, color: AppTheme.danger))),
                      ]),
                    ),
                  ],
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _savingPw ? null : _changePassword,
                      child: _savingPw
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Text('Update Password'),
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // 2FA
            Container(
              decoration: BoxDecoration(color: cardColor, borderRadius: AppTheme.radiusL, border: Border.all(color: AppTheme.border)),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('Two-Factor Authentication',
                            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: isDark ? Colors.white : AppTheme.gray900)),
                        Text('Extra security for your account',
                            style: TextStyle(fontSize: 12, color: isDark ? AppTheme.gray400 : AppTheme.gray500)),
                      ]),
                      Switch(
                        value: _twoFA,
                        onChanged: _saving2FA ? null : _toggle2FA,
                        activeThumbColor: AppTheme.accent,
                      ),
                    ],
                  ),
                  if (_twoFA) ...[
                    const Divider(height: 24),
                    Text('Select Method',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: isDark ? AppTheme.gray400 : AppTheme.gray600)),
                    const SizedBox(height: 10),
                    for (final m in [
                      {'key': 'sms',   'label': 'SMS OTP',           'icon': Icons.sms_outlined},
                      {'key': 'email', 'label': 'Email OTP',          'icon': Icons.email_outlined},
                      {'key': 'app',   'label': 'Authenticator App',  'icon': Icons.security_outlined},
                    ]) ...[
                      InkWell(
                        onTap: _saving2FA ? null : () => _set2FAMethod(m['key'] as String),
                        borderRadius: AppTheme.radiusM,
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                          margin: const EdgeInsets.only(bottom: 8),
                          decoration: BoxDecoration(
                            color: _twoFAMethod == m['key']
                                ? AppTheme.accent.withValues(alpha: 0.1)
                                : (isDark ? Colors.white.withValues(alpha: 0.04) : AppTheme.gray100),
                            borderRadius: AppTheme.radiusM,
                            border: Border.all(
                              color: _twoFAMethod == m['key'] ? AppTheme.accent : AppTheme.border,
                              width: _twoFAMethod == m['key'] ? 1.5 : 1,
                            ),
                          ),
                          child: Row(children: [
                            Icon(m['icon'] as IconData,
                                size: 18,
                                color: _twoFAMethod == m['key'] ? AppTheme.accent : (isDark ? AppTheme.gray400 : AppTheme.gray600)),
                            const SizedBox(width: 10),
                            Expanded(child: Text(m['label'] as String,
                                style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: _twoFAMethod == m['key'] ? AppTheme.accent : (isDark ? Colors.white : AppTheme.gray900),
                                ))),
                            if (_twoFAMethod == m['key'])
                              Icon(Icons.check_circle_rounded, size: 18, color: AppTheme.accent),
                          ]),
                        ),
                      ),
                    ],
                    const SizedBox(height: 12),
                    // Send OTP test button
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: _sendingOtp ? null : _sendOtp,
                        icon: _sendingOtp
                            ? const SizedBox(width: 16, height: 16,
                                child: CircularProgressIndicator(strokeWidth: 2))
                            : const Icon(Icons.send_rounded, size: 16),
                        label: Text(_sendingOtp ? 'Sending...' : 'Send Verification Code'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppTheme.accent,
                          side: BorderSide(color: AppTheme.accent.withValues(alpha: 0.5)),
                          shape: RoundedRectangleBorder(borderRadius: AppTheme.radiusM),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                        ),
                      ),
                    ),
                  ],  // end if (_twoFA)
                ],
              ),
            ),
            Container(
              decoration: BoxDecoration(color: cardColor, borderRadius: AppTheme.radiusL, border: Border.all(color: AppTheme.border)),
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: const Color(0xFF7C3AED).withValues(alpha: 0.12),
                      borderRadius: AppTheme.radiusM,
                    ),
                    child: const Icon(Icons.fingerprint_rounded, color: Color(0xFF7C3AED), size: 24),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Biometric Login',
                          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: isDark ? Colors.white : AppTheme.gray900)),
                      Text(_bioAvailable ? 'Fingerprint or Face ID' : 'Not available on this device',
                          style: TextStyle(fontSize: 12, color: isDark ? AppTheme.gray400 : AppTheme.gray500)),
                    ]),
                  ),
                  Switch(
                    value: _biometric,
                    onChanged: (!_bioAvailable || _savingBio) ? null : _toggleBiometric,
                    activeThumbColor: AppTheme.accent,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PwField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final bool show;
  final VoidCallback onToggle;
  final ValueChanged<String>? onChanged;
  const _PwField({required this.label, required this.controller, required this.show, required this.onToggle, this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.gray600)),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          obscureText: !show,
          onChanged: onChanged,
          decoration: InputDecoration(
            hintText: label,
            suffixIcon: IconButton(
              icon: Icon(show ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 18),
              onPressed: onToggle,
            ),
          ),
        ),
      ],
    );
  }
}

// --- Appearance Page ----------------------------------------------------------

class _AppearancePage extends StatefulWidget {
  final VoidCallback onBack;
  const _AppearancePage({required this.onBack});
  @override
  State<_AppearancePage> createState() => _AppearancePageState();
}

class _AppearancePageState extends State<_AppearancePage> {
  bool _saving = false;

  // Notification preferences (loaded from server)
  bool _notifCheckIn     = true;
  bool _notifCheckOut    = true;
  bool _notifLeave       = true;
  bool _notifAnnounce    = true;
  bool _notifChat        = true;
  bool _notifAbsent      = true;
  bool _loadingNotif     = true;

  @override
  void initState() {
    super.initState();
    _loadNotifPrefs();
  }

  Future<void> _loadNotifPrefs() async {
    final res = await ApiService.instance.get('/users/profile/preferences');
    if (!mounted) return;
    setState(() => _loadingNotif = false);
    if (res['success'] == true) {
      final data = (res['data'] ?? res) as Map<String, dynamic>;
      final notif = data['notifications'] as Map<String, dynamic>? ?? {};
      setState(() {
        _notifCheckIn  = notif['checkIn']      as bool? ?? true;
        _notifCheckOut = notif['checkOut']     as bool? ?? true;
        _notifLeave    = notif['leave']        as bool? ?? true;
        _notifAnnounce = notif['announcements'] as bool? ?? true;
        _notifChat     = notif['chat']         as bool? ?? true;
        _notifAbsent   = notif['absent']       as bool? ?? true;
      });
    }
  }

  Future<void> _savePrefs(Map<String, dynamic> patch) async {
    setState(() => _saving = true);
    await ApiService.instance.request('PUT', '/users/profile/preferences', body: patch);
    if (mounted) setState(() => _saving = false);
  }

  Future<void> _toggleNotif(String key, bool val) async {
    setState(() {
      switch (key) {
        case 'checkIn':       _notifCheckIn  = val; break;
        case 'checkOut':      _notifCheckOut = val; break;
        case 'leave':         _notifLeave    = val; break;
        case 'announcements': _notifAnnounce = val; break;
        case 'chat':          _notifChat     = val; break;
        case 'absent':        _notifAbsent   = val; break;
      }
    });
    await _savePrefs({
      'notifications': {
        'checkIn':       _notifCheckIn,
        'checkOut':      _notifCheckOut,
        'leave':         _notifLeave,
        'announcements': _notifAnnounce,
        'chat':          _notifChat,
        'absent':        _notifAbsent,
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final themeProvider = context.watch<ThemeProvider>();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final cardColor = isDark ? const Color(0xFF18212F) : AppTheme.surface;

    return _SubPageShell(
      title: 'Appearance & Notifications',
      onBack: widget.onBack,
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (_saving)
              Container(
                margin: const EdgeInsets.only(bottom: 12),
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: AppTheme.info.withValues(alpha: 0.1),
                  borderRadius: AppTheme.radiusM,
                ),
                child: Row(children: [
                  const SizedBox(width: 14, height: 14,
                      child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.info)),
                  const SizedBox(width: 10),
                  Text('Saving...', style: TextStyle(fontSize: 12, color: AppTheme.info)),
                ]),
              ),

            // -- Theme ------------------------------------------------------
            Container(
              decoration: BoxDecoration(
                  color: cardColor,
                  borderRadius: AppTheme.radiusL,
                  border: Border.all(color: AppTheme.border)),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _SectionTitle('THEME'),
                  Row(children: [
                    for (final t in [
                      {'mode': ThemeMode.light,  'label': 'Light',  'icon': Icons.wb_sunny_outlined},
                      {'mode': ThemeMode.dark,   'label': 'Dark',   'icon': Icons.nightlight_outlined},
                      {'mode': ThemeMode.system, 'label': 'System', 'icon': Icons.settings_brightness_outlined},
                    ]) ...[
                      Expanded(
                        child: GestureDetector(
                          onTap: () {
                            final m = t['mode'] as ThemeMode;
                            themeProvider.setTheme(m);
                            _savePrefs({
                              'theme': m == ThemeMode.dark
                                  ? 'dark'
                                  : m == ThemeMode.light
                                      ? 'light'
                                      : 'system'
                            });
                          },
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 14),
                            margin: const EdgeInsets.only(right: 6),
                            decoration: BoxDecoration(
                              color: themeProvider.mode == t['mode']
                                  ? AppTheme.accent.withValues(alpha: 0.12)
                                  : (isDark
                                      ? Colors.white.withValues(alpha: 0.04)
                                      : AppTheme.gray100),
                              borderRadius: AppTheme.radiusM,
                              border: Border.all(
                                color: themeProvider.mode == t['mode']
                                    ? AppTheme.accent
                                    : AppTheme.border,
                                width: themeProvider.mode == t['mode'] ? 2 : 1,
                              ),
                            ),
                            child: Column(children: [
                              Icon(t['icon'] as IconData,
                                  size: 22,
                                  color: themeProvider.mode == t['mode']
                                      ? AppTheme.accent
                                      : (isDark ? AppTheme.gray400 : AppTheme.gray600)),
                              const SizedBox(height: 6),
                              Text(t['label'] as String,
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color: themeProvider.mode == t['mode']
                                        ? AppTheme.accent
                                        : (isDark ? AppTheme.gray400 : AppTheme.gray600),
                                  )),
                            ]),
                          ),
                        ),
                      ),
                    ],
                  ]),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // -- Language ---------------------------------------------------
            Container(
              decoration: BoxDecoration(
                  color: cardColor,
                  borderRadius: AppTheme.radiusL,
                  border: Border.all(color: AppTheme.border)),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _SectionTitle('LANGUAGE'),
                  for (final lang in [
                    {'code': 'English', 'label': 'English', 'flag': '????'},
                    {'code': 'Amharic', 'label': '???? (Amharic)', 'flag': '????'},
                    {'code': 'Arabic',  'label': '??????? (Arabic)',  'flag': '????'},
                    {'code': 'French',  'label': 'Français (French)', 'flag': '????'},
                  ])
                    InkWell(
                      onTap: () {
                        themeProvider.setLanguage(lang['code']!);
                        _savePrefs({'language': lang['code']});
                        _showToast(context, 'Language set to ${lang['label']}');
                      },
                      borderRadius: AppTheme.radiusM,
                      child: Padding(
                        padding: const EdgeInsets.symmetric(vertical: 11, horizontal: 4),
                        child: Row(children: [
                          Text(lang['flag']!, style: const TextStyle(fontSize: 20)),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text(lang['label']!,
                                style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w600,
                                  color: isDark ? Colors.white : AppTheme.gray900,
                                )),
                          ),
                          if (themeProvider.language == lang['code'])
                            const Icon(Icons.check_circle_rounded,
                                size: 18, color: AppTheme.accent),
                        ]),
                      ),
                    ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // -- Notifications ----------------------------------------------
            Container(
              decoration: BoxDecoration(
                  color: cardColor,
                  borderRadius: AppTheme.radiusL,
                  border: Border.all(color: AppTheme.border)),
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _SectionTitle('PUSH NOTIFICATIONS'),
                  if (_loadingNotif)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.symmetric(vertical: 16),
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    )
                  else ...[
                    _NotifToggle(
                      icon: Icons.login_rounded,
                      label: 'Check-in reminders',
                      subtitle: 'Remind me when it\'s time to check in',
                      value: _notifCheckIn,
                      isDark: isDark,
                      onChanged: (v) => _toggleNotif('checkIn', v),
                    ),
                    _NotifToggle(
                      icon: Icons.logout_rounded,
                      label: 'Check-out reminders',
                      subtitle: 'Remind me when it\'s time to check out',
                      value: _notifCheckOut,
                      isDark: isDark,
                      onChanged: (v) => _toggleNotif('checkOut', v),
                    ),
                    _NotifToggle(
                      icon: Icons.event_busy_rounded,
                      label: 'Leave updates',
                      subtitle: 'Approval or rejection of leave requests',
                      value: _notifLeave,
                      isDark: isDark,
                      onChanged: (v) => _toggleNotif('leave', v),
                    ),
                    _NotifToggle(
                      icon: Icons.campaign_rounded,
                      label: 'Announcements',
                      subtitle: 'Company-wide announcements from HR',
                      value: _notifAnnounce,
                      isDark: isDark,
                      onChanged: (v) => _toggleNotif('announcements', v),
                    ),
                    _NotifToggle(
                      icon: Icons.chat_bubble_outline_rounded,
                      label: 'Chat messages',
                      subtitle: 'New messages from HR or colleagues',
                      value: _notifChat,
                      isDark: isDark,
                      onChanged: (v) => _toggleNotif('chat', v),
                    ),
                    _NotifToggle(
                      icon: Icons.warning_amber_rounded,
                      label: 'Absence alerts',
                      subtitle: 'Notify me if I\'m marked absent',
                      value: _notifAbsent,
                      isDark: isDark,
                      onChanged: (v) => _toggleNotif('absent', v),
                    ),
                  ],
                ],
              ),
            ),

            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }
}

class _NotifToggle extends StatelessWidget {
  final IconData icon;
  final String label;
  final String subtitle;
  final bool value;
  final bool isDark;
  final ValueChanged<bool> onChanged;

  const _NotifToggle({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.value,
    required this.isDark,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: AppTheme.accent.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 18, color: AppTheme.accent),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w700,
                      color: isDark ? Colors.white : AppTheme.gray900,
                    )),
                Text(subtitle,
                    style: TextStyle(
                      fontSize: 11,
                      color: isDark ? AppTheme.gray400 : AppTheme.gray500,
                    )),
              ],
            ),
          ),
          Switch(
            value: value,
            onChanged: onChanged,
            activeColor: AppTheme.accent,
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
        ],
      ),
    );
  }
}

// --- About Page ---------------------------------------------------------------

class _AboutPage extends StatelessWidget {
  final VoidCallback onBack;
  const _AboutPage({required this.onBack});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final cardColor = isDark ? const Color(0xFF18212F) : AppTheme.surface;

    final links = [
      {'label': 'Terms & Conditions', 'icon': Icons.description_outlined},
      {'label': 'Privacy Policy',     'icon': Icons.privacy_tip_outlined},
      {'label': 'Support / Help Center', 'icon': Icons.help_outline_rounded},
      {'label': 'Contact Us',         'icon': Icons.mail_outline_rounded},
    ];

    return _SubPageShell(
      title: 'About',
      onBack: onBack,
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            // App info card
            Container(
              width: double.infinity,
              decoration: BoxDecoration(color: cardColor, borderRadius: AppTheme.radiusL, border: Border.all(color: AppTheme.border)),
              padding: const EdgeInsets.all(24),
              child: Column(
                children: [
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      gradient: AppTheme.accentGradient,
                      borderRadius: AppTheme.radiusL,
                      boxShadow: [AppTheme.elevatedShadow],
                    ),
                    child: const Icon(Icons.shield_outlined, color: Colors.white, size: 36),
                  ),
                  const SizedBox(height: 16),
                  Text('Alyah Smart Attendance',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: isDark ? Colors.white : AppTheme.gray900)),
                  const SizedBox(height: 4),
                  Text('Version 2.3.1',
                      style: TextStyle(fontSize: 13, color: isDark ? AppTheme.gray400 : AppTheme.gray500)),
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppTheme.success.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: const Text('Up to date',
                        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppTheme.success)),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'A smart attendance management system designed to simplify employee attendance tracking, leave management and payroll integration.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 13, color: isDark ? AppTheme.gray400 : AppTheme.gray600, height: 1.5),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),

            // Links
            Container(
              decoration: BoxDecoration(color: cardColor, borderRadius: AppTheme.radiusL, border: Border.all(color: AppTheme.border)),
              child: Column(
                children: links.asMap().entries.map((e) {
                  final i = e.key;
                  final link = e.value;
                  return Column(
                    children: [
                      InkWell(
                        onTap: () {},
                        borderRadius: i == 0
                            ? BorderRadius.only(topLeft: Radius.circular(24), topRight: Radius.circular(24))
                            : i == links.length - 1
                                ? BorderRadius.only(bottomLeft: Radius.circular(24), bottomRight: Radius.circular(24))
                                : BorderRadius.zero,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                          child: Row(children: [
                            Icon(link['icon'] as IconData,
                                size: 20,
                                color: isDark ? AppTheme.gray400 : AppTheme.gray600),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Text(link['label'] as String,
                                  style: TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                    color: isDark ? Colors.white : AppTheme.gray900,
                                  )),
                            ),
                            Icon(Icons.chevron_right_rounded,
                                size: 18,
                                color: isDark ? AppTheme.gray400 : AppTheme.gray400),
                          ]),
                        ),
                      ),
                      if (i < links.length - 1)
                        Divider(height: 1, indent: 50, color: isDark ? Colors.white10 : AppTheme.border),
                    ],
                  );
                }).toList(),
              ),
            ),

            const SizedBox(height: 24),
            Text(
              '\u00a9 ${DateTime.now().year} Alyah Smart Attendance\nAll rights reserved.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: isDark ? AppTheme.gray400 : AppTheme.gray500, height: 1.6),
            ),
          ],
        ),
      ),
    );
  }
}


