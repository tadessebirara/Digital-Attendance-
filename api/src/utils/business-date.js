const DEFAULT_TIME_ZONE = process.env.BUSINESS_TIMEZONE || process.env.TZ || 'Africa/Addis_Ababa';

function getBusinessParts(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);

  const part = (type) => parts.find((p) => p.type === type)?.value;
  return {
    year: Number(part('year')),
    month: Number(part('month')),
    day: Number(part('day')),
    weekday: part('weekday'),
  };
}

function getBusinessDateString(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const { year, month, day } = getBusinessParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getBusinessDayOfWeek(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[getBusinessParts(date, timeZone).weekday] ?? date.getDay();
}

function getBusinessMonthStart(date = new Date(), timeZone = DEFAULT_TIME_ZONE) {
  const { year, month } = getBusinessParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

module.exports = {
  DEFAULT_TIME_ZONE,
  getBusinessDateString,
  getBusinessDayOfWeek,
  getBusinessMonthStart,
  getBusinessParts,
};
