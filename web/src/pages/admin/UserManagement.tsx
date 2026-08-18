import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { Pagination, ConfirmModal, useConfirm } from '../../components/common';
import {
  Search, Plus, Edit, Trash2, Shield, X, Eye, EyeOff,
  Mail, Phone, Building2, Briefcase, CalendarDays,
  Clock, AlertTriangle, Smartphone, CheckCircle, XCircle,
  Lock, Unlock, RefreshCw, Activity, Key, Monitor,
  TrendingUp, Users, UserCheck, UserX, KeyRound,
} from 'lucide-react';
import { authService } from '../../services/api.services';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40`;
const cardCls = `bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07]`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">{label}</label>{children}</div>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    INACTIVE: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    LOCKED_ROLE: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
    PENDING_APPROVAL: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
    PENDING_ACTIVATION: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
    APPROVED: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    PENDING: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
    REJECTED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    REVOKED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    SUCCESS: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    FAILED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] ?? 'bg-gray-100 dark:bg-[#0F1929] text-gray-600 dark:text-gray-400'}`}>{status?.replace(/_/g, ' ')}</span>;
}

// ─── User Profile Panel ───────────────────────────────────────────────────────
type AdminTab = 'overview' | 'activity' | 'devices';

function UserProfilePanel({ user, onClose, onRefresh }: { user: any; onClose: () => void; onRefresh: () => void }) {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loginAttempts, setLoginAttempts] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [overviewStats, setOverviewStats] = useState({ present: 0, late: 0, absent: 0, rate: 0, leavesUsed: 0 });
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const isLocked = () => {
    return user.accountLockedUntil && new Date(user.accountLockedUntil) > new Date();
  };

  // Overview: fetch this month attendance
  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const now = new Date();
        const s = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const e = now.toISOString().split('T')[0];
        const [attRes, leaveRes] = await Promise.all([
          apiClient.get(`/attendance`, { params: { userId: user.id, startDate: s, endDate: e } }),
          apiClient.get(`/leaves`, { params: { userId: user.id, status: 'APPROVED' } }),
        ]);
        const attBody = attRes.data;
        if (attBody.success) {
          const data: any[] = (attBody.data as any[]) ?? [];
          const present = data.filter(r => r.status === 'PRESENT').length;
          const late = data.filter(r => r.status === 'LATE').length;
          const absent = data.filter(r => r.status === 'ABSENT').length;
          const total = present + late + absent;
          setOverviewStats(s => ({ ...s, present, late, absent, rate: total > 0 ? Math.round(((present + late) / total) * 100) : 0 }));
        }
        const leaveBody = leaveRes.data;
        if (leaveBody.success) {
          const totalLeaves = ((leaveBody.data as any[]) ?? []).reduce((sum: number, l: any) => sum + (l.daysRequested || 0), 0);
          setOverviewStats(s => ({ ...s, leavesUsed: totalLeaves }));
        }
      } catch { /* silent */ }
    };
    fetchOverview();
  }, [user.id]);

  const fetchActivity = useCallback(async () => {
    setLoadingActivity(true);
    try {
      const [auditRes, loginRes] = await Promise.all([
        apiClient.get(`/audit/logs?limit=50&userId=${user.id}`),
        apiClient.get(`/admin/security/login-attempts?email=${encodeURIComponent(user.email)}&limit=30`),
      ]);
      const auditBody = auditRes.data;
      const loginBody = loginRes.data;
      if (auditBody.success) setAuditLogs((auditBody.data as any[]) ?? []);
      if (loginBody.success) setLoginAttempts((loginBody.data as any[]) ?? []);
    } catch { /* silent */ }
    finally { setLoadingActivity(false); }
  }, [user.id, user.email]);

  const fetchDevices = useCallback(async () => {
    setLoadingDevices(true);
    try {
      const res = await apiClient.get(`/devices`, { params: { userId: user.id } });
      const body = res.data;
      if (body.success) setDevices((body.data as any[]) ?? []);
    } catch { /* silent */ }
    finally { setLoadingDevices(false); }
  }, [user.id]);

  useEffect(() => { if (tab === 'activity') fetchActivity(); }, [tab, fetchActivity]);
  useEffect(() => { if (tab === 'devices') fetchDevices(); }, [tab, fetchDevices]);

  const toggleStatus = async () => {
    setTogglingStatus(true);
    try {
      const newStatus = user.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await apiClient.put(`/users/${user.id}/status`, { status: newStatus });
      onRefresh();
      onClose();
    } catch { /* silent */ }
    finally { setTogglingStatus(false); }
  };

  const handleUnlock = async () => {
    setUnlocking(true);
    try {
      const res = await apiClient.post(`/users/${user.id}/unlock-account`);
      if (res.data.success) {
        onRefresh();
      }
    } catch { /* silent */ }
    finally { setUnlocking(false); }
  };

  const revokeDevice = async (deviceId: number) => {
    try {
      await apiClient.post(`/devices/${deviceId}/revoke`);
      fetchDevices();
    } catch { /* silent */ }
  };

  const approveDevice = async (deviceId: number) => {
    try {
      await apiClient.post(`/devices/${deviceId}/approve`);
      fetchDevices();
    } catch { /* silent */ }
  };

  const TABS: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'overview',  label: 'Overview',           icon: <TrendingUp size={13} /> },
    { id: 'activity',  label: 'Activity & Audit',   icon: <Activity size={13} /> },
    { id: 'devices',   label: 'Devices & Security', icon: <Smartphone size={13} /> },
  ];

  const roleBg: Record<string, string> = {
    ADMIN: 'from-purple-600 to-purple-700',
    HR: 'from-blue-600 to-blue-700',
    EMPLOYEE: 'from-emerald-600 to-emerald-700',
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[740px] h-full bg-white dark:bg-[#0F1929] flex flex-col shadow-2xl border-l border-gray-200 dark:border-white/[0.07]">

        {/* Header */}
        <div className={`bg-gradient-to-r ${roleBg[user.role] ?? 'from-gray-600 to-gray-700'} px-6 py-5 shrink-0`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center shrink-0 border-2 border-white/30">
                {user.profilePicture
                  ? <img src={user.profilePicture} alt="" className="w-full h-full rounded-full object-cover" />
                  : <span className="text-xl font-bold text-white">{user.firstName?.[0]}{user.lastName?.[0]}</span>
                }
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{user.fullName}</h2>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className="text-xs text-white/75 font-mono">{user.employeeId || `#${user.id}`}</span>
                  {user.department && <span className="text-xs text-white/60">· {user.department}</span>}
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-white/20 text-white">{user.role}</span>
                  <StatusBadge status={user.status} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={toggleStatus} disabled={togglingStatus}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  user.status === 'ACTIVE'
                    ? 'bg-red-500/20 hover:bg-red-500/30 text-white border border-red-400/30'
                    : 'bg-green-500/20 hover:bg-green-500/30 text-white border border-green-400/30'
                }`}>
                {user.status === 'ACTIVE' ? <><Lock size={12} /> Deactivate</> : <><Unlock size={12} /> Activate</>}
              </button>
              <button onClick={onClose} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"><X size={16} /></button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] shrink-0">
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
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {/* ── OVERVIEW ── */}
          {tab === 'overview' && (
            <>
              {/* Quick stats */}
              <div className="grid grid-cols-5 gap-3">
                {[
                  { label: 'Present', value: overviewStats.present, color: 'text-green-600 dark:text-green-400' },
                  { label: 'Late', value: overviewStats.late, color: 'text-yellow-600 dark:text-yellow-400' },
                  { label: 'Absent', value: overviewStats.absent, color: 'text-red-600 dark:text-red-400' },
                  { label: 'Att. Rate', value: `${overviewStats.rate}%`, color: 'text-blue-600 dark:text-blue-400' },
                  { label: 'Leaves Used', value: overviewStats.leavesUsed, color: 'text-purple-600 dark:text-purple-400' },
                ].map(s => (
                  <div key={s.label} className={`${cardCls} p-3 text-center`}>
                    <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              {/* Info cards */}
              <div className="grid grid-cols-2 gap-4">
                <div className={`${cardCls} p-4 space-y-2.5`}>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Contact</h3>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"><Mail size={14} className="text-gray-400 shrink-0" /><span className="truncate">{user.email}</span></div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"><Phone size={14} className="text-gray-400 shrink-0" /><span>{user.phone || '—'}</span></div>
                </div>
                <div className={`${cardCls} p-4 space-y-2.5`}>
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Account</h3>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"><Shield size={14} className="text-gray-400 shrink-0" /><span>{user.role}</span></div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"><Building2 size={14} className="text-gray-400 shrink-0" /><span>{user.department || '—'}</span></div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"><Briefcase size={14} className="text-gray-400 shrink-0" /><span>{user.position || '—'}</span></div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"><CalendarDays size={14} className="text-gray-400 shrink-0" /><span>Joined {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</span></div>
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400"><Clock size={14} className="text-gray-400 shrink-0" /><span>Last login: {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</span></div>
                </div>
              </div>
            </>
          )}

          {/* ── ACTIVITY & AUDIT ── */}
          {tab === 'activity' && (
            <>
              {loadingActivity ? (
                <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : (
                <>
                  {/* Login attempts */}
                  <div className={`${cardCls} overflow-hidden`}>
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.07] flex items-center gap-2">
                      <Key size={14} className="text-gray-400" />
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Login History</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b border-gray-50 dark:border-white/[0.07]">
                          {['Status', 'IP Address', 'Device', 'Reason', 'Time'].map(h => (
                            <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr></thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                          {loginAttempts.length > 0 ? loginAttempts.slice(0, 15).map((a, i) => (
                            <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                              <td className="px-4 py-2.5"><StatusBadge status={a.status} /></td>
                              <td className="px-4 py-2.5 text-xs font-mono text-gray-500 dark:text-gray-400">{a.ipAddress || '—'}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-400 dark:text-gray-500 truncate max-w-[100px]">{a.deviceId ? a.deviceId.substring(0, 12) + '...' : '—'}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-400 dark:text-gray-500">{a.failureReason || '—'}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{new Date(a.createdAt).toLocaleString()}</td>
                            </tr>
                          )) : <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">No login history</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Audit trail */}
                  <div className={`${cardCls} overflow-hidden`}>
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.07] flex items-center gap-2">
                      <Activity size={14} className="text-gray-400" />
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Audit Trail</h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b border-gray-50 dark:border-white/[0.07]">
                          {['Action', 'Category', 'Description', 'IP', 'Time'].map(h => (
                            <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr></thead>
                        <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                          {auditLogs.length > 0 ? auditLogs.slice(0, 20).map((log, i) => (
                            <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                              <td className="px-4 py-2.5 text-xs font-mono font-medium text-gray-700 dark:text-gray-300">{log.action}</td>
                              <td className="px-4 py-2.5">
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">{log.category || log.entity || '—'}</span>
                              </td>
                              <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400 max-w-[160px] truncate">{log.description || '—'}</td>
                              <td className="px-4 py-2.5 text-xs font-mono text-gray-400 dark:text-gray-500">{log.ipAddress || '—'}</td>
                              <td className="px-4 py-2.5 text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">{log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}</td>
                            </tr>
                          )) : <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500">No audit logs</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {/* ── DEVICES & SECURITY ── */}
          {tab === 'devices' && (
            <>
              {loadingDevices ? (
                <div className="flex justify-center py-10"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
              ) : (
                <div className={`${cardCls} overflow-hidden`}>
                  <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.07] flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Smartphone size={14} className="text-gray-400" />
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Registered Devices</h3>
                    </div>
                    <button onClick={fetchDevices} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                      <RefreshCw size={13} />
                    </button>
                  </div>
                  {devices.length > 0 ? (
                    <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
                      {devices.map((d, i) => (
                        <div key={i} className="flex items-center justify-between gap-4 px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                              d.status === 'APPROVED' ? 'bg-green-100 dark:bg-green-900/30' :
                              d.status === 'PENDING' ? 'bg-yellow-100 dark:bg-yellow-900/30' :
                              'bg-red-100 dark:bg-red-900/30'
                            }`}>
                              <Monitor size={16} className={
                                d.status === 'APPROVED' ? 'text-green-600 dark:text-green-400' :
                                d.status === 'PENDING' ? 'text-yellow-600 dark:text-yellow-400' :
                                'text-red-600 dark:text-red-400'
                              } />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900 dark:text-white">{d.deviceName || 'Unknown Device'}</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500">{d.platform} · {d.deviceModel || '—'}</p>
                              <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">{d.deviceId?.substring(0, 20)}...</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <StatusBadge status={d.status} />
                            {d.status === 'PENDING' && (
                              <button onClick={() => approveDevice(d.id)}
                                className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors" title="Approve">
                                <CheckCircle size={14} />
                              </button>
                            )}
                            {d.status === 'APPROVED' && (
                              <button onClick={() => revokeDevice(d.id)}
                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Revoke">
                                <XCircle size={14} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-12 text-center">
                      <Smartphone size={28} className="text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                      <p className="text-sm text-gray-400 dark:text-gray-500">No devices registered</p>
                    </div>
                  )}
                </div>
              )}

              {/* Security info */}
              <div className={`${cardCls} p-4`}>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                  <AlertTriangle size={14} className="text-yellow-500" /> Security Info
                </h3>

                {/* ── Brute-force lock banner + instant Unlock button ── */}
                {isLocked() && (
                  <div className="mb-4 flex items-start gap-3 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                      <Lock size={15} className="text-red-600 dark:text-red-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-red-700 dark:text-red-400">Account Locked</p>
                      <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-0.5">
                        Locked until {new Date(user.accountLockedUntil!).toLocaleString()} — too many failed login attempts.
                      </p>
                    </div>
                    <button
                      onClick={handleUnlock}
                      disabled={unlocking}
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                    >
                      {unlocking
                        ? <><div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />Unlocking…</>
                        : <><Unlock size={12} />Unlock Now</>}
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-[#0F1929]/50 border border-gray-100 dark:border-white/[0.07]">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Primary Device</p>
                    <p className="font-medium text-gray-900 dark:text-white text-xs font-mono">{user.primaryDeviceId ? user.primaryDeviceId.substring(0, 16) + '...' : 'Not set'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-[#0F1929]/50 border border-gray-100 dark:border-white/[0.07]">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">First Login Done</p>
                    <p className="font-medium text-gray-900 dark:text-white">{user.firstLogin === false ? 'Yes' : 'No (pending)'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-gray-50 dark:bg-[#0F1929]/50 border border-gray-100 dark:border-white/[0.07]">
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Last Login IP</p>
                    <p className="font-medium text-gray-900 dark:text-white text-xs font-mono">{user.lastLoginIp || '—'}</p>
                  </div>
                  <div className={`p-3 rounded-lg border ${isLocked() ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' : 'bg-gray-50 dark:bg-[#0F1929]/50 border-gray-100 dark:border-white/[0.07]'}`}>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Account Lock Status</p>
                    {isLocked()
                      ? <p className="font-bold text-red-600 dark:text-red-400 text-xs">🔒 LOCKED</p>
                      : <p className="font-medium text-green-600 dark:text-green-400 text-xs">✓ Not locked</p>
                    }
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Working time type selector ───────────────────────────────────────────────
const WTT_OPTIONS = [
  { value: 'FULL_TIME', label: 'Full-Time', icon: '🕗', defaultDays: 5, defaultHours: 8 },
  { value: 'PART_TIME', label: 'Part-Time', icon: '🕓', defaultDays: 3, defaultHours: 5 },
  { value: 'CONTRACT',  label: 'Contract',  icon: '📄', defaultDays: 5, defaultHours: 8 },
  { value: 'INTERN',    label: 'Intern',    icon: '🎓', defaultDays: 5, defaultHours: 6 },
];

// ─── Main User Management Page ────────────────────────────────────────────────
const emptyForm = {
  firstName: '', lastName: '', email: '', password: '',
  role: 'EMPLOYEE', phone: '', department: '', position: '',
  workingTimeType: 'FULL_TIME', workingDaysPerWeek: 5, workingHoursPerDay: 8,
};

export const UserManagement = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [formData, setFormData] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [approvingUser, setApprovingUser] = useState<any>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<any>(null);
  const [unlockingId, setUnlockingId] = useState<number | null>(null);
  const { confirmProps, confirm } = useConfirm();

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    try {
      const res = await apiClient.get(`/users`, { params: { limit: 1000 } });
      const body = res.data;
      if (body.success) {
        setUsers((body.data as any[]) ?? []);
        setTotalUsers((body.data as any[])?.length ?? 0);
      } else console.error('fetchUsers failed:', body.error);
    } catch (err: any) {
      console.error('fetchUsers error:', err?.response?.data?.error || err?.message);
    } finally { setLoading(false); }
  };

  const filtered = users.filter(u => {
    const matchSearch = u.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) || u.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
    const matchStatus = statusFilter === 'ALL' || u.status === statusFilter;
    return matchSearch && matchRole && matchStatus;
  });

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilter, statusFilter]);

  // Data slicing for pagination
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedUsers = filtered.slice(startIndex, endIndex);

  const openAdd = () => { setEditingUser(null); setFormData({ ...emptyForm }); setShowModal(true); };
  const openEdit = (u: any) => {
    setEditingUser(u);
    setFormData({
      firstName: u.firstName, lastName: u.lastName, email: u.email, password: '',
      role: u.role, phone: u.phone || '', department: u.department || '', position: u.position || '',
      workingTimeType: u.workingTimeType || 'FULL_TIME',
      workingDaysPerWeek: u.workingDaysPerWeek ?? 5,
      workingHoursPerDay: u.workingHoursPerDay ?? 8,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    const ok = await confirm({ title: 'Delete User', message: 'This will permanently remove the user and all their data. This action cannot be undone.', confirmLabel: 'Delete', variant: 'danger' });
    if (!ok) return;
    try { await apiClient.delete(`/users/${id}`); fetchUsers(); showToast('User deleted'); } catch { showToast('Failed to delete user', false); }
  };

  const handleRejectUser = async (id: number) => {
    const ok = await confirm({ title: 'Reject Account', message: 'This account will be rejected and the user will be notified. Are you sure?', confirmLabel: 'Reject', variant: 'warning' });
    if (!ok) return;
    setRejectingId(id);
    try {
      await authService.approveAccount(id, { action: 'REJECT', reason: 'Rejected by admin' });
      fetchUsers();
    } catch { showToast('Failed to reject', false); }
    finally { setRejectingId(null); }
  };

  const handleQuickUnlock = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setUnlockingId(id);
    try {
      const res = await apiClient.post(`/users/${id}/unlock-account`);
      if (res.data.success) {
        showToast('Account unlocked successfully');
        fetchUsers();
      } else {
        showToast(res.data.error || 'Failed to unlock account', false);
      }
    } catch {
      showToast('Failed to unlock account', false);
    } finally {
      setUnlockingId(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editingUser) await apiClient.put(`/users/${editingUser.id}`, formData);
      else await apiClient.post(`/users`, formData);
      // Reset form, close modal, refresh list
      setFormData({ ...emptyForm });
      setEditingUser(null);
      setShowModal(false);
      fetchUsers();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to save user', false);
    }
    finally { setSaving(false); }
  };

  const stats = [
    { label: 'Total Users', value: totalUsers, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30', icon: <Users size={18} /> },
    { label: 'Active', value: users.filter(u => u.status === 'ACTIVE').length, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30', icon: <UserCheck size={18} /> },
    { label: 'Admins', value: users.filter(u => u.role === 'ADMIN').length, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30', icon: <Shield size={18} /> },
    { label: 'Inactive', value: users.filter(u => u.status !== 'ACTIVE').length, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30', icon: <UserX size={18} /> },
  ];

  return (
    <div className="space-y-5">
      <ConfirmModal {...confirmProps} />
      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium ${toast.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300'}`}>
          {toast.ok ? <CheckCircle size={15} /> : <XCircle size={15} />}{toast.msg}
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage all system users — Admin, HR, Employees</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
          <Plus size={15} /> Add User
        </button>
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

      {/* Filters */}
      <div className={`${cardCls} p-3 flex flex-wrap gap-3`}>
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search users..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-gray-50 dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40">
          <option value="ALL">All Roles</option>
          <option value="ADMIN">Admin</option>
          <option value="HR">HR</option>
          <option value="EMPLOYEE">Employee</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40">
          <option value="ALL">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
        </select>
      </div>

      {/* Table */}
      <div className={`${cardCls} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/[0.07]">
                {['User', 'Email', 'Role', 'Status', 'Last Login', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center"><div className="flex justify-center"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div></td></tr>
              ) : paginatedUsers.length > 0 ? paginatedUsers.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer" onClick={() => setSelectedUser(u)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                        {u.profilePicture ? <img src={u.profilePicture} alt="" className="w-full h-full rounded-full object-cover" /> : <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{u.firstName?.[0]}{u.lastName?.[0]}</span>}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{u.fullName}</p>
                        {u.employeeId && <p className="text-xs text-gray-400 font-mono">{u.employeeId}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`flex items-center gap-1 w-fit px-2 py-0.5 rounded-full text-xs font-semibold ${
                      u.role === 'ADMIN' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' :
                      u.role === 'HR' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                      'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                    }`}><Shield size={10} />{u.role}</span>
                  </td>
                  <td className="px-4 py-3"><StatusBadge status={u.status} /></td>
                  <td className="px-4 py-3 text-gray-400 dark:text-gray-500 text-xs">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      {/* Approve/Reject — for PENDING_APPROVAL and PENDING_ACTIVATION */}
                      {(u.status === 'PENDING_APPROVAL' || u.status === 'PENDING_ACTIVATION') && (
                        <>
                          <button onClick={() => setApprovingUser(u)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors border border-green-200 dark:border-green-800"
                            title="Approve">
                            <CheckCircle size={12} /> Approve
                          </button>
                          <button onClick={() => handleRejectUser(u.id)} disabled={rejectingId === u.id}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors border border-red-200 dark:border-red-800 disabled:opacity-50"
                            title="Reject">
                            <XCircle size={12} /> Reject
                          </button>
                        </>
                      )}
                      <button onClick={() => setSelectedUser(u)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="View profile"><Eye size={14} /></button>
                      <button onClick={() => openEdit(u)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors" title="Edit"><Edit size={14} /></button>
                      <button onClick={() => setResetPasswordUser(u)} className="p-1.5 rounded-lg text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition-colors" title="Reset Password"><KeyRound size={14} /></button>
                      {/* Quick unlock — only shown when brute-force locked */}
                      {u.accountLockedUntil && new Date(u.accountLockedUntil) > new Date() && (
                        <button
                          onClick={(e) => void handleQuickUnlock(u.id, e)}
                          disabled={unlockingId === u.id}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50 transition-colors border border-orange-200 dark:border-orange-800 disabled:opacity-50"
                          title="Unlock Account">
                          {unlockingId === u.id
                            ? <div className="w-3 h-3 border border-orange-500 border-t-transparent rounded-full animate-spin" />
                            : <Unlock size={12} />}
                          Unlock
                        </button>
                      )}
                      <button onClick={() => handleDelete(u.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-500">No users found</td></tr>
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
      </div>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-[#0F1929] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/[0.07] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.07]">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{editingUser ? 'Edit User' : 'Add New User'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="First Name"><input type="text" required value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} className={inputCls} /></Field>
                <Field label="Last Name"><input type="text" required value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} className={inputCls} /></Field>
              </div>
              <Field label="Email"><input type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className={inputCls} /></Field>
              {!editingUser && <Field label="Password"><input type="password" required minLength={6} value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} className={inputCls} /></Field>}
              <Field label="Role">
                <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} className={inputCls}>
                  <option value="EMPLOYEE">Employee</option>
                  <option value="HR">HR</option>
                  <option value="ADMIN">Admin</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Phone"><input type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className={inputCls} /></Field>
                <Field label="Department"><input type="text" value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })} className={inputCls} /></Field>
              </div>
              <Field label="Position"><input type="text" value={formData.position} onChange={e => setFormData({ ...formData, position: e.target.value })} className={inputCls} /></Field>

              {/* Working time — only shown for Employee role */}
              {formData.role === 'EMPLOYEE' && (
                <Field label="Working Time">
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {WTT_OPTIONS.map(opt => (
                      <button key={opt.value} type="button"
                        onClick={() => setFormData({
                          ...formData,
                          workingTimeType: opt.value,
                          workingDaysPerWeek: opt.defaultDays,
                          workingHoursPerDay: opt.defaultHours,
                        })}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border text-left transition-all ${
                          formData.workingTimeType === opt.value
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500'
                            : 'border-gray-200 dark:border-white/[0.07] hover:border-gray-300 dark:hover:border-gray-600'
                        }`}>
                        <span className="text-base">{opt.icon}</span>
                        <span className={`text-xs font-semibold ${formData.workingTimeType === opt.value ? 'text-blue-700 dark:text-blue-400' : 'text-gray-800 dark:text-gray-200'}`}>{opt.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Days / week</label>
                      <input type="number" min={1} max={7} value={formData.workingDaysPerWeek}
                        onChange={e => setFormData({ ...formData, workingDaysPerWeek: Number(e.target.value) })}
                        className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-[11px] text-gray-500 dark:text-gray-400 mb-1">Hours / day</label>
                      <input type="number" min={1} max={24} step={0.5} value={formData.workingHoursPerDay}
                        onChange={e => setFormData({ ...formData, workingHoursPerDay: Number(e.target.value) })}
                        className={inputCls} />
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
                    Total: <span className="font-medium text-gray-600 dark:text-gray-300">
                      {(formData.workingDaysPerWeek * formData.workingHoursPerDay).toFixed(1)}h / week
                    </span>
                  </p>
                </Field>
              )}              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 transition-colors">{saving ? 'Saving...' : editingUser ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* User profile panel */}
      {selectedUser && (
        <UserProfilePanel
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onRefresh={fetchUsers}
        />
      )}

      {/* Approve with schedule modal */}
      {approvingUser && (
        <ApproveWithScheduleModal
          user={approvingUser}
          onClose={() => setApprovingUser(null)}
          onDone={() => { setApprovingUser(null); fetchUsers(); }}
        />
      )}

      {/* Reset Password modal */}
      {resetPasswordUser && (
        <ResetPasswordModal
          user={resetPasswordUser}
          onClose={() => setResetPasswordUser(null)}
          onDone={() => { setResetPasswordUser(null); }}
        />
      )}
    </div>
  );
};

// ── Approve With Schedule Modal (shared by Admin UserManagement & Dashboard) ──
const SHIFT_TYPES_UM = ['Regular', 'Flexible', 'ShiftWork', 'Custom'] as const;
const ALL_DAYS_UM = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ApproveWithScheduleModal({ user, onClose, onDone }: { user: any; onClose: () => void; onDone: () => void }) {
  const [department, setDepartment] = useState(user.department || '');
  const [position, setPosition] = useState(user.position || '');
  const [shiftType, setShiftType] = useState('Regular');
  const [workDays, setWorkDays] = useState(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [startTime, setStartTime] = useState('08:30');
  const [endTime, setEndTime] = useState('17:30');
  const [gracePeriod, setGracePeriod] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const toggleDay = (d: string) => setWorkDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);

  const handleApprove = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const res = await authService.approveAccount(user.id, {
        action: 'APPROVE',
        department,
        position,
        workSchedule: { shiftType, workDays, startTime, endTime, gracePeriod },
      });
      const newStatus = (res.data?.data as { newStatus?: string } | undefined)?.newStatus;
      const msg = newStatus === 'ACTIVE'
        ? `✓ Approved & Activated! ${user.email} can log in immediately with their existing password.`
        : `✓ Approved! Activation email sent to ${user.email}. They will sign in → enter OTP → set password.`;
      setSuccess(msg);
      setTimeout(() => onDone(), 3000);
    } catch (err: any) {
      const msg = err?.error || err?.response?.data?.error || err?.message || 'Failed to approve';
      setError(msg);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-[#0F1929] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/[0.07] max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.07] shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Approve Employee</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Set work schedule for {user.firstName} {user.lastName}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">{error}</div>}
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

          {/* Department & Position */}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Department</label>
              <input type="text" value={department} onChange={e => setDepartment(e.target.value)} className={inputCls} placeholder="e.g. Engineering" /></div>
            <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Position</label>
              <input type="text" value={position} onChange={e => setPosition(e.target.value)} className={inputCls} placeholder="e.g. Developer" /></div>
          </div>

          {/* Shift type cards */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Shift Type</label>
            <div className="grid grid-cols-2 gap-2">
              {SHIFT_TYPES_UM.map(t => (
                <button key={t} type="button" onClick={() => setShiftType(t)}
                  className={`py-2.5 px-3 rounded-xl text-sm font-semibold border-2 transition-all text-left ${
                    shiftType === t ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-400 hover:border-blue-300'}`}>
                  <div className="font-bold">{t}</div>
                  <div className="text-xs font-normal mt-0.5 opacity-70">
                    {t === 'Regular' && 'Fixed daily hours'}
                    {t === 'Flexible' && 'Core hours + flex'}
                    {t === 'ShiftWork' && 'Rotating shifts'}
                    {t === 'Custom' && 'Custom config'}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Work days */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Work Days</label>
            <div className="flex flex-wrap gap-2">
              {ALL_DAYS_UM.map(d => (
                <button key={d} type="button" onClick={() => toggleDay(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border-2 transition-colors ${
                    workDays.includes(d) ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white dark:bg-[#0F1929] border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-400 hover:border-blue-400'}`}>
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Times */}
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Start Time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">End Time</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className={inputCls} /></div>
            <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Grace (min)</label>
              <input type="number" min={0} value={gracePeriod} onChange={e => setGracePeriod(Number(e.target.value))} className={inputCls} /></div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-white/[0.07] flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          <button onClick={handleApprove} disabled={saving}
            className="px-4 py-2 text-sm rounded-lg bg-green-600 hover:bg-green-700 text-white font-medium disabled:opacity-50 transition-colors">
            {saving ? 'Approving...' : '✓ Approve & Activate'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reset Password Modal ──────────────────────────────────────────────────────
function ResetPasswordModal({ user, onClose, onDone }: { user: any; onClose: () => void; onDone: () => void }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const generate = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!';
    const pw = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    setNewPassword(pw);
    setConfirm(pw);
  };

  const handleReset = async () => {
    setError(''); setSuccess('');
    if (newPassword.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (newPassword !== confirm) { setError('Passwords do not match'); return; }
    setSaving(true);
    try {
      const res = await apiClient.post(`/users/${user.id}/reset-password`, { newPassword });
      if (res.data?.success) {
        setSuccess(`Password reset successfully for ${user.email}`);
        setTimeout(() => { onDone(); }, 2000);
      } else {
        setError(res.data?.error || 'Failed to reset password');
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to reset password');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-[#0F1929] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/[0.07]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
              <KeyRound size={18} className="text-yellow-600 dark:text-yellow-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Reset Password</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">{user.fullName || `${user.firstName} ${user.lastName}`}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"><X size={16} /></button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* User info */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-800/30">
            <div className="w-9 h-9 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-yellow-700 dark:text-yellow-400">{user.firstName?.[0]}{user.lastName?.[0]}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{user.email}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{user.role} · {user.department || 'No department'}</p>
            </div>
          </div>

          {error && <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm"><AlertTriangle size={14} />{error}</div>}
          {success && <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-sm"><CheckCircle size={14} />{success}</div>}

          {/* New password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-gray-600 dark:text-gray-400">New Password</label>
              <button type="button" onClick={generate}
                className="text-xs text-blue-500 hover:text-blue-700 font-medium hover:underline">
                Generate strong password
              </button>
            </div>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Min 6 characters"
                className={inputCls + ' pr-10 font-mono'}
              />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>
          </div>

          {/* Confirm */}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Confirm Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat new password"
                className={inputCls + ' pr-10 font-mono'}
              />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5">
            <AlertTriangle size={11} className="text-yellow-500 shrink-0" />
            This will immediately invalidate all active sessions for this user.
          </p>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 dark:border-white/[0.07] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          <button onClick={handleReset} disabled={saving || !!success}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-yellow-500 hover:bg-yellow-600 text-white font-medium disabled:opacity-50 transition-colors">
            <KeyRound size={14} />
            {saving ? 'Resetting...' : 'Reset Password'}
          </button>
        </div>
      </div>
    </div>
  );
}
