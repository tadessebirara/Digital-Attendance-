import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/announcement_provider.dart';
import '../utils/app_strings.dart';
import '../utils/app_theme.dart';
import '../utils/ethiopian_calendar.dart';
import '../widgets/app_widgets.dart';

class AlertsScreen extends StatelessWidget {
  const AlertsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final ann  = Provider.of<AnnouncementProvider>(context);
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final s = AppStrings.of(context);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
              child: PageHeader(eyebrow: s.alertsEyebrow, title: s.alertsTitle),
            ),
            Expanded(
              child: RefreshIndicator(
                onRefresh: () => ann.getAnnouncements(),
                color: AppTheme.accent,
                child: _buildContent(context, ann, isDark, s),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent(
      BuildContext context, AnnouncementProvider ann, bool isDark, AppStrings s) {
    // Skeleton while first load
    if (ann.isLoading && ann.announcements.isEmpty) {
      return const AlertListSkeleton();
    }

    if (ann.announcements.isEmpty) {
      return ListView(
        children: [
          const SizedBox(height: 80),
          AppEmptyState(
            icon: Icons.campaign_outlined,
            title: s.noAlerts,
            subtitle: s.noAlertsSubtitle,
            actionLabel: 'Refresh',
            onAction: () => ann.getAnnouncements(),
          ),
        ],
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(18, 4, 18, 24),
      itemCount: ann.announcements.length,
      itemBuilder: (context, index) => _AlertCard(
        a: ann.announcements[index] as Map<String, dynamic>,
        index: index,
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Alert Card
// ─────────────────────────────────────────────────────────────────────────────

class _AlertCard extends StatefulWidget {
  final Map<String, dynamic> a;
  final int index;

  const _AlertCard({required this.a, required this.index});

  @override
  State<_AlertCard> createState() => _AlertCardState();
}

class _AlertCardState extends State<_AlertCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 450),
    );
    _anim = CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic);
    // Stagger based on index
    Future.delayed(Duration(milliseconds: widget.index * 60), () {
      if (mounted) _ctrl.forward();
    });
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  String _formatDate(dynamic raw) {
    if (raw == null) return '';
    try {
      final dt = DateTime.parse(raw.toString()).toLocal();
      final ethDate = toEthiopian(dt);
      final ethTime = toEthiopianTime(dt);
      return '${ethDate.formatShortAm()} — ${ethTime.format()}';
    } catch (_) {
      return '';
    }
  }

  /// Maps priority/type → accent color, bg color, icon, label
  static _CardStyle _resolveStyle(Map<String, dynamic> a) {
    final priority = (a['priority'] ?? '').toString().toUpperCase();
    final type     = (a['type']     ?? '').toString().toUpperCase();

    // CRITICAL / EMERGENCY
    if (priority == 'CRITICAL' || type == 'EMERGENCY') {
      return _CardStyle(
        accent: const Color(0xFFEF4444),
        bg:     const Color(0xFFFEF2F2),
        bgDark: const Color(0xFF2D1515),
        icon:   Icons.emergency_rounded,
        badge:  'CRITICAL',
        badgeColor: const Color(0xFFEF4444),
      );
    }
    // URGENT / HIGH
    if (priority == 'URGENT' || priority == 'HIGH' || type == 'URGENT') {
      return _CardStyle(
        accent: const Color(0xFFF59E0B),
        bg:     const Color(0xFFFFFBEB),
        bgDark: const Color(0xFF2D2208),
        icon:   Icons.warning_amber_rounded,
        badge:  'URGENT',
        badgeColor: const Color(0xFFF59E0B),
      );
    }
    // MEDIUM / NORMAL / GENERAL
    if (priority == 'MEDIUM' || priority == 'NORMAL' || type == 'GENERAL' || type == 'NOTICE') {
      return _CardStyle(
        accent: const Color(0xFF3B82F6),
        bg:     const Color(0xFFEFF6FF),
        bgDark: const Color(0xFF0F1E35),
        icon:   Icons.campaign_outlined,
        badge:  null,
        badgeColor: const Color(0xFF3B82F6),
      );
    }
    // LOW / INFO
    if (priority == 'LOW' || type == 'INFO') {
      return _CardStyle(
        accent: const Color(0xFF10B981),
        bg:     const Color(0xFFECFDF5),
        bgDark: const Color(0xFF0A2520),
        icon:   Icons.info_outline_rounded,
        badge:  null,
        badgeColor: const Color(0xFF10B981),
      );
    }
    // Default — blue
    return _CardStyle(
      accent: const Color(0xFF3B82F6),
      bg:     const Color(0xFFEFF6FF),
      bgDark: const Color(0xFF0F1E35),
      icon:   Icons.campaign_outlined,
      badge:  null,
      badgeColor: const Color(0xFF3B82F6),
    );
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.a;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final style  = _resolveStyle(a);

    return FadeSlideIn(
      animation: _anim,
      child: Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Container(
          decoration: BoxDecoration(
            color: isDark ? style.bgDark : AppTheme.surface,
            borderRadius: AppTheme.radiusM,
            boxShadow: AppTheme.shadowMd,
            border: Border.all(color: style.accent.withValues(alpha: isDark ? 0.30 : 0.18)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Colored header strip ──────────────────────────────────
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
                decoration: BoxDecoration(
                  color: style.accent.withValues(alpha: isDark ? 0.18 : 0.09),
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Row(children: [
                      Container(
                        width: 26, height: 26,
                        decoration: BoxDecoration(
                          color: style.accent.withValues(alpha: isDark ? 0.25 : 0.14),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Icon(style.icon, size: 14, color: style.accent),
                      ),
                      const SizedBox(width: 10),
                      Text(
                        (a['type'] ?? 'NOTICE').toString().toUpperCase(),
                        style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: style.accent,
                          letterSpacing: 0.7,
                        ),
                      ),
                      if (style.badge != null) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: style.badgeColor,
                            borderRadius: BorderRadius.circular(999),
                          ),
                          child: Text(
                            style.badge!,
                            style: const TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.w900,
                              color: Colors.white,
                              letterSpacing: 0.5,
                            ),
                          ),
                        ),
                      ],
                    ]),
                    Text(
                      _formatDate(a['publishedAt'] ?? a['createdAt']),
                      style: TextStyle(
                          fontSize: 10,
                          color: isDark ? AppTheme.gray500 : AppTheme.gray400),
                    ),
                  ],
                ),
              ),

              // ── Body ─────────────────────────────────────────────────
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Left-accent bar + title
                    IntrinsicHeight(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Container(
                            width: 3,
                            decoration: BoxDecoration(
                              color: style.accent,
                              borderRadius: BorderRadius.circular(999),
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              a['title'] ?? 'Untitled',
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w800,
                                color: isDark ? Colors.white : AppTheme.gray900,
                                height: 1.3,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                    Text(
                      a['content'] ?? '',
                      style: TextStyle(
                        fontSize: 13,
                        color: isDark ? AppTheme.gray300 : AppTheme.gray600,
                        height: 1.6,
                      ),
                    ),

                    // Department / audience tag
                    if (a['targetDepartment'] != null ||
                        a['targetAudience'] != null) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                        decoration: BoxDecoration(
                          color: style.accent.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(999),
                        ),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          Icon(Icons.group_outlined,
                              size: 12, color: style.accent),
                          const SizedBox(width: 5),
                          Text(
                            a['targetDepartment'] as String? ??
                                a['targetAudience'] as String? ?? '',
                            style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: style.accent),
                          ),
                        ]),
                      ),
                    ],
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

// ── Card style data class ─────────────────────────────────────────────────────
class _CardStyle {
  final Color accent;
  final Color bg;
  final Color bgDark;
  final IconData icon;
  final String? badge;
  final Color badgeColor;

  const _CardStyle({
    required this.accent,
    required this.bg,
    required this.bgDark,
    required this.icon,
    required this.badge,
    required this.badgeColor,
  });
}
