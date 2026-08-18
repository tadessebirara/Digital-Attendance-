import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users, UserCheck, Clock, ShieldAlert, FileText, ArrowRight,
  UserPlus, CheckCircle, XCircle, RefreshCw, Map,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { attendanceService, authService } from '../../services/api.services';
import { ConfirmModal, useConfirm } from '../../components/common';
import { LiveEmployeeMap } from '../../components/LiveEmployeeMap';
import apiClient from '../../api/client';

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = 'overview' | 'live-map';

// ── Main component ────────────────────────────────────────────────────────────
export const AdminDashboard = () => {
  const [pendingUsers, setPendingUsers]     = useState<any[]>([]);
  const [approvingId, setApprovingId]       = useState<number | null>(null);
  const [showApproveModal, setShowApproveModal] = useState<any>(null);
  const [activeTab, setActiveTab]           = useState<Tab>('overview');
  const [offices, setOffices]               = useState<any[]>([]);
  const { confirmProps, confirm }           = useConfirm();

  const { data: statsRes, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => attendanceService.getAdminStats().then((res: any) => res.data),
  });
  const stats = statsRes?.data;

  useEffect(() => {
    fetchPending();
    apiClient.get('/admin/public-config')
      .then(res => {
        const d = (res.data as any)?.data;
        if (d?.offices) setOffices(d.offices);
      })
      .catch(() => {});
  }, []);

  const fetchPending = async () => {
    try {
      const res = await authService.getPendingAccounts();
      if (res.data?.success) setPendingUsers(Array.isArray(res.data.data) ? res.data.data : []);
    } catch { /* silent */ }
  };

  const handleReject = async (id: number) => {
    const ok = await confirm({
      title: 'Reject Account',
      message: 'This account will be rejected. The user will not be able to log in.',
      confirmLabel: 'Reject',
      variant: 'warning',
    });
    if (!ok) return;
    setApprovingId(id);
    try {
      await authService.approveAccount(id, { action: 'REJECT', reason: 'Rejected by admin' });
      fetchPending(); refetch();
    } catch { /* silent */ }
    finally { setApprovingId(null); }
  };

  const statCards = [
    { title: 'Total Users',      value: stats?.systemStats?.totalUsers     ?? 0, icon: Users,     bgLight: 'bg-blue-50',    bgDark: 'dark:bg-blue-500/10',    iconColor: 'text-blue-600 dark:text-blue-400',    border: 'border-blue-100 dark:border-blue-500/20',    textColor: 'text-blue-700 dark:text-blue-400' },
    { title: 'Active Employees', value: stats?.systemStats?.totalEmployees ?? 0, icon: UserCheck, bgLight: 'bg-emerald-50', bgDark: 'dark:bg-emerald-500/10', iconColor: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-100 dark:border-emerald-500/20', textColor: 'text-emerald-700 dark:text-emerald-400' },
    { title: 'Check-ins Today',  value: stats?.systemStats?.checkinsToday  ?? 0, icon: Clock,     bgLight: 'bg-violet-50',  bgDark: 'dark:bg-violet-500/10',  iconColor: 'text-violet-600 dark:text-violet-400',    border: 'border-violet-100 dark:border-violet-500/20',  textColor: 'text-violet-700 dark:text-violet-400' },
    { title: 'Pending Approval', value: pendingUsers.length,                      icon: UserPlus,  bgLight: 'bg-amber-50',   bgDark: 'dark:bg-amber-500/10',   iconColor: 'text-amber-600 dark:text-amber-400',      border: 'border-amber-100 dark:border-amber-500/20',    textColor: 'text-amber-700 dark:text-amber-400' },
  ];

  if (isLoading) return <DashboardSkeleton />;
  if (error)     return <ErrorState message="Failed to load dashboard data" />;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <ConfirmModal {...confirmProps} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Overview</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Real-time enterprise monitoring dashboard.</p>
        </div>
        <button
          onClick={() => { refetch(); fetchPending(); }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800/50 rounded-xl w-fit">
        {(['overview', 'live-map'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              activeTab === tab
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab === 'overview' ? <><ShieldAlert size={14} /> Overview</> : <><Map size={14} /> Live Map</>}
          </button>
        ))}
      </div>

      {/* ── Live Map Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'live-map' && (
        <div className="bg-white dark:bg-[#151929] rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
          <h2 className="text-sm font-black text-gray-900 dark:text-white mb-4 uppercase tracking-widest flex items-center gap-2">
            <Map size={14} className="text-teal-500" /> Live Employee Locations
          </h2>
          <LiveEmployeeMap offices={offices} />
        </div>
      )}

      {/* ── Overview Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="space-y-6">

          {/* Stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map(card => (
              <div key={card.title} className={`bg-white dark:bg-[#151929] rounded-xl border ${card.border} p-5 flex items-center gap-5 shadow-sm`}>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${card.bgLight} ${card.bgDark}`}>
                  <card.icon size={22} className={card.iconColor} />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider">{card.title}</p>
                  <p className={`text-2xl font-black ${card.textColor}`}>{card.value.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Pending Approvals */}
          {pendingUsers.length > 0 && (
            <div className="bg-white dark:bg-[#151929] rounded-xl border border-yellow-200 dark:border-yellow-800/40 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                  <UserPlus size={16} className="text-yellow-500" />
                  Pending Employee Approvals
                  <span className="px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs font-bold">
                    {pendingUsers.length}
                  </span>
                </h2>
                <Link to="/admin/user-management" className="text-xs text-blue-500 hover:underline font-medium">View all →</Link>
              </div>
              <div className="space-y-2">
                {pendingUsers.slice(0, 5).map(u => (
                  <div key={u.id} className="flex items-center justify-between gap-4 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-800/30">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-yellow-700 dark:text-yellow-400">{u.firstName?.[0]}{u.lastName?.[0]}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{u.fullName || `${u.firstName} ${u.lastName}`}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{u.email} · {u.department || 'No dept'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setShowApproveModal(u)}
                        disabled={approvingId === u.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors border border-green-200 dark:border-green-800"
                      >
                        <CheckCircle size={13} /> Approve
                      </button>
                      <button
                        onClick={() => handleReject(u.id)}
                        disabled={approvingId === u.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors border border-red-200 dark:border-red-800"
                      >
                        <XCircle size={13} /> Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analytics + Quick links */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Attendance bar chart */}
            <div className="lg:col-span-2 bg-white dark:bg-[#151929] rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="text-sm font-black text-gray-900 dark:text-white mb-6 uppercase tracking-widest">Attendance Velocity</h2>
              {(stats?.monthlyAttendance ?? []).length === 0 ? (
                <div className="h-64 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
                  No attendance data this month
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stats?.monthlyAttendance ?? []} barGap={2} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#D1D5DB" strokeOpacity={0.5} vertical={false} />
                      <XAxis
                        dataKey="date" axisLine={false} tickLine={false}
                        tick={{ fontSize: 10, fill: '#6B7280' }}
                        tickFormatter={(v: string) => {
                          try { return new Date(v).toLocaleDateString('en', { month: 'short', day: 'numeric' }); }
                          catch { return v; }
                        }}
                      />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#6B7280' }} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: 'rgba(124,58,237,0.06)' }}
                        contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', fontSize: 12 }}
                        labelFormatter={(v: string) => {
                          try { return new Date(v).toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' }); }
                          catch { return v; }
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                        formatter={(value: string) => (
                          <span style={{ color: '#6B7280', fontWeight: 600, textTransform: 'capitalize' }}>{value}</span>
                        )}
                      />
                      <Bar dataKey="present" fill="#6D28D9" radius={[4, 4, 0, 0]} name="Present" />
                      <Bar dataKey="late"    fill="#F59E0B" radius={[4, 4, 0, 0]} name="Late" />
                      <Bar dataKey="absent"  fill="#EF4444" radius={[4, 4, 0, 0]} name="Absent" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Quick links + system stats */}
            <div className="bg-white dark:bg-[#151929] rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <h2 className="text-sm font-black text-gray-900 dark:text-white mb-6 uppercase tracking-widest">Quick Management</h2>
              <div className="space-y-3">
                {[
                  { label: 'Audit Logs',      to: '/admin/audit-logs',      icon: FileText },
                  { label: 'User Directory',  to: '/admin/user-management', icon: Users },
                  { label: 'Security Alerts', to: '/admin/security-alerts', icon: ShieldAlert },
                ].map(({ label, to, icon: Icon }) => (
                  <Link key={to} to={to} className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-800/30 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all group border border-transparent hover:border-blue-200">
                    <Icon size={18} className="text-gray-400 group-hover:text-blue-500" />
                    <span className="text-sm font-bold text-gray-700 dark:text-gray-300 group-hover:text-blue-600">{label}</span>
                    <ArrowRight size={14} className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                  </Link>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-2">
                {[
                  { label: 'Admins',              value: stats?.systemStats?.totalAdmins    ?? 0 },
                  { label: 'HR Staff',             value: stats?.systemStats?.totalHR        ?? 0 },
                  { label: 'Employees',            value: stats?.systemStats?.totalEmployees ?? 0 },
                  { label: 'Audit Events (24h)',   value: stats?.systemStats?.auditLogs24h   ?? 0 },
                ].map(s => (
                  <div key={s.label} className="flex items-center justify-between text-sm">
                    <span className="text-gray-500 dark:text-gray-400">{s.label}</span>
                    <span className="font-bold text-gray-900 dark:text-white">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Approve modal */}
      {showApproveModal && (
        <ApproveModal
          user={showApproveModal}
          onClose={() => setShowApproveModal(null)}
          onDone={() => { setShowApproveModal(null); fetchPending(); refetch(); }}
        />
      )}
    </div>
  );
};

// ── Approve Modal ─────────────────────────────────────────────────────────────
const SHIFT_TYPES = ['Regular', 'Flexible', 'ShiftWork', 'Custom'] as const;
const ALL_DAYS    = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ApproveModal({ user, onClose, onDone }: {
  user: any; onClose: () => void; onDone: () => void;
}) {
  const [department,  setDepartment]  = useState(user.department || '');
  const [position,    setPosition]    = useState(user.position   || '');
  const [shiftType,   setShiftType]   = useState('Regular');
  const [workDays,    setWorkDays]    = useState(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [startTime,   setStartTime]   = useState('08:30');
  const [endTime,     setEndTime]     = useState('17:30');
  const [gracePeriod, setGracePeriod] = useState(0);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [success,     setSuccess]     = useState('');

  const toggleDay = (d: string) =>
    setWorkDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const handleApprove = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await authService.approveAccount(user.id, {
        action: 'APPROVE',
        department,
        position,
        workSchedule: { shiftType, workDays, startTime, endTime, gracePeriod },
      });
      const newStatus = (res.data?.data as any)?.newStatus;
      const msg = newStatus === 'ACTIVE'
        ? `✓ Approved & Activated! ${user.email} can log in immediately.`
        : `✓ Approved! Activation email sent to ${user.email}.`;
      setSuccess(msg);
      setTimeout(() => onDone(), 3000);
    } catch (err: any) {
      setError(err?.error || err?.response?.data?.error || err?.message || 'Failed to approve');
    } finally { setSaving(false); }
  };

  const inputCls = 'w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-[#1a1d2e] rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-700 max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Approve Employee</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Set schedule for {user.firstName} {user.lastName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
            <XCircle size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error   && <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">{error}</div>}
          {success && <div className="px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm font-medium">{success}</div>}

          {/* Employee info */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{user.firstName?.[0]}{user.lastName?.[0]}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{user.firstName} {user.lastName}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{user.email}</p>
            </div>
          </div>

          {/* Dept + Position */}
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

          {/* Shift type */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Shift Type</label>
            <div className="grid grid-cols-2 gap-2">
              {SHIFT_TYPES.map(t => (
                <button key={t} type="button" onClick={() => setShiftType(t)}
                  className={`py-2.5 px-3 rounded-xl text-sm font-semibold border-2 transition-all text-left ${
                    shiftType === t
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-300'
                  }`}>
                  <div className="font-bold">{t}</div>
                  <div className="text-xs font-normal mt-0.5 opacity-70">
                    {t === 'Regular'   && 'Fixed daily hours'}
                    {t === 'Flexible'  && 'Core hours + flex'}
                    {t === 'ShiftWork' && 'Rotating shifts'}
                    {t === 'Custom'    && 'Custom config'}
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
                    workDays.includes(d)
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-blue-400'
                  }`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Times */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Start Time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">End Time</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Grace (min)</label>
              <input type="number" min={0} value={gracePeriod} onChange={e => setGracePeriod(Number(e.target.value))} className={inputCls} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Cancel
          </button>
          <button onClick={handleApprove} disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-50 transition-colors">
            {saving ? 'Approving...' : '✓ Approve & Activate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Skeleton + Error ──────────────────────────────────────────────────────────
const DashboardSkeleton = () => (
  <div className="animate-pulse space-y-6">
    <div className="h-8 w-48 bg-gray-200 dark:bg-gray-800 rounded" />
    <div className="grid grid-cols-4 gap-4">
      {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-gray-200 dark:bg-gray-800 rounded-xl" />)}
    </div>
    <div className="h-64 bg-gray-200 dark:bg-gray-800 rounded-xl" />
  </div>
);

const ErrorState = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center h-64 text-center">
    <ShieldAlert size={48} className="text-red-500 mb-4" />
    <p className="font-bold text-gray-900 dark:text-white">{message}</p>
    <button onClick={() => window.location.reload()} className="mt-4 text-blue-500 font-bold hover:underline">Retry</button>
  </div>
);
