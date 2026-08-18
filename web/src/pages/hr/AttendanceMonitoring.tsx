import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import {
  Search, Download, UserCheck, UserX, Clock, Users,
  RefreshCw, MapPin, X, AlertCircle, CheckCircle, Lock,
  LogIn, LogOut, Building2, Calendar, Info
} from 'lucide-react';
import { useOnRefresh } from '../../context/DataRefreshContext';
import { socketService } from '../../services/socket.service';
import { Pagination } from '../../components/common';

const inputCls = `w-full px-3 py-2 text-sm rounded-xl bg-white dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40`;

// ─── Live clock hook ──────────────────────────────────────────────────────────
function useLiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// ─── Manual Check-In Modal ────────────────────────────────────────────────────
interface CheckInModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function ManualCheckInModal({ onClose, onSuccess }: CheckInModalProps) {
  const now = useLiveClock();
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [location, setLocation] = useState('Main Office');
  const [checkType, setCheckType] = useState<'in' | 'out'>('in');
  const [useCustomTime, setUseCustomTime] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Default the custom time input to "now" in local datetime-local format
  const toLocalDatetimeValue = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [customTime, setCustomTime] = useState<string>(() => toLocalDatetimeValue(new Date()));

  const displayTime = now.toLocaleString('en-US', {
    month: '2-digit', day: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true,
  });

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await apiClient.get(`/users?role=EMPLOYEE&limit=1000`);
      if (res.data.success) setEmployees((res.data.data as any[]) ?? []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { fetchEmployees(); }, [fetchEmployees]);
  useOnRefresh('users', fetchEmployees);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) { setError('Please select an employee'); return; }

    // Validate custom time: must not be in the future
    if (useCustomTime) {
      const picked = new Date(customTime);
      if (isNaN(picked.getTime())) { setError('Invalid time value'); return; }
      if (picked > new Date()) { setError('Time cannot be in the future'); return; }
    }

    setError('');
    setSubmitting(true);
    try {
      const checkTime = useCustomTime
        ? new Date(customTime).toISOString()
        : new Date().toISOString();

      const payload: Record<string, unknown> = {
        employeeId: selectedEmployee,
        location,
        type: checkType,
        checkTime,
        isManual: true,
      };
      if (notes.trim()) payload.notes = notes.trim();

      const res = await apiClient.post(`/attendance/manual-checkin`, payload);
      if (res.data.success) {
        setSuccess(`${checkType === 'in' ? 'Check-in' : 'Check-out'} recorded successfully`);
        setTimeout(() => { onSuccess(); onClose(); }, 1500);
      } else {
        // Surface clear message for already-checked-in conflict
        const code = res.data.code;
        if (code === 'ALREADY_CHECKED_IN') {
          setError('This employee already has a check-in record for that day. Use the update action on the existing record to correct it.');
        } else {
          setError(res.data.error || 'Failed to record attendance');
        }
      }
    } catch (err: any) {
      const serverError = err?.response?.data?.error || err?.response?.data?.message;
      const serverCode  = err?.response?.data?.code;
      if (serverCode === 'ALREADY_CHECKED_IN') {
        setError('This employee already has a check-in record for that day. Use the update action on the existing record to correct it.');
      } else {
        setError(serverError || 'Failed to record attendance');
      }
    } finally { setSubmitting(false); }
  };

  const selectedEmp = employees.find(e => String(e.id) === String(selectedEmployee));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-[#0F1929] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/[0.07]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.07]">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Manual Attendance</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Success */}
          {success && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm">
              <CheckCircle size={15} />{success}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
              <AlertCircle size={15} className="shrink-0 mt-0.5" /><span>{error}</span>
            </div>
          )}

          {/* Check type toggle */}
          <div className="flex rounded-xl border border-gray-200 dark:border-white/[0.07] overflow-hidden">
            <button type="button" onClick={() => setCheckType('in')}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${checkType === 'in' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-[#0F1929] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              Check-In
            </button>
            <button type="button" onClick={() => setCheckType('out')}
              className={`flex-1 py-2 text-sm font-medium transition-colors ${checkType === 'out' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-[#0F1929] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
              Check-Out
            </button>
          </div>

          {/* Employee */}
          <Field label="Employee">
            <select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)} className={inputCls} required>
              <option value="">Select employee...</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.fullName} {emp.department ? `— ${emp.department}` : ''}</option>
              ))}
            </select>
          </Field>

          {/* Employee info card (auto-populated) */}
          {selectedEmp && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
              <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                  {selectedEmp.firstName?.[0]}{selectedEmp.lastName?.[0]}
                </span>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedEmp.fullName}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{selectedEmp.department || 'No department'} · {selectedEmp.position || 'Employee'}</p>
              </div>
            </div>
          )}

          {/* Location */}
          <Field label="Location">
            <select value={location} onChange={e => setLocation(e.target.value)} className={inputCls}>
              <option value="Main Office">Main Office</option>
              <option value="Branch Office">Branch Office</option>
              <option value="Remote">Remote</option>
              <option value="Field">Field</option>
            </select>
          </Field>

          {/* Time — live clock OR custom picker */}
          <Field label={checkType === 'out' ? 'Check-Out Time' : 'Check-In Time'}>
            <div className="space-y-2">
              {/* Toggle between now / custom */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setUseCustomTime(false)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${!useCustomTime ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 dark:border-white/[0.07] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                >
                  <Clock size={11} /> Now
                </button>
                <button
                  type="button"
                  onClick={() => { setUseCustomTime(true); setCustomTime(toLocalDatetimeValue(new Date())); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${useCustomTime ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 dark:border-white/[0.07] text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
                >
                  <Calendar size={11} /> Custom time
                </button>
              </div>

              {!useCustomTime ? (
                <div className={`${inputCls} flex items-center justify-between bg-gray-50 dark:bg-[#080E18]/50 cursor-not-allowed`}>
                  <span className="font-mono text-sm text-gray-700 dark:text-gray-300">{displayTime}</span>
                  <Lock size={13} className="text-gray-400 shrink-0" />
                </div>
              ) : (
                <div>
                  <input
                    type="datetime-local"
                    value={customTime}
                    max={toLocalDatetimeValue(new Date())}
                    onChange={e => setCustomTime(e.target.value)}
                    className={inputCls}
                    required
                  />
                  <p className="text-xs text-amber-500 dark:text-amber-400 mt-1 flex items-center gap-1">
                    <AlertCircle size={10} /> Backdating is logged and audited
                  </p>
                </div>
              )}
            </div>
          </Field>

          {/* Notes (optional) */}
          <Field label="Notes (optional)">
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Reason for manual entry…"
              maxLength={200}
              className={inputCls}
            />
          </Field>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="px-5 py-2 text-sm rounded-xl border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium">
              Cancel
            </button>
            <button type="submit" disabled={submitting || !!success}
              className="flex items-center gap-2 px-5 py-2 text-sm rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 transition-colors">
              <UserCheck size={14} />
              {submitting ? 'Recording…' : `Record ${checkType === 'in' ? 'Check-In' : 'Check-Out'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Attendance Detail Modal ──────────────────────────────────────────────────
interface AttendanceDetailModalProps {
  record: any;
  onClose: () => void;
}

function AttendanceDetailModal({ record, onClose }: AttendanceDetailModalProps) {
  const fmt = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const fmtTime = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
  const fmtDate = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '—';

  const isAbsent = record.status === 'ABSENT' || record.status === 'EXCUSED';

  const duration = (() => {
    if (isAbsent) return null;
    if (!record.checkInTime || !record.checkOutTime) return null;
    const ms = new Date(record.checkOutTime).getTime() - new Date(record.checkInTime).getTime();
    if (ms <= 0) return null;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  })();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-[#0F1929] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/[0.07]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{record.employeeName?.[0]}</span>
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{record.employeeName}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">{record.department || '—'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Status */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Info size={13} />Status</span>
            <StatusBadge status={record.status} earlyLeaveMinutes={record.earlyLeaveMinutes} checkInTime={record.checkInTime} checkOutTime={record.checkOutTime} hoursWorked={record.hoursWorked} />
          </div>

          {/* Date */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Calendar size={13} />Date</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {fmtDate(record.checkInTime || record.attendanceDate)}
            </span>
          </div>

          <div className="h-px bg-gray-100 dark:bg-gray-700" />

          {/* Check In / Out */}
          {(() => {
            const isAbsent = record.status === 'ABSENT' || record.status === 'EXCUSED';
            const effectiveCheckIn  = isAbsent ? null : record.checkInTime;
            const effectiveCheckOut = isAbsent ? null : record.checkOutTime;
            return (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 border border-green-100 dark:border-green-800">
                  <div className="flex items-center gap-1.5 mb-1">
                    <LogIn size={13} className="text-green-600 dark:text-green-400" />
                    <span className="text-xs font-medium text-green-700 dark:text-green-400">Check In</span>
                  </div>
                  {effectiveCheckIn ? (
                    <>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{fmtTime(effectiveCheckIn)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmt(effectiveCheckIn)}</p>
                    </>
                  ) : (
                    <p className="text-lg font-bold text-gray-400 dark:text-gray-600">—</p>
                  )}
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-xl p-3 border border-orange-100 dark:border-orange-800">
                  <div className="flex items-center gap-1.5 mb-1">
                    <LogOut size={13} className="text-orange-600 dark:text-orange-400" />
                    <span className="text-xs font-medium text-orange-700 dark:text-orange-400">Check Out</span>
                  </div>
                  {effectiveCheckOut ? (
                    <>
                      <p className="text-lg font-bold text-gray-900 dark:text-white">{fmtTime(effectiveCheckOut)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmt(effectiveCheckOut)}</p>
                    </>
                  ) : (
                    <p className="text-lg font-bold text-gray-400 dark:text-gray-600">—</p>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Duration */}
          {duration && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Clock size={13} />Duration</span>
              <span className="text-sm font-semibold text-gray-900 dark:text-white">{duration}</span>
            </div>
          )}

          {/* Late minutes */}
          {record.lateMinutes != null && record.lateMinutes > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Clock size={13} />Late by</span>
              <span className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">{record.lateMinutes} min</span>
            </div>
          )}

          {/* Early leave */}
          {record.earlyLeaveMinutes != null && record.earlyLeaveMinutes > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><LogOut size={13} />Left early by</span>
              <span className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">{record.earlyLeaveMinutes} min</span>
            </div>
          )}

          {/* Location */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><MapPin size={13} />Location</span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
                {record.checkInTime && record.status !== 'ABSENT' && record.status !== 'EXCUSED'
                  ? (record.officeName || 'Office')
                  : '—'}
              </span>
          </div>

          {/* Work mode */}
          {record.workMode && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5"><Building2 size={13} />Work Mode</span>
              <span className="text-sm font-medium text-gray-900 dark:text-white capitalize">{record.workMode}</span>
            </div>
          )}

          {/* Notes */}
          {record.notes && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Notes</p>
              <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-[#0F1929] rounded-lg px-3 py-2">{record.notes}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-white/[0.07] flex justify-end">
          <button onClick={onClose}
            className="px-5 py-2 text-sm rounded-xl border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export const AttendanceMonitoring = () => {
  const [attendance, setAttendance] = useState<any[]>([]);
  const [summaryStats, setSummaryStats] = useState({ present: 0, late: 0, absent: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  useEffect(() => { fetchAttendance(); }, [selectedDate]);

  // Real-time: refresh when any attendance event fires
  useEffect(() => {
    const onAttendanceUpdate = () => fetchAttendance();
    socketService.on('attendance:update', onAttendanceUpdate);
    return () => socketService.off('attendance:update', onAttendanceUpdate);
  }, []);

  const fetchAttendance = async () => {
    try {
      // Fetch attendance records + real summary stats in parallel
      const [attendanceRes, summaryRes] = await Promise.all([
        apiClient.get(`/attendance?startDate=${selectedDate}&endDate=${selectedDate}&limit=200`),
        apiClient.get(`/dashboard/today?date=${selectedDate}`),
      ]);

      if (attendanceRes.data.success) {
        const raw = (attendanceRes.data.data as any[]) ?? [];
        setAttendance(raw.map((r: any) => ({
          ...r,
          employeeName: r.user?.fullName ?? r.employeeName ?? '—',
          department:   r.user?.department ?? r.department ?? '—',
          checkInTime:  r.clockInTime  ?? r.checkInTime,
          checkOutTime: r.clockOutTime ?? r.checkOutTime,
          hoursWorked:  r.hoursWorked  ?? r.hours_worked ?? null,
          officeName:   r.checkinOfficeName ?? r.checkin_office_name ?? r.location ?? null,
        })));
      }

      if (summaryRes.data.success) {
        const s = (summaryRes.data.data as {
          present?: number;
          late?: number;
          absent?: number;
          totalEmployees?: number;
        } | undefined) ?? {};
        setSummaryStats({
          present: s.present ?? 0,
          late:    s.late    ?? 0,
          absent:  s.absent  ?? 0,
          total:   s.totalEmployees ?? 0,
        });
      }
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  };

  const handleRefresh = () => { setRefreshing(true); fetchAttendance(); };

  const handleExport = () => {
    if (!attendance.length) return;
    const headers = ['Employee', 'Department', 'Check In', 'Check Out', 'Status', 'Location'];
    const rows = attendance.map(r => [
      r.employeeName, r.department,
      r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString() : '',
      r.checkOutTime ? new Date(r.checkOutTime).toLocaleTimeString() : '',
      r.status, r.checkInTime ? (r.officeName || 'Office') : '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `attendance_${selectedDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const stats = {
    present: summaryStats.present,
    late:    summaryStats.late,
    absent:  summaryStats.absent,
    total:   summaryStats.total,
  };

  const filtered = attendance.filter(r =>
    r.employeeName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.employeeId?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // Data slicing for pagination
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedAttendance = filtered.slice(startIndex, endIndex);

  const statCards = [
    { label: 'Present', value: stats.present, icon: <UserCheck size={20} />, iconBg: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400', valueCls: 'text-gray-900 dark:text-white' },
    { label: 'Late',    value: stats.late,    icon: <Clock size={20} />,     iconBg: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400', valueCls: 'text-gray-900 dark:text-white' },
    { label: 'Absent',  value: stats.absent,  icon: <UserX size={20} />,     iconBg: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400', valueCls: 'text-red-600 dark:text-red-400' },
    { label: 'Total Employees', value: stats.total, icon: <Users size={20} />, iconBg: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400', valueCls: 'text-gray-900 dark:text-white' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Attendance Monitoring</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Real-time tracking of employee check-ins and departures</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
          <button onClick={() => setShowCheckInModal(true)}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
            <UserCheck size={15} /> Manual Check-In
          </button>
          <button onClick={handleExport}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
            <Download size={15} /> Export
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(card => (
          <div key={card.label} className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] p-4 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${card.iconBg}`}>{card.icon}</div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{card.label}</p>
              <p className={`text-2xl font-bold ${card.valueCls}`}>{card.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07]">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 dark:border-white/[0.07]">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search by name or ID..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-gray-50 dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
          </div>
          <button onClick={handleRefresh} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/[0.07]">
                {['Employee', 'Check In', 'Check Out', 'Status', 'Location', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center"><div className="flex justify-center"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div></td></tr>
              ) : paginatedAttendance.length > 0 ? paginatedAttendance.map(record => (
                <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{record.employeeName?.[0]}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{record.employeeName}</p>
                        <p className="text-xs text-gray-400">{record.department}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {(record.status === 'ABSENT' || record.status === 'EXCUSED') || !record.checkInTime
                      ? <span className="text-gray-400 dark:text-gray-600">—</span>
                      : new Date(record.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {(record.status === 'ABSENT' || record.status === 'EXCUSED') || !record.checkOutTime
                      ? <span className="text-gray-400 dark:text-gray-600">—</span>
                      : new Date(record.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={record.status} earlyLeaveMinutes={record.earlyLeaveMinutes} checkInTime={record.checkInTime} checkOutTime={record.checkOutTime} hoursWorked={record.hoursWorked} /></td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-400">
                    {record.checkInTime && record.status !== 'ABSENT' && record.status !== 'EXCUSED'
                      ? <div className="flex items-center gap-1"><MapPin size={12} className="text-gray-400" />{record.officeName || 'Office'}</div>
                      : <span className="text-gray-300 dark:text-gray-700">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelectedRecord(record)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline font-medium">View</button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-500">No attendance records for this date.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        {!loading && (
          <Pagination
            totalItems={filtered.length}
            rowsPerPage={rowsPerPage}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onRowsPerPageChange={setRowsPerPage}
          />
        )}
      </div>

      {/* Manual Check-In Modal */}
      {showCheckInModal && (
        <ManualCheckInModal
          onClose={() => setShowCheckInModal(false)}
          onSuccess={() => { fetchAttendance(); }}
        />
      )}

      {/* Attendance Detail Modal */}
      {selectedRecord && (
        <AttendanceDetailModal
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
        />
      )}
    </div>
  );
};

function StatusBadge({ status, earlyLeaveMinutes, checkInTime, checkOutTime, hoursWorked }: {
  status: string;
  earlyLeaveMinutes?: number | null;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  hoursWorked?: number | null;
}) {
  // Derive a display status from the raw DB status + runtime signals
  const deriveDisplay = (): { label: string; style: string } => {
    const isAbsent  = status === 'ABSENT'  || status === 'EXCUSED';
    const hasIn     = !!checkInTime;
    const hasOut    = !!checkOutTime;
    const hours     = hoursWorked ?? 0;
    const earlyLeft = earlyLeaveMinutes != null && earlyLeaveMinutes > 0;

    // ABSENT — no check-in at all
    if (isAbsent || (!hasIn && status !== 'PRESENT' && status !== 'LATE' && status !== 'HALF_DAY')) {
      return { label: 'Absent', style: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' };
    }

    // Checked in but never checked out
    if (hasIn && !hasOut) {
      // Less than half a typical 8h day (< 4h) → Partial Day
      if (hours > 0 && hours < 4) {
        return { label: 'Partial Day', style: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' };
      }
      // Still working (no checkout recorded) → Incomplete
      return { label: 'Incomplete', style: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' };
    }

    // Checked in + checked out
    if (hasIn && hasOut) {
      // Less than half day worked
      if (hours > 0 && hours < 4) {
        return { label: 'Half Day', style: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' };
      }
      // Left early
      if (earlyLeft) {
        return {
          label: `Left Early (${earlyLeaveMinutes}m)`,
          style: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
        };
      }
      // Late check-in
      if (status === 'LATE' || status === 'HALF_DAY') {
        return { label: 'Late', style: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' };
      }
      // Full present
      return { label: 'Present', style: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' };
    }

    // Fallback — map raw DB values
    const fallbackMap: Record<string, { label: string; style: string }> = {
      PRESENT:         { label: 'Present',   style: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
      LATE:            { label: 'Late',      style: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' },
      ABSENT:          { label: 'Absent',    style: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
      HALF_DAY:        { label: 'Half Day',  style: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' },
      CHECKED_OUT:     { label: 'Present',   style: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
      MISSED_CHECKOUT: { label: 'Incomplete',style: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
      AUTO_CHECKOUT:   { label: 'Present',   style: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
      EXCUSED:         { label: 'Excused',   style: 'bg-gray-100 dark:bg-[#0F1929] text-gray-600 dark:text-gray-400' },
    };
    return fallbackMap[status] ?? { label: status, style: 'bg-gray-100 dark:bg-[#0F1929] text-gray-500 dark:text-gray-400' };
  };

  const { label, style } = deriveDisplay();

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${style}`}>
      {label}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">{label}</label>{children}</div>;
}
