/// App-wide string localisation.
///
/// Usage (anywhere in a widget):
///   final s = AppStrings.of(context);
///   Text(s.checkIn)
///
/// Supports: English (default) and አማርኛ (Amharic).
/// Language is driven by ThemeProvider.language which the user sets in
/// Profile → Appearance.  Defaults to English if not set.
library app_strings;

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/theme_provider.dart';

class AppStrings {
  final bool _am; // true = Amharic, false = English

  const AppStrings._(this._am);

  /// Whether Amharic is active — can be used for inline ternaries.
  bool get isAmharic => _am;

  /// Get the strings instance for the current language setting.
  static AppStrings of(BuildContext context) {
    final lang = Provider.of<ThemeProvider>(context, listen: false).language;
    return AppStrings._(lang == 'Amharic');
  }

  // ── Schedule screen ────────────────────────────────────────────────────────
  String get scheduleEyebrow     => _am ? 'የሥራ ፕሮግራም — ሥርዓት' : 'Work Schedule';
  String get scheduleTitle       => _am ? 'ሥርዓት'               : 'Schedule';
  String get shiftDetails        => _am ? 'የዕለት ሥርዓት'          : 'Shift Details';
  String get checkIn             => _am ? 'ወደ ሥራ መግቢያ'         : 'Check In';
  String get checkOut            => _am ? 'ከሥራ መውጫ'            : 'Check Out';
  String get restDay             => _am ? 'ዕረፍት ቀን'             : 'Rest Day';
  String get noShiftScheduled    => _am ? 'ለዚህ ቀን ሥርዓት አልተዘጋጀም።' : 'No shift scheduled for this day.';
  String get publicHoliday       => _am ? 'በዓል ቀን'              : 'Public Holiday';
  String get scheduledOff        => _am ? 'ዕረፍት'                : 'Day Off';
  String get workingDay          => _am ? 'ሥራ ቀን'               : 'Working';
  String get noAttendanceRequired => _am
      ? 'ዛሬ ትምህርት አያስፈልግም — ቀን አትቀጣም።'
      : 'No attendance required today. You will not be marked absent.';

  String gracePeriod(String minutes) => _am
      ? 'የዘግይቶ ቅጣት: ሥርዓቱ ከጀመረ ከ$minutes ደቂቃ በኋላ ዘግይቶ ይቆጠራል።'
      : 'Grace period: $minutes minutes before late status applies.';

  String get shiftActionsDisabled => _am
      ? 'ለዕረፍት ቀናት የሥርዓት እርምጃዎች ተዘግተዋል።'
      : 'Shift actions are disabled for non-working days.';

  // ── Legend pills ────────────────────────────────────────────────────────────
  String get legendWorking => _am ? 'ሥራ ቀን' : 'Working';
  String get legendOff     => _am ? 'ዕረፍት'  : 'Day Off';
  String get legendHoliday => _am ? 'በዓል'   : 'Holiday';
  String get legendToday   => _am ? 'ዛሬ'    : 'Today';

