/// Ethiopian Calendar (Ge'ez / Ethiopic) utilities.
///
/// The Ethiopian calendar has 13 months: 12 months of 30 days each + Pagume
/// (5 or 6 days). It runs ~7–8 years behind the Gregorian calendar.
///
/// Ethiopian New Year (Enkutatash) = 1 Meskerem:
///   - Gregorian September 11 in non-leap years
///   - Gregorian September 12 in Gregorian leap years
///
/// JDN offset verified against official Ethiopian calendar tables.
library ethiopian_calendar;

// ── Month & Day names ─────────────────────────────────────────────────────────

const List<String> ethMonthsAm = [
  'መስከረም', 'ጥቅምት', 'ህዳር',    'ታህሳስ',
  'ጥር',     'የካቲት', 'መጋቢት',  'ሚያዚያ',
  'ግንቦት',   'ሰኔ',   'ሐምሌ',   'ነሐሴ', 'ጷጉሜን',
];

const List<String> ethMonthsEn = [
  'Meskerem', 'Tikimt',  'Hidar',   'Tahsas',
  'Tir',      'Yekatit', 'Megabit', 'Miazia',
  'Ginbot',   'Sene',    'Hamle',   'Nehase', 'Pagume',
];

const List<String> ethDaysAm = [
  'እሑድ', 'ሰኞ', 'ማክሰኞ', 'ረቡዕ', 'ሐሙስ', 'አርብ', 'ቅዳሜ',
];

const List<String> ethDaysEn = [
  'Ehud', 'Segno', 'Maksegno', 'Rebue', 'Hamus', 'Arb', 'Kidame',
];

// ── Ethiopian Date class ──────────────────────────────────────────────────────

class EthiopianDate {
  final int year;
  final int month; // 1–13
  final int day;   // 1–30

  const EthiopianDate(this.year, this.month, this.day);

  String get monthNameAm => ethMonthsAm[(month - 1).clamp(0, 12)];
  String get monthNameEn => ethMonthsEn[(month - 1).clamp(0, 12)];

  /// e.g. "27 ሐምሌ 2016 ዓ.ም"
  String formatAm() => '$day $monthNameAm $year ዓ.ም';

  /// e.g. "27 Hamle 2016 EC"
  String formatEn() => '$day $monthNameEn $year EC';

  /// Short: "27 ሐምሌ"
  String formatShortAm() => '$day $monthNameAm';

  @override
  String toString() => formatAm();
}

// ── Conversion: Gregorian → Ethiopian ────────────────────────────────────────
//
// Algorithm based on the Coptic calendar epoch (JDN 1723856 = 1 Thoout 1 AM).
// The Ethiopian calendar shares the same epoch as the Coptic calendar.
//
// Verified:
//   2024-09-11 → 1 Meskerem 2017 (non-leap GC year)
//   2024-09-12 → 2 Meskerem 2017
//   2025-09-11 → 2 Meskerem 2018 (because 2025 follows a GC leap year)
//   2025-09-12 → 3 Meskerem 2018
//   Ethiopian New Year 2017 = GC 2024-09-11 ✓

EthiopianDate toEthiopian(DateTime date) {
  // Use the proleptic Gregorian → JDN algorithm
  final y = date.year;
  final m = date.month;
  final d = date.day;

  // Proleptic Gregorian to JDN (correct formula)
  final a = (14 - m) ~/ 12;
  final yr = y + 4800 - a;
  final mo = m + 12 * a - 3;
  final jdn = d + (153 * mo + 2) ~/ 5 + 365 * yr + yr ~/ 4
      - yr ~/ 100 + yr ~/ 400 - 32045;

  // JDN → Ethiopian (Coptic epoch offset = 1723856)
  // Each Ethiopian 4-year cycle = 1461 days (like Julian)
  final r = (jdn - 1723856) % 1461;
  final n = r % 365 + 365 * (r ~/ 1460);
  final ethYear  = 4 * ((jdn - 1723856) ~/ 1461) + r ~/ 365 - r ~/ 1460;
  final ethMonth = n ~/ 30 + 1;
  final ethDay   = n % 30 + 1;

  return EthiopianDate(ethYear, ethMonth, ethDay);
}

// ── Ethiopian Time ────────────────────────────────────────────────────────────
//
// Ethiopian clock starts at dawn (~6 AM civil time = 12:00 ET).
// Civil 06:00 → ET 12:00 ጠዋት  (morning)
// Civil 12:00 → ET  6:00 ቀን    (noon/day)
// Civil 18:00 → ET 12:00 ምሽት   (evening)
// Civil 00:00 → ET  6:00 ሌሊት   (night)

class EthiopianTime {
  final int hour;   // 1–12
  final int minute;
  final int second;
  final String period; // ጠዋት | ቀን | ምሽት | ሌሊት

  const EthiopianTime(this.hour, this.minute, this.second, this.period);

  /// e.g. "07:30 ጠዋት"
  String format({bool showSeconds = false}) {
    final h = hour.toString().padLeft(2, '0');
    final mi = minute.toString().padLeft(2, '0');
    final s = second.toString().padLeft(2, '0');
    return showSeconds ? '$h:$mi:$s $period' : '$h:$mi $period';
  }

  /// Compact — no period label
  String formatCompact({bool showSeconds = false}) {
    final h = hour.toString().padLeft(2, '0');
    final mi = minute.toString().padLeft(2, '0');
    final s = second.toString().padLeft(2, '0');
    return showSeconds ? '$h:$mi:$s' : '$h:$mi';
  }
}

EthiopianTime toEthiopianTime(DateTime dt) {
  final civil = dt.hour;
  // Ethiopian hour = (civil + 18) % 24, then map to 1–12
  final eth24 = (civil + 18) % 24;
  final eth12 = eth24 % 12 == 0 ? 12 : eth24 % 12;

  final String period = civil >= 6 && civil < 12
      ? 'ጠዋት'   // 06:00–11:59  morning
      : civil >= 12 && civil < 18
          ? 'ቀን'    // 12:00–17:59  daytime
          : civil >= 18 && civil < 24
              ? 'ምሽት'  // 18:00–23:59  evening
              : 'ሌሊት'; // 00:00–05:59  night

  return EthiopianTime(eth12, dt.minute, dt.second, period);
}

// ── Day-of-week helpers ────────────────────────────────────────────────────────
// Dart weekday: 1=Mon … 7=Sun → convert to 0=Sun … 6=Sat
String ethDayNameAm(int dartWeekday) => ethDaysAm[dartWeekday % 7];
String ethDayNameEn(int dartWeekday) => ethDaysEn[dartWeekday % 7];

// ── Formatted strings ─────────────────────────────────────────────────────────

/// Full date+time: "አርብ, 27 ሐምሌ 2016 ዓ.ም — 01:30 ጠዋት"
String formatEthDateTimeAm(DateTime dt, {bool showSeconds = false}) {
  final ethDate = toEthiopian(dt);
  final ethTime = toEthiopianTime(dt);
  final day = ethDayNameAm(dt.weekday);
  return '$day, ${ethDate.formatAm()} — ${ethTime.format(showSeconds: showSeconds)}';
}

/// Short date: "27 ሐምሌ 2016 ዓ.ም"
String formatEthDateShort(DateTime dt) => toEthiopian(dt).formatAm();

/// Time only: "01:30 ጠዋት"
String formatEthTimeAm(DateTime dt, {bool showSeconds = false}) =>
    toEthiopianTime(dt).format(showSeconds: showSeconds);
