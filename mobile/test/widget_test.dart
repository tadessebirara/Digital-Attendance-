import 'package:alyah_smart_attendance/providers/announcement_provider.dart';
import 'package:alyah_smart_attendance/providers/app_config_provider.dart';
import 'package:alyah_smart_attendance/providers/attendance_provider.dart';
import 'package:alyah_smart_attendance/providers/auth_provider.dart';
import 'package:alyah_smart_attendance/providers/chat_provider.dart';
import 'package:alyah_smart_attendance/providers/leave_provider.dart';
import 'package:alyah_smart_attendance/providers/schedule_provider.dart';
import 'package:alyah_smart_attendance/providers/theme_provider.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

void main() {
  testWidgets('Provider shell builds app theme context', (WidgetTester tester) async {
    await tester.pumpWidget(
      MultiProvider(
        providers: [
          ChangeNotifierProvider(create: (_) => ThemeProvider()),
          ChangeNotifierProvider(create: (_) => AppConfigProvider()),
          ChangeNotifierProvider(create: (_) => AuthProvider()),
          ChangeNotifierProvider(create: (_) => AttendanceProvider()),
          ChangeNotifierProvider(create: (_) => LeaveProvider()),
          ChangeNotifierProvider(create: (_) => ChatProvider()),
          ChangeNotifierProvider(create: (_) => AnnouncementProvider()),
          ChangeNotifierProvider(create: (_) => ScheduleProvider()),
        ],
        child: Consumer<ThemeProvider>(
          builder: (_, themeProvider, __) => MaterialApp(
            themeMode: themeProvider.mode,
            home: const Scaffold(body: Text('Alyah Smart Attendance')),
          ),
        ),
      ),
    );

    expect(find.byType(MaterialApp), findsOneWidget);
    expect(find.text('Alyah Smart Attendance'), findsOneWidget);
  });
}
