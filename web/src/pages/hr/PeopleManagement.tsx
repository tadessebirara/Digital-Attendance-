import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Users, UserCheck, UserX, Clock, Eye,
  CheckCircle, XCircle, RefreshCw, AlertCircle, X,
  TrendingUp, FileText, Upload, Phone,
  Calendar, Mail, Building2, Briefcase, Hash,
  DollarSign, Star, Trash2,
} from 'lucide-react';
import { useDataRefresh } from '../../context/DataRefreshContext';
import { ConfirmModal, useConfirm } from '../../components/common';
// FIX 7: Use the authenticated apiClient â€” never raw axios.
// apiClient attaches Authorization header and handles 401 â†’ token refresh automatically.
import apiClient from '../../api/client';
import { Pagination } from '../../components/common';
const inputCls = `w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40`;
const cardCls = `bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07]`;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    INACTIVE: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    PENDING_APPROVAL: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
    PENDING_ACTIVATION: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
    ON_LEAVE: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    PRESENT: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    LATE: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
    ABSENT: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    APPROVED: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    REJECTED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    PENDING: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? 'bg-gray-100 dark:bg-[#0F1929] text-gray-600 dark:text-gray-400'}`}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

// â”€â”€â”€ Work Schedule on Approve Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ── Ethiopian time helper ─────────────────────────────────────────────────────
// Converts HH:MM (24h EAT) to Ethiopian 12-hour display
// Ethiopian clock: 6:00 AM standard = 12:00 ጠዋት Ethiopian
// e.g. 08:30 → 2:30 ጠዋት  |  17:30 → 11:30 ቀን
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

const SHIFT_TYPES = ['REGULAR', 'FLEXIBLE', 'SHIFT', 'CUSTOM'] as const;
type ShiftType = typeof SHIFT_TYPES[number];
const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULT_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

interface WorkSchedule {
  shiftType: ShiftType;
  workDays: string[];
  startTime: string;
  endTime: string;
  gracePeriod: number;
  coreStart?: string;
  coreEnd?: string;
  flexWindow?: number;
  shift?: 'Morning' | 'Evening' | 'Night';
  rotation?: 'Weekly' | 'Bi-weekly';
}

function defaultSchedule(t: ShiftType): WorkSchedule {
  return { shiftType: t, workDays: [...DEFAULT_DAYS], startTime: '08:30', endTime: '17:30', gracePeriod: 0 };
}

function ApproveWithScheduleModal({ employee, onClose, onDone }: {
  employee: any; onClose: () => void; onDone: () => void;
}) {
  const [schedule, setSchedule] = useState<WorkSchedule>(defaultSchedule('REGULAR'));
  const [department, setDepartment] = useState(employee.department || '');
  const [position, setPosition] = useState(employee.position || '');
  const [monthlySalary, setMonthlySalary] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function set<K extends keyof WorkSchedule>(k: K, v: WorkSchedule[K]) {
    setSchedule(s => ({ ...s, [k]: v }));
  }
  const toggleDay = (d: string) => set('workDays', schedule.workDays.includes(d) ? schedule.workDays.filter(x => x !== d) : [...schedule.workDays, d]);

  const handleApprove = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await apiClient.post(`/auth/approve-account/${employee.id}`, {
        action: 'APPROVE',
        workSchedule: schedule,
        department,
        position,
        monthlySalary: monthlySalary ? parseFloat(monthlySalary) : 0,
      });
      const newStatus = (res.data?.data as any)?.newStatus as string | undefined;
      const msg = newStatus === 'ACTIVE'
        ? `âœ“ Approved & Activated! ${employee.email} can log in immediately with their existing password.`
        : `âœ“ Approved! Activation email sent to ${employee.email}. They will sign in â†’ enter OTP â†’ set password.`;
      setSuccess(msg);
      setTimeout(() => { onDone(); onClose(); }, 3000);
    } catch (err: any) {
      const msg = err?.error || err?.response?.data?.error || err?.message || 'Failed to approve';
      setError(msg);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-[#0F1929] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/[0.07] max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.07]">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Approve Employee</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Set work schedule and details before approving {employee.firstName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm"><AlertCircle size={14} />{error}</div>}
          {success && <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm font-medium"><CheckCircle size={14} />{success}</div>}

          {/* Employee info */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{employee.firstName?.[0]}{employee.lastName?.[0]}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{employee.fullName}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{employee.email}</p>
            </div>
          </div>

          {/* Department & Position */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Department</label>
              <input type="text" value={department} onChange={e => setDepartment(e.target.value)} className={inputCls} placeholder="e.g. Engineering" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Position</label>
              <input type="text" value={position} onChange={e => setPosition(e.target.value)} className={inputCls} placeholder="e.g. Developer" />
            </div>
          </div>

          {/* Net Monthly Salary */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
              Net Monthly Salary (ETB)
              <span className="ml-1 text-gray-400 font-normal">â€” net, no tax deductions</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">ETB</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={monthlySalary}
                onChange={e => setMonthlySalary(e.target.value)}
                className={`${inputCls} pl-12`}
                placeholder="0.00 (can be set later)"
              />
            </div>
          </div>

          {/* Shift type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Shift Type</label>
            <div className="grid grid-cols-2 gap-2">
              {SHIFT_TYPES.map(t => (
                <button key={t} type="button" onClick={() => setSchedule(defaultSchedule(t))}
                  className={`py-2 px-3 rounded-lg text-xs font-medium border-2 transition-all ${schedule.shiftType === t ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' : 'border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-400 hover:border-blue-300'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Work days */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Work Days</label>
            <div className="flex flex-wrap gap-2">
              {ALL_DAYS.map(d => (
                <button key={d} type="button" onClick={() => toggleDay(d)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${schedule.workDays.includes(d) ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white dark:bg-[#0F1929] border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-400 hover:border-blue-400'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Times */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Start Time
                <span className="ml-1.5 text-blue-500 font-semibold">{toEthTime(schedule.startTime)}</span>
              </label>
              <input type="time" value={schedule.startTime} onChange={e => set('startTime', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                End Time
                <span className="ml-1.5 text-blue-500 font-semibold">{toEthTime(schedule.endTime)}</span>
              </label>
              <input type="time" value={schedule.endTime} onChange={e => set('endTime', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Grace (min)</label>
              <input type="number" min={0} value={schedule.gracePeriod} onChange={e => set('gracePeriod', Number(e.target.value))} className={inputCls} />
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 dark:border-white/[0.07] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          <button onClick={handleApprove} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-50 transition-colors">
            {saving ? 'Approving...' : 'âœ“ Approve & Activate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Payroll Tab (inside Employee Profile) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function PayrollTab({ employee }: { employee: any }) {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [payroll, setPayroll]   = useState<any>(null);
  const [loading, setLoading]   = useState(false);
  const [baseSalary, setBaseSalary] = useState<number>(employee.monthlySalary ?? 0);
  const [editing,  setEditing]  = useState(false);
  const [editVal,  setEditVal]  = useState('');
  const [saving,   setSaving]   = useState(false);
  const [toast,    setToast]    = useState('');
  const [error,    setError]    = useState('');

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const fmt = (n: number) => n.toLocaleString('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Load payroll for selected month
  useEffect(() => {
    const load = async () => {
      setLoading(true); setError('');
      try {
        const res: any = await apiClient.get(`/salary/payroll/${employee.id}?year=${year}&month=${month}`);
        if (res.data?.success) {
          const d = res.data.data;
          setPayroll(d);
          setBaseSalary(d.baseSalary ?? 0);
        }
      } catch { setError('Failed to load payroll'); }
      finally { setLoading(false); }
    };
    load();
  }, [employee.id, year, month]);

  const handleSaveSalary = async () => {
    const val = parseFloat(editVal);
    if (isNaN(val) || val < 0) { setToast('Invalid salary value'); return; }
    setSaving(true);
    try {
      await apiClient.put(`/salary/employees/${employee.id}`, { monthlySalary: val });
      setBaseSalary(val);
      setEditing(false);
      setToast('Salary updated');
      // reload payroll
      const res: any = await apiClient.get(`/salary/payroll/${employee.id}?year=${year}&month=${month}`);
      if (res.data?.success) setPayroll(res.data.data);
      setTimeout(() => setToast(''), 3000);
    } catch {
      setToast('Failed to save salary');
    } finally { setSaving(false); }
  };

  const startEdit = () => { setEditVal(String(baseSalary || '')); setEditing(true); };
  const cancelEdit = () => setEditing(false);

  return (
    <div className="space-y-4">
      {/* Toast */}
      {toast && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm">
          <CheckCircle size={14} />{toast}
        </div>
      )}

      {/* â”€â”€ Net Monthly Salary card â”€â”€ */}
      <div className={`${cardCls} p-5`}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Net Monthly Salary</p>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">Base amount before attendance penalties are applied</p>
          </div>
          {!editing && (
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 border border-blue-200 dark:border-blue-800 transition-colors"
            >
              {baseSalary > 0 ? 'âœ Edit Salary' : '+ Add Salary'}
            </button>
          )}
        </div>

        {editing ? (
          <div className="flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 font-medium">ETB</span>
              <input
                type="number"
                min={0}
                step="0.01"
                autoFocus
                value={editVal}
                onChange={e => setEditVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveSalary(); if (e.key === 'Escape') cancelEdit(); }}
                className={`${inputCls} pl-12 text-base font-bold`}
                placeholder="0.00"
              />
            </div>
            <button onClick={handleSaveSalary} disabled={saving} className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
              {saving ? 'Savingâ€¦' : 'Save'}
            </button>
            <button onClick={cancelEdit} className="px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.07] text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            {baseSalary > 0 ? (
              <>
                <span className="text-3xl font-bold text-gray-900 dark:text-white">ETB {fmt(baseSalary)}</span>
                <span className="text-sm text-gray-400 dark:text-gray-500">/ month</span>
              </>
            ) : (
              <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500">
                <DollarSign size={20} className="text-gray-300 dark:text-gray-600" />
                <span className="text-sm italic">No salary set â€” click "+ Add Salary" to configure</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* â”€â”€ Month selector â”€â”€ */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Calculate for:</span>
        <select value={month} onChange={e => setMonth(Number(e.target.value))}
          className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/30">
          {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select>
        <input type="number" value={year} min={2020} max={2099}
          onChange={e => setYear(Number(e.target.value))}
          className="w-20 px-2 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/30" />
      </div>

      {/* â”€â”€ Payroll breakdown â”€â”€ */}
      {loading ? (
        <div className="flex justify-center py-8"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : error ? (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
          <AlertCircle size={14} />{error}
        </div>
      ) : payroll ? (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Base Salary',       value: `ETB ${fmt(payroll.baseSalary)}`,       color: 'text-emerald-600 dark:text-emerald-400',  bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
              { label: 'Absence Deduction', value: payroll.absenceDeduction > 0 ? `âˆ’ETB ${fmt(payroll.absenceDeduction)}` : 'â€”', color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
              { label: 'Late Deduction',    value: payroll.lateDeduction > 0 ? `âˆ’ETB ${fmt(payroll.lateDeduction)}` : 'â€”',    color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
              { label: 'Net Salary',        value: `ETB ${fmt(payroll.netSalary)}`,        color: 'text-purple-700 dark:text-purple-400',    bg: 'bg-purple-50 dark:bg-purple-900/20' },
            ].map(s => (
              <div key={s.label} className={`${cardCls} p-4 flex items-center gap-3 ${s.bg} border-0`}>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
                  <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Absent Days',    value: payroll.absentDays,       color: 'text-red-600 dark:text-red-400' },
              { label: 'Half Days',      value: payroll.halfDays,          color: 'text-orange-600 dark:text-orange-400' },
              { label: 'Late Days',      value: payroll.lateDays,          color: 'text-amber-600 dark:text-amber-400' },
              { label: 'Late Minutes',   value: payroll.totalLateMinutes,  color: 'text-blue-600 dark:text-blue-400' },
            ].map(s => (
              <div key={s.label} className={`${cardCls} p-3 text-center`}>
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Net salary formula */}
          {payroll.baseSalary > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-gray-50 dark:bg-[#0F1929]/60 border border-gray-100 dark:border-white/[0.07] text-sm">
              <span className="text-gray-500 dark:text-gray-400">Net =</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">ETB {fmt(payroll.baseSalary)}</span>
              {payroll.absenceDeduction > 0 && <><span className="text-gray-400">âˆ’</span><span className="text-red-600 dark:text-red-400">{fmt(payroll.absenceDeduction)}</span></>}
              {payroll.lateDeduction > 0 && <><span className="text-gray-400">âˆ’</span><span className="text-amber-600 dark:text-amber-400">{fmt(payroll.lateDeduction)}</span></>}
              <span className="text-gray-400">=</span>
              <span className="font-bold text-purple-700 dark:text-purple-400">ETB {fmt(payroll.netSalary)}</span>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

// â”€â”€â”€ Employee Profile Panel (slide-in from right) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type ProfileTab = 'overview' | 'attendance' | 'leave' | 'documents' | 'payroll' | 'performance';

function EmployeeProfilePanel({ employee, onClose }: { employee: any; onClose: () => void }) {
  const [tab, setTab] = useState<ProfileTab>('overview');
  const [attRange, setAttRange] = useState<'today' | 'week' | 'month' | 'custom'>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [attendance, setAttendance] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [overviewStats, setOverviewStats] = useState({ present: 0, late: 0, absent: 0, rate: 0 });
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loadingAtt, setLoadingAtt] = useState(false);
  const [loadingLeave, setLoadingLeave] = useState(false);
  
  // Pagination state for attendance and leave tables
  const [attCurrentPage, setAttCurrentPage] = useState(1);
  const [attRowsPerPage, setAttRowsPerPage] = useState(15);
  const [leaveCurrentPage, setLeaveCurrentPage] = useState(1);
  const [leaveRowsPerPage, setLeaveRowsPerPage] = useState(15);

  const getRange = useCallback(() => {
    const now = new Date();
    if (attRange === 'today') { const d = now.toISOString().split('T')[0]; return { s: d, e: d }; }
    if (attRange === 'week') { const s = new Date(now); s.setDate(now.getDate() - 6); return { s: s.toISOString().split('T')[0], e: now.toISOString().split('T')[0] }; }
    if (attRange === 'month') { const s = new Date(now.getFullYear(), now.getMonth(), 1); return { s: s.toISOString().split('T')[0], e: now.toISOString().split('T')[0] }; }
    return { s: customFrom, e: customTo };
  }, [attRange, customFrom, customTo]);

  const fetchAttendance = useCallback(async () => {
    const { s, e } = getRange();
    if (!s || !e) return;
    setLoadingAtt(true);
    try {
      const res: any = await apiClient.get(`/attendance?userId=${employee.id}&startDate=${s}&endDate=${e}&limit=200`);
      if (res.data?.success) setAttendance(res.data.data ?? []);
    } catch { /* silent */ }
    finally { setLoadingAtt(false); }
  }, [employee.id, getRange]);

  const fetchLeaves = useCallback(async () => {
    setLoadingLeave(true);
    try {
      const res: any = await apiClient.get(`/leaves?userId=${employee.id}&limit=200`);
      if (res.data?.success) setLeaves(res.data.data ?? []);
    } catch { /* silent */ }
    finally { setLoadingLeave(false); }
  }, [employee.id]);

  // Overview: fetch this month's stats
  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const now = new Date();
        const s = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const e = now.toISOString().split('T')[0];
        const res: any = await apiClient.get(`/attendance?userId=${employee.id}&startDate=${s}&endDate=${e}&limit=200`);
        if (res.data?.success) {
          const data: any[] = res.data.data ?? [];
          const present = data.filter(r => r.status === 'PRESENT').length;
          const late = data.filter(r => r.status === 'LATE').length;
          const absent = data.filter(r => r.status === 'ABSENT').length;
          const total = present + late + absent;
          setOverviewStats({ present, late, absent, rate: total > 0 ? Math.round(((present + late) / total) * 100) : 0 });
          setRecentActivity(data.slice(0, 5));
        }
      } catch { /* silent */ }
    };
    fetchOverview();
  }, [employee.id]);

  useEffect(() => { if (tab === 'attendance') { fetchAttendance(); setAttCurrentPage(1); } }, [tab, fetchAttendance]);
  useEffect(() => { if (tab === 'leave') { fetchLeaves(); setLeaveCurrentPage(1); } }, [tab, fetchLeaves]);

  const attStats = {
    present: attendance.filter(r => r.status === 'PRESENT').length,
    late: attendance.filter(r => r.status === 'LATE').length,
    absent: attendance.filter(r => r.status === 'ABSENT').length,
    hours: attendance.reduce((s, r) => s + (parseFloat(r.hoursWorked || r.totalHours) || 0), 0).toFixed(1),
  };

  // Data slicing for attendance pagination
  const attStartIndex = (attCurrentPage - 1) * attRowsPerPage;
  const attEndIndex = attStartIndex + attRowsPerPage;
  const paginatedAttendance = attendance.slice(attStartIndex, attEndIndex);

  // Data slicing for leave pagination
  const leaveStartIndex = (leaveCurrentPage - 1) * leaveRowsPerPage;
  const leaveEndIndex = leaveStartIndex + leaveRowsPerPage;
  const paginatedLeaves = leaves.slice(leaveStartIndex, leaveEndIndex);

  const TABS: { id: ProfileTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview',     label: 'Overview',     icon: <TrendingUp size={13} /> },
    { id: 'attendance',   label: 'Attendance',   icon: <Clock size={13} /> },
    { id: 'leave',        label: 'Leave',        icon: <Calendar size={13} /> },
    { id: 'documents',    label: 'Documents',    icon: <FileText size={13} /> },
    { id: 'payroll',      label: 'Payroll',      icon: <DollarSign size={13} /> },
    { id: 'performance',  label: 'Performance',  icon: <Star size={13} /> },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col min-w-0 bg-white dark:bg-[#0F1929]">        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-4 border-b border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] shrink-0">
          <button onClick={onClose} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0 border border-gray-200 dark:border-white/[0.07]">
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
              {employee.department && <span className="text-xs text-gray-400 dark:text-gray-500">Â· {employee.department}</span>}
              {employee.position && <span className="text-xs text-gray-400 dark:text-gray-500">Â· {employee.position}</span>}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <StatusBadge status={employee.status} />
              <span className="text-xs text-gray-400 dark:text-gray-500">Joined {employee.createdAt ? new Date(employee.createdAt).toLocaleDateString() : 'â€”'}</span>
            </div>
          </div>
        </div>

        {/* Tab nav */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] shrink-0 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                tab === t.id ? 'bg-blue-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 max-w-5xl mx-auto w-full">

          {/* â”€â”€ OVERVIEW â”€â”€ */}
          {tab === 'overview' && (
            <>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Present', value: overviewStats.present, color: 'text-green-600 dark:text-green-400' },
                  { label: 'Late', value: overviewStats.late, color: 'text-yellow-600 dark:text-yellow-400' },
                  { label: 'Absent', value: overviewStats.absent, color: 'text-red-600 dark:text-red-400' },
                  { label: 'Att. Rate', value: `${overviewStats.rate}%`, color: 'text-blue-600 dark:text-blue-400' },
                ].map(s => (
                  <div key={s.label} className={`${cardCls} p-4 text-center`}>
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className={`${cardCls} p-4 space-y-2.5`}>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Contact Info</h3>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"><Mail size={14} className="text-gray-400 shrink-0" /><span className="truncate">{employee.email || 'â€”'}</span></div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"><Phone size={14} className="text-gray-400 shrink-0" /><span>{employee.phone || 'â€”'}</span></div>
                </div>
                <div className={`${cardCls} p-4 space-y-2.5`}>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Employment</h3>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"><Building2 size={14} className="text-gray-400 shrink-0" /><span>{employee.department || 'â€”'}</span></div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"><Briefcase size={14} className="text-gray-400 shrink-0" /><span>{employee.position || 'â€”'}</span></div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"><Hash size={14} className="text-gray-400 shrink-0" /><span className="font-mono">{employee.employeeId || 'â€”'}</span></div>
                </div>
              </div>

              <div className={`${cardCls} p-4`}>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Recent Activity (This Month)</h3>
                {recentActivity.length === 0
                  ? <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No recent activity</p>
                  : <div className="space-y-2">
                    {recentActivity.map((r, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-white/[0.07]/50 last:border-0">
                        <div>
                          <p className="text-sm text-gray-700 dark:text-gray-300">{r.date ? new Date(r.date).toLocaleDateString() : r.clockInTime ? new Date(r.clockInTime).toLocaleDateString() : 'â€”'}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {r.clockInTime ? `In: ${new Date(r.clockInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                            {r.clockOutTime ? ` Â· Out: ${new Date(r.clockOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                          </p>
                        </div>
                        <StatusBadge status={r.status} />
                      </div>
                    ))}
                  </div>
                }
              </div>
            </>
          )}

          {/* â”€â”€ ATTENDANCE â”€â”€ */}
          {tab === 'attendance' && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {(['today', 'week', 'month', 'custom'] as const).map(r => (
                  <button key={r} onClick={() => setAttRange(r)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${attRange === r ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-[#0F1929] text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
                    {r === 'week' ? 'This Week' : r === 'month' ? 'This Month' : r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
                {attRange === 'custom' && (
                  <div className="flex items-center gap-2">
                    <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className={`${inputCls} w-auto`} />
                    <span className="text-gray-400 text-xs">to</span>
                    <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className={`${inputCls} w-auto`} />
                    <button onClick={fetchAttendance} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors">Apply</button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Present', value: attStats.present, color: 'text-green-600 dark:text-green-400' },
                  { label: 'Late', value: attStats.late, color: 'text-yellow-600 dark:text-yellow-400' },
                  { label: 'Absent', value: attStats.absent, color: 'text-red-600 dark:text-red-400' },
                  { label: 'Total Hours', value: `${attStats.hours}h`, color: 'text-blue-600 dark:text-blue-400' },
                ].map(s => (
                  <div key={s.label} className={`${cardCls} p-4 text-center`}>
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className={`${cardCls} overflow-hidden`}>
                {loadingAtt
                  ? <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
                  : <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b border-gray-100 dark:border-white/[0.07]">
                            {['Date', 'Check In', 'Check Out', 'Hours', 'Status'].map(h => (
                              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                            ))}
                          </tr></thead>
                          <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                            {paginatedAttendance.length > 0 ? paginatedAttendance.map((r, i) => (
                              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{r.clockInTime ? new Date(r.clockInTime).toLocaleDateString() : 'â€”'}</td>
                                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{r.clockInTime ? new Date(r.clockInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'â€”'}</td>
                                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{r.clockOutTime ? new Date(r.clockOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'â€”'}</td>
                                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{r.hoursWorked ? `${parseFloat(r.hoursWorked).toFixed(1)}h` : 'â€”'}</td>
                                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                              </tr>
                            )) : <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">No records for this period</td></tr>}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Pagination for attendance */}
                      <Pagination
                        totalItems={attendance.length}
                        rowsPerPage={attRowsPerPage}
                        currentPage={attCurrentPage}
                        onPageChange={setAttCurrentPage}
                        onRowsPerPageChange={setAttRowsPerPage}
                        compact
                      />
                    </>
                }
              </div>
            </>
          )}

          {/* â”€â”€ LEAVE â”€â”€ */}
          {tab === 'leave' && (
            <>
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'Sick Leave', key: 'SICK', color: 'text-red-600 dark:text-red-400' },
                  { label: 'Annual', key: 'ANNUAL', color: 'text-blue-600 dark:text-blue-400' },
                  { label: 'Personal', key: 'PERSONAL', color: 'text-purple-600 dark:text-purple-400' },
                  { label: 'Emergency', key: 'EMERGENCY', color: 'text-orange-600 dark:text-orange-400' },
                ].map(s => {
                  const used = leaves.filter(l => l.leaveType?.toUpperCase().includes(s.key) && l.status === 'APPROVED').reduce((sum, l) => sum + (l.daysRequested || l.days || 0), 0);
                  return (
                    <div key={s.key} className={`${cardCls} p-4 text-center`}>
                      <p className={`text-2xl font-bold ${s.color}`}>{used}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{s.label} Used</p>
                    </div>
                  );
                })}
              </div>

              <div className={`${cardCls} overflow-hidden`}>
                {loadingLeave
                  ? <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
                  : <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead><tr className="border-b border-gray-100 dark:border-white/[0.07]">
                            {['Type', 'From', 'To', 'Days', 'Status', 'Reason'].map(h => (
                              <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                            ))}
                          </tr></thead>
                          <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                            {paginatedLeaves.length > 0 ? paginatedLeaves.map((l, i) => (
                              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                <td className="px-4 py-3 text-gray-700 dark:text-gray-300 capitalize">{l.leaveType?.replace('_', ' ').toLowerCase() || 'â€”'}</td>
                                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{l.startDate ? new Date(l.startDate).toLocaleDateString() : 'â€”'}</td>
                                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{l.endDate ? new Date(l.endDate).toLocaleDateString() : 'â€”'}</td>
                                <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{l.daysRequested ?? l.days ?? 'â€”'}</td>
                                <td className="px-4 py-3"><StatusBadge status={l.status} /></td>
                                <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs max-w-[140px] truncate">{l.reason || 'â€”'}</td>
                              </tr>
                            )) : <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400 dark:text-gray-500">No leave records</td></tr>}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Pagination for leave */}
                      <Pagination
                        totalItems={leaves.length}
                        rowsPerPage={leaveRowsPerPage}
                        currentPage={leaveCurrentPage}
                        onPageChange={setLeaveCurrentPage}
                        onRowsPerPageChange={setLeaveRowsPerPage}
                        compact
                      />
                    </>
                }
              </div>
            </>
          )}

          {/* â”€â”€ DOCUMENTS â”€â”€ */}
          {tab === 'documents' && (
            <DocumentsTab employee={employee} />
          )}

          {/* â”€â”€ PAYROLL â”€â”€ */}
          {tab === 'payroll' && (
            <PayrollTab employee={employee} />
          )}

          {/* â”€â”€ PERFORMANCE â”€â”€ */}
          {tab === 'performance' && (
            <PerformanceTab employee={employee} />
          )}
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Documents Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DOC_TYPES = [
  { value: 'CV_RESUME',           label: 'CV / Resume',         color: 'text-blue-500'   },
  { value: 'EMPLOYMENT_CONTRACT', label: 'Employment Contract', color: 'text-green-500'  },
  { value: 'NATIONAL_ID',         label: 'National ID',         color: 'text-purple-500' },
  { value: 'CERTIFICATE',         label: 'Certificate',         color: 'text-orange-500' },
  { value: 'OTHER',               label: 'Other',               color: 'text-gray-500'   },
];

function DocumentsTab({ employee }: { employee: any }) {
  const empId = employee?.id;
  const [docs,      setDocs]      = useState<any[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [uploading, setUploading] = useState(false);
  const [docType,   setDocType]   = useState('CV_RESUME');
  const [docToast,  setDocToast]  = useState<{ msg: string; ok: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { confirmProps: docConfirmProps, confirm: confirmDoc } = useConfirm();

  const showDocToast = (msg: string, ok = true) => { setDocToast({ msg, ok }); setTimeout(() => setDocToast(null), 3000); };

  const docCardCls  = 'rounded-xl bg-white dark:bg-[#0F1929] border border-gray-100 dark:border-white/[0.07]/50';
  const docInputCls = 'px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30';

  const loadDocs = useCallback(async () => {
    if (!empId) return;
    setLoading(true);
    try {
      const r = await apiClient.get(`/uploads/employee-documents/${empId}`);
      if (r.data.success) setDocs((r.data.data as any[]) ?? []);
    } catch { /**/ }
    finally { setLoading(false); }
  }, [empId]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('document', file);
      fd.append('docType', docType);
      fd.append('label', file.name);
      await apiClient.post(`/uploads/employee-documents/${empId}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      showDocToast('Document uploaded');
      loadDocs();
    } catch { showDocToast('Upload failed', false); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  const handleDelete = async (docId: number) => {
    const ok = await confirmDoc({ title: 'Delete Document', message: 'This document will be permanently deleted and cannot be recovered.', confirmLabel: 'Delete', variant: 'danger' });
    if (!ok) return;
    try {
      await apiClient.delete(`/uploads/employee-documents/${empId}/${docId}`);
      showDocToast('Document deleted');
      loadDocs();
    } catch { showDocToast('Failed to delete', false); }
  };

  const fmtSize = (b: number) => b < 1024 * 1024 ? `${(b/1024).toFixed(0)} KB` : `${(b/1024/1024).toFixed(1)} MB`;

  return (
    <div className="space-y-4">
      <ConfirmModal {...docConfirmProps} />
      {docToast && (
        <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium ${docToast.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300'}`}>
          {docToast.ok ? 'âœ“' : 'âœ•'} {docToast.msg}
        </div>
      )}
      <div className={`${docCardCls} p-4`}>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Upload Document</h3>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={docType} onChange={e => setDocType(e.target.value)} className={docInputCls}>
            {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${uploading ? 'opacity-50 pointer-events-none bg-gray-400' : 'bg-blue-600 hover:bg-blue-700'} text-white`}>
            {uploading ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Uploadingâ€¦</> : <><Upload size={13} />Choose File</>}
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={handleUpload} disabled={uploading} />
          </label>
          <span className="text-xs text-gray-400 dark:text-gray-500">PDF, JPG, PNG, DOC â€” max 10 MB</span>
        </div>
      </div>
      <div className={`${docCardCls} p-4`}>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
          Uploaded Documents {docs.length > 0 && <span className="text-gray-400 font-normal">({docs.length})</span>}
        </h3>
        {loading ? (
          <div className="flex justify-center py-6"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : docs.length === 0 ? (
          <div className="py-8 text-center"><FileText size={28} className="text-gray-300 dark:text-gray-600 mx-auto mb-2" /><p className="text-xs text-gray-400 dark:text-gray-500">No documents uploaded yet</p></div>
        ) : (
          <div className="space-y-2">
            {docs.map((doc: any) => {
              const ti = DOC_TYPES.find(t => t.value === doc.doc_type) || DOC_TYPES[4];
              return (
                <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-gray-100 dark:border-white/[0.07] hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText size={16} className={ti.color} />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-700 dark:text-gray-300 truncate font-medium">{doc.label}</p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">{ti.label} Â· {doc.file_size ? fmtSize(doc.file_size) : 'â€”'} Â· {new Date(doc.created_at).toLocaleDateString()} Â· by {doc.uploaded_by_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="View"><Eye size={13} /></a>
                    <button onClick={() => handleDelete(doc.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors" title="Delete"><Trash2 size={13} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// â”€â”€â”€ Performance Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function PerformanceTab({ employee }: { employee: any }) {
  const empId = employee?.id;

  // â”€â”€ HR Notes â”€â”€
  const [notes,       setNotes]       = useState('');
  const [loadingNote, setLoadingNote] = useState(true);
  const [savingNote,  setSavingNote]  = useState(false);
  const [noteSaved,   setNoteSaved]   = useState(false);

  // â”€â”€ KPI + Ratings â”€â”€
  const [perf,        setPerf]        = useState<any>(null);
  const [loadingPerf, setLoadingPerf] = useState(true);
  const [months,      setMonths]      = useState(3);

  // â”€â”€ Add Rating â”€â”€
  const [showForm,    setShowForm]    = useState(false);
  const [ratingForm,  setRatingForm]  = useState({ period: new Date().toISOString().slice(0,7), rating: 3, category: 'OVERALL', notes: '' });
  const [savingRating,setSavingRating]= useState(false);

  const { confirmProps: perfConfirmProps, confirm: confirmPerf } = useConfirm();

  const cardCls  = 'rounded-xl bg-white dark:bg-[#0F1929] border border-gray-100 dark:border-white/[0.07]/50';
  const inputCls = 'w-full px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30';

  useEffect(() => {
    if (!empId) return;
    // Load HR notes
    apiClient.get(`/users/${empId}/hr-notes`)
      .then(r => { if (r.data.success) setNotes((r.data.data as any)?.notes || ''); })
      .catch(() => {})
      .finally(() => setLoadingNote(false));
  }, [empId]);

  useEffect(() => {
    if (!empId) return;
    setLoadingPerf(true);
    apiClient.get(`/users/${empId}/performance?months=${months}`)
      .then(r => { if (r.data.success) setPerf(r.data.data); })
      .catch(() => {})
      .finally(() => setLoadingPerf(false));
  }, [empId, months]);

  const handleSaveNote = async () => {
    setSavingNote(true); setNoteSaved(false);
    try {
      await apiClient.put(`/users/${empId}/hr-notes`, { notes });
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 3000);
    } catch { /**/ } finally { setSavingNote(false); }
  };

  const handleAddRating = async () => {
    setSavingRating(true);
    try {
      await apiClient.post(`/users/${empId}/performance`, ratingForm);
      setShowForm(false);
      // Reload
      const r = await apiClient.get(`/users/${empId}/performance?months=${months}`);
      if (r.data.success) setPerf(r.data.data);
    } catch { /**/ } finally { setSavingRating(false); }
  };

  const handleDeleteRating = async (rid: number) => {
    const ok = await confirmPerf({ title: 'Delete Rating', message: 'This performance rating will be permanently deleted.', confirmLabel: 'Delete', variant: 'danger' });
    if (!ok) return;
    await apiClient.delete(`/users/${empId}/performance/${rid}`);
    const r = await apiClient.get(`/users/${empId}/performance?months=${months}`);
    if (r.data.success) setPerf(r.data.data);
  };

  const stars = (n: number) => 'â˜…'.repeat(n) + 'â˜†'.repeat(5 - n);
  const ratingColor = (n: number) =>
    n >= 4 ? 'text-emerald-600 dark:text-emerald-400' :
    n === 3 ? 'text-amber-500 dark:text-amber-400' :
    'text-rose-500 dark:text-rose-400';

  const kpi = perf?.kpi;
  const attendanceRate  = kpi?.attendanceRate  ?? null;
  const punctualityRate = kpi?.punctualityRate ?? null;

  return (
    <div className="space-y-4">
      <ConfirmModal {...perfConfirmProps} />
      {/* â”€â”€ Attendance KPIs â”€â”€ */}
      <div className={`${cardCls} p-4`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Attendance Overview</h3>
          <select value={months} onChange={e => setMonths(+e.target.value)}
            className="text-xs px-2 py-1 rounded-lg bg-gray-100 dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-300">
            {[1,3,6,12].map(m => <option key={m} value={m}>Last {m} month{m>1?'s':''}</option>)}
          </select>
        </div>
        {loadingPerf ? (
          <div className="flex justify-center py-6"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : kpi ? (
          <>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: 'Present',    value: kpi.present,    color: 'text-emerald-600' },
                { label: 'Late',       value: kpi.late,       color: 'text-amber-500'   },
                { label: 'Absent',     value: kpi.absent,     color: 'text-rose-500'    },
                { label: 'Half Day',   value: kpi.halfDay,    color: 'text-orange-500'  },
                { label: 'Early Leave',value: kpi.earlyLeave, color: 'text-yellow-600'  },
                { label: 'Avg Hours',  value: kpi.avgHours ? kpi.avgHours+'h' : 'â€”', color: 'text-blue-600' },
              ].map(s => (
                <div key={s.label} className="rounded-lg bg-gray-50 dark:bg-[#0F1929]/60 p-3 text-center">
                  <p className={`text-lg font-black ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 font-medium mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            {/* Rate bars */}
            {[
              { label: 'Attendance Rate',  pct: attendanceRate,  color: 'bg-emerald-500' },
              { label: 'Punctuality Rate', pct: punctualityRate, color: 'bg-blue-500'    },
            ].map(bar => bar.pct != null && (
              <div key={bar.label} className="mb-2">
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                  <span>{bar.label}</span><span className="font-semibold">{bar.pct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div className={`h-full rounded-full ${bar.color} transition-all duration-500`} style={{ width: `${bar.pct}%` }} />
                </div>
              </div>
            ))}
          </>
        ) : <p className="text-xs text-gray-400 text-center py-4">No attendance data</p>}
      </div>

      {/* â”€â”€ HR Performance Ratings â”€â”€ */}
      <div className={`${cardCls} p-4`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Performance Ratings</h3>
          <button onClick={() => setShowForm(s => !s)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors">
            <Star size={11} /> Add Rating
          </button>
        </div>

        {/* Add rating form */}
        {showForm && (
          <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Period (YYYY-MM)</label>
                <input type="month" value={ratingForm.period}
                  onChange={e => setRatingForm(f => ({ ...f, period: e.target.value }))}
                  className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
                <select value={ratingForm.category}
                  onChange={e => setRatingForm(f => ({ ...f, category: e.target.value }))}
                  className={inputCls}>
                  {['OVERALL','ATTENDANCE','PUNCTUALITY','CONDUCT'].map(c => (
                    <option key={c} value={c}>{c.charAt(0)+c.slice(1).toLowerCase()}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Rating (1â€“5)</label>
              <div className="flex gap-2">
                {[1,2,3,4,5].map(n => (
                  <button key={n} type="button"
                    onClick={() => setRatingForm(f => ({ ...f, rating: n }))}
                    className={`w-8 h-8 rounded-lg text-sm font-bold transition-colors ${ratingForm.rating >= n ? 'bg-amber-400 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-400'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes (optional)</label>
              <input value={ratingForm.notes}
                onChange={e => setRatingForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Brief commentâ€¦" className={inputCls} />
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddRating} disabled={savingRating}
                className="px-4 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 transition-colors">
                {savingRating ? 'Savingâ€¦' : 'Save Rating'}
              </button>
              <button onClick={() => setShowForm(false)}
                className="px-4 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Ratings list */}
        {loadingPerf ? (
          <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : perf?.ratings?.length > 0 ? (
          <div className="space-y-2">
            {perf.ratings.map((r: any) => (
              <div key={r.id} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-gray-50 dark:bg-[#0F1929]/50 border border-gray-100 dark:border-white/[0.07]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-base font-black ${ratingColor(r.rating)}`}>{stars(r.rating)}</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 uppercase">{r.category}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500">{r.period}</span>
                  </div>
                  {r.notes && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">{r.notes}</p>}
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">by {r.rated_by_name}</p>
                </div>
                <button onClick={() => handleDeleteRating(r.id)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors shrink-0">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-6">No ratings yet â€” click "Add Rating" to start</p>
        )}
      </div>

      {/* â”€â”€ HR Notes â”€â”€ */}
      <div className={`${cardCls} p-4`}>
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">HR Notes (internal)</h3>
        {loadingNote ? (
          <div className="h-20 animate-pulse bg-gray-100 dark:bg-[#0F1929] rounded-lg" />
        ) : (
          <>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={4}
              placeholder="Internal notes about this employee â€” not visible to the employee..."
              className={`${inputCls} resize-none`} />
            <div className="mt-2 flex items-center gap-3">
              <button onClick={handleSaveNote} disabled={savingNote}
                className="px-4 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 transition-colors">
                {savingNote ? 'Savingâ€¦' : 'Save Notes'}
              </button>
              {noteSaved && <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">âœ“ Saved</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// â”€â”€â”€ Add Employee Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function AddEmployeeModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', phone: '', department: '', position: '', role: 'EMPLOYEE' });
  const [schedule, setSchedule] = useState<WorkSchedule>(defaultSchedule('REGULAR'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  function setSched<K extends keyof WorkSchedule>(k: K, v: WorkSchedule[K]) {
    setSchedule(s => ({ ...s, [k]: v }));
  }
  const toggleDay = (d: string) => setSched('workDays', schedule.workDays.includes(d) ? schedule.workDays.filter(x => x !== d) : [...schedule.workDays, d]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email || !form.password) {
      setError('First name, last name, email and password are required'); return;
    }
    if (form.password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setSaving(true); setError('');
    try {
      const res = await apiClient.post('/users', {
        ...form,
        workingTimeType: schedule.shiftType,
        workingDaysPerWeek: schedule.workDays.length,
        workSchedule: schedule,
      });
      if (res.data?.success) { onDone(); onClose(); }
      else setError(res.data?.error || 'Failed to create employee');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create employee');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-[#0F1929] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/[0.07] max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.07] shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Add New Employee</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {error && <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm"><AlertCircle size={14} />{error}</div>}

          {/* â”€â”€ Personal Info â”€â”€ */}
          <div>
            <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Personal Information</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">First Name *</label><input type="text" value={form.firstName} onChange={e => set('firstName', e.target.value)} className={inputCls} placeholder="John" required /></div>
                <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Last Name *</label><input type="text" value={form.lastName} onChange={e => set('lastName', e.target.value)} className={inputCls} placeholder="Doe" required /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email *</label><input type="email" value={form.email} onChange={e => set('email', e.target.value)} className={inputCls} placeholder="john@company.com" required /></div>
              <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Password *</label><input type="password" value={form.password} onChange={e => set('password', e.target.value)} className={inputCls} placeholder="Min 6 characters" required /></div>
              <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Phone</label><input type="text" value={form.phone} onChange={e => set('phone', e.target.value)} className={inputCls} placeholder="+1 234 567 8900" /></div>
            </div>
          </div>

          {/* â”€â”€ Employment â”€â”€ */}
          <div>
            <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Employment Details</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Department</label><input type="text" value={form.department} onChange={e => set('department', e.target.value)} className={inputCls} placeholder="Engineering" /></div>
                <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Position</label><input type="text" value={form.position} onChange={e => set('position', e.target.value)} className={inputCls} placeholder="Developer" /></div>
              </div>
              <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Role</label>
                <select value={form.role} onChange={e => set('role', e.target.value)} className={inputCls}>
                  <option value="EMPLOYEE">Employee</option>
                  <option value="HR">HR</option>
                </select>
              </div>
            </div>
          </div>

          {/* â”€â”€ Work Schedule â”€â”€ */}
          <div>
            <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">Work Schedule</p>
            <div className="space-y-4">

              {/* 4 shift type cards */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Shift Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {SHIFT_TYPES.map(t => (
                    <button key={t} type="button" onClick={() => setSchedule(defaultSchedule(t))}
                      className={`py-3 px-4 rounded-xl text-sm font-semibold border-2 transition-all text-left ${
                        schedule.shiftType === t
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                          : 'border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-400 hover:border-blue-300 dark:hover:border-blue-700'
                      }`}>
                      <div className="font-bold">{t}</div>
                      <div className="text-xs font-normal mt-0.5 opacity-70">
                        {t === 'REGULAR' && 'Fixed daily hours'}
                        {t === 'FLEXIBLE' && 'Core hours + flex window'}
                        {t === 'SHIFT' && 'Rotating shifts'}
                        {t === 'CUSTOM' && 'Custom configuration'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Work days */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Work Days</label>
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
              </div>

              {/* Times + grace */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Start Time
                    <span className="ml-1.5 text-blue-500 font-semibold">{toEthTime(schedule.startTime)}</span>
                  </label>
                  <input type="time" value={schedule.startTime} onChange={e => setSched('startTime', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    End Time
                    <span className="ml-1.5 text-blue-500 font-semibold">{toEthTime(schedule.endTime)}</span>
                  </label>
                  <input type="time" value={schedule.endTime} onChange={e => setSched('endTime', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Grace (min)</label>
                  <input type="number" min={0} max={60} value={schedule.gracePeriod} onChange={e => setSched('gracePeriod', Number(e.target.value))} className={inputCls} />
                </div>
              </div>

              {/* Flexible-specific */}
              {schedule.shiftType === 'FLEXIBLE' && (
                <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Core Start</label>
                    <input type="time" value={schedule.coreStart || '10:00'} onChange={e => setSched('coreStart', e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Core End</label>
                    <input type="time" value={schedule.coreEnd || '15:00'} onChange={e => setSched('coreEnd', e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Flex Window (h)</label>
                    <input type="number" min={1} max={4} value={schedule.flexWindow || 2} onChange={e => setSched('flexWindow', Number(e.target.value))} className={inputCls} />
                  </div>
                </div>
              )}

              {/* ShiftWork-specific */}
              {schedule.shiftType === 'SHIFT' && (
                <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/30">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Shift</label>
                    <select value={schedule.shift || 'Morning'} onChange={e => setSched('shift', e.target.value as any)} className={inputCls}>
                      <option value="Morning">Morning</option>
                      <option value="Evening">Evening</option>
                      <option value="Night">Night</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Rotation</label>
                    <select value={schedule.rotation || 'Weekly'} onChange={e => setSched('rotation', e.target.value as any)} className={inputCls}>
                      <option value="Weekly">Weekly</option>
                      <option value="Bi-weekly">Bi-weekly</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        </form>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-white/[0.07] flex justify-end gap-3 shrink-0">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          <button onClick={handleSubmit as any} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 transition-colors">
            {saving ? 'Creating...' : 'Create Employee'}
          </button>
        </div>
      </div>
    </div>
  );
}

// â”€â”€â”€ Main HR People Management Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export const HRPeopleManagement = () => {
  const { notify } = useDataRefresh();
  const [employees, setEmployees] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [activeTab, setActiveTab] = useState<'employees' | 'pending'>('employees');
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [approvingEmployee, setApprovingEmployee] = useState<any>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSaving, setRejectSaving] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  const fetchAll = useCallback(async () => {
    try {
      const [empRes, pendingRes]: any[] = await Promise.all([
        apiClient.get('/users?role=EMPLOYEE&limit=200'),
        apiClient.get('/auth/pending-accounts'),
      ]);
      if (empRes.data?.success) setEmployees(empRes.data.data ?? []);
      if (pendingRes.data?.success) setPending(pendingRes.data.data ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleRefresh = () => { setRefreshing(true); fetchAll(); };

  const handleReject = async (id: number) => {
    setRejectSaving(true);
    try {
      await apiClient.post(`/auth/approve-account/${id}`, { action: 'REJECT', reason: rejectReason });
      setRejectingId(null);
      setRejectReason('');
      fetchAll();
      notify('users');
    } catch { /* silent */ }
    finally { setRejectSaving(false); }
  };

  const filtered = employees.filter(e => {
    const matchSearch = e.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.employeeId?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  // Data slicing for pagination
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedEmployees = filtered.slice(startIndex, endIndex);

  const stats = [
    { label: 'Total', value: employees.length, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30', icon: <Users size={18} /> },
    { label: 'Active', value: employees.filter(e => e.status === 'ACTIVE').length, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30', icon: <UserCheck size={18} /> },
    { label: 'Pending', value: pending.length, color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30', icon: <Clock size={18} /> },
    { label: 'Inactive', value: employees.filter(e => e.status !== 'ACTIVE').length, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', icon: <UserX size={18} /> },
  ];

  return (
    <div className="space-y-5">
      {/* â”€â”€ When an employee is selected, show full-page profile (like Salary Details) â”€â”€ */}
      {selectedEmployee && (
        <EmployeeProfilePanel
          employee={selectedEmployee}
          onClose={() => setSelectedEmployee(null)}
        />
      )}

      {/* â”€â”€ Normal list view â€” hidden (not unmounted) while profile is open â”€â”€ */}
      <div className={selectedEmployee ? 'hidden' : undefined}>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">People Management</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage employees, review registrations, view detailed profiles</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
            <UserCheck size={15} /> Add Employee
          </button>
          <button onClick={handleRefresh} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className={`${cardCls} p-4 flex items-center gap-3`}>
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

      {/* Table card */}
      <div className={`${cardCls}`}>
        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 pt-3 border-b border-gray-100 dark:border-white/[0.07]">
          <button onClick={() => setActiveTab('employees')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${activeTab === 'employees' ? 'text-gray-900 dark:text-white bg-gray-100 dark:bg-[#0F1929]' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
            Employees ({employees.length})
          </button>
          <button onClick={() => setActiveTab('pending')}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${activeTab === 'pending' ? 'text-gray-900 dark:text-white bg-gray-100 dark:bg-[#0F1929]' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}>
            Pending Approval
            {pending.length > 0 && <span className="px-1.5 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs font-bold">{pending.length}</span>}
          </button>
        </div>

        {/* Employees toolbar */}
        {activeTab === 'employees' && (
          <div className="flex flex-wrap gap-3 px-4 py-3 border-b border-gray-100 dark:border-white/[0.07]">
            <div className="relative flex-1 min-w-[180px]">
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
            </select>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : activeTab === 'employees' ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/[0.07]">
                  {['Employee', 'Department', 'Position', 'Net Salary', 'Status', 'Last Login', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {paginatedEmployees.length > 0 ? paginatedEmployees.map(emp => (
                  <tr key={emp.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer" onClick={() => setSelectedEmployee(emp)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                          {emp.profilePicture
                            ? <img src={emp.profilePicture} alt="" className="w-full h-full rounded-full object-cover" />
                            : <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{emp.firstName?.[0]}{emp.lastName?.[0]}</span>
                          }
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{emp.fullName}</p>
                          <p className="text-xs text-gray-400 font-mono">{emp.employeeId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{emp.department || 'â€”'}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{emp.position || 'â€”'}</td>
                    <td className="px-4 py-3">
                      {(emp.monthlySalary ?? 0) > 0
                        ? <span className="font-semibold text-emerald-600 dark:text-emerald-400 text-xs">ETB {Number(emp.monthlySalary).toLocaleString('en-ET', { minimumFractionDigits: 2 })}</span>
                        : <span className="text-xs text-gray-300 dark:text-gray-600 italic">Not set</span>
                      }
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={emp.status} /></td>
                    <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs">{emp.lastLoginAt ? new Date(emp.lastLoginAt).toLocaleDateString() : 'Never'}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1 flex-wrap">
                        {emp.status === 'PENDING_APPROVAL' && (
                          <>
                            <button onClick={() => setApprovingEmployee(emp)}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors border border-green-200 dark:border-green-800">
                              <CheckCircle size={12} /> Approve
                            </button>
                            <button onClick={() => { setRejectingId(emp.id); setRejectReason(''); }}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors border border-red-200 dark:border-red-800">
                              <XCircle size={13} /> Reject
                            </button>
                          </>
                        )}
                        <button onClick={() => setSelectedEmployee(emp)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                          <Eye size={12} /> View
                        </button>
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-500">No employees found</td></tr>
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          <Pagination
            totalItems={filtered.length}
            rowsPerPage={rowsPerPage}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onRowsPerPageChange={setRowsPerPage}
          />
          </>
        ) : (
          /* Pending tab */
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {pending.length > 0 ? pending.map(emp => (
              <div key={emp.id} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-yellow-600 dark:text-yellow-400">{emp.firstName?.[0]}{emp.lastName?.[0]}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{emp.fullName}</p>
                      <StatusBadge status={emp.status} />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{emp.email}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {emp.phone && <span className="text-xs text-gray-400 dark:text-gray-500">{emp.phone}</span>}
                      <span className="text-xs text-gray-400 dark:text-gray-500">Registered {new Date(emp.createdAt).toLocaleDateString()}</span>
                      {emp.status === 'PENDING_ACTIVATION' && (
                        <span className="text-xs text-orange-500 dark:text-orange-400">Awaiting email activation</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* âœ“ Approve â€” opens work schedule modal */}
                  <button onClick={() => setApprovingEmployee(emp)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 border border-green-200 dark:border-green-800 transition-colors">
                    <CheckCircle size={13} /> âœ“
                  </button>
                  {/* âœ— Reject */}
                  <button onClick={() => { setRejectingId(emp.id); setRejectReason(''); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800 transition-colors">
                    <XCircle size={13} /> âœ—
                  </button>
                </div>
              </div>
            )) : (
              <div className="py-16 text-center">
                <CheckCircle size={32} className="text-green-400 mx-auto mb-3" />
                <p className="text-sm text-gray-400 dark:text-gray-500">No pending employee registrations</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Employee modal */}
      {showAddModal && (
        <AddEmployeeModal
          onClose={() => setShowAddModal(false)}
          onDone={() => { fetchAll(); notify('users'); }}
        />
      )}

      {/* Reject reason modal */}
      {rejectingId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white dark:bg-[#0F1929] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/[0.07] p-6">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Reject Employee</h2>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3}
              placeholder="Reason for rejection (optional)..."
              className={`${inputCls} resize-none mb-4`} />
            <div className="flex justify-end gap-3">
              <button onClick={() => setRejectingId(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
              <button onClick={() => handleReject(rejectingId)} disabled={rejectSaving}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50 transition-colors">
                {rejectSaving ? 'Rejecting...' : 'âœ— Reject'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve with schedule modal */}
      {approvingEmployee && (
        <ApproveWithScheduleModal
          employee={approvingEmployee}
          onClose={() => setApprovingEmployee(null)}
          onDone={() => { fetchAll(); notify('users'); }}
        />
      )}

      </div>
    </div>
  );
};
