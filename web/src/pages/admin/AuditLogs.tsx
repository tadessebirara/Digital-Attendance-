import { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import { Pagination } from '../../components/common';
import {
  Search, Filter, Download, RefreshCw, X,
  Shield, Clock, User,
  CheckCircle, LogIn,
  Smartphone, Settings, FileText, Eye
} from 'lucide-react';

// ─── Category config ──────────────────────────────────────────────────────────
const CATEGORY_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  AUTH:         { label: 'Auth',         color: 'text-blue-700 dark:text-blue-400',   bg: 'bg-blue-100 dark:bg-blue-900/30',   icon: <LogIn size={11} /> },
  USER:         { label: 'User',         color: 'text-purple-700 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30', icon: <User size={11} /> },
  ATTENDANCE:   { label: 'Attendance',   color: 'text-green-700 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30', icon: <CheckCircle size={11} /> },
  LEAVE:        { label: 'Leave',        color: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30', icon: <Clock size={11} /> },
  SECURITY:     { label: 'Security',     color: 'text-red-700 dark:text-red-400',     bg: 'bg-red-100 dark:bg-red-900/30',     icon: <Shield size={11} /> },
  SYSTEM:       { label: 'System',       color: 'text-gray-700 dark:text-gray-400',   bg: 'bg-gray-100 dark:bg-gray-700',      icon: <Settings size={11} /> },
  DEVICE:       { label: 'Device',       color: 'text-orange-700 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30', icon: <Smartphone size={11} /> },
  ANNOUNCEMENT: { label: 'Announcement', color: 'text-blue-700 dark:text-blue-400',   bg: 'bg-blue-100 dark:bg-blue-900/30',   icon: <FileText size={11} /> },
};

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
  CRITICAL: { label: 'Critical', color: 'text-red-700 dark:text-red-400',    bg: 'bg-red-100 dark:bg-red-900/30',    dot: 'bg-red-500' },
  WARNING:  { label: 'Warning',  color: 'text-yellow-700 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30', dot: 'bg-yellow-500' },
  INFO:     { label: 'Info',     color: 'text-green-700 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30', dot: 'bg-green-500' },
};

