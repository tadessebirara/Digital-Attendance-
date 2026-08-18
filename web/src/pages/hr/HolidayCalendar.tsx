import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import {
  ChevronLeft, ChevronRight, Calendar, Plus, Trash2,
  RefreshCw, Star, X, AlertCircle, CheckCircle, Pencil, Upload,
} from 'lucide-react';
import {
  toEthiopian, formatEthDateAm, formatEthDateFromStr,
  ETH_MONTHS_AM as ETH_MONTHS, ETH_DAYS_AM,
} from '../../utils/ethiopianCalendar';
import { ConfirmModal, useConfirm } from '../../components/common';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Holiday {
  id: number;
  name: string;
  nameAm?: string;
  date: string;           // YYYY-MM-DD
  type: string;           // NATIONAL | RELIGIOUS | OPTIONAL
  religion?: string;
  isRecurring: boolean;
  description?: string;
  offType?: string;       // FULL_DAY | HALF_DAY
}

// ─── Constants ────────────────────────────────────────────────────────────────
const GR_MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const GR_DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function firstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
const isWeekend = (dow: number) => dow === 0;

const TYPE_COLOR: Record<string, string> = {
  NATIONAL:  'bg-accent-500',
  RELIGIOUS: 'bg-amber-500',
  OPTIONAL:  'bg-sky-500',
};
const TYPE_LIGHT: Record<string, string> = {
  NATIONAL:  'bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-300 border-accent-200 dark:border-accent-500/30',
  RELIGIOUS: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
  OPTIONAL:  'bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-500/30',
};
const religionIcon = (r?: string) =>
  r === 'CHRISTIAN' ? '✝️' : r === 'MUSLIM' ? '☪️' : '🇪🇹';

// ─── Ethiopian fixed holidays (Gregorian dates) ──────────────────────────────
//
// Ethiopian New Year (1 Meskerem / Enkutatash):
//   - GC September 11 in non-leap Gregorian years
//   - GC September 12 in the year FOLLOWING a GC leap year
//   A year is a GC leap year if divisible by 4, except centuries not by 400.
//
// All other fixed holidays are listed as their stable Gregorian equivalents.

function isGCLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Ethiopian New Year falls on Sep 12 in the year after a GC leap year */
function ethiopianNewYearDay(gcYear: number): number {
  // If the PREVIOUS year was a GC leap year, New Year shifts to Sep 12
  return isGCLeapYear(gcYear - 1) ? 12 : 11;
}

const ETHIOPIAN_FIXED_BASE = [
  { name: 'Ethiopian Christmas',      nameAm: 'ገና / ልደት',          month:  1, dayFn: () => 7,  religion: 'CHRISTIAN', description: 'Genna (Lidat) — Ethiopian Orthodox Christmas' },
  { name: 'Timkat',                   nameAm: 'ጥምቀት',               month:  1, dayFn: () => 19, religion: 'CHRISTIAN', description: 'Ethiopian Epiphany — Baptism of Jesus' },
  { name: 'Adwa Victory Day',         nameAm: 'የዓድዋ ድል',            month:  3, dayFn: () => 2,  religion: null,        description: 'Battle of Adwa victory over Italy (1896)' },
  { name: 'Ethiopian Patriots Day',   nameAm: 'የአርበኞች ቀን',          month:  4, dayFn: () => 23, religion: null,        description: 'Honors resistance against Italian occupation' },
  { name: 'International Labour Day', nameAm: 'የሠራተኞች ቀን',          month:  5, dayFn: () => 1,  religion: null,        description: 'International Workers Day' },
  { name: 'Liberation Day',           nameAm: 'ነጻነት ቀን',             month:  5, dayFn: () => 5,  religion: null,        description: 'Return of Emperor Haile Selassie (1941)' },
  { name: 'Downfall of the Derg',     nameAm: 'ደርግ መወረድ',           month:  5, dayFn: () => 28, religion: null,        description: 'Fall of the Derg regime (1991)' },
  { name: 'Ethiopian New Year',       nameAm: 'እንቁጣጣሽ / አዲስ ዓመት',   month:  9, dayFn: ethiopianNewYearDay, religion: null, description: 'Enkutatash — 1 Meskerem, Ethiopian New Year' },
  { name: 'Meskel',                   nameAm: 'መስቀል',                month:  9, dayFn: () => 27, religion: 'CHRISTIAN', description: 'Finding of the True Cross' },
];

