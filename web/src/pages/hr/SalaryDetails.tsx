/**
 * SalaryDetails.tsx
 * Per-employee salary breakdown for a given month.
 *
 * Shows:
 *  - Employee info header
 *  - Base Salary / Net Salary summary cards
 *  - Deduction breakdown table (per day)
 *  - Totals
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  DollarSign,
  TrendingDown,
  Clock,
  AlertCircle,
  CheckCircle,
  CalendarDays,
} from 'lucide-react';
import apiClient from '../../api/client';
import { Pagination } from '../../components/common';

// ── Types ─────────────────────────────────────────────────────────────────────
interface BreakdownItem {
  date: string;
  status: string;
  lateMinutes: number;
  absenceDeduction: number;
  lateDeduction: number;
}

interface EmployeePayroll {
  userId: number;
  employeeId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  department: string;
  position: string;
  year: number;
  month: number;
  baseSalary: number;
  absentDays: number;
  halfDays: number;
  lateDays: number;
  totalLateMinutes: number;
  absenceDeduction: number;
  lateDeduction: number;
  totalDeductions: number;
  netSalary: number;
  breakdown: BreakdownItem[];
  penaltyConfig: {
    absenceUnit: string;
    absenceType: string;
    absenceValue: number;
    lateUnit: string;
    lateType: string;
    lateValue: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  n.toLocaleString('en-ET', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

const STATUS_COLORS: Record<string, string> = {
  ABSENT:   'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  HALF_DAY: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
  LATE:     'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
};

function SummaryCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; accent: string;
}) {
  return (
    <div className={`rounded-xl border p-5 flex items-center gap-4 ${accent}`}>
      <div className="w-12 h-12 rounded-xl bg-white/60 dark:bg-white/10 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold opacity-70 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-bold leading-tight">{value}</p>
        {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export function SalaryDetails() {
  const { userId } = useParams<{ userId: string }>();
  const [sp] = useSearchParams();
  const navigate = useNavigate();

  const now = new Date();
  const year  = parseInt(sp.get('year')  || String(now.getFullYear()));
  const month = parseInt(sp.get('month') || String(now.getMonth() + 1));

  const [data, setData]     = useState<EmployeePayroll | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(15);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const res: any = await apiClient.get(`/salary/payroll/${userId}?year=${year}&month=${month}`);
        if (res.data?.success) setData(res.data.data);
        else setError(res.data?.error || 'Failed to load');
      } catch (e: any) {
        setError(e?.error || e?.message || 'Failed to load payroll');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [userId, year, month]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-100 dark:bg-[#0F1929] text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
          <ArrowLeft size={15} /> Go Back
        </button>
      </div>
    );
  }

  if (!data) return null;

  const cfg = data.penaltyConfig;
  const penaltyDesc = {
    absence: cfg.absenceValue === 0 ? 'No penalty configured'
      : cfg.absenceType === 'FIXED'
        ? `ETB ${fmt(cfg.absenceValue)} per ${cfg.absenceUnit === 'PER_DAY' ? 'day' : 'record'}`
        : `${cfg.absenceValue}% per ${cfg.absenceUnit === 'PER_DAY' ? 'day' : 'record'}`,
    late: cfg.lateValue === 0 ? 'No penalty configured'
      : cfg.lateType === 'FIXED'
        ? `ETB ${fmt(cfg.lateValue)} per ${cfg.lateUnit === 'PER_MINUTE' ? 'minute' : 'hour'}`
        : `${cfg.lateValue}% per ${cfg.lateUnit === 'PER_MINUTE' ? 'minute' : 'hour'}`,
  };

  // Data slicing for pagination
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedBreakdown = data.breakdown.slice(startIndex, endIndex);

  return (
    <div className="space-y-6 max-w-5xl">
      {/* ── Back button + title ── */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.07] text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <ArrowLeft size={15} /> Back
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Salary Details</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {MONTHS[month - 1]} {year} · All amounts in ETB
          </p>
        </div>
      </div>

      {/* ── Employee header card ── */}
      <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] p-5 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 text-xl font-bold text-blue-600 dark:text-blue-400">
          {data.firstName[0]}{data.lastName[0]}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{data.fullName}</h2>
          <div className="flex items-center gap-3 flex-wrap mt-0.5">
            {data.employeeId && (
              <span className="text-xs font-mono text-gray-400 dark:text-gray-500">{data.employeeId}</span>
            )}
            {data.department && (
              <span className="text-xs text-gray-400 dark:text-gray-500">· {data.department}</span>
            )}
            {data.position && (
              <span className="text-xs text-gray-400 dark:text-gray-500">· {data.position}</span>
            )}
          </div>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-xs text-gray-400 dark:text-gray-500">Period</p>
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-1">
            <CalendarDays size={13} className="text-gray-400" />
            {MONTHS[month - 1]} {year}
          </p>
        </div>
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<DollarSign size={22} className="text-emerald-600" />}
          label="Base Salary"
          value={`ETB ${fmt(data.baseSalary)}`}
          accent="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"
        />
        <SummaryCard
          icon={<TrendingDown size={22} className="text-red-600" />}
          label="Absence Deduction"
          value={`−ETB ${fmt(data.absenceDeduction)}`}
          sub={`${data.absentDays} absent · ${data.halfDays} half-day`}
          accent="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-200"
        />
        <SummaryCard
          icon={<Clock size={22} className="text-amber-600" />}
          label="Late Deduction"
          value={`−ETB ${fmt(data.lateDeduction)}`}
          sub={`${data.totalLateMinutes} total late min`}
          accent="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200"
        />
        <SummaryCard
          icon={<CheckCircle size={22} className="text-purple-600" />}
          label="Net Salary"
          value={`ETB ${fmt(data.netSalary)}`}
          sub={`After ETB ${fmt(data.totalDeductions)} deductions`}
          accent="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-200"
        />
      </div>

      {/* ── Penalty config used ── */}
      <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] p-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">Penalty Rules Applied</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider mb-1">Absence Penalty</p>
            <p className="text-gray-700 dark:text-gray-200">{penaltyDesc.absence}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">HALF_DAY = 50% of absence penalty</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 font-medium uppercase tracking-wider mb-1">Late Penalty</p>
            <p className="text-gray-700 dark:text-gray-200">{penaltyDesc.late}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Counted after grace period only</p>
          </div>
        </div>
      </div>

      {/* ── Deduction breakdown table ── */}
      <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-white/[0.07]">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Deduction Breakdown</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            Only days with penalties are listed. PRESENT, EXCUSED, and approved leave days are excluded.
          </p>
        </div>
        {data.breakdown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12">
            <CheckCircle size={36} className="text-emerald-400" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No deductions this month</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#0F1929]/50">
                  {['Date', 'Status', 'Late Minutes', 'Absence Deduction (ETB)', 'Late Deduction (ETB)', 'Total (ETB)'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                {paginatedBreakdown.map((item, i) => {
                  const rowTotal = item.absenceDeduction + item.lateDeduction;
                  return (
                    <tr key={i} className="hover:bg-gray-50/60 dark:hover:bg-gray-800/30">
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-200 font-mono text-xs">
                        {item.date ? new Date(item.date + 'T00:00:00').toLocaleDateString('en-ET', { weekday: 'short', day: '2-digit', month: 'short' }) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[item.status] || 'bg-gray-100 dark:bg-[#0F1929] text-gray-600 dark:text-gray-400'}`}>
                          {item.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {item.lateMinutes > 0 ? (
                          <span className="flex items-center gap-1">
                            <Clock size={12} className="text-amber-500" />
                            {item.lateMinutes} min
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-red-600 dark:text-red-400 font-medium">
                        {item.absenceDeduction > 0 ? `−${fmt(item.absenceDeduction)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-amber-600 dark:text-amber-400 font-medium">
                        {item.lateDeduction > 0 ? `−${fmt(item.lateDeduction)}` : '—'}
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">
                        {rowTotal > 0 ? `−${fmt(rowTotal)}` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* Totals footer */}
              <tfoot>
                <tr className="bg-gray-50 dark:bg-[#0F1929]/50 border-t-2 border-gray-200 dark:border-gray-600">
                  <td colSpan={3} className="px-4 py-3 font-bold text-gray-700 dark:text-gray-200">Total Deductions</td>
                  <td className="px-4 py-3 font-bold text-red-600 dark:text-red-400">−{fmt(data.absenceDeduction)}</td>
                  <td className="px-4 py-3 font-bold text-amber-600 dark:text-amber-400">−{fmt(data.lateDeduction)}</td>
                  <td className="px-4 py-3 font-bold text-purple-700 dark:text-purple-400">−{fmt(data.totalDeductions)}</td>
                </tr>
                <tr className="bg-purple-50 dark:bg-purple-900/20">
                  <td colSpan={5} className="px-4 py-3 font-bold text-purple-700 dark:text-purple-300 text-right">
                    Net Salary (Base − Deductions):
                  </td>
                  <td className="px-4 py-3 font-bold text-purple-700 dark:text-purple-300 text-lg">
                    ETB {fmt(data.netSalary)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        
        {/* Pagination */}
        {data.breakdown.length > 0 && (
          <Pagination
            totalItems={data.breakdown.length}
            rowsPerPage={rowsPerPage}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onRowsPerPageChange={setRowsPerPage}
          />
        )}
      </div>

      {/* ── Monthly stats summary ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Absent Days',      value: data.absentDays,        color: 'text-red-600 dark:text-red-400' },
          { label: 'Half Days',        value: data.halfDays,           color: 'text-orange-600 dark:text-orange-400' },
          { label: 'Late Days',        value: data.lateDays,           color: 'text-amber-600 dark:text-amber-400' },
          { label: 'Total Late Min',   value: data.totalLateMinutes,   color: 'text-blue-600 dark:text-blue-400' },
        ].map(s => (
          <div key={s.label} className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] p-4 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
