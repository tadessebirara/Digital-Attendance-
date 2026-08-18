import { useState, useCallback, useRef } from 'react';
import apiClient from '../../api/client';
import {
  Download, Users, Clock, FileText, Calendar,
  TrendingUp, UserX, AlertCircle, ChevronRight,
  BarChart2, RefreshCw,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Pagination } from '../../components/common';

const inputCls = `px-3 py-2 text-sm rounded-lg bg-white dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40`;

const REPORT_TYPES = [
  { id: 'attendance_log',     label: 'Full Attendance Log',   desc: 'Every check-in/out with timestamps',       icon: Users,      color: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-50 dark:bg-blue-900/20' },
  { id: 'attendance_summary', label: 'Attendance Summary',    desc: 'Present, late, absent per employee',       icon: Calendar,   color: 'text-green-600 dark:text-green-400',  bg: 'bg-green-50 dark:bg-green-900/20' },
  { id: 'late_arrivals',      label: 'Late Arrivals',         desc: 'Employees who arrived after shift start',  icon: Clock,      color: 'text-yellow-600 dark:text-yellow-400',bg: 'bg-yellow-50 dark:bg-yellow-900/20' },
  { id: 'absent_employees',   label: 'Absent Employees',      desc: 'Employees with no check-in',               icon: UserX,      color: 'text-red-600 dark:text-red-400',      bg: 'bg-red-50 dark:bg-red-900/20' },
  { id: 'leave_summary',      label: 'Leave Summary',         desc: 'All leave requests with status breakdown', icon: FileText,   color: 'text-purple-600 dark:text-purple-400',bg: 'bg-purple-50 dark:bg-purple-900/20' },
  { id: 'overtime',           label: 'Overtime Report',       desc: 'Employees who worked beyond schedule',     icon: TrendingUp, color: 'text-orange-600 dark:text-orange-400',bg: 'bg-orange-50 dark:bg-orange-900/20' },
];

const DEPARTMENTS = ['All Departments', 'Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations'];
const PIE_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

// ─── 3D Bar ───────────────────────────────────────────────────────────────────
const Bar3D = (props: any) => {
  const { x, y, width, height, fill } = props;
  if (!height || height <= 0) return null;
  const d = 5;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} rx={2} />
      <polygon points={`${x},${y} ${x+d},${y-d} ${x+width+d},${y-d} ${x+width},${y}`} fill={fill} opacity={0.65} />
      <polygon points={`${x+width},${y} ${x+width+d},${y-d} ${x+width+d},${y+height-d} ${x+width},${y+height}`} fill={fill} opacity={0.45} />
    </g>
  );
};

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

