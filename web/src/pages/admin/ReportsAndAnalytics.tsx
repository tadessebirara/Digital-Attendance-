import { useState, useCallback } from 'react';
import apiClient from '../../api/client';
import { Pagination } from '../../components/common';
import {
  Download, Users, FileText, Shield, AlertTriangle,
  Activity, Key, Smartphone, Settings, ChevronRight,
  BarChart2, RefreshCw, Lock,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';

const inputCls = `px-3 py-2 text-sm rounded-lg bg-white dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40`;

// ─── Admin system report types ────────────────────────────────────────────────
const REPORT_TYPES = [
  { id: 'audit_log',         label: 'Full Audit Log',          desc: 'All system actions with user, IP, timestamp',  icon: FileText,    color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-900/20' },
  { id: 'login_history',     label: 'Login History',           desc: 'All login attempts — success and failed',      icon: Key,         color: 'text-green-600 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-900/20' },
  { id: 'failed_logins',     label: 'Failed Login Attempts',   desc: 'Brute-force and suspicious login attempts',    icon: Lock,        color: 'text-red-600 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-900/20' },
  { id: 'security_alerts',   label: 'Security Alerts',         desc: 'Account locks, token reuse, device attacks',   icon: AlertTriangle,color:'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-900/20' },
  { id: 'user_activity',     label: 'User Activity',           desc: 'Who did what — profile changes, role edits',   icon: Activity,    color: 'text-purple-600 dark:text-purple-400',bg: 'bg-purple-50 dark:bg-purple-900/20' },
  { id: 'device_report',     label: 'Device Report',           desc: 'Registered devices, approvals, revocations',   icon: Smartphone,  color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-900/20' },
  { id: 'role_changes',      label: 'Role & Permission Changes',desc: 'All role assignments and permission edits',    icon: Shield,      color: 'text-indigo-600 dark:text-indigo-400',bg: 'bg-indigo-50 dark:bg-indigo-900/20' },
  { id: 'system_settings',   label: 'System Settings Log',     desc: 'Configuration changes and admin actions',      icon: Settings,    color: 'text-gray-600 dark:text-gray-400',    bg: 'bg-gray-50 dark:bg-[#0F1929]' },
  { id: 'user_summary',      label: 'User Summary',            desc: 'All users by role, status, last login',        icon: Users,       color: 'text-cyan-600 dark:text-cyan-400',    bg: 'bg-cyan-50 dark:bg-cyan-900/20' },
];

const PIE_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] rounded-xl shadow-xl px-4 py-3 text-sm">
      <p className="font-semibold text-gray-900 dark:text-white mb-1.5">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.fill || p.color }} />
          <span className="text-gray-500 dark:text-gray-400">{p.name}:</span>
          <span className="font-medium text-gray-900 dark:text-white">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-44 flex items-center justify-center">
      <div className="text-center">
        <BarChart2 size={26} className="text-gray-300 dark:text-gray-600 mx-auto mb-2" />
        <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
      </div>
    </div>
  );
}