// ─── Detail Modal ─────────────────────────────────────────────────────────────
function DetailModal({ log, onClose }: { log: any; onClose: () => void }) {
  const cat = CATEGORY_CONFIG[log.category] ?? CATEGORY_CONFIG.SYSTEM;
  const sev = SEVERITY_CONFIG[log.severity] ?? SEVERITY_CONFIG.INFO;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-white dark:bg-[#0F1929] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/[0.07] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.07]">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cat.bg}`}>
              <span className={cat.color}>{cat.icon}</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">{log.action}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{log.category} · {log.severity}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Description */}
          <div className={`px-4 py-3 rounded-xl border ${sev.bg} border-opacity-50`}>
            <p className={`text-sm font-medium ${sev.color}`}>{log.description}</p>
          </div>

          {/* Core fields */}
          <div className="grid grid-cols-2 gap-3">
            <InfoField label="Timestamp" value={log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'} />
            <InfoField label="User" value={log.user || '—'} />
            <InfoField label="Email" value={log.userEmail || '—'} />
            <InfoField label="Role" value={log.userRole || '—'} />
            <InfoField label="IP Address" value={log.ipAddress || '—'} />
            <InfoField label="Entity" value={log.entity || '—'} />
            {log.entityId && <InfoField label="Entity ID" value={String(log.entityId)} />}
          </div>

          {/* Details object */}
          {log.details && Object.keys(log.details).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Action Details</p>
              <div className="bg-gray-50 dark:bg-[#0F1929]/50 rounded-xl border border-gray-200 dark:border-white/[0.07] divide-y divide-gray-100 dark:divide-gray-700">
                {Object.entries(log.details).map(([k, v]) => (
                  <div key={k} className="flex items-start gap-3 px-4 py-2.5">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-32 shrink-0 capitalize">{k.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-gray-900 dark:text-white break-all">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          {log.metadata && (log.metadata.userAgent || log.metadata.location) && (
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Device &amp; Location</p>
              <div className="bg-gray-50 dark:bg-[#0F1929]/50 rounded-xl border border-gray-200 dark:border-white/[0.07] divide-y divide-gray-100 dark:divide-gray-700">
                {log.metadata.userAgent && (
                  <>
                    {log.metadata.userAgent.browser && <MetaRow label="Browser" value={log.metadata.userAgent.browser} />}
                    {log.metadata.userAgent.os && <MetaRow label="OS" value={log.metadata.userAgent.os} />}
                    {log.metadata.userAgent.device && <MetaRow label="Device" value={log.metadata.userAgent.device} />}
                  </>
                )}
                {log.metadata.location && (
                  <>
                    {log.metadata.location.country && <MetaRow label="Country" value={log.metadata.location.country} />}
                    {log.metadata.location.city && <MetaRow label="City" value={log.metadata.location.city} />}
                    {log.metadata.location.timezone && <MetaRow label="Timezone" value={log.metadata.location.timezone} />}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-medium text-gray-900 dark:text-white break-all">{value}</p>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-24 shrink-0">{label}</span>
      <span className="text-xs text-gray-900 dark:text-white">{value}</span>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export const AuditLogs = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'activity' | 'failed'>('activity');
  const [showFilters, setShowFilters] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [selectedLog, setSelectedLog] = useState<any>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  useEffect(() => { fetchLogs(); }, []);

  const fetchLogs = async () => {
    try {
      const res = await apiClient.get(`/audit/logs?limit=200`);
      const body = res.data;
      if (body.success) setLogs((body.data as any[]) || []);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  };

  const handleRefresh = () => { setRefreshing(true); fetchLogs(); };

  const exportCSV = () => {
    const headers = ['Timestamp', 'User', 'Email', 'Role', 'Category', 'Action', 'Severity', 'Description', 'IP', 'Entity'];
    const rows = filtered.map(l => [
      l.timestamp ? new Date(l.timestamp).toLocaleString() : '',
      l.user || '', l.userEmail || '', l.userRole || '',
      l.category || '', l.action || '', l.severity || '',
      l.description || '', l.ipAddress || '', l.entity || '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `audit_logs_${new Date().toISOString().split('T')[0]}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const stats = {
    total: logs.length,
    today: logs.filter(l => l.timestamp && new Date(l.timestamp).toDateString() === new Date().toDateString()).length,
    critical: logs.filter(l => l.severity === 'CRITICAL').length,
    failedLogins: logs.filter(l => l.action === 'LOGIN_FAILED' || l.action === 'FAILED_LOGIN').length,
  };

  const filtered = logs.filter(log => {
    const userStr = String(log.user || '');
    const matchSearch = !searchTerm || (
      userStr.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(log.action || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(log.description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(log.userEmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(log.ipAddress || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
    const matchCat = categoryFilter === 'ALL' || log.category === categoryFilter;
    const matchSev = severityFilter === 'ALL' || log.severity === severityFilter;
    const matchTab = activeTab === 'failed'
      ? (log.action === 'LOGIN_FAILED' || log.action === 'FAILED_LOGIN')
      : true;
    return matchSearch && matchCat && matchSev && matchTab;
  });

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, categoryFilter, severityFilter, activeTab]);

  // Data slicing for pagination
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedLogs = filtered.slice(startIndex, endIndex);

  const statCards = [
    { label: 'Total Logs',         value: stats.total,        color: 'text-blue-600 dark:text-blue-400' },
    { label: 'Today',              value: stats.today,        color: 'text-green-600 dark:text-green-400' },
    { label: 'Critical Events',    value: stats.critical,     color: 'text-red-600 dark:text-red-400' },
    { label: 'Failed Logins',      value: stats.failedLogins, color: 'text-orange-500 dark:text-orange-400' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Audit Logs</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Full system activity — HR actions, admin changes, security events
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={exportCSV} disabled={!filtered.length}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors">
            <Download size={15} /> Export CSV
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(card => (
          <div key={card.label} className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] p-4">
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07]">
        {/* Tabs */}
        <div className="flex items-center gap-1 px-4 pt-3 border-b border-gray-100 dark:border-white/[0.07]">
          {(['activity', 'failed'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors
                ${activeTab === tab
                  ? 'text-gray-900 dark:text-white bg-gray-100 dark:bg-[#0F1929]'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}>
              {tab === 'activity' ? 'Activity Logs' : 'Failed Logins'}
            </button>
          ))}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-white/[0.07]">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="Search user, action, description, IP..."
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-gray-50 dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-colors ${showFilters ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400' : 'border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
            <Filter size={14} /> Filters
          </button>
        </div>

        {/* Filter row */}
        {showFilters && (
          <div className="flex flex-wrap gap-3 px-4 py-3 border-b border-gray-100 dark:border-white/[0.07] bg-gray-50 dark:bg-[#0F1929]/50">
            <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40">
              <option value="ALL">All Categories</option>
              {Object.entries(CATEGORY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value)}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40">
              <option value="ALL">All Severity</option>
              <option value="CRITICAL">Critical</option>
              <option value="WARNING">Warning</option>
              <option value="INFO">Info</option>
            </select>
            <span className="text-xs text-gray-400 dark:text-gray-500 self-center">{filtered.length} results</span>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/[0.07]">
                {['Timestamp', 'User', 'Category', 'Action', 'Severity', 'Description', 'IP', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center">
                  <div className="flex justify-center"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
                </td></tr>
              ) : paginatedLogs.length > 0 ? (
                paginatedLogs.map(log => {
                  const cat = CATEGORY_CONFIG[log.category] ?? CATEGORY_CONFIG.SYSTEM;
                  const sev = SEVERITY_CONFIG[log.severity] ?? SEVERITY_CONFIG.INFO;
                  return (
                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      {/* Timestamp */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-xs font-medium text-gray-900 dark:text-white">
                          {log.timestamp ? new Date(log.timestamp).toLocaleDateString() : '—'}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          {log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                        </p>
                      </td>
                      {/* User */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-xs font-medium text-gray-900 dark:text-white">{log.user || '—'}</p>
                        {log.userEmail && <p className="text-xs text-gray-400 dark:text-gray-500">{log.userEmail}</p>}
                        {log.userRole && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{log.userRole}</span>}
                      </td>
                      {/* Category */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cat.bg} ${cat.color}`}>
                          {cat.icon}{cat.label}
                        </span>
                      </td>
                      {/* Action */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-mono font-medium text-gray-700 dark:text-gray-300">{log.action}</span>
                      </td>
                      {/* Severity */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${sev.bg} ${sev.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sev.dot}`} />
                          {sev.label}
                        </span>
                      </td>
                      {/* Description */}
                      <td className="px-4 py-3 max-w-xs">
                        <p className="text-xs text-gray-600 dark:text-gray-400 truncate" title={log.description}>{log.description || '—'}</p>
                      </td>
                      {/* IP */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{log.ipAddress || '—'}</span>
                      </td>
                      {/* View button */}
                      <td className="px-4 py-3">
                        <button onClick={() => setSelectedLog(log)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
                          <Eye size={11} /> View
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
                  No logs found matching your filters.
                </td></tr>
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

      {/* Detail modal */}
      {selectedLog && <DetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />}
    </div>
  );
};