function buildEthiopianHolidaysForYear(year: number): Omit<Holiday, 'id'>[] {
  return ETHIOPIAN_FIXED_BASE.map(h => ({
    name: h.name,
    nameAm: h.nameAm ?? undefined,
    date: `${year}-${String(h.month).padStart(2,'0')}-${String(h.dayFn(year)).padStart(2,'0')}`,
    type: 'NATIONAL',
    religion: h.religion ?? undefined,
    isRecurring: true,
    description: h.description,
    offType: 'FULL_DAY',
  }));
}

// Check if all fixed Ethiopian holidays already exist for the year
function missingEthiopianHolidays(year: number, existing: Holiday[]): Omit<Holiday,'id'>[] {
  const existingDates = new Set(existing.map(h => h.date.split('T')[0]));
  return buildEthiopianHolidaysForYear(year).filter(h => !existingDates.has(h.date));
}

// ─── Add/Edit Modal ───────────────────────────────────────────────────────────
function HolidayFormModal({ initial, prefillDate, onClose, onSaved }: {
  initial?: Holiday; prefillDate?: string; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!initial;
  const [name, setName]         = useState(initial?.name ?? '');
  const [nameAm, setNameAm]     = useState(initial?.nameAm ?? '');
  const [date, setDate]         = useState(initial?.date ?? prefillDate ?? '');
  const [type, setType]         = useState(initial?.type ?? 'NATIONAL');
  const [religion, setReligion] = useState(initial?.religion ?? '');
  const [isRecurring, setIsRecurring] = useState(initial?.isRecurring ?? false);
  const [offType, setOffType]   = useState(initial?.offType ?? 'FULL_DAY');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');

  // Show Ethiopian date equivalent live
  const ethPreview = date
    ? (() => { try { return formatEthDateFromStr(date); } catch { return ''; } })()
    : '';

  const handleSave = async () => {
    if (!name.trim() || !date) { setError('Name and date are required'); return; }
    setError(''); setSaving(true);
    try {
      const body = { name, nameAm: nameAm || null, date, type, religion: religion || null, isRecurring, offType, description };
      if (isEdit) { await apiClient.put(`/holidays/${initial!.id}`, body); }
      else        { await apiClient.post('/holidays', body); }
      onSaved(); onClose();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Failed to save holiday');
    } finally { setSaving(false); }
  };

  const iCls = 'w-full px-3 py-2 text-sm rounded-xl bg-white dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-accent-500/30';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-[#0F1929] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.06]">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{isEdit ? 'Edit Holiday' : 'Add Holiday'}</h2>
            <p className="text-xs text-gray-400 mt-0.5">Dates shown in both Gregorian &amp; Ethiopian calendar</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5"><X size={16}/></button>
        </div>
        <div className="px-6 py-5 space-y-3 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400">
              <AlertCircle size={14} className="shrink-0"/>{error}
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Holiday Name (English) *</label>
            <input className={iCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ethiopian Christmas" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Amharic Name — ስም</label>
            <input className={iCls} value={nameAm} onChange={e => setNameAm(e.target.value)} placeholder="e.g. ገና" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Date (Gregorian) *</label>
            <input type="date" className={iCls} value={date} onChange={e => setDate(e.target.value)} />
            {ethPreview && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400 font-semibold">
                🇪🇹 Ethiopian: {ethPreview}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Type</label>
              <select className={iCls} value={type} onChange={e => setType(e.target.value)}>
                <option value="NATIONAL">National</option>
                <option value="RELIGIOUS">Religious</option>
                <option value="OPTIONAL">Optional</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Off Type</label>
              <select className={iCls} value={offType} onChange={e => setOffType(e.target.value)}>
                <option value="FULL_DAY">Full Day Off</option>
                <option value="HALF_DAY">Half Day Off</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Religion</label>
            <select className={iCls} value={religion} onChange={e => setReligion(e.target.value)}>
              <option value="">All / Non-denominational</option>
              <option value="CHRISTIAN">Christian ✝️</option>
              <option value="MUSLIM">Muslim ☪️</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="recur" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} className="w-4 h-4 rounded accent-violet-600" />
            <label htmlFor="recur" className="text-sm text-gray-600 dark:text-gray-300 cursor-pointer">Repeats annually (same date every year)</label>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Description</label>
            <textarea className={iCls + ' resize-none'} rows={2} value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description…" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 dark:border-white/[0.06] flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm rounded-xl bg-accent-600 hover:bg-accent-700 text-white font-semibold disabled:opacity-50 transition-colors">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Holiday'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export const HolidayCalendar = () => {
  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [allYear,  setAllYear]  = useState<Holiday[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showAdd,     setShowAdd]     = useState(false);
  const [editTarget,  setEditTarget]  = useState<Holiday | null>(null);
  const [addPrefill,  setAddPrefill]  = useState('');
  const [toast,       setToast]       = useState('');
  const [seeding,     setSeeding]     = useState(false);
  const { confirmProps, confirm } = useConfirm();

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  const fetchMonth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/holidays?year=${year}&month=${month + 1}`);
      if (res.data.success) setHolidays((res.data.data as Holiday[]) ?? []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [year, month]);

  const fetchYear = useCallback(async () => {
    try {
      const res = await apiClient.get(`/holidays?year=${year}`);
      if (res.data.success) setAllYear((res.data.data as Holiday[]) ?? []);
    } catch { /* silent */ }
  }, [year]);

  useEffect(() => { fetchMonth(); }, [fetchMonth]);
  useEffect(() => { fetchYear();  }, [fetchYear]);

  // How many of the 9 fixed Ethiopian holidays are missing for this year
  const missing = missingEthiopianHolidays(year, allYear);
  const allEthImported = missing.length === 0;

  const handleSeedYear = async () => {
    if (allEthImported) {
      const ok = await confirm({ title: 'Update Ethiopian Holidays', message: `Re-import all ${ETHIOPIAN_FIXED_BASE.length} Ethiopian holidays for ${year}? Existing entries will be updated.`, confirmLabel: 'Update', variant: 'info' });
      if (!ok) return;
      setSeeding(true);
      const rows = buildEthiopianHolidaysForYear(year);
      for (const h of rows) {
        const existing = allYear.find(e => e.date.split('T')[0] === h.date);
        if (existing) {
          try { await apiClient.put(`/holidays/${existing.id}`, h); } catch { /* silent */ }
        }
      }
    } else {
      const ok = await confirm({ title: 'Import Ethiopian Holidays', message: `Import ${missing.length} missing Ethiopian public holidays for ${year}?`, confirmLabel: 'Import', variant: 'info' });
      if (!ok) return;
      setSeeding(true);
      for (const h of missing) {
        try { await apiClient.post('/holidays', h); } catch { /* silent */ }
      }
    }
    setSeeding(false);
    await Promise.all([fetchMonth(), fetchYear()]);
    showToast(allEthImported ? `Updated Ethiopian holidays for ${year}` : `Imported ${missing.length} holidays for ${year} ✓`);
  };

  const holidayMap = holidays.reduce<Record<string, Holiday[]>>((acc, h) => {
    const d = h.date.split('T')[0];
    (acc[d] ??= []).push(h);
    return acc;
  }, {});

  const todayStr  = today.toISOString().split('T')[0];
  const totalDays = daysInMonth(year, month);
  const startDay  = firstDayOfMonth(year, month);
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const prev = () => { if (month === 0) { setYear(y => y-1); setMonth(11); } else setMonth(m => m-1); setSelectedDay(null); };
  const next = () => { if (month === 11) { setYear(y => y+1); setMonth(0);  } else setMonth(m => m+1); setSelectedDay(null); };

  const handleDelete = async (id: number) => {
    const ok = await confirm({ title: 'Delete Holiday', message: 'This holiday will be permanently removed from the calendar.', confirmLabel: 'Delete', variant: 'danger' });
    if (!ok) return;
    try {
      await apiClient.delete(`/holidays/${id}`);
      await Promise.all([fetchMonth(), fetchYear()]);
      showToast('Holiday removed');
    } catch { showToast('Failed to delete'); }
  };

  const onSaved = async () => {
    await Promise.all([fetchMonth(), fetchYear()]);
    showToast('Saved ✓');
    setSelectedDay(null);
  };

  // Year-level sorted list used in the upcoming events panel
  const sortedYear = [...allYear].sort((a, b) => a.date.localeCompare(b.date));

  const card = 'bg-white dark:bg-[#0F1929] border border-gray-100 dark:border-white/[0.07] rounded-2xl shadow-sm';

  return (
    <div className="space-y-6">
      <ConfirmModal {...confirmProps} />
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Holiday Calendar</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Ethiopian public holidays — dates shown in Gregorian &amp; Ethiopian calendar
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => { fetchMonth(); fetchYear(); }}
            className="p-2.5 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/5 border border-gray-200 dark:border-white/10 transition-colors"
            title="Refresh">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/>
          </button>
          <button onClick={handleSeedYear} disabled={seeding}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors disabled:opacity-50 ${
              allEthImported
                ? 'border-emerald-300 dark:border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'
                : 'border-accent-300 dark:border-accent-500/40 text-accent-600 dark:text-accent-400 hover:bg-accent-50 dark:hover:bg-accent-500/10'
            }`}>
            <Upload size={14}/>
            {seeding ? 'Working…' : allEthImported ? `Update ${year} Holidays` : `Import ${year} Holidays (${missing.length})`}
          </button>
          <button onClick={() => { setEditTarget(null); setAddPrefill(''); setShowAdd(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent-600 hover:bg-accent-700 text-white text-sm font-semibold shadow-sm transition-colors">
            <Plus size={15}/> Add Holiday
          </button>
        </div>
      </div>

      {/* ── Legend pills ── */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'National',  dot: 'bg-accent-500', cls: 'bg-accent-50 dark:bg-accent-500/10 text-accent-600 dark:text-accent-300 border-accent-200 dark:border-accent-500/30', count: allYear.filter(h=>h.type==='NATIONAL').length },
          { label: 'Religious', dot: 'bg-amber-500',  cls: 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',   count: allYear.filter(h=>h.type==='RELIGIOUS').length },
          { label: 'Optional',  dot: 'bg-sky-500',    cls: 'bg-sky-50 dark:bg-sky-500/10 text-sky-600 dark:text-sky-300 border-sky-200 dark:border-sky-500/30',               count: allYear.filter(h=>h.type==='OPTIONAL').length },
          { label: 'Full Day',  dot: 'bg-emerald-500',cls: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30', count: allYear.filter(h=>!h.offType||h.offType==='FULL_DAY').length },
          { label: '½ Day Off', dot: 'bg-orange-400', cls: 'bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-300 border-orange-200 dark:border-orange-500/30', count: allYear.filter(h=>h.offType==='HALF_DAY').length },
        ].map(l => (
          <span key={l.label} className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${l.cls}`}>
            <span className={`w-2 h-2 rounded-full ${l.dot} shrink-0`}/>
            {l.label}{l.count > 0 && <span className="opacity-60 ml-0.5">({l.count})</span>}
          </span>
        ))}
        <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-400 border-red-200 dark:border-red-500/30">
          <span className="w-2 h-2 rounded-full bg-red-400 shrink-0"/>እሑድ Sunday (Off)
        </span>
      </div>

      {/* ── Calendar card ── */}
      <div className={card + ' overflow-hidden'}>
        {/* Month nav */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/[0.06]">
          <button onClick={prev} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 text-gray-500 transition-colors"><ChevronLeft size={18}/></button>
          <div className="text-center">
            <p className="text-lg font-black text-gray-900 dark:text-white">{GR_MONTHS[month]} {year}</p>
            <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-0.5">
              {ETH_MONTHS[toEthiopian(year, month+1, 1).m - 1]} — {toEthiopian(year, month+1, 1).y} ዓ.ም
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">{holidays.length} holiday{holidays.length !== 1 ? 's' : ''} this month</p>
          </div>
          <button onClick={next} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-white/5 text-gray-500 transition-colors"><ChevronRight size={18}/></button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 bg-gray-50 dark:bg-white/[0.02] border-b border-gray-100 dark:border-white/[0.06]">
          {GR_DAYS.map((d, i) => (
            <div key={d} className="py-2 text-center">
              <div className={`text-[11px] font-black uppercase tracking-wider ${i === 0 ? 'text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>{d}</div>
              <div className={`text-[10px] font-medium ${i === 0 ? 'text-red-300' : 'text-gray-300 dark:text-gray-600'}`}>{ETH_DAYS_AM[i]}</div>
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7">
          {cells.map((cell, idx) => {
            if (!cell) return <div key={`e-${idx}`} className="min-h-[90px] border-r border-b border-gray-50 dark:border-white/[0.03]"/>;
            const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(cell).padStart(2,'0')}`;
            const dow     = (startDay + cell - 1) % 7;
            const isWknd  = isWeekend(dow);
            const isToday = dateStr === todayStr;
            const dayHols = holidayMap[dateStr] ?? [];
            const isHol   = dayHols.length > 0;
            const isSel   = selectedDay === cell;
            const ethD    = toEthiopian(year, month+1, cell);
            return (
              <div key={cell}
                onClick={() => setSelectedDay(isSel ? null : cell)}
                className={`relative min-h-[90px] border-r border-b border-gray-50 dark:border-white/[0.03] p-2 cursor-pointer transition-all select-none group
                  ${isWknd ? 'bg-red-50/50 dark:bg-red-500/[0.04]' : ''}
                  ${isHol && !isWknd ? 'bg-amber-50/50 dark:bg-amber-500/[0.04]' : ''}
                  ${isSel ? 'ring-2 ring-inset ring-accent-500 z-10 bg-accent-50/40 dark:bg-accent-500/[0.07]' : 'hover:bg-gray-50/80 dark:hover:bg-white/[0.03]'}`}>
                {/* Day number + Ethiopian date */}
                <div className="flex items-start justify-between">
                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-sm font-bold shrink-0
                    ${isToday ? 'bg-accent-600 text-white shadow-md' : ''}
                    ${isWknd && !isToday ? 'text-red-400' : ''}
                    ${!isWknd && !isToday ? 'text-gray-800 dark:text-gray-100' : ''}
                    ${isHol && !isToday ? 'ring-2 ring-amber-400/60 dark:ring-amber-500/40' : ''}`}>
                    {cell}
                  </span>
                  <span className="text-[9px] font-semibold text-gray-300 dark:text-gray-600 leading-none mt-1">{ethD.d}</span>
                </div>
                {/* Holiday chips */}
                <div className="mt-1 space-y-0.5">
                  {dayHols.slice(0, 2).map(h => (
                    <div key={h.id} className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold truncate ${TYPE_LIGHT[h.type] || TYPE_LIGHT.NATIONAL}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TYPE_COLOR[h.type] || TYPE_COLOR.NATIONAL}`}/>
                      <span className="truncate">{h.name}</span>
                    </div>
                  ))}
                  {dayHols.length > 2 && <div className="text-[9px] text-gray-400 pl-1">+{dayHols.length - 2}</div>}
                </div>
                {isWknd && !isHol && <div className="mt-1 text-[9px] text-red-300 dark:text-red-500/80 font-semibold">እሑድ</div>}
              </div>
            );
          })}
        </div>

        {/* Selected day detail */}
        {selectedDay !== null && (() => {
          const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(selectedDay).padStart(2,'0')}`;
          const dayHols = holidayMap[dateStr] ?? [];
          const dow     = (startDay + selectedDay - 1) % 7;
          const ethD    = toEthiopian(year, month+1, selectedDay);
          return (
            <div className="border-t border-gray-100 dark:border-white/[0.06] bg-gray-50/50 dark:bg-white/[0.02] p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 ${dateStr === todayStr ? 'bg-accent-600' : 'bg-white dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07]'}`}>
                  <span className={`text-sm font-black leading-none ${dateStr === todayStr ? 'text-white' : 'text-gray-900 dark:text-white'}`}>{selectedDay}</span>
                  <span className={`text-[9px] font-semibold leading-none mt-0.5 ${dateStr === todayStr ? 'text-white/70' : 'text-gray-400'}`}>{ethD.d}</span>
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-900 dark:text-white">
                    {GR_DAYS[dow]}, {GR_MONTHS[month]} {selectedDay}, {year}
                  </p>
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 mt-0.5">
                    🇪🇹 {ETH_DAYS_AM[dow]} {ethD.d} {ETH_MONTHS[ethD.m - 1]} {ethD.y} ዓ.ም
                  </p>
                  {!dayHols.length && isWeekend(dow) && <p className="text-xs text-red-400 mt-0.5">እሑድ — Day Off</p>}
                  {!dayHols.length && !isWeekend(dow) && <p className="text-xs text-emerald-500 mt-0.5">Regular working day</p>}
                </div>
              </div>
              <div className="space-y-2">
                {dayHols.map(h => (
                  <div key={h.id} className={`p-3.5 rounded-xl border ${TYPE_LIGHT[h.type] || TYPE_LIGHT.NATIONAL}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-base leading-none">{religionIcon(h.religion)}</span>
                          <p className="font-bold text-sm leading-snug">{h.name}</p>
                          {h.nameAm && <span className="text-xs opacity-70 font-medium">{h.nameAm}</span>}
                        </div>
                        {h.description && <p className="text-xs opacity-60 mt-1 leading-relaxed">{h.description}</p>}
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-white/50 dark:bg-black/20 border border-current/20">{h.type}</span>
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${h.offType === 'HALF_DAY' ? 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/30' : 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30'}`}>
                            {h.offType === 'HALF_DAY' ? '½ Half Day Off' : '✓ Full Day Off'}
                          </span>
                          {h.isRecurring && <span className="text-[10px] text-gray-500 font-semibold">↻ Annual</span>}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => { setEditTarget(h); setShowAdd(true); }} className="p-1.5 rounded-lg text-accent-500 hover:bg-accent-100 dark:hover:bg-accent-500/20 transition-colors"><Pencil size={13}/></button>
                        <button onClick={() => handleDelete(h.id)} className="p-1.5 rounded-lg text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"><Trash2 size={13}/></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => { setAddPrefill(dateStr); setShowAdd(true); }}
                className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold text-accent-600 dark:text-accent-400 border border-dashed border-accent-300 dark:border-accent-500/30 hover:bg-accent-50 dark:hover:bg-accent-500/5 transition-colors">
                <Plus size={13}/> Add Holiday on This Day
              </button>
            </div>
          );
        })()}
      </div>

      {/* ── Holiday list table — ascending, all year ── */}
      <HolidayTable
        holidays={sortedYear} year={year} loading={loading}
        onEdit={h => { setEditTarget(h); setShowAdd(true); }}
        onDelete={handleDelete}
      />

      {showAdd && (
        <HolidayFormModal
          initial={editTarget ?? undefined}
          prefillDate={addPrefill}
          onClose={() => { setShowAdd(false); setEditTarget(null); setAddPrefill(''); }}
          onSaved={onSaved}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-5 py-3 rounded-2xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold shadow-2xl">
          <CheckCircle size={16} className="text-emerald-400 dark:text-emerald-600 shrink-0"/>{toast}
        </div>
      )}
    </div>
  );
};

// ─── Holiday Table — only holidays, no Sundays ───────────────────────────────
// Sundays appear on the calendar grid only. This table lists holidays only,
// sorted ascending. Filters at top, pagination at bottom.

function HolidayTable({ year, holidays, loading, onEdit, onDelete }: {
  year: number; holidays: Holiday[]; loading: boolean;
  onEdit: (h: Holiday) => void; onDelete: (id: number) => void;
}) {
  const PAGE_SIZE = 15;
  const [search,   setSearch]   = useState('');
  const [typeF,    setTypeF]    = useState('ALL');
  const [offTypeF, setOffTypeF] = useState('ALL');
  const [page,     setPage]     = useState(1);

  const sorted   = [...holidays].sort((a, b) => a.date.localeCompare(b.date));
  const filtered = sorted.filter(h => {
    const q = search.toLowerCase();
    const ms = !q || h.name.toLowerCase().includes(q) || (h.nameAm ?? '').toLowerCase().includes(q) || h.date.includes(q);
    const mt = typeF === 'ALL'    || h.type === typeF;
    const mo = offTypeF === 'ALL' || (h.offType ?? 'FULL_DAY') === offTypeF;
    return ms && mt && mo;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pageRows   = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const go = (v: string, setter: (s: string) => void) => { setter(v); setPage(1); };

  const chipCls = (active: boolean) =>
    `px-3 py-1 rounded-full text-xs font-semibold border cursor-pointer select-none transition-colors ${
      active ? 'bg-accent-600 text-white border-accent-600 shadow-sm'
             : 'bg-white dark:bg-[#0F1929] text-gray-500 dark:text-gray-400 border-gray-200 dark:border-white/[0.07] hover:border-accent-400 dark:hover:border-accent-500 hover:text-accent-600'
    }`;
  const selCls = 'px-3 py-2 text-sm rounded-xl bg-white dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-accent-500/30';


  return (
    <div className="bg-white dark:bg-[#0F1929] border border-gray-100 dark:border-white/[0.07] rounded-2xl shadow-sm overflow-hidden">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-white/[0.06]">
        <Calendar size={16} className="text-accent-500 shrink-0"/>
        <div>
          <h2 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">Holiday List — {year}</h2>
          <p className="text-xs text-gray-400 mt-0.5">All public &amp; company holidays, ascending by date</p>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-accent-50 dark:bg-accent-500/10 text-accent-600 dark:text-accent-400 border border-accent-200 dark:border-accent-500/30">{holidays.length} total</span>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-100 dark:bg-white/5 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-white/10">{filtered.length} shown</span>
        </div>
      </div>

      {/* ── Filters (above table) ── */}
      <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.05] bg-gray-50/60 dark:bg-white/[0.01] flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input type="text" value={search} onChange={e => go(e.target.value, setSearch)} placeholder="Search holidays…"
            className="w-full pl-8 pr-3 py-2 text-sm rounded-xl bg-white dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-700 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"/>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['ALL','NATIONAL','RELIGIOUS','OPTIONAL'] as const).map(t => (
            <span key={t} className={chipCls(typeF === t)} onClick={() => go(t, setTypeF)}>
              {t === 'ALL' ? 'All Types' : t[0] + t.slice(1).toLowerCase()}
            </span>
          ))}
        </div>
        <select value={offTypeF} onChange={e => go(e.target.value, setOffTypeF)} className={selCls}>
          <option value="ALL">All Off Types</option>
          <option value="FULL_DAY">Full Day</option>
          <option value="HALF_DAY">Half Day</option>
        </select>
      </div>

      {/* ── Table body ── */}
      {loading ? (
        <div className="py-14 flex justify-center"><div className="w-6 h-6 border-2 border-accent-500 border-t-transparent rounded-full animate-spin"/></div>
      ) : pageRows.length === 0 ? (
        <div className="py-14 text-center">
          <Star size={30} className="mx-auto text-gray-300 dark:text-gray-600 mb-2"/>
          <p className="text-sm font-semibold text-gray-400 dark:text-gray-500">
            {holidays.length === 0 ? 'No holidays yet — use "Import" above to load Ethiopian holidays.' : 'No holidays match the current filters.'}
          </p>
          {holidays.length > 0 && (search || typeF !== 'ALL' || offTypeF !== 'ALL') && (
            <button onClick={() => { setSearch(''); setTypeF('ALL'); setOffTypeF('ALL'); setPage(1); }}
              className="mt-2 text-xs text-accent-500 hover:underline font-medium">Clear filters</button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-white/[0.02] border-b border-gray-100 dark:border-white/[0.05]">
                {['#','Gregorian Date','🇪🇹 Ethiopian Date','Day','Holiday Name','Off Type','Category','Actions'].map((h, i) => (
                  <th key={h} className={`px-4 py-3 text-left text-[11px] font-black uppercase tracking-wider whitespace-nowrap ${i === 2 ? 'text-amber-500 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/[0.03]">
              {pageRows.map((h, idx) => {
                const d      = new Date(h.date + 'T00:00:00');
                const dow    = d.getDay();
                const eth    = toEthiopian(d.getFullYear(), d.getMonth()+1, d.getDate());
                const grDate = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                const ethDate= formatEthDateAm(eth);
                const isHalf = h.offType === 'HALF_DAY';
                return (
                  <tr key={h.id} className="hover:bg-gray-50/80 dark:hover:bg-white/[0.02] transition-colors group">
                    <td className="px-4 py-3 text-xs text-gray-300 dark:text-gray-600 font-mono">{(safePage-1)*PAGE_SIZE+idx+1}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{grDate}</span></td>
                    <td className="px-4 py-3 whitespace-nowrap"><span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{ethDate}</span></td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-bold text-gray-600 dark:text-gray-300">{GR_DAYS[dow]}</div>
                      <div className="text-[10px] text-amber-500/80 font-medium">{ETH_DAYS_AM[dow]}</div>
                    </td>
                    <td className="px-4 py-3 max-w-[220px]">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base shrink-0">{religionIcon(h.religion)}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{h.name}</p>
                          {h.nameAm && <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold">{h.nameAm}</p>}
                          {h.description && <p className="text-[10px] text-gray-400 truncate mt-0.5">{h.description}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-black px-2.5 py-1 rounded-full border whitespace-nowrap ${isHalf ? 'bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-300 border-orange-200 dark:border-orange-500/30' : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30'}`}>
                        {isHalf ? '½ Half Day' : '✓ Full Day'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border w-fit ${TYPE_LIGHT[h.type] || TYPE_LIGHT.NATIONAL}`}>{h.type}</span>
                      {h.isRecurring && <div className="text-[10px] text-accent-500 dark:text-accent-400 font-semibold mt-0.5">↻ Annual</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => onEdit(h)} title="Edit" className="p-1.5 rounded-lg text-accent-500 hover:bg-accent-50 dark:hover:bg-accent-500/10 transition-colors"><Pencil size={13}/></button>
                        <button onClick={() => onDelete(h.id)} title="Delete" className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"><Trash2 size={13}/></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Pagination (below table) ── */}
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 dark:border-white/[0.05] bg-gray-50/40 dark:bg-white/[0.01]">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Showing{' '}
            <span className="font-semibold text-gray-700 dark:text-gray-200">
              {(safePage-1)*PAGE_SIZE+1}–{Math.min(safePage*PAGE_SIZE, filtered.length)}
            </span>{' '}
            of{' '}
            <span className="font-semibold text-gray-700 dark:text-gray-200">{filtered.length}</span>
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(1)} disabled={safePage===1}
              className="px-2 py-1 rounded-lg text-xs font-bold text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">«</button>
            <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={safePage===1}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronLeft size={14}/>
            </button>
            {Array.from({length: totalPages},(_,i)=>i+1)
              .filter(p => p===1 || p===totalPages || Math.abs(p-safePage)<=1)
              .reduce<(number|'…')[]>((acc,p,i,arr) => {
                if (i>0 && (arr[i-1] as number)+1 < p) acc.push('…');
                acc.push(p); return acc;
              }, [])
              .map((p,i) =>
                p==='…'
                  ? <span key={`d${i}`} className="px-1 text-xs text-gray-400 select-none">…</span>
                  : <button key={p} onClick={() => setPage(p as number)}
                      className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-bold transition-colors ${
                        safePage===p
                          ? 'bg-accent-600 text-white shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10 hover:text-gray-800 dark:hover:text-white'
                      }`}>{p}</button>
              )
            }
            <button onClick={() => setPage(p => Math.min(totalPages,p+1))} disabled={safePage===totalPages}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
              <ChevronRight size={14}/>
            </button>
            <button onClick={() => setPage(totalPages)} disabled={safePage===totalPages}
              className="px-2 py-1 rounded-lg text-xs font-bold text-gray-400 hover:text-gray-700 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">»</button>
          </div>
        </div>
      )}
    </div>
  );
}