// ─── Build chart from admin report data ───────────────────────────────────────
function buildAdminChart(reportId: string, data: any[]) {
  if (!data.length) return { trend: [], pie: [], isLine: false };

  if (reportId === 'login_history' || reportId === 'failed_logins') {
    const byDate: Record<string, { success: number; failed: number }> = {};
    data.forEach(r => {
      const d = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : null;
      if (!d) return;
      if (!byDate[d]) byDate[d] = { success: 0, failed: 0 };
      if (r.status === 'SUCCESS') byDate[d].success++;
      else byDate[d].failed++;
    });
    const trend = Object.entries(byDate).slice(-14).map(([date, v]) => ({ date, ...v }));
    const totals = trend.reduce((a, r) => ({ success: a.success + r.success, failed: a.failed + r.failed }), { success: 0, failed: 0 });
    const pie = [{ name: 'Success', value: totals.success }, { name: 'Failed', value: totals.failed }].filter(p => p.value > 0);
    return { trend, pie, isLine: true };
  }

  if (reportId === 'audit_log' || reportId === 'user_activity') {
    const byDate: Record<string, number> = {};
    data.forEach(r => {
      const d = r.timestamp || r.createdAt;
      if (d) { const k = new Date(d).toLocaleDateString(); byDate[k] = (byDate[k] || 0) + 1; }
    });
    const trend = Object.entries(byDate).slice(-14).map(([date, count]) => ({ date, count }));
    const byCategory: Record<string, number> = {};
    data.forEach(r => { const c = r.category || r.entity || 'Other'; byCategory[c] = (byCategory[c] || 0) + 1; });
    const pie = Object.entries(byCategory).map(([name, value]) => ({ name, value }));
    return { trend, pie, isLine: false };
  }

  if (reportId === 'security_alerts') {
    const bySeverity: Record<string, number> = {};
    data.forEach(r => { const s = r.severity || 'INFO'; bySeverity[s] = (bySeverity[s] || 0) + 1; });
    const pie = Object.entries(bySeverity).map(([name, value]) => ({ name, value }));
    const byDate: Record<string, number> = {};
    data.forEach(r => { const d = r.createdAt; if (d) { const k = new Date(d).toLocaleDateString(); byDate[k] = (byDate[k] || 0) + 1; } });
    const trend = Object.entries(byDate).slice(-14).map(([date, count]) => ({ date, count }));
    return { trend, pie, isLine: false };
  }

  if (reportId === 'user_summary') {
    const byRole: Record<string, number> = {};
    data.forEach(r => { const role = r.role || 'Unknown'; byRole[role] = (byRole[role] || 0) + 1; });
    const pie = Object.entries(byRole).map(([name, value]) => ({ name, value }));
    const byStatus: Record<string, number> = {};
    data.forEach(r => { const s = r.status || 'Unknown'; byStatus[s] = (byStatus[s] || 0) + 1; });
    const trend = Object.entries(byStatus).map(([date, count]) => ({ date, count }));
    return { trend, pie, isLine: false };
  }

  if (reportId === 'device_report') {
    const byStatus: Record<string, number> = {};
    data.forEach(r => { const s = r.status || 'Unknown'; byStatus[s] = (byStatus[s] || 0) + 1; });
    const pie = Object.entries(byStatus).map(([name, value]) => ({ name, value }));
    const byPlatform: Record<string, number> = {};
    data.forEach(r => { const p = r.platform || 'Unknown'; byPlatform[p] = (byPlatform[p] || 0) + 1; });
    const trend = Object.entries(byPlatform).map(([date, count]) => ({ date, count }));
    return { trend, pie, isLine: false };
  }

  return { trend: [], pie: [], isLine: false };
}

