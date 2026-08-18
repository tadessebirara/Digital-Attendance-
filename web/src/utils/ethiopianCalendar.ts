/**
 * Ethiopian Calendar utilities (shared across all web pages).
 *
 * The Ethiopian calendar (Ge'ez / Ethiopic) shares the Coptic epoch.
 * Ethiopian New Year (Enkutatash) = 1 Meskerem:
 *   - GC September 11 in non-leap Gregorian years
 *   - GC September 12 in leap Gregorian years (years divisible by 4,
 *     except century years not divisible by 400)
 *
 * Verified reference points:
 *   GC 2024-09-11 → 1 Meskerem 2017 EC  ✓
 *   GC 2025-09-12 → 3 Meskerem 2018 EC  (2025 follows GC leap year 2024)
 *   GC 2023-09-11 → 1 Meskerem 2016 EC  ✓
 */

export const ETH_MONTHS_AM = [
  'መስከረም','ጥቅምት','ህዳር','ታህሳስ',
  'ጥር','የካቲት','መጋቢት','ሚያዚያ',
  'ግንቦት','ሰኔ','ሐምሌ','ነሐሴ','ጷጉሜን',
];

export const ETH_MONTHS_EN = [
  'Meskerem','Tikimt','Hidar','Tahsas',
  'Tir','Yekatit','Megabit','Miazia',
  'Ginbot','Sene','Hamle','Nehase','Pagume',
];

export const ETH_DAYS_AM = ['እሑድ','ሰኞ','ማክሰኞ','ረቡዕ','ሐሙስ','አርብ','ቅዳሜ'];

export interface EthDate { y: number; m: number; d: number; }

/** Convert Gregorian date numbers to Ethiopian calendar. */
export function toEthiopian(year: number, month: number, day: number): EthDate {
  // Step 1: Gregorian → JDN (proleptic Gregorian algorithm)
  const a = Math.floor((14 - month) / 12);
  const yr = year + 4800 - a;
  const mo = month + 12 * a - 3;
  const jdn = day
    + Math.floor((153 * mo + 2) / 5)
    + 365 * yr
    + Math.floor(yr / 4)
    - Math.floor(yr / 100)
    + Math.floor(yr / 400)
    - 32045;

  // Step 2: JDN → Ethiopian (Coptic epoch = JDN 1723856)
  const r = (jdn - 1723856) % 1461;
  const n = (r % 365) + 365 * Math.floor(r / 1460);
  const ethYear  = 4 * Math.floor((jdn - 1723856) / 1461) + Math.floor(r / 365) - Math.floor(r / 1460);
  const ethMonth = Math.floor(n / 30) + 1;
  const ethDay   = (n % 30) + 1;

  return { y: ethYear, m: ethMonth, d: ethDay };
}

/** Format an Ethiopian date as "27 ሐምሌ 2016 ዓ.ም" */
export function formatEthDateAm(eth: EthDate): string {
  const monthName = ETH_MONTHS_AM[(eth.m - 1) % 13] ?? '';
  return `${eth.d} ${monthName} ${eth.y} ዓ.ም`;
}

/** Format an Ethiopian date as "27 Hamle 2016 EC" */
export function formatEthDateEn(eth: EthDate): string {
  const monthName = ETH_MONTHS_EN[(eth.m - 1) % 13] ?? '';
  return `${eth.d} ${monthName} ${eth.y} EC`;
}

/** Format from a YYYY-MM-DD string: "27 ሐምሌ 2016 ዓ.ም" */
export function formatEthDateFromStr(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  return formatEthDateAm(toEthiopian(y, m, d));
}

/** Returns "GC Sep 11, 2024 → 1 Meskerem 2017 ዓ.ም" style dual label */
export function dualDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const eth = toEthiopian(d.getFullYear(), d.getMonth() + 1, d.getDate());
  const grLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${grLabel}  🇪🇹 ${formatEthDateAm(eth)}`;
}
