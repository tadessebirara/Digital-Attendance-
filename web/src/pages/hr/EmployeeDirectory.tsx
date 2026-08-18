﻿import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import {
  Search, Users, UserCheck, UserX, Clock, RefreshCw, X,
  Mail, Phone, Building2, Briefcase, Hash, Calendar,
  AlertCircle, CheckCircle, Edit3,
} from 'lucide-react';
import { useOnRefresh } from '../../context/DataRefreshContext';

const card = 'bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07]';
const inputCls = 'w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40';

// --- Types --------------------------------------------------------------------
const SHIFT_TYPES = ['REGULAR', 'FLEXIBLE', 'SHIFT', 'CUSTOM'] as const;
type ShiftType = typeof SHIFT_TYPES[number];
const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_MAP: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const DOW_TO_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface WorkSchedule {
  shiftType: ShiftType;
  workDays: string[];
  startTime: string;
  endTime: string;
  gracePeriod: number;
}

function defaultSchedule(): WorkSchedule {
  return { shiftType: 'REGULAR', workDays: ['Mon','Tue','Wed','Thu','Fri'], startTime: '08:30', endTime: '17:30', gracePeriod: 0 };
}

// Ethiopian time helper — converts HH:MM (24h EAT) to Ethiopian 12-hour display
// Ethiopian clock: 6:00 AM standard = 12:00 ጠዋት  |  e.g. 08:30 → 2:30 ጠዋት, 17:30 → 11:30 ቀን
function toEthTime(hhmm: string): string {
  if (!hhmm) return '';
  const [hStr, mStr] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const ethH = ((h - 6 + 24) % 12) || 12;
  const mm = m.toString().padStart(2, '0');
  let period = '';
  if (h >= 6 && h < 12) period = 'ጠዋት';
  else if (h >= 12 && h < 18) period = 'ቀን';
  else if (h >= 18 && h < 24) period = 'ምሽት';
  else period = 'ሌሊት';
  return `${ethH}:${mm} ${period}`;
}

// --- Status Badge -------------------------------------------------------------
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    INACTIVE: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    PENDING_APPROVAL: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? 'bg-gray-100 dark:bg-[#0F1929] text-gray-600 dark:text-gray-400'}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