// ─── Export CSV ───────────────────────────────────────────────────────────────
function exportCSV(data: any[], filename: string) {
  if (!data.length) return;
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(r => Object.values(r).map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([headers + '\n' + rows], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Fetch admin report data ──────────────────────────────────────────────────
async function fetchAdminReport(reportId: string, params: Record<string, string>) {
  const endpointMap: Record<string, string> = {
    audit_log:       `/audit/logs`,
    login_history:   `/admin/security/login-attempts`,
    failed_logins:   `/admin/security/login-attempts`,
    security_alerts: `/admin/security/alerts`,
    user_activity:   `/audit/logs`,
    device_report:   `/devices`,
    role_changes:    `/audit/logs`,
    system_settings: `/audit/logs`,
    user_summary:    `/users`,
  };

  const extraParams: Record<string, Record<string, string>> = {
    failed_logins:   { status: 'FAILED' },
    role_changes:    { category: 'SECURITY' },
    system_settings: { category: 'SYSTEM' },
  };

  const url = endpointMap[reportId] || `/audit/logs`;
  const merged = { ...params, ...(extraParams[reportId] || {}), limit: '200' };
  const qs = new URLSearchParams(merged).toString();
  const res = await apiClient.get(`${url}?${qs}`);
  const body = res.data;
  return body.success ? ((body.data as any[]) || []) : [];
}

// ─── Main Component ───────────────────────────────────────────────────────────
export const ReportsAndAnalytics = () => {
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [chartTrend, setChartTrend] = useState<any[]>([]);
  const [chartPie, setChartPie] = useState<any[]>([]);
  const [isLine, setIsLine] = useState(false);

  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const generateReport = useCallback(async (reportId: string) => {
    setActiveReport(reportId);
    setGenerating(true);
    setError('');
    setReportData([]);
    setChartTrend([]);
    setChartPie([]);
    setCurrentPage(1); // Reset to page 1 when generating new report
    try {
      const params: Record<string, string> = { from: dateFrom, to: dateTo };
      if (roleFilter !== 'ALL') params.role = roleFilter;
      if (severityFilter !== 'ALL') params.severity = severityFilter;
      const data = await fetchAdminReport(reportId, params);
      setReportData(data);
      const { trend, pie, isLine: il } = buildAdminChart(reportId, data);
      setChartTrend(trend);
      setChartPie(pie);
      setIsLine(il);
    } catch {
      setError('Failed to generate report. Please try again.');
    } finally { setGenerating(false); }
  }, [dateFrom, dateTo, roleFilter, severityFilter]);

  const activeReportDef = REPORT_TYPES.find(r => r.id === activeReport);

  const trendKey = isLine ? 'count' : (chartTrend[0] ? Object.keys(chartTrend[0]).find(k => k !== 'date') || 'count' : 'count');
  
  // Data slicing for pagination
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedReportData = reportData.slice(startIndex, endIndex);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">System Reports &amp; Analytics</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Audit logs, security events, user activity — select a report type and export</p>
      </div>

      {/* ── Filters + Export ── */}
      <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Role</label>
            <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className={inputCls}>
              <option value="ALL">All Roles</option>
              <option value="ADMIN">Admin</option>
              <option value="HR">HR</option>
              <option value="EMPLOYEE">Employee</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Severity</label>
            <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} className={inputCls}>
              <option value="ALL">All Severity</option>
              <option value="CRITICAL">Critical</option>
              <option value="WARNING">Warning</option>
              <option value="INFO">Info</option>
            </select>
          </div>
          <div className="flex-1" />
          {activeReport && (
            <button onClick={() => generateReport(activeReport)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <RefreshCw size={14} /> Refresh
            </button>
          )}
          <button
            onClick={() => exportCSV(reportData, `${activeReport || 'report'}_${dateFrom}_${dateTo}.csv`)}
            disabled={!reportData.length}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Download size={14} />
            Export {activeReportDef ? activeReportDef.label : 'Report'}
          </button>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Report Types */}
        <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.07]">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">System Report Types</p>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {REPORT_TYPES.map(rt => {
              const Icon = rt.icon;
              const isAct = activeReport === rt.id;
              return (
                <button key={rt.id} onClick={() => generateReport(rt.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isAct ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${rt.bg}`}>
                    <Icon size={16} className={rt.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${isAct ? 'text-blue-700 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>{rt.label}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{rt.desc}</p>
                  </div>
                  <ChevronRight size={13} className={`shrink-0 ${isAct ? 'text-blue-500' : 'text-gray-300 dark:text-gray-600'}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Charts */}
        <div className="lg:col-span-2 space-y-5">
          {/* Trend / Activity chart */}
          <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              {activeReport ? `${activeReportDef?.label} — Activity Over Time` : 'Activity Over Time'}
            </h2>
            {generating ? (
              <div className="h-52 flex items-center justify-center"><div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : chartTrend.length > 0 ? (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  {isLine ? (
                    <LineChart data={chartTrend}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.4} vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="success" name="Success" stroke="#22c55e" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="failed" name="Failed" stroke="#ef4444" strokeWidth={2} dot={false} />
                    </LineChart>
                  ) : (
                    <BarChart data={chartTrend} barCategoryGap="40%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.4} vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey={trendKey} name="Events" fill="#3b82f6" radius={[3,3,0,0]} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart label={activeReport ? 'No activity data for this period' : 'Select a report type to see activity'} />
            )}
          </div>

          {/* Distribution pie */}
          <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
              {activeReport ? `${activeReportDef?.label} — Distribution` : 'Distribution'}
            </h2>
            {generating ? (
              <div className="h-44 flex items-center justify-center"><div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : chartPie.length > 0 ? (
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={chartPie} cx="50%" cy="50%" innerRadius={38} outerRadius={65}
                      paddingAngle={3} dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}>
                      {chartPie.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart label={activeReport ? 'No distribution data' : 'Select a report type to see distribution'} />
            )}
          </div>
        </div>
      </div>

      {/* ── Data table ── */}
      {activeReport && (
        <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07]">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-white/[0.07]">
            <div className="flex items-center gap-3">
              {activeReportDef && (
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${activeReportDef.bg}`}>
                  <activeReportDef.icon size={15} className={activeReportDef.color} />
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{activeReportDef?.label}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500">{dateFrom} &rarr; {dateTo} &middot; {reportData.length} records</p>
              </div>
            </div>
            <button onClick={() => exportCSV(reportData, `${activeReport}_${dateFrom}_${dateTo}.csv`)} disabled={!reportData.length}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-40 transition-colors">
              <Download size={13} /> Export CSV
            </button>
          </div>

          {generating ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-400 dark:text-gray-500">Generating report…</p>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 m-5 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
              <AlertTriangle size={15} />{error}
            </div>
          ) : reportData.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-white/[0.07]">
                      {Object.keys(reportData[0]).slice(0, 8).map(k => (
                        <th key={k} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                          {k.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {paginatedReportData.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        {Object.values(row).slice(0, 8).map((val: any, j) => (
                          <td key={j} className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap text-xs">
                            {typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}T/)
                              ? new Date(val).toLocaleString() : String(val ?? '\u2014')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination */}
              <Pagination
                totalItems={reportData.length}
                rowsPerPage={rowsPerPage}
                currentPage={currentPage}
                onPageChange={setCurrentPage}
                onRowsPerPageChange={setRowsPerPage}
              />
            </>
          ) : (
            <div className="py-14 text-center text-sm text-gray-400 dark:text-gray-500">
              No data found for the selected filters.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
