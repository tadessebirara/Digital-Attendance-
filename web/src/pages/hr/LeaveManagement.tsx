import { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import { Search, Calendar, Check, X, Clock, FileText, Eye, AlertCircle, ExternalLink, TrendingUp } from 'lucide-react';
import { socketService } from '../../services/socket.service';
import { Pagination } from '../../components/common';

function LeaveReviewPanel({ leave, onClose, onApprove, onReject }: {
  leave: any;
  onClose: () => void;
  onApprove: (id: number) => void;
  onReject: (id: number, reason: string) => void;
}) {
  const [rejectReason, setRejectReason] = useState('');
  const [hrNote, setHrNote] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [attendanceStats, setAttendanceStats] = useState<{rate: number; totalLeaves: number; totalHours: string} | null>(null);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const now = new Date();
        const yearStart = `${now.getFullYear()}-01-01`;
        const today = now.toISOString().split('T')[0];
        const res = await apiClient.get(`/attendance?userId=${leave.userId}&startDate=${yearStart}&endDate=${today}&limit=500`);
        if (res.data?.success) {
          const records: any[] = (res.data.data as any[]) ?? [];
          const present = records.filter((r: any) => r.status === 'PRESENT').length;
          const late = records.filter((r: any) => r.status === 'LATE').length;
          const total = records.length;
          const totalHours = records.reduce((s: number, r: any) => s + (parseFloat(r.hoursWorked || r.totalHours) || 0), 0);
          const leaveCount = records.filter((r: any) => r.status === 'EXCUSED').length;
          setAttendanceStats({
            rate: total > 0 ? Math.round(((present + late) / total) * 100) : 0,
            totalLeaves: leaveCount,
            totalHours: totalHours.toFixed(1),
          });
        }
      } catch { /* silent */ }
    };
    if (leave.userId) fetchStats();
  }, [leave.userId]);

  const handleApprove = async () => {
    setActing(true);
    await onApprove(leave.id);
    setActing(false);
    onClose();
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) { setShowRejectInput(true); return; }
    setActing(true);
    await onReject(leave.id, rejectReason);
    setActing(false);
    onClose();
  };

  const typeColor: Record<string, string> = {
    SICK: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    VACATION: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    PERSONAL: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    EMERGENCY: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
    MATERNITY: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400',
    PATERNITY: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
  };
  const statusColor: Record<string, string> = {
    PENDING: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
    APPROVED: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    REJECTED: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  };

  const fmt = (d: string) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';

  const docFileName = leave.documentUrl
    ? decodeURIComponent(leave.documentUrl.split('/').pop() || 'Document')
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-5xl bg-white dark:bg-[#0F1929] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/[0.07] my-6 font-sans">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-white/[0.07]">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">Leave Request Review</h2>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
          <div className="lg:col-span-2 p-6 space-y-5 border-r border-gray-100 dark:border-white/[0.07]">

            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                {leave.user?.profilePicture
                  ? <img src={leave.user.profilePicture} alt="" className="w-full h-full rounded-xl object-cover" />
                  : <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{(leave.employeeName || 'U')[0].toUpperCase()}</span>
                }
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">{leave.employeeName}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {leave.department || leave.user?.department || 'No department'}
                  {leave.user?.employeeId && <span className="ml-2 font-mono text-xs text-gray-400">ID: {leave.user.employeeId}</span>}
                </p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${typeColor[leave.type] ?? 'bg-gray-100 text-gray-600'}`}>
                    {(leave.type || '').replace(/_/g, ' ')} LEAVE
                  </span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColor[leave.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {leave.status === 'PENDING' ? 'PENDING APPROVAL' : leave.status}
                  </span>
                </div>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">Requested on {fmt(leave.createdAt)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#0F1929]/50 border border-gray-100 dark:border-white/[0.07]">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Duration</p>
                <div className="flex items-center gap-3">
                  <Calendar size={16} className="text-blue-500 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{fmt(leave.startDate)} to {fmt(leave.endDate)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{leave.days} day{leave.days !== 1 ? 's' : ''}</p>
                  </div>
                </div>
              </div>
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#0F1929]/50 border border-gray-100 dark:border-white/[0.07]">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Leave Type</p>
                <div className="flex items-center gap-3">
                  <FileText size={16} className="text-purple-500 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white capitalize">{(leave.type || '').replace(/_/g, ' ').toLowerCase()}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{leave.days} days requested</p>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Reason for Request</p>
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-[#0F1929]/50 border border-gray-100 dark:border-white/[0.07]">
                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed italic">
                  "{leave.reason || 'No reason provided.'}"
                </p>
              </div>
            </div>

            {leave.description && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Additional Details</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{leave.description}</p>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Supporting Document</p>
              {leave.documentUrl ? (
                <a
                  href={leave.documentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10 hover:bg-blue-100 dark:hover:bg-blue-900/20 transition-colors group"
                >
                  <div className="w-10 h-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                    <FileText size={18} className="text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-blue-700 dark:text-blue-400 truncate">{docFileName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Click to open document in new tab</p>
                  </div>
                  <ExternalLink size={16} className="text-blue-400 group-hover:text-blue-600 transition-colors shrink-0" />
                </a>
              ) : (
                <div className="flex items-center gap-3 p-4 rounded-xl border border-dashed border-gray-200 dark:border-white/[0.07] bg-gray-50 dark:bg-[#0F1929]/30">
                  <AlertCircle size={16} className="text-gray-400 shrink-0" />
                  <p className="text-sm text-gray-400">No supporting document uploaded</p>
                </div>
              )}
            </div>

            {leave.status === 'REJECTED' && leave.rejectionReason && (
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
                <p className="text-xs font-semibold text-red-500 uppercase tracking-wider mb-1">Rejection Reason</p>
                <p className="text-sm text-red-700 dark:text-red-400">{leave.rejectionReason}</p>
              </div>
            )}
          </div>

          <div className="p-6 space-y-5">
            <div>
              <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <FileText size={14} className="text-blue-500" /> HR Assessment
              </h4>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Decision Comments</label>
              <textarea
                value={hrNote}
                onChange={e => setHrNote(e.target.value)}
                rows={4}
                placeholder="Add notes for the employee or for internal audit..."
                className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
              />
            </div>

            {leave.status === 'PENDING' && (
              <div className="space-y-3">
                {showRejectInput && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Rejection Reason *</label>
                    <textarea
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      rows={3}
                      placeholder="Provide a reason for rejection..."
                      className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-[#0F1929] border border-red-300 dark:border-red-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500/40 resize-none"
                    />
                  </div>
                )}
                <button onClick={handleReject} disabled={acting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold text-sm transition-colors disabled:opacity-50">
                  <X size={16} /> Reject Request
                </button>
                <button onClick={handleApprove} disabled={acting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-semibold text-sm transition-colors disabled:opacity-50">
                  <Check size={16} /> Approve Leave
                </button>
                <p className="text-xs text-center text-gray-400">
                  Decision will be logged and emailed to {leave.user?.email ?? leave.employeeName}
                </p>
              </div>
            )}

            {leave.status !== 'PENDING' && (
              <div className={`p-3 rounded-xl text-center text-sm font-semibold ${
                leave.status === 'APPROVED'
                  ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800'
              }`}>
                {leave.status === 'APPROVED' ? 'Leave Approved' : 'Leave Rejected'}
              </div>
            )}

            <div>
              <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                <TrendingUp size={14} className="text-green-500" /> Attendance Context
              </h4>
              {attendanceStats ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-white/[0.07]">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Attendance Rate</span>
                    <span className={`text-sm font-bold ${attendanceStats.rate >= 90 ? 'text-green-600' : attendanceStats.rate >= 75 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {attendanceStats.rate}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-white/[0.07]">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Total Leaves (YTD)</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{attendanceStats.totalLeaves} Days</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Total Hours (YTD)</span>
                    <span className="text-sm font-bold text-blue-600">+{attendanceStats.totalHours} hrs</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-8 bg-gray-100 dark:bg-[#0F1929] rounded animate-pulse" />)}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const LeaveManagement = () => {
  const [leaves, setLeaves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLeave, setSelectedLeave] = useState<any>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(20);

  useEffect(() => { fetchLeaves(); }, []);

  useEffect(() => {
    const onLeaveUpdate = () => fetchLeaves();
    socketService.on('leave:update', onLeaveUpdate);
    socketService.on('leave:request', onLeaveUpdate);
    return () => {
      socketService.off('leave:update', onLeaveUpdate);
      socketService.off('leave:request', onLeaveUpdate);
    };
  }, []);

  const fetchLeaves = async () => {
    try {
      const response = await apiClient.get('/leaves?limit=200');
      if (response.data.success) {
        const raw = (response.data.data as any[]) ?? [];
        setLeaves(raw.map((l: any) => ({
          ...l,
          employeeName: l.user?.fullName ?? l.employeeName ?? '-',
          department:   l.user?.department ?? l.department ?? '-',
          type:         l.leaveType ?? l.type ?? '-',
          days:         l.daysRequested ?? l.days ?? 0,
          documentUrl:  l.documentUrl ?? l.document_url ?? null,
          description:  l.description ?? null,
        })));
      }
    } catch (error) {
      console.error('Failed to fetch leaves:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    try { await apiClient.post(`/leaves/${id}/approve`); fetchLeaves(); }
    catch (error) { console.error('Failed to approve leave:', error); }
  };

  const handleReject = async (id: number, reason = '') => {
    try { await apiClient.post(`/leaves/${id}/reject`, { rejectionReason: reason || 'Rejected by HR' }); fetchLeaves(); }
    catch (error) { console.error('Failed to reject leave:', error); }
  };

  const filteredLeaves = leaves.filter(leave => {
    const matchesSearch = leave.employeeName?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || leave.status === statusFilter;
    const matchesType = typeFilter === 'ALL' || leave.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, typeFilter]);

  // Data slicing for pagination
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedLeaves = filteredLeaves.slice(startIndex, endIndex);

  const stats = {
    pending:  leaves.filter(l => l.status === 'PENDING').length,
    approved: leaves.filter(l => l.status === 'APPROVED').length,
    rejected: leaves.filter(l => l.status === 'REJECTED').length,
    total:    leaves.length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Leave Management</h1>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Pending',        value: stats.pending,  color: 'bg-yellow-500', Icon: Clock },
            { label: 'Approved',       value: stats.approved, color: 'bg-green-500',  Icon: Check },
            { label: 'Rejected',       value: stats.rejected, color: 'bg-red-500',    Icon: X },
            { label: 'Total Requests', value: stats.total,    color: 'bg-blue-500',   Icon: FileText },
          ].map(({ label, value, color, Icon }) => (
            <div key={label} className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] p-5 flex items-center gap-4">
              <div className={`${color} p-3 rounded-lg shrink-0`}>
                <Icon className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input type="text" placeholder="Search by employee name..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#0F1929] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#0F1929] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              <option value="ALL">All Status</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
            <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-[#0F1929] text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500">
              <option value="ALL">All Types</option>
              <option value="SICK">Sick Leave</option>
              <option value="VACATION">Vacation</option>
              <option value="PERSONAL">Personal Leave</option>
              <option value="EMERGENCY">Emergency Leave</option>
              <option value="MATERNITY">Maternity Leave</option>
              <option value="PATERNITY">Paternity Leave</option>
            </select>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-[#0F1929]/50">
              <tr>
                {['Employee', 'Type', 'Duration', 'Reason', 'Document', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {paginatedLeaves.length > 0 ? paginatedLeaves.map(leave => (
                <tr key={leave.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="px-5 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                        <span className="text-sm font-bold text-blue-700 dark:text-blue-400">{(leave.employeeName || 'U')[0].toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{leave.employeeName}</p>
                        <p className="text-xs text-gray-400">{leave.department}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">{(leave.type || '').replace(/_/g, ' ').toLowerCase()}</span>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-sm text-gray-600 dark:text-gray-300">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-gray-400" />
                      <span>{new Date(leave.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(leave.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{leave.days} days</p>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300 max-w-[160px] truncate">{leave.reason}</td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    {leave.documentUrl ? (
                      <a href={leave.documentUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 border border-blue-200 dark:border-blue-800 transition-colors">
                        <FileText size={12} /> View Doc
                      </a>
                    ) : (
                      <span className="text-xs text-gray-400">None</span>
                    )}
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <span className={`px-2.5 py-1 inline-flex text-xs font-semibold rounded-full ${
                      leave.status === 'APPROVED' ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' :
                      leave.status === 'REJECTED' ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400' :
                      'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400'
                    }`}>{leave.status}</span>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap text-right">
                    <div className="flex justify-end items-center gap-1.5">
                      <button onClick={() => setSelectedLeave(leave)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 hover:bg-blue-100 border border-blue-200 dark:border-blue-800 transition-colors">
                        <Eye size={12} /> View
                      </button>
                      {leave.status === 'PENDING' && (
                        <>
                          <button onClick={() => handleApprove(leave.id)} title="Approve"
                            className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                            <Check size={15} />
                          </button>
                          <button onClick={() => handleReject(leave.id, 'Rejected by HR')} title="Reject"
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                            <X size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-gray-400">No leave requests found</td></tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <Pagination
          totalItems={filteredLeaves.length}
          rowsPerPage={rowsPerPage}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          onRowsPerPageChange={setRowsPerPage}
        />
      </div>

      {selectedLeave && (
        <LeaveReviewPanel
          leave={selectedLeave}
          onClose={() => setSelectedLeave(null)}
          onApprove={async (id) => { await handleApprove(id); setSelectedLeave(null); }}
          onReject={async (id, reason) => { await handleReject(id, reason); setSelectedLeave(null); }}
        />
      )}
    </>
  );
};
