import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// ─────────────────────────────────────────────────────────────────────────────
/// Alyah Design System v2.0
/// Inspired by Linear, Stripe, Notion — precision, depth, and clarity.
/// ─────────────────────────────────────────────────────────────────────────────

class AppTheme {
  AppTheme._();

  // ── Brand palette ────────────────────────────────────────────────────────────
  static const Color primary   = Color(0xFF0D1B2A); // deep navy
  static const Color accent    = Color(0xFF3B82F6); // electric blue  ← brand color
  static const Color accentDim = Color(0xFF2563EB); // deeper blue
  static const Color brand     = Color(0xFF3B82F6); // electric blue

  // ── Backgrounds ──────────────────────────────────────────────────────────────
  static const Color bg        = Color(0xFFF8FAFC); // off-white — not pure white
  static const Color surface   = Color(0xFFFFFFFF); // pure white cards
  static const Color surfaceElevated = Color(0xFFFAFBFD);
  static const Color border    = Color(0xFFE2E8F0); // subtle border

  // ── Semantic ─────────────────────────────────────────────────────────────────
  static const Color success   = Color(0xFF10B981);
  static const Color successBg = Color(0xFFECFDF5);
  static const Color warning   = Color(0xFFF59E0B);
  static const Color warningBg = Color(0xFFFFFBEB);
  static const Color danger    = Color(0xFFEF4444);
  static const Color dangerBg  = Color(0xFFFEF2F2);
  static const Color info      = Color(0xFF3B82F6);
  static const Color infoBg    = Color(0xFFEFF6FF);
  static const Color coral     = Color(0xFFFF6B6B);
  static const Color purple    = Color(0xFF8B5CF6);
  static const Color purpleBg  = Color(0xFFF5F3FF);

  // ── Soft tints ───────────────────────────────────────────────────────────────
  static const Color tealSoft  = Color(0xFFEFF6FF); // blue-50 (matches blueSoft)
  static const Color mintSoft  = Color(0xFFF0FDF4);
  static const Color redSoft   = Color(0xFFFEF2F2);
  static const Color amberSoft = Color(0xFFFFFBEB);
  static const Color blueSoft  = Color(0xFFEFF6FF);
  static const Color stoneSoft = Color(0xFFF8FAFC);

  // ── Neutral scale ────────────────────────────────────────────────────────────
  static const Color gray950   = Color(0xFF0D1117);
  static const Color gray900   = Color(0xFF0F172A);
  static const Color gray800   = Color(0xFF1E293B);
  static const Color gray700   = Color(0xFF334155);
  static const Color gray600   = Color(0xFF475569);
  static const Color gray500   = Color(0xFF64748B);
  static const Color gray400   = Color(0xFF94A3B8);
  static const Color gray300   = Color(0xFFCBD5E1);
  static const Color gray200   = Color(0xFFE2E8F0);
  static const Color gray100   = Color(0xFFF1F5F9);
  static const Color gray50    = Color(0xFFF8FAFC);

  static const Color primaryFade = Color(0x1A0D1B2A);

  // ── Gradients ─────────────────────────────────────────────────────────────────
  static const Gradient primaryGradient = LinearGradient(
    colors: [Color(0xFFF0F9FF), Color(0xFFF8FAFC)],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );

