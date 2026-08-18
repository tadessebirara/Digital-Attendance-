import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../utils/app_theme.dart';

/// Shown when login returns accountStatus = PENDING_APPROVAL.
/// Polls the server every 15 seconds to check if the account has been approved.
/// Uses polling instead of a raw unmanaged socket connection for reliability.
class PendingApprovalScreen extends StatefulWidget {
  const PendingApprovalScreen({super.key});

  @override
  State<PendingApprovalScreen> createState() => _PendingApprovalScreenState();
}

class _PendingApprovalScreenState extends State<PendingApprovalScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;
  Timer? _pollTimer;
  String? _statusMessage;
  bool _approved = false;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      duration: const Duration(seconds: 2),
      vsync: this,
    )..repeat(reverse: true);
    // Poll every 15 seconds — lightweight, no unmanaged socket
    _pollTimer = Timer.periodic(const Duration(seconds: 15), (_) => _checkStatus());
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _pulse.dispose();
    super.dispose();
  }

  Future<void> _checkStatus() async {
    if (!mounted || _approved) return;
    try {
      // Use /auth/me — returns current account status without requiring a valid session
      final res = await ApiService.instance.get('/auth/me');
      if (!mounted) return;

      final data = res['data'];
      // Safely extract status — handle both { status: ... } and { user: { status: ... } }
      String? rawStatus;
      if (data is Map) {
        rawStatus = data['status']?.toString();
        if (rawStatus == null || rawStatus.isEmpty) {
          final user = data['user'];
          if (user is Map) rawStatus = user['status']?.toString();
        }
      }
      final status = rawStatus?.toUpperCase();

      if (status == 'ACTIVE') {
        _approved = true;
        setState(() => _statusMessage = 'Your account has been approved! Redirecting…');
        await Future.delayed(const Duration(seconds: 2));
        if (mounted) {
          context.read<AuthProvider>().clearError();
          Navigator.of(context).pushNamedAndRemoveUntil('/login', (_) => false);
        }
      } else if (status == 'REJECTED') {
        if (mounted) setState(() => _statusMessage = 'Your account was not approved. Please contact HR.');
      }
    } catch (_) {
      // Silent — network error during polling, will retry next tick
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: isDark ? AppTheme.gray900 : AppTheme.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ── Animated icon ─────────────────────────────────────────────
              Center(
                child: AnimatedBuilder(
                  animation: _pulse,
                  builder: (_, __) => Container(
                    width: 100,
                    height: 100,
                    decoration: BoxDecoration(
                      color: AppTheme.warning
                          .withValues(alpha: 0.08 + _pulse.value * 0.08),
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      _approved
                          ? Icons.check_circle_rounded
                          : Icons.hourglass_top_rounded,
                      size: 48,
                      color: (_approved ? AppTheme.success : AppTheme.warning)
                          .withValues(alpha: 0.7 + _pulse.value * 0.3),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 32),

              Text(
                'Account Pending Approval',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w900,
                  color: isDark ? Colors.white : AppTheme.primary,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 14),
              Text(
                'Your account has been submitted and is waiting for HR approval. '
                'You will receive an email as soon as your account is activated.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 15,
                  color: isDark ? AppTheme.gray400 : AppTheme.gray500,
                  height: 1.6,
                ),
              ),
              const SizedBox(height: 32),

              // ── Status badge ───────────────────────────────────────────────
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
                decoration: BoxDecoration(
                  color: _statusMessage != null
                      ? (_approved
                          ? AppTheme.success.withValues(alpha: 0.1)
                          : AppTheme.danger.withValues(alpha: 0.1))
                      : AppTheme.warning.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(
                    color: _statusMessage != null
                        ? (_approved
                            ? AppTheme.success.withValues(alpha: 0.3)
                            : AppTheme.danger.withValues(alpha: 0.3))
                        : AppTheme.warning.withValues(alpha: 0.3),
                  ),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      _statusMessage != null
                          ? (_approved
                              ? Icons.check_circle_rounded
                              : Icons.cancel_rounded)
                          : Icons.schedule_rounded,
                      color: _statusMessage != null
                          ? (_approved ? AppTheme.success : AppTheme.danger)
                          : AppTheme.warning,
                      size: 18,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        _statusMessage ?? 'Status: Pending HR Review',
                        style: TextStyle(
                          color: _statusMessage != null
                              ? (_approved ? AppTheme.success : AppTheme.danger)
                              : AppTheme.warning,
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 40),

              // ── What to expect ─────────────────────────────────────────────
              Container(
                padding: const EdgeInsets.all(18),
                decoration: BoxDecoration(
                  color: isDark ? const Color(0xFF1F2937) : AppTheme.gray100,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'WHAT HAPPENS NEXT',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: isDark ? AppTheme.gray400 : AppTheme.gray500,
                        letterSpacing: 1.2,
                      ),
                    ),
                    const SizedBox(height: 12),
                    const _Step(
                        icon: Icons.person_search_rounded,
                        text: 'HR reviews your registration'),
                    const _Step(
                        icon: Icons.assignment_turned_in_rounded,
                        text: 'HR assigns your department & schedule'),
                    const _Step(
                        icon: Icons.mark_email_read_rounded,
                        text: 'You receive an approval email with a login link'),
                    const _Step(
                        icon: Icons.login_rounded,
                        text: 'Tap the link to open the app and sign in'),
                  ],
                ),
              ),
              const SizedBox(height: 40),

              // ── Back to login ──────────────────────────────────────────────
              OutlinedButton(
                onPressed: () {
                  context.read<AuthProvider>().clearError();
                  Navigator.of(context)
                      .pushNamedAndRemoveUntil('/login', (_) => false);
                },
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14)),
                  side: BorderSide(
                      color: isDark ? AppTheme.gray600 : AppTheme.gray300),
                ),
                child: Text(
                  'Back to Sign In',
                  style: TextStyle(
                    color: isDark ? AppTheme.gray300 : AppTheme.gray600,
                    fontWeight: FontWeight.w700,
                    fontSize: 15,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Step extends StatelessWidget {
  final IconData icon;
  final String text;
  const _Step({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppTheme.accent),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(
                  fontSize: 13,
                  color: AppTheme.gray600,
                  fontWeight: FontWeight.w500),
            ),
          ),
        ],
      ),
    );
  }
}
