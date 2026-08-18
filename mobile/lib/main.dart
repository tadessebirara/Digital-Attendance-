import 'dart:async' show runZonedGuarded, unawaited, StreamSubscription;
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:logger/logger.dart';
import 'package:app_links/app_links.dart';
import 'providers/auth_provider.dart';
import 'providers/attendance_provider.dart';
import 'providers/leave_provider.dart';
import 'providers/chat_provider.dart';
import 'providers/announcement_provider.dart';
import 'providers/schedule_provider.dart';
import 'providers/app_config_provider.dart';
import 'providers/theme_provider.dart';
import 'providers/location_provider.dart';
import 'services/api_service.dart';
import 'screens/splash_screen.dart';
import 'screens/login_screen.dart';
import 'screens/forgot_password_screen.dart';
import 'screens/email_otp_screen.dart';
import 'screens/complete_activation_screen.dart';
import 'screens/replace_device_screen.dart';
import 'screens/reset_password_screen.dart';
import 'screens/pending_approval_screen.dart';
import 'screens/main_shell.dart';
import 'screens/chat/chat_screen.dart';
import 'screens/chat/chat_list_screen.dart';
import 'screens/leave/leave_management_screen.dart';
import 'screens/alerts_screen.dart';
import 'screens/attendance/attendance_history_screen.dart';
import 'screens/admin/office_management_screen.dart';
import 'screens/schedule/schedule_screen.dart';
import 'screens/profile/documents_screen.dart';
import 'utils/app_theme.dart';

final GlobalKey<NavigatorState> navigatorKey = GlobalKey<NavigatorState>();
final Logger _logger = Logger();

// Routes that are part of an auth flow — a 401 must NOT wipe these screens.
const Set<String> authFlowRoutes = {
  '/email-otp',
  '/complete-activation',
  '/replace-device',
  '/reset-password',
  '/pending-approval',
  '/forgot-password',
  '/login',
  '/register',
};

/// Called by ApiService when a token refresh fails (session truly expired).
void handleSessionExpired() {
  final navigator = navigatorKey.currentState;
  if (navigator == null) return;

  String? currentRoute;
  navigator.popUntil((route) {
    currentRoute = route.settings.name;
    return true;
  });

  if (currentRoute != null && authFlowRoutes.contains(currentRoute)) {
    _logger.w('[Session] 401 ignored — user is on auth flow screen: $currentRoute');
    return;
  }

  _logger.w('[Session] Token expired — redirecting to login');
  navigator.pushNamedAndRemoveUntil('/login', (_) => false);
}

void main() {
  runZonedGuarded(() async {
    WidgetsFlutterBinding.ensureInitialized();

    ApiService.sessionExpiredHandler = handleSessionExpired;

    // Warm up token + deviceId cache before first frame
    unawaited(Future.wait([
      ApiService.instance.getToken(),
      ApiService.instance.getDeviceId(),
    ]));

    ErrorWidget.builder = (FlutterErrorDetails details) {
      return Material(
        child: Container(
          color: AppTheme.bg,
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline_rounded, size: 64, color: AppTheme.danger),
              const SizedBox(height: 24),
              const Text('Application Error',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: AppTheme.gray900)),
              const SizedBox(height: 8),
              const Text(
                'An unexpected error occurred. We have logged the issue and are working on it.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppTheme.gray500, fontSize: 14),
              ),
              const SizedBox(height: 32),
              ElevatedButton(
                onPressed: () =>
                    navigatorKey.currentState?.pushNamedAndRemoveUntil('/', (_) => false),
                style: ElevatedButton.styleFrom(backgroundColor: AppTheme.primary),
                child: const Text('RESTART APP'),
              ),
            ],
          ),
        ),
      );
    };

    runApp(
      MultiProvider(
        providers: [
          // ── Critical providers — needed before/during splash ──────────────
          ChangeNotifierProvider(create: (_) => ThemeProvider()),
          ChangeNotifierProvider(create: (_) => AppConfigProvider()),
          ChangeNotifierProvider(create: (_) => AuthProvider()),
          ChangeNotifierProvider(create: (_) => LocationProvider(), lazy: true),
          // ── Post-login providers — lazy so they don't block startup ────────
          ChangeNotifierProvider(create: (_) => ChatProvider(), lazy: true),
          ChangeNotifierProvider(create: (_) => AttendanceProvider(), lazy: true),
          ChangeNotifierProvider(create: (_) => LeaveProvider(), lazy: true),
          ChangeNotifierProvider(create: (_) => AnnouncementProvider(), lazy: true),
          ChangeNotifierProvider(create: (_) => ScheduleProvider(), lazy: true),
        ],
        child: const MyApp(),
      ),
    );
  }, (error, stack) {
    _logger.e('CRITICAL_CRASH: $error', error: error, stackTrace: stack);
  });
}

class MyApp extends StatefulWidget {
  const MyApp({super.key});

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> with WidgetsBindingObserver {
  late final AppLinks _appLinks;
  StreamSubscription<Uri>? _linkSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initDeepLinks();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _linkSub?.cancel();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // intentionally empty — no redirect on resume/foreground
  }

