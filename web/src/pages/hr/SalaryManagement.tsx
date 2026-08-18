/**
 * SalaryManagement.tsx
 * HR / Admin — Monthly Payroll Overview
 *
 * Features:
 *  - Month/Year picker
 *  - Table: Employee | Base Salary | Absent Days | Half Days | Late Min |
 *           Absence Deduction | Late Deduction | Net Salary
 *  - Click row → SalaryDetails page
 *  - Export to Excel (.xlsx) or CSV
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  DollarSign,
  Users,
  TrendingDown,
  Clock,
  FileSpreadsheet,
} from 'lucide-react';
import apiClient from '../../api/client';
import { Pagination } from '../../components/common';

// ── Types ─────────────────────────────────────────────────────────────────────
interface PayrollRow {
  userId: number;
  employeeId: string;
  fullName: string;
  department: string;
  baseSalary: number;
  absentDays: number;
  halfDays: number;
  lateDays: number;
  totalLateMinutes: number;
  absenceDeduction: number;
  lateDeduction: number;
  totalDeductions: number;
  netSalary: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] p-4 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</p>
        <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight truncate">{value}</p>
        {sub && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function SalaryManagement() {
  const navigate = useNavigate();
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows,  setRows]  = useState<PayrollRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res: any = await apiClient.get(`/salary/payroll?year=${year}&month=${month}`);
      if (res.data?.success) setRows(res.data.data ?? []);
      else setError(res.data?.error || 'Failed to load payroll');
    } catch (e: any) {
      setError(e?.error || e?.message || 'Failed to load payroll');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleExport = async (format: 'xlsx' | 'csv') => {
    setExporting(true);
    try {
      const res = await apiClient.get(`/salary/export?year=${year}&month=${month}&format=${format}`, {
        responseType: 'blob',
      });
      const ext  = format === 'xlsx' ? 'xlsx' : 'csv';
      const mime = format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'text/csv';
      const blob = new Blob([(res as any).data], { type: mime });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `salary_${year}_${String(month).padStart(2,'0')}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.error || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  // Filtered rows
  const filtered = rows.filter(r =>
    !search ||
    r.fullName.toLowerCase().includes(search.toLowerCase()) ||
    (r.department || '').toLowerCase().includes(search.toLowerCase()) ||
    (r.employeeId || '').toLowerCase().includes(search.toLowerCase())
  );

  // Reset to page 1 when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  // Data slicing for pagination
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedRows = filtered.slice(startIndex, endIndex);

  // Totals
  const totals = filtered.reduce((a, r) => ({
    base:      a.base      + r.baseSalary,
    absDeduct: a.absDeduct + r.absenceDeduction,
    latDeduct: a.latDeduct + r.lateDeduction,
    net:       a.net       + r.netSalary,
  }), { base: 0, absDeduct: 0, latDeduct: 0, net: 0 });

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Salary Management</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Monthly payroll — {MONTHS[month - 1]} {year} · All amounts in ETB
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Month/Year picker */}
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <input
            type="number"
            value={year}
            min={2020}
            max={2099}
            onChange={e => setYear(Number(e.target.value))}
            className="w-24 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <button
            onClick={() => fetch()}
            disabled={loading}
            className="p-2 rounded-lg border border-gray-200 dark:border-white/[0.07] text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="flex items-center gap-1 bg-white dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] rounded-lg overflow-hidden">
            <button
              onClick={() => handleExport('xlsx')}
              disabled={exporting || rows.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors disabled:opacity-50"
            >
              <FileSpreadsheet size={15} />
              Excel
            </button>
            <div className="w-px h-6 bg-gray-200 dark:bg-gray-700" />
            <button
              onClick={() => handleExport('csv')}
              disabled={exporting || rows.length === 0}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50"
            >
              <Download size={15} />
              CSV
            </button>
          </div>
        </div>
      </div>

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Users size={20} className="text-blue-600 dark:text-blue-400" />}
          label="Total Employees"
          value={String(filtered.length)}
          color="bg-blue-50 dark:bg-blue-900/20"
        />
        <StatCard
          icon={<DollarSign size={20} className="text-emerald-600 dark:text-emerald-400" />}
          label="Total Base Salary"
          value={`ETB ${fmt(totals.base)}`}
          color="bg-emerald-50 dark:bg-emerald-900/20"
        />
        <StatCard
          icon={<TrendingDown size={20} className="text-red-600 dark:text-red-400" />}
          label="Total Deductions"
          value={`ETB ${fmt(totals.absDeduct + totals.latDeduct)}`}
          sub={`Absence: ${fmt(totals.absDeduct)} · Late: ${fmt(totals.latDeduct)}`}
          color="bg-red-50 dark:bg-red-900/20"
        />
        <StatCard
          icon={<DollarSign size={20} className="text-purple-600 dark:text-purple-400" />}
          label="Total Net Salary"
          value={`ETB ${fmt(totals.net)}`}
          color="bg-purple-50 dark:bg-purple-900/20"
        />
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* ── Search ── */}
      <div className="relative max-w-xs">
        <input
          type="text"
          placeholder="Search employee..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-700 dark:text-gray-200 outline-none focus:ring-2 focus:ring-blue-500/30"
        />
        <Users size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      </div>

      {/* ── Table ── */}
      <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] overflow-hidden">
        {loading ? (
          <div className="flex justify-center items-center py-16">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="border-b border-gray-100 dark:border-white/[0.07] bg-gray-50 dark:bg-[#0F1929]/50">
                  {[
                    'Employee', 'Base Salary (ETB)',
                    'Absent', 'Half Days', 'Late Min',
                    'Abs. Deduction', 'Late Deduction', 'Net Salary (ETB)', '',
                  ].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {paginatedRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
                      {search ? 'No employees match your search.' : 'No payroll data for this period.'}
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map(row => (
                    <tr
                      key={row.userId}
                      onClick={() => navigate(`/hr/salary/${row.userId}?year=${year}&month=${month}`)}
                      className="hover:bg-blue-50/40 dark:hover:bg-blue-900/10 cursor-pointer transition-colors group"
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{row.fullName}</p>
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 font-mono">{row.employeeId || '—'}</p>
                          {row.department && (
                            <p className="text-[11px] text-gray-400 dark:text-gray-500">{row.department}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{fmt(row.baseSalary)}</td>
                      <td className="px-4 py-3">
                        {row.absentDays > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                            {row.absentDays}
                          </span>
                        ) : <span className="text-gray-400 dark:text-gray-500">0</span>}
                      </td>
                      <td className="px-4 py-3">
                        {row.halfDays > 0 ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400">
                            {row.halfDays}
                          </span>
                        ) : <span className="text-gray-400 dark:text-gray-500">0</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <Clock size={12} className="text-amber-500" />
                          {row.totalLateMinutes}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-red-600 dark:text-red-400 font-medium">
                        {row.absenceDeduction > 0 ? `−${fmt(row.absenceDeduction)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-amber-600 dark:text-amber-400 font-medium">
                        {row.lateDeduction > 0 ? `−${fmt(row.lateDeduction)}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-bold ${row.totalDeductions > 0 ? 'text-purple-700 dark:text-purple-400' : 'text-emerald-700 dark:text-emerald-400'}`}>
                          {fmt(row.netSalary)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-100 dark:border-blue-800 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40 transition-colors">
                          Detail <ChevronRight size={12} />
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>

              {/* Totals footer */}
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 dark:bg-[#0F1929]/50 border-t-2 border-gray-200 dark:border-gray-600">
                    <td className="px-4 py-3 font-bold text-gray-700 dark:text-gray-200">
                      Total ({filtered.length} employees)
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">{fmt(totals.base)}</td>
                    <td className="px-4 py-3 font-bold text-red-600 dark:text-red-400">
                      {filtered.reduce((s, r) => s + r.absentDays, 0)}
                    </td>
                    <td className="px-4 py-3 font-bold text-orange-600 dark:text-orange-400">
                      {filtered.reduce((s, r) => s + r.halfDays, 0)}
                    </td>
                    <td className="px-4 py-3 font-bold text-amber-600 dark:text-amber-400">
                      {filtered.reduce((s, r) => s + r.totalLateMinutes, 0)}
                    </td>
                    <td className="px-4 py-3 font-bold text-red-600 dark:text-red-400">−{fmt(totals.absDeduct)}</td>
                    <td className="px-4 py-3 font-bold text-amber-600 dark:text-amber-400">−{fmt(totals.latDeduct)}</td>
                    <td className="px-4 py-3 font-bold text-purple-700 dark:text-purple-400">{fmt(totals.net)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        
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
    </div>
  );
}