  static const Gradient accentGradient = LinearGradient(
    colors: [Color(0xFF3B82F6), Color(0xFF2563EB)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const Gradient navyGradient = LinearGradient(
    colors: [Color(0xFF0D1B2A), Color(0xFF1A2D45)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const Gradient alertGradient = LinearGradient(
    colors: [Color(0xFFEF4444), Color(0xFFDC2626)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const Gradient successGradient = LinearGradient(
    colors: [Color(0xFF10B981), Color(0xFF059669)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const Gradient blueGradient = LinearGradient(
    colors: [Color(0xFF3B82F6), Color(0xFF2563EB)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  // ── Elevation / Shadow system ─────────────────────────────────────────────────
  // Level 0 — flat (no shadow)
  static const List<BoxShadow> shadowNone = [];

  // Level 1 — subtle card
  static List<BoxShadow> get shadowSm => [
    BoxShadow(
      color: const Color(0xFF0D1B2A).withValues(alpha: 0.04),
      blurRadius: 8,
      offset: const Offset(0, 2),
    ),
    BoxShadow(
      color: const Color(0xFF0D1B2A).withValues(alpha: 0.02),
      blurRadius: 1,
      offset: const Offset(0, 1),
    ),
  ];

  // Level 2 — elevated card (default)
  static List<BoxShadow> get shadowMd => [
    BoxShadow(
      color: const Color(0xFF0D1B2A).withValues(alpha: 0.06),
      blurRadius: 20,
      offset: const Offset(0, 6),
    ),
    BoxShadow(
      color: const Color(0xFF0D1B2A).withValues(alpha: 0.03),
      blurRadius: 4,
      offset: const Offset(0, 2),
    ),
  ];

  // Level 3 — modal / floating
  static List<BoxShadow> get shadowLg => [
    BoxShadow(
      color: const Color(0xFF0D1B2A).withValues(alpha: 0.10),
      blurRadius: 40,
      offset: const Offset(0, 16),
    ),
    BoxShadow(
      color: const Color(0xFF0D1B2A).withValues(alpha: 0.05),
      blurRadius: 8,
      offset: const Offset(0, 4),
    ),
  ];

  // Level 4 — action button glow
  static List<BoxShadow> shadowAccent(Color color) => [
    BoxShadow(
      color: color.withValues(alpha: 0.30),
      blurRadius: 24,
      offset: const Offset(0, 8),
    ),
    BoxShadow(
      color: color.withValues(alpha: 0.12),
      blurRadius: 6,
      offset: const Offset(0, 2),
    ),
  ];

  // Legacy compat
  static BoxShadow get cardShadow => BoxShadow(
    color: const Color(0xFF0D1B2A).withValues(alpha: 0.06),
    blurRadius: 20,
    offset: const Offset(0, 6),
  );
  static BoxShadow get elevatedShadow => BoxShadow(
    color: const Color(0xFF0D1B2A).withValues(alpha: 0.10),
    blurRadius: 40,
    offset: const Offset(0, 16),
  );

  // ── Animation ────────────────────────────────────────────────────────────────
  static const Duration fastDuration   = Duration(milliseconds: 120);
  static const Duration normalDuration = Duration(milliseconds: 220);
  static const Duration slowDuration   = Duration(milliseconds: 380);
  static const Duration pageTransitionDuration = Duration(milliseconds: 240);

  static const Curve defaultCurve  = Curves.easeOutCubic;
  static const Curve bounceCurve   = Curves.elasticOut;
  static const Curve fastOutSlowIn = Curves.fastOutSlowIn;

  // ── Border radii ──────────────────────────────────────────────────────────────
  static BorderRadius get radiusXS => BorderRadius.circular(8);
  static BorderRadius get radiusS  => BorderRadius.circular(12);
  static BorderRadius get radiusM  => BorderRadius.circular(16);
  static BorderRadius get radiusL  => BorderRadius.circular(20);
  static BorderRadius get radiusXL => BorderRadius.circular(28);
  static BorderRadius get radiusFull => BorderRadius.circular(999);

  // ── Typography scale ─────────────────────────────────────────────────────────
  static const TextStyle displayLg = TextStyle(
    fontSize: 32, fontWeight: FontWeight.w800,
    letterSpacing: -0.8, height: 1.15,
  );
  static const TextStyle displaySm = TextStyle(
    fontSize: 26, fontWeight: FontWeight.w800,
    letterSpacing: -0.5, height: 1.2,
  );
  static const TextStyle headingLg = TextStyle(
    fontSize: 20, fontWeight: FontWeight.w700,
    letterSpacing: -0.3, height: 1.3,
  );
  static const TextStyle headingSm = TextStyle(
    fontSize: 17, fontWeight: FontWeight.w700,
    letterSpacing: -0.2, height: 1.35,
  );
  static const TextStyle bodyLg = TextStyle(
    fontSize: 16, fontWeight: FontWeight.w400, height: 1.6,
  );
  static const TextStyle bodyMd = TextStyle(
    fontSize: 14, fontWeight: FontWeight.w400, height: 1.55,
  );
  static const TextStyle bodySm = TextStyle(
    fontSize: 13, fontWeight: FontWeight.w400, height: 1.5,
  );
  static const TextStyle labelLg = TextStyle(
    fontSize: 13, fontWeight: FontWeight.w600, letterSpacing: 0.1,
  );
  static const TextStyle labelSm = TextStyle(
    fontSize: 11, fontWeight: FontWeight.w700, letterSpacing: 0.6,
  );
  static const TextStyle caption = TextStyle(
    fontSize: 11, fontWeight: FontWeight.w500,
    color: gray500, height: 1.4,
  );
  static const TextStyle overline = TextStyle(
    fontSize: 10, fontWeight: FontWeight.w700,
    letterSpacing: 1.2, color: gray400,
  );

  // ── Theme data ────────────────────────────────────────────────────────────────
  static final ThemeData light = ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    primaryColor: primary,
    scaffoldBackgroundColor: bg,
    fontFamily: 'Inter',
    colorScheme: ColorScheme(
      brightness: Brightness.light,
      primary: primary,
      onPrimary: Colors.white,
      secondary: accent,
      onSecondary: Colors.white,
      surface: surface,
      onSurface: gray900,
      error: danger,
      onError: Colors.white,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      foregroundColor: gray900,
      elevation: 0,
      scrolledUnderElevation: 0,
      systemOverlayStyle: SystemUiOverlayStyle(
        statusBarBrightness: Brightness.light,
        statusBarIconBrightness: Brightness.dark,
        statusBarColor: Colors.transparent,
      ),
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontSize: 17, fontWeight: FontWeight.w700,
        color: gray900, letterSpacing: -0.2, fontFamily: 'Inter',
      ),
    ),
    dividerTheme: const DividerThemeData(
      color: gray200, thickness: 1, space: 1,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: gray50,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: radiusM,
        borderSide: const BorderSide(color: gray200),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: radiusM,
        borderSide: const BorderSide(color: gray200),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: radiusM,
        borderSide: const BorderSide(color: accent, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: radiusM,
        borderSide: const BorderSide(color: danger),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: radiusM,
        borderSide: const BorderSide(color: danger, width: 2),
      ),
      hintStyle: const TextStyle(color: gray400, fontSize: 14, fontWeight: FontWeight.w400),
      labelStyle: const TextStyle(color: gray500, fontSize: 14),
      floatingLabelStyle: TextStyle(color: accent, fontSize: 12, fontWeight: FontWeight.w600),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: primary,
        foregroundColor: Colors.white,
        elevation: 0,
        shadowColor: Colors.transparent,
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 24),
        shape: RoundedRectangleBorder(borderRadius: radiusM),
        textStyle: const TextStyle(
          fontSize: 15, fontWeight: FontWeight.w700,
          letterSpacing: 0.1, fontFamily: 'Inter',
        ),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: primary,
        side: const BorderSide(color: gray200, width: 1.5),
        padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 20),
        shape: RoundedRectangleBorder(borderRadius: radiusM),
        textStyle: const TextStyle(
          fontSize: 14, fontWeight: FontWeight.w600, fontFamily: 'Inter',
        ),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: accent,
        textStyle: const TextStyle(
          fontSize: 14, fontWeight: FontWeight.w600, fontFamily: 'Inter',
        ),
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: gray100,
      selectedColor: accentGradient.colors.first.withValues(alpha: 0.1),
      labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600, fontFamily: 'Inter'),
      shape: RoundedRectangleBorder(borderRadius: radiusS),
      side: const BorderSide(color: gray200),
    ),
    cardTheme: CardThemeData(
      color: surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: radiusL,
        side: const BorderSide(color: gray200),
      ),
      margin: const EdgeInsets.symmetric(vertical: 6),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: surface,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: surface,
      elevation: 0,
      shape: RoundedRectangleBorder(borderRadius: radiusXL),
      titleTextStyle: const TextStyle(
        fontSize: 18, fontWeight: FontWeight.w800,
        color: gray900, fontFamily: 'Inter',
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: radiusM),
      backgroundColor: gray900,
      contentTextStyle: const TextStyle(
        color: Colors.white, fontSize: 13,
        fontWeight: FontWeight.w600, fontFamily: 'Inter',
      ),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(
      color: accent,
      linearTrackColor: gray100,
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((s) =>
          s.contains(WidgetState.selected) ? accent : gray300),
      trackColor: WidgetStateProperty.resolveWith((s) =>
          s.contains(WidgetState.selected)
              ? accent.withValues(alpha: 0.3)
              : gray200),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith((s) =>
          s.contains(WidgetState.selected) ? accent : Colors.transparent),
      side: const BorderSide(color: gray300, width: 1.5),
      shape: RoundedRectangleBorder(borderRadius: radiusXS),
    ),
  );

  static final ThemeData dark = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    primaryColor: accent,
    scaffoldBackgroundColor: const Color(0xFF090E1A),
    fontFamily: 'Inter',
    colorScheme: ColorScheme(
      brightness: Brightness.dark,
      primary: accent,
      onPrimary: const Color(0xFF090E1A),
      secondary: accent,
      onSecondary: const Color(0xFF090E1A),
      surface: const Color(0xFF111827),
      onSurface: Colors.white,
      error: const Color(0xFFF87171),
      onError: Colors.white,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.transparent,
      foregroundColor: Colors.white,
      elevation: 0,
      scrolledUnderElevation: 0,
      systemOverlayStyle: SystemUiOverlayStyle(
        statusBarBrightness: Brightness.dark,
        statusBarIconBrightness: Brightness.light,
        statusBarColor: Colors.transparent,
      ),
      centerTitle: false,
      titleTextStyle: TextStyle(
        fontSize: 17, fontWeight: FontWeight.w700,
        color: Colors.white, letterSpacing: -0.2, fontFamily: 'Inter',
      ),
    ),
    dividerTheme: const DividerThemeData(
      color: Color(0xFF1E293B), thickness: 1, space: 1,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: const Color(0xFF0F1729),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: radiusM,
        borderSide: const BorderSide(color: Color(0xFF1E293B)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: radiusM,
        borderSide: const BorderSide(color: Color(0xFF1E293B)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: radiusM,
        borderSide: const BorderSide(color: accent, width: 2),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: radiusM,
        borderSide: const BorderSide(color: Color(0xFFF87171)),
      ),
      hintStyle: const TextStyle(
        color: Color(0xFF4B5563), fontSize: 14, fontWeight: FontWeight.w400,
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: accent,
        foregroundColor: const Color(0xFF0D1B2A),
        elevation: 0,
        padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 24),
        shape: RoundedRectangleBorder(borderRadius: radiusM),
        textStyle: const TextStyle(
          fontSize: 15, fontWeight: FontWeight.w800,
          letterSpacing: 0.1, fontFamily: 'Inter',
        ),
      ),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: Color(0xFF111827),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: radiusM),
      backgroundColor: const Color(0xFF1E293B),
      contentTextStyle: const TextStyle(
        color: Colors.white, fontSize: 13,
        fontWeight: FontWeight.w600, fontFamily: 'Inter',
      ),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AppCard — premium card with optional glass effect
// ─────────────────────────────────────────────────────────────────────────────

class AppCard extends StatelessWidget {
  final Widget child;
  final EdgeInsets? padding;
  final Color? color;
  final double? radius;
  final bool elevated;
  final bool glass;
  final Color? borderColor;
  final List<BoxShadow>? shadows;
  final VoidCallback? onTap;

  const AppCard({
    super.key,
    required this.child,
    this.padding,
    this.color,
    this.radius,
    this.elevated = true,
    this.glass = false,
    this.borderColor,
    this.shadows,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    final bg = color ??
        (isDark ? const Color(0xFF111827) : AppTheme.surface);

    final effectiveBorder = borderColor ??
        (isDark ? const Color(0xFF1E293B) : AppTheme.border);

    final effectiveShadows = shadows ??
        (elevated ? AppTheme.shadowMd : AppTheme.shadowNone);

    Widget card = Container(
      padding: padding ?? const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: glass ? bg.withValues(alpha: 0.85) : bg,
        borderRadius: BorderRadius.circular(radius ?? 20),
        boxShadow: effectiveShadows,
        border: Border.all(color: effectiveBorder, width: 1),
      ),
      child: child,
    );

    if (onTap != null) {
      card = Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(radius ?? 20),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(radius ?? 20),
          child: card,
        ),
      );
    }

    return card;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// StatusBadge — clean pill badge
// ─────────────────────────────────────────────────────────────────────────────

class StatusBadge extends StatelessWidget {
  final String label;
  final Color color;
  final Color? background;
  final double fontSize;

  const StatusBadge({
    super.key,
    required this.label,
    required this.color,
    this.background,
    this.fontSize = 10,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: background ?? color.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.20)),
      ),
      child: Text(
        label.replaceAll('_', ' ').toUpperCase(),
        style: TextStyle(
          fontSize: fontSize,
          fontWeight: FontWeight.w700,
          color: color,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}