  void _initDeepLinks() {
    _appLinks = AppLinks();

    _appLinks.getInitialLink().then((uri) {
      if (uri == null) return;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        Future.delayed(const Duration(milliseconds: 300), () {
          if (mounted) _handleDeepLink(uri);
        });
      });
    }).catchError((_) {});

    _linkSub = _appLinks.uriLinkStream.listen(
      _handleDeepLink,
      onError: (_) {},
    );
  }

  void _handleDeepLink(Uri uri) {
    _logger.i('[DeepLink] Received: $uri');
    final host = uri.host;
    final path = uri.path;

    if (host == 'login' || path == '/login') {
      navigatorKey.currentState?.pushNamedAndRemoveUntil('/login', (_) => false);
      return;
    }

    if (host == 'verify-email' || path == '/verify-email') {
      final email = uri.queryParameters['email'];
      if (email != null && email.isNotEmpty) {
        final nav = navigatorKey.currentState;
        if (nav == null) {
          Future.delayed(const Duration(milliseconds: 500), () => _handleDeepLink(uri));
          return;
        }
        nav.pushNamed('/email-otp', arguments: {
          'email': email,
          'flow': 'activation',
        });
      }
      return;
    }

    if (host == 'reset-password' || path == '/reset-password') {
      final token = uri.queryParameters['token'];
      _logger.i('[DeepLink] reset-password → token length: ${token?.length ?? 0}');
      if (token != null && token.isNotEmpty) {
        final nav = navigatorKey.currentState;
        if (nav == null) {
          _logger.w('[DeepLink] navigator not ready — retrying in 500ms');
          Future.delayed(const Duration(milliseconds: 500), () => _handleDeepLink(uri));
          return;
        }
        nav.pushNamed('/reset-password', arguments: token);
      }
      return;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Consumer2<ThemeProvider, AppConfigProvider>(
      builder: (_, themeProvider, configProvider, __) {
        final primaryColor = configProvider.config.primaryColor;
        final lightTheme = AppTheme.light.copyWith(
          colorScheme: AppTheme.light.colorScheme.copyWith(
            primary: primaryColor,
            onPrimary: Colors.white,
          ),
          elevatedButtonTheme: ElevatedButtonThemeData(
            style: AppTheme.light.elevatedButtonTheme.style?.copyWith(
              backgroundColor: WidgetStateProperty.resolveWith((states) {
                if (states.contains(WidgetState.disabled)) return primaryColor.withValues(alpha: 0.5);
                return primaryColor;
              }),
            ) ?? ElevatedButton.styleFrom(backgroundColor: primaryColor, foregroundColor: Colors.white),
          ),
        );

        return MaterialApp(
          title: configProvider.config.companyName.isNotEmpty
              ? configProvider.config.companyName
              : 'Alyah Smart Attendance',
          debugShowCheckedModeBanner: false,
          theme: lightTheme,
          darkTheme: AppTheme.dark,
          themeMode: themeProvider.mode,
          navigatorKey: navigatorKey,
          initialRoute: '/',
          // ── Single route table with smooth fade+slide transitions ──────────
          // Do NOT add a `routes:` table — it would take priority over
          // onGenerateRoute and all custom transitions would be skipped.
          onGenerateRoute: (settings) {
            final routes = <String, WidgetBuilder>{
              '/':                    (_) => const SplashScreen(),
              '/login':               (_) => const LoginScreen(),
              '/register':            (_) => const LoginScreen(),
              '/forgot-password':     (_) => const ForgotPasswordScreen(),
              '/email-otp':           (_) => const EmailOtpScreen(),
              '/complete-activation': (_) => const CompleteActivationScreen(),
              '/replace-device':      (_) => const ReplaceDeviceScreen(),
              '/reset-password':      (_) => const ResetPasswordScreen(),
              '/pending-approval':    (_) => const PendingApprovalScreen(),
              '/home':                (_) => const MainShell(),
              '/chat':                (_) => const ChatScreen(),
              '/chat-list':           (_) => const ChatListScreen(),
              '/leave':               (_) => const LeaveManagementScreen(),
              '/alerts':              (_) => const AlertsScreen(),
              '/history':             (_) => const AttendanceHistoryScreen(),
              '/schedule':            (_) => const ScheduleScreen(),
              '/documents':           (_) => const EmployeeDocumentsScreen(),
              '/admin/offices':       (_) => const OfficeManagementScreen(),
            };
            final builder = routes[settings.name];
            if (builder == null) return null;
            return PageRouteBuilder(
              settings: settings,
              pageBuilder: (ctx, a, sa) => builder(ctx),
              transitionsBuilder: (ctx, a, sa, child) => FadeTransition(
                opacity: CurvedAnimation(parent: a, curve: Curves.easeOut),
                child: SlideTransition(
                  position: Tween<Offset>(
                    begin: const Offset(0.03, 0),
                    end: Offset.zero,
                  ).animate(CurvedAnimation(parent: a, curve: Curves.easeOutCubic)),
                  child: child,
                ),
              ),
              transitionDuration: const Duration(milliseconds: 260),
              reverseTransitionDuration: const Duration(milliseconds: 220),
            );
          },
        );
      },
    );
  }
}
