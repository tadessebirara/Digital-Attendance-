
import { useEffect, useState, useCallback } from 'react';
import { DashboardSkeleton } from '../../components/common/Skeleton';
import apiClient from '../../api/client';
import {
  Users, UserCheck, Calendar, Smartphone,
  AlertCircle, Clock, TrendingUp, RefreshCw,
  CheckCircle, XCircle, Star, Moon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useOnRefresh } from '../../context/DataRefreshContext';
import { Pagination } from '../../components/common';

const card = 'bg-white dark:bg-[#1a1d2e] rounded-xl border border-gray-200 dark:border-gray-700';

export const HRDashboard = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(15);

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const res = await apiClient.get(`/dashboard/hr`);
      const body = res.data;
      if (body.success) setData(body.data);
      else setError(body.error || 'Failed to load dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not connect to server');
      console.error('HR Dashboard error:', err?.response?.data || err?.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Re-fetch when users/leaves/devices change elsewhere in the app
  useOnRefresh('users', useCallback(() => fetchData(true), [fetchData]));
  useOnRefresh('leaves', useCallback(() => fetchData(true), [fetchData]));
  useOnRefresh('devices', useCallback(() => fetchData(true), [fetchData]));

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const t = setInterval(() => fetchData(true), 60_000);
    return () => clearInterval(t);
  }, [fetchData]);

  const counts = data?.counts ?? {};

  const statCards = [
    {
      title: 'Total Employees',
      value: counts.totalEmployees ?? 0,
      icon: Users,
      color: 'bg-blue-500',
      textColor: 'text-blue-600 dark:text-blue-400',
      to: '/hr/employee-directory',
    },
    {
      title: 'Present Today',
      value: counts.presentToday ?? 0,
      icon: UserCheck,
      color: 'bg-green-500',
      textColor: 'text-green-600 dark:text-green-400',
      to: '/hr/attendance-monitoring',
    },
    {
      title: 'Pending Leaves',
      value: counts.pendingLeaves ?? 0,
      icon: Calendar,
      color: 'bg-amber-500',
      textColor: 'text-amber-600 dark:text-amber-400',
      to: '/hr/leave-management',
    },
    {
      title: 'Pending Devices',
      value: counts.pendingDevices ?? 0,
      icon: Smartphone,
      color: 'bg-purple-500',
      textColor: 'text-purple-600 dark:text-purple-400',
      to: '/hr/dashboard',
    },
  ];

  if (loading) {
    return <DashboardSkeleton />;
  }

  const todayMeta = data?.todayMeta;
  const isNonWorkingDay = todayMeta?.isHoliday || todayMeta?.isWeekend;

  // Data slicing for pagination
  const todayAttendance = data?.todayAttendance ?? [];
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedAttendance = todayAttendance.slice(startIndex, endIndex);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">HR Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage your team and track attendance</p>
        </div>
        <button onClick={() => fetchData(true)} disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-400">
          <AlertCircle size={15} className="shrink-0" />
          {error}
        </div>
      )}

      {/* ── Holiday / Weekend banner ── */}
      {todayMeta?.isHoliday && todayMeta.holiday && (
        <div className="flex items-start gap-3 px-4 py-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30">
          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center shrink-0 text-xl">
            {todayMeta.holiday.religion === 'CHRISTIAN' ? '✝️' : todayMeta.holiday.religion === 'MUSLIM' ? '☪️' : '🇪🇹'}
          </div>
          <div>
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
              Today is a Public Holiday — {todayMeta.holiday.name}
              {todayMeta.holiday.nameAm && <span className="ml-2 font-normal opacity-70">{todayMeta.holiday.nameAm}</span>}
            </p>
            {todayMeta.holiday.description && (
              <p className="text-xs text-amber-700/70 dark:text-amber-400/70 mt-0.5">{todayMeta.holiday.description}</p>
            )}
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 font-medium">
              Attendance is not expected today. No employees are marked absent.
            </p>
          </div>
          <Link to="/hr/holiday-calendar"
            className="ml-auto shrink-0 px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-500/30 transition-colors">
            View Calendar
          </Link>
        </div>
      )}

      {!todayMeta?.isHoliday && todayMeta?.isWeekend && (
        <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl bg-gray-50 dark:bg-white/[0.03] border border-gray-200 dark:border-white/[0.07]">
          <Moon size={16} className="text-gray-400 shrink-0"/>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            <span className="font-semibold text-gray-700 dark:text-gray-200">Today is Sunday</span> — a non-working day.
            Only employees with a custom Sunday schedule will appear below.
          </p>
        </div>
      )}

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(c => (
          <Link key={c.title} to={c.to} className="block group">
            <div className={`${card} p-4 flex items-center gap-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors`}>
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${c.color}`}>
                <c.icon size={20} className="text-white" />
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-medium leading-tight">{c.title}</p>
                <p className={`text-3xl font-bold mt-0.5 ${c.textColor} group-hover:scale-105 transition-transform`}>
                  {c.value}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* ── Attendance rate bar ── */}
      {counts.totalEmployees > 0 && !isNonWorkingDay && (
        <div className={`${card} p-4`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp size={15} className="text-blue-500" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">Today's Attendance Rate</span>
            </div>
            <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
              {Math.round((counts.presentToday / counts.totalEmployees) * 100)}%
            </span>
          </div>
          <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-green-500 rounded-full transition-all duration-700"
              style={{ width: `${Math.min(100, Math.round((counts.presentToday / counts.totalEmployees) * 100))}%` }}
            />
          </div>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1"><CheckCircle size={11} className="text-green-500" />{counts.presentToday} present</span>
            <span className="flex items-center gap-1"><XCircle size={11} className="text-red-400" />{counts.totalEmployees - counts.presentToday} absent</span>
          </div>
        </div>
      )}

      {/* ── Today's Attendance table ── */}
      <div className={card}>
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Today's Attendance</h2>
            {isNonWorkingDay && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400">
                {todayMeta?.isHoliday ? 'Holiday' : 'Weekend'}
              </span>
            )}
          </div>
          {data?.todayAttendance?.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">{data.todayAttendance.length} record{data.todayAttendance.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <div className="overflow-x-auto">
          {data?.todayAttendance?.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-50 dark:border-gray-700/50">
                  {['Employee', 'Dept', 'Check In', 'Check Out', 'Status'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-700/30">
                {paginatedAttendance.map((r: any) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">
                            {r.employeeName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white text-xs">{r.employeeName}</p>
                          {r.employeeId && <p className="text-[10px] text-gray-400 font-mono">{r.employeeId}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{r.department || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300 font-mono">
                      {r.status === 'ABSENT'
                        ? <span className="text-gray-400 dark:text-gray-600 tracking-widest">--:--</span>
                        : r.checkInTime
                          ? new Date(r.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : <span className="text-gray-400 dark:text-gray-600 tracking-widest">--:--</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300 font-mono">
                      {r.status === 'ABSENT' || (!r.checkInTime && !r.checkOutTime)
                        ? <span className="text-gray-400 dark:text-gray-600 tracking-widest">--:--</span>
                        : r.checkInTime && !r.checkOutTime
                          ? <span className="text-gray-400 dark:text-gray-600 tracking-widest">--:--</span>
                          : r.checkOutTime
                            ? new Date(r.checkOutTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : <span className="text-gray-400 dark:text-gray-600 tracking-widest">--:--</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        r.status === 'PRESENT'  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                        r.status === 'LATE'     ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                        r.status === 'HALF_DAY' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' :
                        r.status === 'EXCUSED'  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                        'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                      }`}>{r.status ?? 'ABSENT'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="py-12 text-center">
              {isNonWorkingDay ? (
                <>
                  <Star size={28} className="text-amber-300 dark:text-amber-600 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                    {todayMeta?.isHoliday ? `${todayMeta.holiday?.name} — Public Holiday` : 'Sunday — No Work Today'}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    No attendance expected. Employees will not be marked absent.
                  </p>
                </>
              ) : (
                <>
                  <Clock size={28} className="text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-400 dark:text-gray-500">No attendance records for today</p>
                </>
              )}
            </div>
          )}
        </div>
        
        {/* Pagination */}
        {todayAttendance.length > 0 && (
          <Pagination
            totalItems={todayAttendance.length}
            rowsPerPage={rowsPerPage}
            currentPage={currentPage}
            onPageChange={setCurrentPage}
            onRowsPerPageChange={setRowsPerPage}
          />
        )}
      </div>

      {/* ── Pending Approvals ── */}
      {data?.pendingApprovals?.length > 0 && (
        <div className={card}>
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
            <AlertCircle size={15} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Pending Approvals</h2>
            <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
              {data.pendingApprovals.length}
            </span>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-700/30">
            {data.pendingApprovals.map((a: any, i: number) => (
              <div key={i} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    a.type === 'LEAVE'    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' :
                    a.type === 'EMPLOYEE' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' :
                    'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400'
                  }`}>{a.type}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{a.name}</p>
                    {a.requestType && <p className="text-xs text-gray-400 dark:text-gray-500">{a.requestType}</p>}
                  </div>
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                  {new Date(a.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