  // ── Dashboard ──────────────────────────────────────────────────────────────
  String get dashboardEyebrow   => _am ? 'የሥራ ዳሽቦርድ'       : 'Attendance Dashboard';
  String helloName(String name) => _am ? 'ሰላም, $name 👋'    : 'Hello, $name 👋';
  String get checkInTitle       => _am ? 'ወደ ሥራ ግባ'         : 'Check In';
  String get checkOutTitle      => _am ? 'ከሥራ ውጣ'           : 'Check Out';
  String get scanQR             => _am ? 'QR ቃኝ'             : 'Scan QR';
  String get scheduleShort      => _am ? 'ሥርዓት'             : 'Schedule';
  String get requestLeave       => _am ? 'ፈቃድ ጠይቅ'          : 'Request Leave';
  String get history            => _am ? 'ታሪክ'               : 'History';
  String get onLeave            => _am ? 'በፈቃድ ላይ'           : 'On Leave';
  String get halfDayHoliday     => _am ? 'ግማሽ ቀን በዓል'        : 'Half-day holiday';
  String get lateCheckIn        => _am ? 'ዘግይቷል — ቃኝ'        : 'Late — tap to check in';
  String get tapToScan          => _am ? 'ለቃኘት ጠቅ አድርግ'      : 'Tap to scan QR';
  String get attendanceComplete => _am ? 'ዛሬ ተጠናቅቋል'         : 'Completed today';
  String get nextAction         => _am ? 'ቀጣይ እርምጃ'          : 'Next action';
  String get completed          => _am ? 'ተጠናቅቋል'            : 'Completed';
  String get lunchOut           => _am ? 'የምሳ ዕረፍት'           : 'Lunch out';
  String get startShift         => _am ? 'ሥራ ጀምር'            : 'Start shift';
  String get monthlyAttendance  => _am ? 'ወርሃዊ ትምህርት'         : 'Monthly Attendance';
  String get present            => _am ? 'ተገኝቷል'              : 'Present';
  String get late               => _am ? 'ዘግይቷል'              : 'Late';
  String get absent             => _am ? 'አልተገኘም'             : 'Absent';
  String get pendingStatus      => _am ? 'በመጠባበቅ ላይ'          : 'Pending';
  String get onTrack            => _am ? 'በሂደት ላይ'            : 'On Track';
  String get locationVerified   => _am ? 'ቦታ ተረጋግጧል'          : 'Location verified for this session';
  String get readyOnSite        => _am ? 'ሲደርሱ ዝግጁ ነው'        : 'Ready when you arrive on site';

  // ── Alerts screen ──────────────────────────────────────────────────────────
  String get alertsEyebrow  => _am ? 'ማሳወቂያዎች'   : 'Company Alerts';
  String get alertsTitle    => _am ? 'ማስታወቂያዎች'  : 'Announcements';
  String get noAlerts       => _am ? 'ማስታወቂያ የለም' : 'No announcements yet';
  String get noAlertsSubtitle => _am ? 'አዲስ ማስታወቂያዎች እዚህ ይታያሉ።' : 'New company announcements will appear here.';

  // ── Leave screen ───────────────────────────────────────────────────────────
  String get leaveEyebrow     => _am ? 'ፈቃድ'             : 'Time Off';
  String get leaveTitle       => _am ? 'የፈቃድ አስተዳደር'     : 'Leave Management';
  String get newRequest       => _am ? 'አዲስ ጥያቄ'          : 'New Request';
  String get myHistory        => _am ? 'ታሪኬ'              : 'My History';
  String get submitRequest    => _am ? 'ጥያቄ ላክ'           : 'Submit Leave Request';
  String get leaveType        => _am ? 'የፈቃድ ዓይነት'        : 'Leave Type';
  String get duration         => _am ? 'ጊዜ'               : 'Duration';
  String get startDate        => _am ? 'መጀመሪያ ቀን'         : 'Start Date';
  String get endDate          => _am ? 'መጨረሻ ቀን'          : 'End Date';
  String get reason           => _am ? 'ምክንያት'            : 'Reason for Leave';
  String get document         => _am ? 'ሰነድ'              : 'Supporting Document';
  String get noLeaveYet       => _am ? 'ጥያቄ አልቀረበም'        : 'No leave requests yet';
  String get noLeaveSubtitle  => _am ? 'የቀረቡ ጥያቄዎች እዚህ ይታያሉ።' : 'Your submitted requests will appear here.';
  String get inReview         => _am ? 'በግምገማ ላይ'          : 'In Review';
  String get approvedByHR     => _am ? 'በሰው ሃብት ፀደቀ'       : 'Approved by HR';
  String get notApproved      => _am ? 'ጥያቄው አልፀደቀም።'      : 'Request was not approved.';
  String get pendingApproval  => _am ? 'እያጠበቀ ነው'           : 'Pending Approval';
  String get reasonForLeave   => _am ? 'ምክንያቱን አስቀምጥ...'   : 'Briefly describe your reason...';
  String get tapToUpload      => _am ? 'ሰነድ ለማስቀመጥ ጠቅ አድርግ' : 'Tap to upload document';
  String get requiredForSick  => _am ? 'ለታምሚ ፈቃድ አስፈላጊ'    : 'REQUIRED FOR SICK LEAVE';
  String daysCount(int n)     => _am ? '$n ቀን'              : '$n day(s)';

