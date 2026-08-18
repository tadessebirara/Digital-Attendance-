import 'package:flutter/material.dart';
import '../utils/app_theme.dart';

/// Animated shimmer effect for skeleton loaders.
class Shimmer extends StatefulWidget {
  final Widget child;

  const Shimmer({super.key, required this.child});

  @override
  State<Shimmer> createState() => _ShimmerState();
}

class _ShimmerState extends State<Shimmer> with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1400),
    )..repeat();
    _anim = Tween<double>(begin: -2, end: 2).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeInOutSine),
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final base   = isDark ? const Color(0xFF1E293B) : const Color(0xFFE8EBF0);
    final shine  = isDark ? const Color(0xFF2D3F52) : const Color(0xFFF3F5F7);

    return AnimatedBuilder(
      animation: _anim,
      child: widget.child,
      builder: (context, child) {
        return ShaderMask(
          blendMode: BlendMode.srcATop,
          shaderCallback: (rect) {
            return LinearGradient(
              begin: Alignment(-1 + _anim.value * 0.5, 0),
              end: Alignment(1 + _anim.value * 0.5, 0),
              colors: [base, shine, base],
              stops: const [0.0, 0.5, 1.0],
            ).createShader(rect);
          },
          child: child,
        );
      },
    );
  }
}

/// A single shimmer box — use to build skeleton layouts.
class ShimmerBox extends StatelessWidget {
  final double width;
  final double height;
  final double radius;

  const ShimmerBox({
    super.key,
    required this.width,
    required this.height,
    this.radius = 10,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E293B) : const Color(0xFFE8EBF0),
        borderRadius: BorderRadius.circular(radius),
      ),
    );
  }
}

/// Dashboard card skeleton.
class DashboardSkeleton extends StatelessWidget {
  const DashboardSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(18, 10, 18, 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Top strip
            Row(children: [
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const ShimmerBox(width: 120, height: 12),
                const SizedBox(height: 6),
                const ShimmerBox(width: 180, height: 22),
              ]),
              const Spacer(),
              const ShimmerBox(width: 44, height: 44, radius: 16),
              const SizedBox(width: 10),
              const ShimmerBox(width: 44, height: 44, radius: 16),
            ]),
            const SizedBox(height: 18),
            // Announcement hero
            const ShimmerBox(width: double.infinity, height: 140, radius: 24),
            const SizedBox(height: 18),
            // Session card
            const ShimmerBox(width: double.infinity, height: 220, radius: 24),
            const SizedBox(height: 18),
            // Action tiles
            Row(children: [
              Expanded(child: const ShimmerBox(width: double.infinity, height: 88, radius: 20)),
              const SizedBox(width: 14),
              Expanded(child: const ShimmerBox(width: double.infinity, height: 88, radius: 20)),
            ]),
          ],
        ),
      ),
    );
  }
}

/// Leave list skeleton.
class LeaveListSkeleton extends StatelessWidget {
  const LeaveListSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: Column(
        children: List.generate(4, (_) => Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Theme.of(context).brightness == Brightness.dark
                  ? const Color(0xFF1E293B) : Colors.white,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(children: [
              const ShimmerBox(width: 40, height: 40, radius: 20),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const ShimmerBox(width: 120, height: 14),
                const SizedBox(height: 6),
                const ShimmerBox(width: 80, height: 11),
              ])),
              const ShimmerBox(width: 60, height: 24, radius: 6),
            ]),
          ),
        )),
      ),
    );
  }
}

/// Chat message list skeleton.
class ChatSkeleton extends StatelessWidget {
  const ChatSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(children: [
          _bubble(isMe: false, width: 220),
          const SizedBox(height: 12),
          _bubble(isMe: true, width: 160),
          const SizedBox(height: 12),
          _bubble(isMe: false, width: 180),
          const SizedBox(height: 12),
          _bubble(isMe: true, width: 240),
          const SizedBox(height: 12),
          _bubble(isMe: false, width: 200),
        ]),
      ),
    );
  }

  Widget _bubble({required bool isMe, required double width}) {
    return Row(
      mainAxisAlignment: isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
      children: [
        if (!isMe) ...[
          const ShimmerBox(width: 30, height: 30, radius: 15),
          const SizedBox(width: 8),
        ],
        ShimmerBox(width: width, height: 44, radius: 18),
        if (isMe) const SizedBox(width: 8),
      ],
    );
  }
}

/// Generic list skeleton for announcements / alerts.
class AlertListSkeleton extends StatelessWidget {
  const AlertListSkeleton({super.key});

  @override
  Widget build(BuildContext context) {
    return Shimmer(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(children: List.generate(3, (_) => Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: Container(
            decoration: BoxDecoration(
              color: Theme.of(context).brightness == Brightness.dark
                  ? const Color(0xFF1E293B) : Colors.white,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Column(children: [
              Container(
                height: 36,
                decoration: const BoxDecoration(
                  color: Color(0xFFE8EBF0),
                  borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const ShimmerBox(width: 200, height: 16),
                  const SizedBox(height: 8),
                  const ShimmerBox(width: double.infinity, height: 12),
                  const SizedBox(height: 4),
                  const ShimmerBox(width: 260, height: 12),
                ]),
              ),
            ]),
          ),
        ))),
      ),
    );
  }
}