// --- Edit Schedule Modal ------------------------------------------------------
function EditScheduleModal({ employee, onClose, onSaved }: {
  employee: any; onClose: () => void; onSaved: () => void;
}) {
  const [schedule, setSchedule] = useState<WorkSchedule>(defaultSchedule());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Load existing schedule on open
  useEffect(() => {
    (async () => {
      try {
        const res = await apiClient.get(`/schedules/user/${employee.id}`);
        if (res.data?.success) {
          const shifts: any[] = (res.data.data as any)?.schedules ?? [];
          if (shifts.length > 0) {
            const workingShifts = shifts.filter((s: any) => s.isWorkingDay !== false);
            const first = workingShifts[0] ?? shifts[0];
            const workDays = shifts
              .filter((s: any) => s.isWorkingDay !== false)
              .map((s: any) => DOW_TO_SHORT[s.dayOfWeek ?? s.day_of_week])
              .filter(Boolean);
            setSchedule({
              shiftType: (first.scheduleType ?? 'REGULAR') as ShiftType,
              workDays: workDays.length > 0 ? workDays : ['Mon','Tue','Wed','Thu','Fri'],
              startTime: (first.workStartTime ?? '08:30:00').slice(0, 5),
              endTime: (first.workEndTime ?? '17:30:00').slice(0, 5),
              gracePeriod: first.lateThresholdMinutes ?? first.graceMinutes ?? 0,
            });
          }
        }
      } catch { /* use defaults */ }
      setLoading(false);
    })();
  }, [employee.id]);

  const set = <K extends keyof WorkSchedule>(k: K, v: WorkSchedule[K]) =>
    setSchedule(s => ({ ...s, [k]: v }));
  const toggleDay = (d: string) =>
    set('workDays', schedule.workDays.includes(d)
      ? schedule.workDays.filter(x => x !== d)
      : [...schedule.workDays, d]);

  const handleSave = async () => {
    if (schedule.workDays.length === 0) { setError('Select at least one working day.'); return; }
    setSaving(true); setError('');
    try {
      // Build 7-row payload · one per day of week
      const schedules = ALL_DAYS.map(day => ({
        dayOfWeek: DAY_MAP[day],
        workStartTime: schedule.startTime,
        workEndTime: schedule.endTime,
        lateThresholdMinutes: schedule.gracePeriod,
        isWorkingDay: schedule.workDays.includes(day),
      }));
      await apiClient.put(`/schedules/user/${employee.id}`, {
        schedules,
        scheduleType: schedule.shiftType,
      });
      setSuccess(true);
      setTimeout(() => { onSaved(); onClose(); }, 1200);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? 'Failed to save schedule');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-[#0F1929] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/[0.07] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.07] shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Edit3 size={16} className="text-blue-500" /> Edit Schedule
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{employee.fullName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : success ? (
            <div className="flex flex-col items-center gap-3 py-10">
              <CheckCircle size={48} className="text-green-500" />
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Schedule saved!</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">The employee's app will update in real-time.</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
                  <AlertCircle size={14} className="shrink-0" />{error}
                </div>
              )}

              {/* Shift type */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">Shift Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {SHIFT_TYPES.map(t => (
                    <button key={t} type="button" onClick={() => set('shiftType', t)}
                      className={`py-2.5 px-3 rounded-xl text-xs font-semibold border-2 transition-all ${
                        schedule.shiftType === t
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                          : 'border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-400 hover:border-blue-300'
                      }`}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              {/* Work days */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">Working Days</label>
                <div className="flex flex-wrap gap-2">
                  {ALL_DAYS.map(d => (
                    <button key={d} type="button" onClick={() => toggleDay(d)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-colors ${
                        schedule.workDays.includes(d)
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white dark:bg-[#0F1929] border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-400 hover:border-blue-400'
                      }`}>
                      {d}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                  {schedule.workDays.length} day{schedule.workDays.length !== 1 ? 's' : ''} selected
                </p>
              </div>

              {/* Times + grace */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                    Check-in
                    <span className="ml-1.5 text-blue-500">{toEthTime(schedule.startTime)}</span>
                  </label>
                  <input type="time" value={schedule.startTime} onChange={e => set('startTime', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">
                    Check-out
                    <span className="ml-1.5 text-blue-500">{toEthTime(schedule.endTime)}</span>
                  </label>
                  <input type="time" value={schedule.endTime} onChange={e => set('endTime', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5">Grace (min)</label>
                  <input type="number" min={0} max={120} value={schedule.gracePeriod}
                    onChange={e => set('gracePeriod', Number(e.target.value))} className={inputCls} />
                </div>
              </div>

              {/* Summary preview */}
              <div className="p-3 rounded-xl bg-gray-50 dark:bg-[#0F1929]/50 border border-gray-200 dark:border-white/[0.07] text-xs text-gray-600 dark:text-gray-400 space-y-1">
                <p className="font-semibold text-gray-700 dark:text-gray-300">Schedule Preview</p>
                <p>📅 {schedule.workDays.join(', ') || '—'}</p>
                <p>🕐 {toEthTime(schedule.startTime)} → {toEthTime(schedule.endTime)} · {schedule.gracePeriod} min grace</p>
                <p>🔄 {schedule.shiftType} shift</p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!success && !loading && (
          <div className="px-6 py-4 border-t border-gray-100 dark:border-white/[0.07] flex justify-end gap-3 shrink-0">
            <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50 transition-colors flex items-center gap-2">
              {saving ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving...</> : 'Save Schedule'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Employee Detail Panel ----------------------------------------------------
type DetailTab = 'info' | 'schedule';

function EmployeeDetail({ employee, onClose, onScheduleUpdated }: {
  employee: any; onClose: () => void; onScheduleUpdated: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>('info');
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [currentSchedule, setCurrentSchedule] = useState<any[]>([]);
  const [loadingSchedule, setLoadingSchedule] = useState(false);

  const fetchSchedule = useCallback(async () => {
    setLoadingSchedule(true);
    try {
      const res = await apiClient.get(`/schedules/user/${employee.id}`);
      if (res.data?.success) {
        setCurrentSchedule((res.data.data as any)?.schedules ?? []);
      }
    } catch { /* silent */ }
    setLoadingSchedule(false);
  }, [employee.id]);

  useEffect(() => {
    if (tab === 'schedule') fetchSchedule();
  }, [tab, fetchSchedule]);

  const tabCls = (t: DetailTab) =>
    `px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
      tab === t
        ? 'bg-blue-600 text-white'
        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
    }`;

  return (
    <>
      {editingSchedule && (
        <EditScheduleModal
          employee={employee}
          onClose={() => setEditingSchedule(false)}
          onSaved={() => { fetchSchedule(); onScheduleUpdated(); }}
        />
      )}

      <div className="flex flex-col min-h-full -m-4 sm:-m-6">
        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] shrink-0">
          <button onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border border-gray-200 dark:border-white/[0.07]">
            <X size={15} /> Back
          </button>
          <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 border-2 border-blue-200 dark:border-blue-800">
            {employee.profilePicture
              ? <img src={employee.profilePicture} alt="" className="w-full h-full rounded-full object-cover" />
              : <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{employee.firstName?.[0]}{employee.lastName?.[0]}</span>
            }
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">{employee.fullName}</h2>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              {employee.employeeId && <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{employee.employeeId}</span>}
              {employee.department && <span className="text-xs text-gray-400 dark:text-gray-500">· {employee.department}</span>}
              {employee.position && <span className="text-xs text-gray-400 dark:text-gray-500">· {employee.position}</span>}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <StatusBadge status={employee.status} />
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Joined {employee.createdAt ? new Date(employee.createdAt).toLocaleDateString() : '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-100 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] shrink-0">
          <button className={tabCls('info')} onClick={() => setTab('info')}>
            <span className="flex items-center gap-1.5"><Mail size={13} />Info</span>
          </button>
          <button className={tabCls('schedule')} onClick={() => setTab('schedule')}>
            <span className="flex items-center gap-1.5"><Calendar size={13} />Schedule</span>
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-4xl mx-auto">

            {/* -- Info tab -- */}
            {tab === 'info' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className={`${card} p-5 space-y-3`}>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Contact Information</h3>
                  <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <Mail size={15} className="text-gray-400 shrink-0" />
                    <span className="truncate">{employee.email || '—'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <Phone size={15} className="text-gray-400 shrink-0" />
                    <span>{employee.phone || '—'}</span>
                  </div>
                </div>
                <div className={`${card} p-5 space-y-3`}>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Employment Details</h3>
                  <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <Building2 size={15} className="text-gray-400 shrink-0" />
                    <span>{employee.department || '—'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <Briefcase size={15} className="text-gray-400 shrink-0" />
                    <span>{employee.position || '—'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <Hash size={15} className="text-gray-400 shrink-0" />
                    <span className="font-mono">{employee.employeeId || '—'}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                    <Calendar size={15} className="text-gray-400 shrink-0" />
                    <span>{employee.createdAt ? new Date(employee.createdAt).toLocaleDateString() : '—'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* -- Schedule tab -- */}
            {tab === 'schedule' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 dark:text-white">Work Schedule</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Individual schedule assigned to {employee.firstName}
                    </p>
                  </div>
                  <button
                    onClick={() => setEditingSchedule(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                    <Edit3 size={14} /> Edit Schedule
                  </button>
                </div>

                {loadingSchedule ? (
                  <div className="flex justify-center py-12">
                    <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : currentSchedule.length === 0 ? (
                  <div className={`${card} p-8 text-center`}>
                    <Calendar size={32} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">No schedule set</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      This employee is using the company default (Mon·Fri, 2:30 ጠዋት – 11:30 ቀን).
                    </p>
                    <button onClick={() => setEditingSchedule(true)}
                      className="mt-4 px-4 py-2 text-sm font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                      Set Custom Schedule
                    </button>
                  </div>
                ) : (
                  <div className={`${card} overflow-hidden`}>
                    <div className="px-5 py-3 border-b border-gray-100 dark:border-white/[0.07] bg-gray-50 dark:bg-[#0F1929]/50">
                      <div className="grid grid-cols-5 gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        <span>Day</span>
                        <span>Status</span>
                        <span>Check-in</span>
                        <span>Check-out</span>
                        <span>Grace</span>
                      </div>
                    </div>
                    <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                      {currentSchedule.map((s: any) => {
                        const isWorking = s.isWorkingDay !== false;
                        return (
                          <div key={s.id ?? s.dayOfWeek}
                            className={`px-5 py-3 grid grid-cols-5 gap-2 items-center text-sm ${!isWorking ? 'opacity-50' : ''}`}>
                            <span className="font-semibold text-gray-900 dark:text-white">
                              {s.dayName ?? DOW_TO_SHORT[s.dayOfWeek]}
                            </span>
                            <span>
                              {isWorking
                                ? <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">Working</span>
                                : <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-[#0F1929] text-gray-500 dark:text-gray-400">Off</span>
                              }
                            </span>
                            <span className="text-gray-700 dark:text-gray-300">
                              {isWorking ? toEthTime((s.workStartTime ?? '').slice(0, 5)) : '—'}
                            </span>
                            <span className="text-gray-700 dark:text-gray-300">
                              {isWorking ? toEthTime((s.workEndTime ?? '').slice(0, 5)) : '—'}
                            </span>
                            <span className="text-gray-500 dark:text-gray-400">
                              {isWorking ? `${s.lateThresholdMinutes ?? s.graceMinutes ?? 15} min` : '—'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}

// --- Main Page ----------------------------------------------------------------
export const EmployeeDirectory = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [selected, setSelected] = useState<any>(null);

  const fetchEmployees = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await apiClient.get('/users?role=EMPLOYEE');
      if (res.data.success) setEmployees((res.data.data as any[]) ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);
  useOnRefresh('users', useCallback(() => fetchEmployees(true), [fetchEmployees]));

  const departments = Array.from(new Set(employees.map(e => e.department).filter(Boolean)));

  const filtered = employees.filter(e => {
    const matchSearch = !searchTerm ||
      e.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.employeeId?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || e.status === statusFilter;
    const matchDept = deptFilter === 'ALL' || e.department === deptFilter;
    return matchSearch && matchStatus && matchDept;
  });

  const stats = [
    { label: 'Total',    value: employees.length,                                          color: 'text-blue-600 dark:text-blue-400',   bg: 'bg-blue-100 dark:bg-blue-900/30',   icon: <Users size={18} /> },
    { label: 'Active',   value: employees.filter(e => e.status === 'ACTIVE').length,       color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30', icon: <UserCheck size={18} /> },
    { label: 'Inactive', value: employees.filter(e => e.status === 'INACTIVE').length,     color: 'text-red-600 dark:text-red-400',     bg: 'bg-red-100 dark:bg-red-900/30',     icon: <UserX size={18} /> },
    { label: 'Pending',  value: employees.filter(e => e.status === 'PENDING_APPROVAL').length, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30', icon: <Clock size={18} /> },
  ];

  if (selected) return (
    <EmployeeDetail
      employee={selected}
      onClose={() => setSelected(null)}
      onScheduleUpdated={() => fetchEmployees(true)}
    />
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Team Directory</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Browse, search, and manage employee schedules</p>
        </div>
        <button onClick={() => fetchEmployees(true)} disabled={refreshing}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className={`${card} p-4 flex items-center gap-3`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${s.bg}`}>
              <span className={s.color}>{s.icon}</span>
            </div>
            <div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className={`${card} p-3 flex flex-wrap gap-3`}>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by name, email, ID..." value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-gray-50 dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40">
          <option value="ALL">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="PENDING_APPROVAL">Pending</option>
        </select>
        {departments.length > 0 && (
          <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40">
            <option value="ALL">All Departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      {/* Employee List */}
      <div className={card}>
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {filtered.length > 0 ? filtered.map(emp => (
              <button key={emp.id} onClick={() => setSelected(emp)}
                className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors text-left group">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                  {emp.profilePicture
                    ? <img src={emp.profilePicture} alt="" className="w-full h-full rounded-full object-cover" />
                    : <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{emp.firstName?.[0]}{emp.lastName?.[0]}</span>
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white text-sm">{emp.fullName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    {[emp.position, emp.department].filter(Boolean).join(' · ') || emp.email}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {emp.department && (
                    <span className="hidden sm:block text-xs text-gray-400 dark:text-gray-500">{emp.department}</span>
                  )}
                  <StatusBadge status={emp.status} />
                  <span className="flex items-center gap-1 text-xs text-blue-500 font-medium">
                    <Calendar size={12} /> Schedule
                  </span>
                </div>
              </button>
            )) : (
              <div className="py-16 text-center">
                <Users size={32} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-400 dark:text-gray-500">No employees found</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