// ─── Build chart data from report results ─────────────────────────────────────
function buildChartFromReport(reportId: string, data: any[]) {
  if (!data.length) return { trend: [], pie: [] };

  if (reportId === 'attendance_summary') {
    // Each row is one employee — build pie from totals
    const totals = data.reduce((acc, r) => ({
      present: acc.present + (Number(r['Present']) || 0),
      late:    acc.late    + (Number(r['Late'])    || 0),
      absent:  acc.absent  + (Number(r['Absent'])  || 0),
    }), { present: 0, late: 0, absent: 0 });
    const pie = [
      { name: 'Present', value: totals.present },
      { name: 'Late',    value: totals.late },
      { name: 'Absent',  value: totals.absent },
    ].filter(p => p.value > 0);
    // Trend: top 10 employees by attendance rate
    const trend = data.slice(0, 10).map(r => ({
      date: (r['Employee Name'] || '').split(' ')[0],
      present: Number(r['Present']) || 0,
      late:    Number(r['Late'])    || 0,
      absent:  Number(r['Absent'])  || 0,
    }));
    return { trend, pie };
  }

  if (reportId === 'attendance_log') {
    const byDate: Record<string, { present: number; late: number; absent: number }> = {};
    data.forEach(r => {
      const d = r['Date'] || '';
      if (!d) return;
      if (!byDate[d]) byDate[d] = { present: 0, late: 0, absent: 0 };
      const s = (r['Status'] || '').toUpperCase();
      // Map all status variants to present/late/absent
      if (['PRESENT', 'CHECKED_OUT', 'AUTO_CHECKOUT', 'MISSED_CHECKOUT'].includes(s)) byDate[d].present++;
      else if (['LATE', 'HALF_DAY'].includes(s)) byDate[d].late++;
      else if (s === 'ABSENT') byDate[d].absent++;
    });
    const trend = Object.entries(byDate).slice(-14).map(([date, v]) => ({ date, ...v }));
    const totals = trend.reduce((acc, r) => ({ present: acc.present + r.present, late: acc.late + r.late, absent: acc.absent + r.absent }), { present: 0, late: 0, absent: 0 });
    const pie = [
      { name: 'Present', value: totals.present },
      { name: 'Late',    value: totals.late },
      { name: 'Absent',  value: totals.absent },
    ].filter(p => p.value > 0);
    return { trend, pie };
  }

  if (reportId === 'late_arrivals') {
    const byDate: Record<string, number> = {};
    data.forEach(r => { const d = r['Date'] || ''; if (d) byDate[d] = (byDate[d] || 0) + 1; });
    const trend = Object.entries(byDate).slice(-14).map(([date, late]) => ({ date, present: 0, late, absent: 0 }));
    const pie = [{ name: 'Late Arrivals', value: data.length }];
    return { trend, pie };
  }

  if (reportId === 'absent_employees') {
    const byDate: Record<string, number> = {};
    data.forEach(r => { const d = r['Date'] || ''; if (d) byDate[d] = (byDate[d] || 0) + 1; });
    const trend = Object.entries(byDate).slice(-14).map(([date, absent]) => ({ date, present: 0, late: 0, absent }));
    const pie = [{ name: 'Absent', value: data.length }];
    return { trend, pie };
  }

  if (reportId === 'leave_summary') {
    const byType: Record<string, number> = {};
    data.forEach(r => { const t = r['Leave Type'] || 'Other'; byType[t] = (byType[t] || 0) + 1; });
    const pie = Object.entries(byType).map(([name, value]) => ({ name, value }));
    const byStatus: Record<string, number> = {};
    data.forEach(r => { const s = r['Status'] || 'Unknown'; byStatus[s] = (byStatus[s] || 0) + 1; });
    const trend = Object.entries(byStatus).map(([date, present]) => ({ date, present, late: 0, absent: 0 }));
    return { trend, pie };
  }

  if (reportId === 'overtime') {
    const byEmp: Record<string, number> = {};
    data.forEach(r => {
      const n = (r['Employee Name'] || 'Unknown').split(' ')[0];
      byEmp[n] = (byEmp[n] || 0) + (parseFloat(r['Overtime Hours']) || 0);
    });
    const trend = Object.entries(byEmp).slice(0, 10).map(([date, present]) => ({ date, present, late: 0, absent: 0 }));
    const pie = trend.map(t => ({ name: t.date, value: t.present }));
    return { trend, pie };
  }

  return { trend: [], pie: [] };
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

// ─── Main Component ───────────────────────────────────────────────────────────
export const ReportsAndAnalytics = () => {
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [reportData, setReportData] = useState<any[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [chartTrend, setChartTrend] = useState<any[]>([]);
  const [chartPie, setChartPie] = useState<any[]>([]);

  // Report result cache — key = "type|from|to|dept|status"
  // Avoids re-fetching the same report when clicking back to it
  const reportCache = useRef<Map<string, { data: any[]; trend: any[]; pie: any[] }>>(new Map());

  // Filters
  const [dateFrom, setDateFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]; });
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [department, setDepartment] = useState('All Departments');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [status, setStatus] = useState('ALL');

  const generateReport = useCallback(async (reportId: string, forceRefresh = false) => {
    setActiveReport(reportId);
    setCurrentPage(1);
    setError('');

    const cacheKey = `${reportId}|${dateFrom}|${dateTo}|${department}|${status}`;

    // Serve from cache instantly if available and not forcing refresh
    if (!forceRefresh && reportCache.current.has(cacheKey)) {
      const cached = reportCache.current.get(cacheKey)!;
      setReportData(cached.data);
      setChartTrend(cached.trend);
      setChartPie(cached.pie);
      return;
    }

    setGenerating(true);
    setReportData([]);
    setChartTrend([]);
    setChartPie([]);
    try {
      const params = new URLSearchParams({
        type: reportId, from: dateFrom, to: dateTo,
        ...(department !== 'All Departments' && { department }),
        ...(status !== 'ALL' && { status }),
      });
      const res = await apiClient.get(`/analytics/report?${params}`);
      const data = res.data.success ? ((res.data.data as any[]) || []) : [];
      const { trend, pie } = buildChartFromReport(reportId, data);
      reportCache.current.set(cacheKey, { data, trend, pie });
      setReportData(data);
      setChartTrend(trend);
      setChartPie(pie);
    } catch {
      setError('Failed to generate report. Please try again.');
    } finally { setGenerating(false); }
  }, [dateFrom, dateTo, department, status]);

  const activeReportDef = REPORT_TYPES.find(r => r.id === activeReport);

  const trendLabel = activeReport === 'overtime' ? 'Overtime Hours by Employee'
    : activeReport === 'leave_summary' ? 'Leave Requests Over Time'
    : activeReport === 'late_arrivals' ? 'Late Arrivals Per Day'
    : 'Attendance Trend';

  const pieLabel = activeReport === 'leave_summary' ? 'Leave by Type'
    : activeReport === 'overtime' ? 'Overtime Distribution'
    : 'Status Distribution';

  // Data slicing for pagination
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedReportData = reportData.slice(startIndex, endIndex);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports &amp; Analytics</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Select a report type, apply filters, then export</p>
      </div>

      {/* ── Filters + Export (same row) ── */}
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
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Department</label>
            <select value={department} onChange={e => setDepartment(e.target.value)} className={inputCls}>
              {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
              <option value="ALL">All Status</option>
              <option value="PRESENT">Present</option>
              <option value="LATE">Late</option>
              <option value="ABSENT">Absent</option>
            </select>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Refresh + Export — right side of filter bar */}
          {activeReport && (
            <button
              onClick={() => generateReport(activeReport, true)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
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

      {/* ── Two-column: report types + charts ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Report Types */}
        <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-white/[0.07]">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Report Types</p>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {REPORT_TYPES.map(rt => {
              const Icon = rt.icon;
              const isAct = activeReport === rt.id;
              return (
                <button key={rt.id} onClick={() => generateReport(rt.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors ${isAct ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${rt.bg}`}>
                    <Icon size={18} className={rt.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${isAct ? 'text-blue-700 dark:text-blue-400' : 'text-gray-900 dark:text-white'}`}>{rt.label}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{rt.desc}</p>
                  </div>
                  <ChevronRight size={14} className={`shrink-0 ${isAct ? 'text-blue-500' : 'text-gray-300 dark:text-gray-600'}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Charts — update based on selected report */}
        <div className="lg:col-span-2 space-y-5">
          {/* Trend chart */}
          <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{trendLabel}</h2>
              {chartTrend.length > 0 && (
                <div className="flex gap-3">
                  {[['Present','#22c55e'],['Late','#f59e0b'],['Absent','#ef4444']].map(([l,c]) => (
                    <span key={l} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{l}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {generating ? (
              <div className="h-52 flex items-center justify-center">
                <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : chartTrend.length > 0 ? (
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartTrend} barCategoryGap="30%" barGap={3}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" strokeOpacity={0.4} vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="present" name="Present" fill="#22c55e" shape={<Bar3D />} radius={[3,3,0,0]} />
                    <Bar dataKey="late"    name="Late"    fill="#f59e0b" shape={<Bar3D />} radius={[3,3,0,0]} />
                    <Bar dataKey="absent"  name="Absent"  fill="#ef4444" shape={<Bar3D />} radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyChart label={activeReport ? 'No data for selected filters' : 'Select a report type to see chart'} />
            )}
          </div>

          {/* Pie chart */}
          <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] p-5">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">{pieLabel}</h2>
            {generating ? (
              <div className="h-44 flex items-center justify-center">
                <div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
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

      {/* ── Report data table ── */}
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
                <p className="text-xs text-gray-400 dark:text-gray-500">{dateFrom} &rarr; {dateTo}{department !== 'All Departments' ? ` \u00B7 ${department}` : ''} &middot; {reportData.length} records</p>
              </div>
            </div>
            <button
              onClick={() => exportCSV(reportData, `${activeReport}_${dateFrom}_${dateTo}.csv`)}
              disabled={!reportData.length}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium disabled:opacity-40 transition-colors"
            >
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
              <AlertCircle size={15} />{error}
            </div>
          ) : reportData.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-white/[0.07]">
                      {Object.keys(reportData[0]).map(k => (
                        <th key={k} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                          {k.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                    {paginatedReportData.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        {Object.values(row).map((val: any, j) => (
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
