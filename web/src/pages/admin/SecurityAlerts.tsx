import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Pagination } from '../../components/common';
import {
  AlertTriangle, Shield, RefreshCw, CheckCircle,
  Clock, Lock, Smartphone, Key,
} from 'lucide-react';

// ─── Severity config ──────────────────────────────────────────────────────────
const SEV: Record<string, { color: string; bg: string; dot: string }> = {
  CRITICAL: { color: 'text-red-700 dark:text-red-400',    bg: 'bg-red-100 dark:bg-red-900/30',    dot: 'bg-red-500' },
  HIGH:     { color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30', dot: 'bg-orange-500' },
  MEDIUM:   { color: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30', dot: 'bg-yellow-500' },
  LOW:      { color: 'text-blue-700 dark:text-blue-400',   bg: 'bg-blue-100 dark:bg-blue-900/30',   dot: 'bg-blue-500' },
  INFO:     { color: 'text-gray-600 dark:text-gray-400',   bg: 'bg-gray-100 dark:bg-gray-700',      dot: 'bg-gray-400' },
};

const ALERT_ICONS: Record<string, React.ReactNode> = {
  HARD_LOCK:            <Lock size={15} />,
  SOFT_LOCK:            <Lock size={15} />,
  TOKEN_REUSE_DETECTED: <Key size={15} />,
  DEVICE_OTP_SENT:      <Smartphone size={15} />,
  DEVICE_BLOCKED:       <Smartphone size={15} />,
  ACCOUNT_LOCKED:       <Lock size={15} />,
  SUSPICIOUS_LOGIN:     <AlertTriangle size={15} />,
};

export const SecurityAlerts = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loginAttempts, setLoginAttempts] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'alerts' | 'attempts'>('alerts');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [resolvedFilter, setResolvedFilter] = useState('false');
  
  // Pagination state
  const [alertsCurrentPage, setAlertsCurrentPage] = useState(1);
  const [alertsRowsPerPage, setAlertsRowsPerPage] = useState(20);
  const [attemptsCurrentPage, setAttemptsCurrentPage] = useState(1);
  const [attemptsRowsPerPage, setAttemptsRowsPerPage] = useState(20);
  const fetchAll = useCallback(async () => {
    try {
      const [alertsRes, attemptsRes, dashRes] = await Promise.all([
        apiClient.get(`/admin/security/alerts?resolved=${resolvedFilter}&limit=100`),
        apiClient.get(`/admin/security/login-attempts?limit=100`),
        apiClient.get(`/admin/security/dashboard`),
      ]);
      const a = alertsRes.data;
      const t = attemptsRes.data;
      const d = dashRes.data;
      if (a.success) setAlerts((a.data as any[]) ?? []);
      if (t.success) setLoginAttempts((t.data as any[]) ?? []);
      if (d.success) setStats(d.data ?? null);
    } catch (err: any) {
      console.error('Failed to load security data:', err?.message);
    } finally { setLoading(false); setRefreshing(false); }
  }, [resolvedFilter]);

  // Wait for auth to be ready before fetching
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchAll();
    }
  }, [fetchAll, authLoading, isAuthenticated]);

  const handleRefresh = () => { setRefreshing(true); fetchAll(); };

  const resolveAlert = async (id: number) => {
    try {
      await apiClient.post(`/admin/security/alerts/${id}/resolve`);
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, isResolved: true } : a));
    } catch { /* silent */ }
  };

  const filteredAlerts = alerts.filter(a => {
    if (severityFilter !== 'ALL' && a.severity !== severityFilter) return false;
    return true;
  });

  // Reset to page 1 when filters change
  useEffect(() => {
    setAlertsCurrentPage(1);
  }, [severityFilter, resolvedFilter]);

  // Data slicing for pagination
  const alertsStartIndex = (alertsCurrentPage - 1) * alertsRowsPerPage;
  const alertsEndIndex = alertsStartIndex + alertsRowsPerPage;
  const paginatedAlerts = filteredAlerts.slice(alertsStartIndex, alertsEndIndex);

  const attemptsStartIndex = (attemptsCurrentPage - 1) * attemptsRowsPerPage;
  const attemptsEndIndex = attemptsStartIndex + attemptsRowsPerPage;
  const paginatedAttempts = loginAttempts.slice(attemptsStartIndex, attemptsEndIndex);

  const statCards = [
    { label: 'Failed Logins Today', value: stats?.stats?.failedLoginsToday ?? 0, icon: <AlertTriangle size={18} />, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
    { label: 'Locked Accounts',     value: stats?.stats?.lockedAccounts ?? 0,     icon: <Lock size={18} />,          color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' },
    { label: 'Unresolved Alerts',   value: stats?.stats?.unresolvedAlerts ?? 0,   icon: <Shield size={18} />,        color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
    { label: 'Token Reuse Today',   value: stats?.stats?.tokenReuseToday ?? 0,    icon: <Key size={18} />,           color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Security Alerts</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Real-time security monitoring — login failures, locked accounts, suspicious activity
          </p>
        </div>
        <button onClick={handleRefresh}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(card => (
          <div key={card.label} className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${card.bg}`}>
              <span className={card.color}>{card.icon}</span>
            </div>
            <div>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{card.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Suspicious IPs */}
      {stats?.suspiciousIPs?.length > 0 && (
        <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-red-200 dark:border-red-800 p-4">
          <p className="text-xs font-semibold text-red-600 dark:text-red-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <AlertTriangle size={13} /> Top Suspicious IPs (last 24h)
          </p>
          <div className="flex flex-wrap gap-2">
            {stats.suspiciousIPs.map((item: any) => (
              <span key={item.ip} className="px-3 py-1 rounded-full text-xs font-mono bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                {item.ip} — {item.attempts} attempts
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Main table card */}
      <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07]">
        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 pt-3 border-b border-gray-100 dark:border-white/[0.07]">
          {(['alerts', 'attempts'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors capitalize ${
                activeTab === tab
                  ? 'text-gray-900 dark:text-white bg-gray-100 dark:bg-[#0F1929]'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}>
              {tab === 'alerts' ? `Security Alerts${alerts.filter(a => !a.isResolved).length > 0 ? ` (${alerts.filter(a => !a.isResolved).length})` : ''}` : 'Login Attempts'}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-white/[0.07]">
          {activeTab === 'alerts' && (
            <>
              <select value={resolvedFilter} onChange={e => setResolvedFilter(e.target.value)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40">
                <option value="false">Unresolved</option>
                <option value="true">Resolved</option>
                <option value="">All</option>
              </select>
              <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40">
                <option value="ALL">All Severity</option>
                <option value="CRITICAL">Critical</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
            </>
          )}
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
            {activeTab === 'alerts' ? `${filteredAlerts.length} alerts` : `${loginAttempts.length} attempts`}
          </span>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeTab === 'alerts' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/[0.07]">
                  {['Severity', 'Alert', 'User', 'IP', 'Time', 'Status', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {paginatedAlerts.length > 0 ? paginatedAlerts.map(alert => {
                  const sev = SEV[alert.severity] ?? SEV.INFO;
                  return (
                    <tr key={alert.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${sev.bg} ${sev.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                          {alert.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="flex items-start gap-2">
                          <span className={`mt-0.5 shrink-0 ${sev.color}`}>{ALERT_ICONS[alert.alertType] ?? <AlertTriangle size={14} />}</span>
                          <div>
                            <p className="text-xs font-semibold text-gray-900 dark:text-white">{alert.title}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[200px]">{alert.message}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {alert.user ? alert.user.name : '—'}
                        {alert.user?.email && <p className="text-gray-400 dark:text-gray-500">{alert.user.email}</p>}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">{alert.ipAddress || '—'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {new Date(alert.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {alert.isResolved
                          ? <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400"><CheckCircle size={12} /> Resolved</span>
                          : <span className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400"><Clock size={12} /> Open</span>
                        }
                      </td>
                      <td className="px-4 py-3">
                        {!alert.isResolved && (
                          <button onClick={() => resolveAlert(alert.id)}
                            className="px-2.5 py-1 text-xs rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors font-medium">
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
                    {resolvedFilter === 'false' ? '✅ No unresolved security alerts' : 'No alerts found'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/[0.07]">
                  {['Status', 'Email', 'Reason', 'IP', 'Device', 'Time'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {paginatedAttempts.length > 0 ? paginatedAttempts.map(attempt => (
                  <tr key={attempt.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        attempt.status === 'SUCCESS'
                          ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                          : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      }`}>{attempt.status}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300">{attempt.email}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{attempt.failureReason || '—'}</td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-500 dark:text-gray-400">{attempt.ipAddress}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 dark:text-gray-500 truncate max-w-[120px]">{attempt.deviceId || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {new Date(attempt.createdAt).toLocaleString()}
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-500">No login attempts recorded</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Pagination */}
        {activeTab === 'alerts' && (
          <Pagination
            totalItems={filteredAlerts.length}
            rowsPerPage={alertsRowsPerPage}
            currentPage={alertsCurrentPage}
            onPageChange={setAlertsCurrentPage}
            onRowsPerPageChange={setAlertsRowsPerPage}
          />
        )}
        {activeTab === 'attempts' && (
          <Pagination
            totalItems={loginAttempts.length}
            rowsPerPage={attemptsRowsPerPage}
            currentPage={attemptsCurrentPage}
            onPageChange={setAttemptsCurrentPage}
            onRowsPerPageChange={setAttemptsRowsPerPage}
          />
        )}
      </div>
    </div>
  );
};
