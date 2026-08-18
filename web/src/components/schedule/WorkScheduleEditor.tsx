
/**
 * WorkScheduleEditor — redesigned
 *
 * Regular / Flexible / Shift  →  one shared check-in + check-out for all working days
 *                                 day pills to toggle which days are working
 *
 * Custom                       →  per-day rows, each day has its own times
 *
 * Layout is fully vertical (no fixed-width grid columns) so it works inside
 * any modal width without stacking or overflow.
 */

import { useEffect, useState } from 'react';
import { Clock, Zap, Moon, Sliders, Sun } from 'lucide-react';

// ─── Ethiopian time helper ────────────────────────────────────────────────────
// (Used in future locale display — kept for reference)
// function toEthTime(hhmm: string): string { ... }

// ─── Types ────────────────────────────────────────────────────────────────────
export type ScheduleType = 'REGULAR' | 'FLEXIBLE' | 'SHIFT' | 'CUSTOM';

export interface DaySchedule {
  dayOfWeek: number;
  isWorkingDay: boolean;
  workStartTime: string;
  workEndTime: string;
  lateThresholdMinutes: number;
}

export interface WorkSchedule {
  scheduleType: ScheduleType;
  days: DaySchedule[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function makeDay(dow: number, working: boolean, start: string, end: string): DaySchedule {
  return { dayOfWeek: dow, isWorkingDay: working, workStartTime: start, workEndTime: end, lateThresholdMinutes: 15 };
}

const PRESETS: Record<ScheduleType, () => DaySchedule[]> = {
  REGULAR:  () => [0,1,2,3,4,5,6].map(d => makeDay(d, d >= 1 && d <= 5, '08:30', '17:30')),
  FLEXIBLE: () => [0,1,2,3,4,5,6].map(d => makeDay(d, d >= 1 && d <= 5, '08:00', '18:00')),
  SHIFT:    () => [0,1,2,3,4,5,6].map(d => makeDay(d, d >= 1 && d <= 6, '06:00', '14:00')),
  CUSTOM:   () => [0,1,2,3,4,5,6].map(d => makeDay(d, false, '08:30', '17:30')),
};

// ─── Type card config ─────────────────────────────────────────────────────────
const TYPE_CARDS = [
  {
    value: 'REGULAR'  as ScheduleType,
    label: 'Regular',
    desc: 'Fixed days, same hours every day',
    icon: <Clock size={20} />,
    active: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500',
    iconCls: 'text-blue-500',
    textCls: 'text-blue-700 dark:text-blue-300',
  },
  {
    value: 'FLEXIBLE' as ScheduleType,
    label: 'Flexible',
    desc: 'Window hours, employee picks start',
    icon: <Zap size={20} />,
    active: 'border-amber-500 bg-amber-50 dark:bg-amber-900/20 ring-1 ring-amber-500',
    iconCls: 'text-amber-500',
    textCls: 'text-amber-700 dark:text-amber-300',
  },
  {
    value: 'SHIFT'    as ScheduleType,
    label: 'Shift',
    desc: 'Fixed shift pattern (e.g. morning)',
    icon: <Moon size={20} />,
    active: 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 ring-1 ring-purple-500',
    iconCls: 'text-purple-500',
    textCls: 'text-purple-700 dark:text-purple-300',
  },
  {
    value: 'CUSTOM'   as ScheduleType,
    label: 'Custom',
    desc: 'Set each day individually',
    icon: <Sliders size={20} />,
    active: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-500',
    iconCls: 'text-emerald-500',
    textCls: 'text-emerald-700 dark:text-emerald-300',
  },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function minsBetween(start: string, end: string) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const d = (eh * 60 + em) - (sh * 60 + sm);
  return d > 0 ? d : 0;
}
function fmtH(m: number) {
  const h = Math.floor(m / 60), r = m % 60;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

// ─── Shared input styles ──────────────────────────────────────────────────────
const timeCls = 'px-2.5 py-2 text-sm rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40';
const numCls  = 'px-2.5 py-2 text-sm rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 w-20';

// ─── Component ────────────────────────────────────────────────────────────────
interface Props {
  value: WorkSchedule;
  onChange: (s: WorkSchedule) => void;
}

export function WorkScheduleEditor({ value, onChange }: Props) {
  const { scheduleType, days } = value;

  // Shared time state for non-Custom types
  const [sharedStart, setSharedStart] = useState(days[1]?.workStartTime ?? '08:30');
  const [sharedEnd,   setSharedEnd]   = useState(days[1]?.workEndTime   ?? '17:30');
  const [sharedLate,  setSharedLate]  = useState(days[1]?.lateThresholdMinutes ?? 0);

  // Guard: ensure 7 days always present
  useEffect(() => {
    if (days.length !== 7) onChange({ scheduleType, days: PRESETS[scheduleType]() });
  }, []); // eslint-disable-line

  // When type card changes → apply preset, sync shared times from preset
  const selectType = (type: ScheduleType) => {
    const preset = PRESETS[type]();
    const firstWorking = preset.find(d => d.isWorkingDay);
    if (firstWorking) {
      setSharedStart(firstWorking.workStartTime);
      setSharedEnd(firstWorking.workEndTime);
      setSharedLate(firstWorking.lateThresholdMinutes);
    }
    onChange({ scheduleType: type, days: preset });
  };

  // Toggle a day on/off
  const toggleDay = (dow: number) => {
    onChange({
      scheduleType,
      days: days.map(d =>
        d.dayOfWeek === dow ? { ...d, isWorkingDay: !d.isWorkingDay } : d
      ),
    });
  };

  // For non-Custom: apply shared times to all currently-working days
  const applyShared = (start: string, end: string, late: number) => {
    onChange({
      scheduleType,
      days: days.map(d =>
        d.isWorkingDay
          ? { ...d, workStartTime: start, workEndTime: end, lateThresholdMinutes: late }
          : d
      ),
    });
  };

  // For Custom: update a single day
  const updateDay = (dow: number, patch: Partial<DaySchedule>) => {
    onChange({
      scheduleType,
      days: days.map(d => d.dayOfWeek === dow ? { ...d, ...patch } : d),
    });
  };

  const isCustom = scheduleType === 'CUSTOM';
  const card = TYPE_CARDS.find(c => c.value === scheduleType)!;

  // Summary
  const workingDays = days.filter(d => d.isWorkingDay).length;
  const totalMins   = days.filter(d => d.isWorkingDay)
    .reduce((s, d) => s + minsBetween(d.workStartTime, d.workEndTime), 0);

  return (
    <div className="space-y-6">

      {/* ── 1. Type cards (2×2 grid) ── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Schedule Type
        </p>
        <div className="grid grid-cols-2 gap-3">
          {TYPE_CARDS.map(tc => {
            const active = scheduleType === tc.value;
            return (
              <button key={tc.value} type="button" onClick={() => selectType(tc.value)}
                className={`flex items-start gap-3 p-4 rounded-2xl border-2 text-left transition-all ${
                  active
                    ? tc.active
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/40 hover:border-gray-300 dark:hover:border-gray-600'
                }`}>
                <span className={`mt-0.5 shrink-0 ${active ? tc.iconCls : 'text-gray-400 dark:text-gray-500'}`}>
                  {tc.icon}
                </span>
                <div className="min-w-0">
                  <p className={`text-sm font-bold leading-tight ${active ? tc.textCls : 'text-gray-800 dark:text-gray-200'}`}>
                    {tc.label}
                  </p>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 leading-snug">
                    {tc.desc}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── 2. Working days (pill toggles) ── */}
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Working Days
        </p>
        <div className="flex gap-2 flex-wrap">
          {days.map(d => (
            <button key={d.dayOfWeek} type="button" onClick={() => {
              toggleDay(d.dayOfWeek);
              // For non-Custom, re-apply shared times after toggle
              if (!isCustom) {
                // toggling will flip isWorkingDay; we apply shared on next render via effect below
              }
            }}
              className={`w-12 h-12 rounded-xl text-xs font-bold transition-all border-2 select-none ${
                d.isWorkingDay
                  ? `${card.active} ${card.textCls}`
                  : 'border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800/40 hover:border-gray-300 dark:hover:border-gray-600'
              }`}>
              {DAY_SHORT[d.dayOfWeek]}
            </button>
          ))}
        </div>
      </div>

      {/* ── 3a. Shared times (Regular / Flexible / Shift) ── */}
      {!isCustom && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Check-in / Check-out (applies to all working days)
          </p>
          <div className="flex flex-wrap gap-4 items-end p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40">
            {/* Check-in */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Check-in</label>
              <input type="time" value={sharedStart}
                onChange={e => {
                  setSharedStart(e.target.value);
                  applyShared(e.target.value, sharedEnd, sharedLate);
                }}
                className={timeCls} />
            </div>

            {/* Arrow */}
            <span className="text-gray-400 dark:text-gray-500 text-lg font-light pb-1.5">→</span>

            {/* Check-out */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Check-out</label>
              <input type="time" value={sharedEnd}
                onChange={e => {
                  setSharedEnd(e.target.value);
                  applyShared(sharedStart, e.target.value, sharedLate);
                }}
                className={timeCls} />
            </div>

            {/* Hours badge */}
            {minsBetween(sharedStart, sharedEnd) > 0 && (
              <span className="text-sm font-semibold text-gray-600 dark:text-gray-300 pb-1.5">
                {fmtH(minsBetween(sharedStart, sharedEnd))} / day
              </span>
            )}

            {/* Late threshold */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Late after (min)</label>
              <input type="number" min={0} max={120} value={sharedLate}
                onChange={e => {
                  const v = Number(e.target.value);
                  setSharedLate(v);
                  applyShared(sharedStart, sharedEnd, v);
                }}
                className={numCls} />
            </div>
          </div>
        </div>
      )}

      {/* ── 3b. Per-day times (Custom only) ── */}
      {isCustom && (
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
            Per-day Schedule
          </p>
          <div className="space-y-2">
            {days.map(d => (
              <div key={d.dayOfWeek}
                className={`rounded-xl border transition-all ${
                  d.isWorkingDay
                    ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/40'
                    : 'border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/20 opacity-50'
                }`}>
                {/* Day header row */}
                <div className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    {/* Toggle switch */}
                    <button type="button" onClick={() => toggleDay(d.dayOfWeek)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${
                        d.isWorkingDay ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'
                      }`}>
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        d.isWorkingDay ? 'translate-x-4' : 'translate-x-0.5'
                      }`} />
                    </button>
                    <span className={`text-sm font-semibold ${
                      d.isWorkingDay ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'
                    }`}>
                      {DAY_FULL[d.dayOfWeek]}
                    </span>
                  </div>
                  {d.isWorkingDay && minsBetween(d.workStartTime, d.workEndTime) > 0 && (
                    <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
                      {fmtH(minsBetween(d.workStartTime, d.workEndTime))}
                    </span>
                  )}
                </div>

                {/* Time inputs — only shown when day is ON */}
                {d.isWorkingDay && (
                  <div className="flex flex-wrap gap-3 items-end px-4 pb-3">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium text-gray-400 dark:text-gray-500">Check-in</label>
                      <input type="time" value={d.workStartTime}
                        onChange={e => updateDay(d.dayOfWeek, { workStartTime: e.target.value })}
                        className={timeCls} />
                    </div>
                    <span className="text-gray-400 text-base pb-1.5">→</span>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium text-gray-400 dark:text-gray-500">Check-out</label>
                      <input type="time" value={d.workEndTime}
                        onChange={e => updateDay(d.dayOfWeek, { workEndTime: e.target.value })}
                        className={timeCls} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-medium text-gray-400 dark:text-gray-500">Late (min)</label>
                      <input type="number" min={0} max={120} value={d.lateThresholdMinutes}
                        onChange={e => updateDay(d.dayOfWeek, { lateThresholdMinutes: Number(e.target.value) })}
                        className={numCls} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 4. Summary bar ── */}
      <div className="flex flex-wrap items-center gap-5 px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
        <Sun size={14} className="text-amber-500 shrink-0" />
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Working days: <strong className="text-gray-800 dark:text-gray-200">{workingDays}</strong>
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Total / week: <strong className="text-gray-800 dark:text-gray-200">{fmtH(totalMins)}</strong>
        </span>
        {workingDays > 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Avg / day: <strong className="text-gray-800 dark:text-gray-200">{fmtH(Math.round(totalMins / workingDays))}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

export default WorkScheduleEditor;

export function buildDefaultSchedule(type: ScheduleType = 'REGULAR'): WorkSchedule {
  return { scheduleType: type, days: PRESETS[type]() };
}