  // ── Window timing helpers ──────────────────────────────────────────────
  String get checkInWindowClosed  => _am ? 'የቅበላ ሰዓት አልፏል — ዛሬ መግቢያ አይቻልም' : 'Window closed — check-in no longer available';
  String get checkOutTooEarly     => _am ? 'ቀደም ሲል መውጣት አይቻልም'              : 'Too early to check out';
  String get notAWorkingDay       => _am ? 'ዛሬ የሥራ ቀን አይደለም'                 : 'Not a working day today';
  String get absentNoCheckout     => _am ? 'ተረጋግጧል — Check Out ሳያደርጉ ቀርቷል'   : 'Day closed — you checked in but never checked out';
  String checkOutAvailableAt(String time) => _am
      ? 'ከ$time በፊት መውጣት አይቻልም'
      : 'Check out available after $time';
  String windowClosesAt(String time) => _am
      ? 'ሥርዓቱ $time ይዘጋል'
      : 'Window closes at $time';
  String onLeaveToday(String lt) => _am
      ? 'ዛሬ $lt ፈቃድ አለዎት — ትምህርት አያስፈልግም።'
      : 'You have approved $lt today — attendance recording is disabled.';
  String get alreadyCompleted    => _am ? 'ዛሬ ትምህርት ተጠናቅቋል።'              : 'Attendance already completed for today.';
  String get alreadyCheckedIn    => _am ? 'ተመዝግቧል። ለመውጣት Check Out ይጠቀሙ።' : 'Already checked in. Use Check Out to clock out.';
  String get checkInFirst        => _am ? 'ከ Check In በፊት Check Out አይቻልም።' : 'Please check in first before checking out.';
  String get offlineMessage      => _am ? 'ከኢንተርኔት ተቋርጧል። ድጋሚ ሞክሩ።'        : 'You are offline. Connect and try again.';
  String approvedLeaveToday(String lt) => _am
      ? 'ዛሬ $lt ፈቃድ አለዎት — ትምህርት አያስፈልግም።'
      : 'You have approved ${lt.isNotEmpty ? lt : 'leave'} today — attendance is not required.';

  // ── Attendance history ─────────────────────────────────────────────────────
  String get historyEyebrow => _am ? 'ትምህርት'         : 'Attendance';
  String get historyTitle   => _am ? 'ታሪክ'            : 'History';
  String get noRecords      => _am ? 'መዝገብ አልተገኘም'    : 'No records found';
  String get noRecordsSub   => _am ? 'ለዚህ ጊዜ መዝገብ የለም' : 'No attendance records for this period.';
  String get daily          => _am ? 'ዕለታዊ'           : 'DAILY';
  String get weekly         => _am ? 'ሳምንታዊ'          : 'WEEKLY';
  String get monthly        => _am ? 'ወርሃዊ'           : 'MONTHLY';

  // ── Bottom nav ─────────────────────────────────────────────────────────────
  String get navHome     => _am ? 'ቤት'     : 'Home';
  String get navAlerts   => _am ? 'ማሳወቂያ'  : 'Alerts';
  String get navLeave    => _am ? 'ፈቃድ'    : 'Leave';
  String get navHistory  => _am ? 'ታሪክ'    : 'History';
  String get navSchedule => _am ? 'ሥርዓት'  : 'Schedule';
  String get navChat     => _am ? 'ውይይት'  : 'Chat';
  String get navProfile  => _am ? 'መገለጫ'  : 'Profile';
}
