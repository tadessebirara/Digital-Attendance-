// ignore_for_file: use_build_context_synchronously
import 'dart:async' show unawaited;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../main.dart' show handleSessionExpired;
import '../services/api_service.dart';
import '../providers/auth_provider.dart';
import '../providers/chat_provider.dart';
import '../providers/app_config_provider.dart';

// ── Brand blue used throughout this screen ────────────────────────────────────
const Color _kBlue      = Color(0xFF3B82F6); // AppTheme.brand
const Color _kBlueDim   = Color(0xFF2563EB);
const Color _kNavy      = Color(0xFF0D1B2A); // AppTheme.primary
const Color _kBg        = Color(0xFFF8FAFF);
const Color _kBg2       = Color(0xFFEFF6FF); // blue-tinted bg
const Color _kGray400   = Color(0xFF94A3B8);
const Color _kGray500   = Color(0xFF64748B);

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});
  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {

  // Single controller drives all staggered entrance animations
  late final AnimationController _ctrl;

  late final Animation<double> _logoFade;
  late final Animation<Offset> _logoSlide;
  late final Animation<double> _badgeFade;
  late final Animation<double> _taglineFade;
  late final Animation<double> _logoScale; // subtle scale-in instead of pulse loop

  // Maximum time on splash — navigate as soon as auth is done, never more than this
  static const _maxDisplayMs = 900;

  @override
  void initState() {
    super.initState();

    SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
      statusBarColor:           Colors.transparent,
      statusBarIconBrightness:  Brightness.dark,
      systemNavigationBarColor: Colors.transparent,
    ));

    // ── Single 800ms entrance controller ─────────────────────────────────
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    );

    // Logo: fade + slide up + scale  (0 → 480ms)
    _logoFade = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _ctrl,
          curve: const Interval(0.0, 0.6, curve: Curves.easeOut)));
    _logoSlide = Tween<Offset>(begin: const Offset(0, 0.06), end: Offset.zero)
        .animate(CurvedAnimation(parent: _ctrl,
            curve: const Interval(0.0, 0.6, curve: Curves.easeOutCubic)));
    _logoScale = Tween<double>(begin: 0.88, end: 1.0).animate(
      CurvedAnimation(parent: _ctrl,
          curve: const Interval(0.0, 0.6, curve: Curves.easeOutBack)));

    // Badge  (150 → 600ms)
    _badgeFade = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _ctrl,
          curve: const Interval(0.18, 0.75, curve: Curves.easeOut)));

    // Tagline + loader  (400 → 800ms)
    _taglineFade = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _ctrl,
          curve: const Interval(0.5, 1.0, curve: Curves.easeOut)));

    _ctrl.forward();

    // Kick off auth after first frame — splash is already painting
    WidgetsBinding.instance.addPostFrameCallback((_) => _init());
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _init() async {
    if (!mounted) return;

    final appConfig = Provider.of<AppConfigProvider>(context, listen: false);
    final auth      = Provider.of<AuthProvider>(context, listen: false);
    final chat      = Provider.of<ChatProvider>(context, listen: false);
    final startMs   = DateTime.now().millisecondsSinceEpoch;

    // Auth + config fetch run fully in parallel
    final results = await Future.wait([
      appConfig.load(),
      auth.init(ApiService.sessionExpiredHandler ?? handleSessionExpired),
    ]);

    if (!mounted) return;

    // Only wait if we finished faster than the animation (600ms entrance)
    // Hard cap: never exceed 900ms total on this screen
    final elapsed   = DateTime.now().millisecondsSinceEpoch - startMs;
    final minWait   = 600  - elapsed; // let animation finish
    final maxWait   = _maxDisplayMs - elapsed;
    final waitMs    = minWait.clamp(0, maxWait.clamp(0, _maxDisplayMs));
    if (waitMs > 0) await Future.delayed(Duration(milliseconds: waitMs));

    if (!mounted) return;

    final isAuth = results[1] as bool;

    if (isAuth) {
      final userId = auth.user?['id'];
      if (userId != null) {
        chat.setAppConfig(appConfig);
        unawaited(chat.connectSocket(userId as int));
      }
      Navigator.of(context).pushReplacementNamed('/home');
    } else {
      Navigator.of(context).pushReplacementNamed('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    final h = MediaQuery.of(context).size.height;
    // Read config — if not loaded yet, defaults are fine (splash always shows briefly)
    final cfg = Provider.of<AppConfigProvider>(context).config;

    return Scaffold(
      backgroundColor: _kBg,
      body: SizedBox.expand(
        child: Stack(
          children: [

            // ── Static background ─────────────────────────────────────────────
            const Positioned.fill(
              child: RepaintBoundary(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [_kBg2, _kBg, Color(0xFFF0F4FF)],
                      stops: [0.0, 0.5, 1.0],
                    ),
                  ),
                ),
              ),
            ),

            // ── Wave ─────────────────────────────────────────────────────────
            const Positioned.fill(
              child: RepaintBoundary(
                child: CustomPaint(painter: _WavePainter()),
              ),
            ),

            // ── Dot grids ─────────────────────────────────────────────────────
            Positioned(
              top: h * 0.06, right: 18,
              child: const RepaintBoundary(
                child: Opacity(opacity: 0.10,
                    child: _DotGrid(rows: 7, cols: 9, color: _kBlue)),
              ),
            ),
            Positioned(
              bottom: h * 0.14, left: 14,
              child: const RepaintBoundary(
                child: Opacity(opacity: 0.07,
                    child: _DotGrid(rows: 5, cols: 6, color: _kBlue)),
              ),
            ),

            // ── All animated content ─────────────────────────────────────────
            Positioned.fill(
              child: Column(
                children: [
                  SizedBox(height: h * 0.26),

                  // ── Logo block ──────────────────────────────────────────────
                  FadeTransition(
                    opacity: _logoFade,
                    child: SlideTransition(
                      position: _logoSlide,
                      child: ScaleTransition(
                        scale: _logoScale,
                        child: _LogoBlock(
                          logoUrl: cfg.logoUrl,
                          companyName: cfg.companyName,
                          primaryColor: cfg.primaryColor,
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(height: 36),

                  // ── Badge ───────────────────────────────────────────────────
                  FadeTransition(
                    opacity: _badgeFade,
                    child: const _EnterpriseBadge(),
                  ),

                  const Spacer(),

                  // ── Tagline + progress bar ──────────────────────────────────
                  FadeTransition(
                    opacity: _taglineFade,
                    child: Padding(
                      padding: const EdgeInsets.only(bottom: 56),
                      child: _TaglineSection(companyName: cfg.companyName),
                    ),
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

// ── Logo block — dynamic from admin branding ──────────────────────────────────
class _LogoBlock extends StatelessWidget {
  final String logoUrl;
  final String companyName;
  final Color primaryColor;

  const _LogoBlock({
    required this.logoUrl,
    required this.companyName,
    required this.primaryColor,
  });

  @override
  Widget build(BuildContext context) {
    // Use admin primary color for gradient, fallback to brand blue
    final brandColor = primaryColor == const Color(0xFF0F172A) ? _kBlue : primaryColor;
    final brandDim   = Color.lerp(brandColor, Colors.black, 0.15) ?? brandColor;

    return Column(
      children: [
        // Logo container — shows custom logo image if set, else fingerprint icon
        Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [brandColor, brandDim],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(24),
            boxShadow: [
              BoxShadow(
                color: brandColor.withValues(alpha: 0.32),
                blurRadius: 28,
                offset: const Offset(0, 10),
              ),
              BoxShadow(
                color: brandColor.withValues(alpha: 0.12),
                blurRadius: 8,
                offset: const Offset(0, 3),
              ),
            ],
          ),
          child: logoUrl.isNotEmpty
              ? ClipRRect(
                  borderRadius: BorderRadius.circular(24),
                  child: logoUrl.startsWith('data:')
                      ? Image.memory(
                          Uri.parse(logoUrl).data!.contentAsBytes(),
                          fit: BoxFit.contain,
                          errorBuilder: (_, __, ___) => Image.asset(
                            'assets/icons/icon.png',
                            fit: BoxFit.contain,
                          ),
                        )
                      : Image.network(
                          logoUrl,
                          fit: BoxFit.contain,
                          errorBuilder: (_, __, ___) => Image.asset(
                            'assets/icons/icon.png',
                            fit: BoxFit.contain,
                          ),
                        ),
                )
              : ClipRRect(
                  borderRadius: BorderRadius.circular(24),
                  child: Image.asset(
                    'assets/icons/icon.png',
                    fit: BoxFit.contain,
                  ),
                ),
        ),
        const SizedBox(height: 28),
        Text(
          companyName.isNotEmpty ? companyName.split(' ').first : 'Alyah',
          style: const TextStyle(
            fontSize: 64,
            fontWeight: FontWeight.w900,
            color: _kNavy,
            letterSpacing: -2,
            height: 1.0,
          ),
        ),
        const SizedBox(height: 6),
        const Text(
          'SMART ATTENDANCE',
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: _kBlue,
            letterSpacing: 5,
          ),
        ),
      ],
    );
  }
}

// ── Enterprise badge — const widget ──────────────────────────────────────────
class _EnterpriseBadge extends StatelessWidget {
  const _EnterpriseBadge();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 11),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: _kBlue.withValues(alpha: 0.22),
          width: 1.5,
        ),
        boxShadow: [
          BoxShadow(
            color: _kBlue.withValues(alpha: 0.08),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: _kBlue.withValues(alpha: 0.10),
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.verified_rounded, size: 15, color: _kBlue),
          ),
          const SizedBox(width: 10),
          const Text(
            'Enterprise Workforce Platform',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: _kNavy,
              letterSpacing: 0.2,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Tagline + loader ──────────────────────────────────────────────────────────
class _TaglineSection extends StatelessWidget {
  final String companyName;
  const _TaglineSection({required this.companyName});

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        SizedBox(
          width: 52,
          child: LinearProgressIndicator(
            backgroundColor: _kBlue.withValues(alpha: 0.10),
            valueColor: const AlwaysStoppedAnimation(_kBlue),
            minHeight: 3,
          ),
        ),
        const SizedBox(height: 18),
        const Text(
          'SMARTER ATTENDANCE, BETTER FUTURE',
          style: TextStyle(
            fontSize: 9,
            fontWeight: FontWeight.w700,
            color: _kGray500,
            letterSpacing: 2.5,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          'Powered by Alyah Technologies',
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w500,
            color: _kGray400,
            letterSpacing: 0.3,
          ),
        ),
      ],
    );
  }
}

// ── Wave painter — fully static, const constructable ─────────────────────────
class _WavePainter extends CustomPainter {
  const _WavePainter();

  static final _paintBack = Paint()
    ..color = const Color(0x0A3B82F6) // blue @ ~4%
    ..style = PaintingStyle.fill;

  static final _paintFront = Paint()
    ..color = const Color(0x063B82F6) // blue @ ~2.5%
    ..style = PaintingStyle.fill;

  @override
  void paint(Canvas canvas, Size size) {
    final pathBack = Path()
      ..moveTo(0, size.height * 0.60)
      ..cubicTo(
        size.width * 0.22, size.height * 0.44,
        size.width * 0.58, size.height * 0.74,
        size.width,        size.height * 0.57,
      )
      ..lineTo(size.width, size.height)
      ..lineTo(0,          size.height)
      ..close();
    canvas.drawPath(pathBack, _paintBack);

    final pathFront = Path()
      ..moveTo(0, size.height * 0.70)
      ..cubicTo(
        size.width * 0.28, size.height * 0.54,
        size.width * 0.68, size.height * 0.82,
        size.width,        size.height * 0.66,
      )
      ..lineTo(size.width, size.height)
      ..lineTo(0,          size.height)
      ..close();
    canvas.drawPath(pathFront, _paintFront);
  }

  @override
  bool shouldRepaint(_WavePainter _) => false;
}

// ── Dot grid — pure static layout ────────────────────────────────────────────
class _DotGrid extends StatelessWidget {
  final int rows;
  final int cols;
  final Color color;
  const _DotGrid({required this.rows, required this.cols, required this.color});

  @override
  Widget build(BuildContext context) {
    final dot = Container(
      width: 3.5,
      height: 3.5,
      margin: const EdgeInsets.all(4.5),
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    );
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(
        rows,
        (_) => Row(
          mainAxisSize: MainAxisSize.min,
          children: List.generate(cols, (_) => dot),
        ),
      ),
    );
  }
}
