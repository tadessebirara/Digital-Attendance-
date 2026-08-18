
import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import {
  Plus, Edit, Trash2, Megaphone, Calendar, Send, Eye,
  Clock, X, Download, Filter, CheckCircle, Users,
} from 'lucide-react';
import { socketService } from '../../services/socket.service';
import { ConfirmModal, useConfirm } from '../../components/common';

const cls = `w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40`;

// ─── types ────────────────────────────────────────────────────────────────────
interface Announcement {
  id: number; title: string; content: string;
  type: string; priority: string; status: string;
  scheduledAt?: string; publishedAt?: string;
  editedAt?: string; editedBy?: { firstName: string; lastName: string };
  createdBy: { id: number; firstName: string; lastName: string; fullName: string };
  viewCount: number; createdAt: string;
  viewers?: { id: number; fullName: string; role: string; viewedAt: string }[];
}

const emptyForm = {
  title: '', content: '', type: 'GENERAL', priority: 'LOW',
  targetRoles: ['ALL'], scheduledAt: '', isScheduled: false,
};

const PRIORITY_CLS: Record<string, string> = {
  LOW:      'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  MEDIUM:   'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  HIGH:     'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
  CRITICAL: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
};

const TYPE_ICON: Record<string, string> = {
  GENERAL: '📢', URGENT: '🚨', POLICY: '📋', EVENT: '🎉', SYSTEM: '⚙️',
};

// ─── Field wrapper ────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

// ─── Detail / View modal ──────────────────────────────────────────────────────
function DetailModal({ ann, onClose, onEdit }: { ann: Announcement; onClose: () => void; onEdit: () => void }) {
  const [detail, setDetail] = useState<Announcement>(ann);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient.get(`/announcements/${ann.id}`)
      .then((r) => {
        const body = r.data as { success?: boolean; data?: Announcement };
        if (body.success && body.data) setDetail(body.data);
      })
      .finally(() => setLoading(false));
  }, [ann.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-xl bg-white dark:bg-[#0F1929] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/[0.07] max-h-[90vh] flex flex-col">
        {/* header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.07] shrink-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Eye size={16} className="text-blue-500" /> Announcement Detail
          </h2>
          <div className="flex items-center gap-2">
            <button onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors">
              <Edit size={12} /> Edit
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          {/* title + badges */}
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-lg">{TYPE_ICON[detail.type] ?? '📢'}</span>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">{detail.title}</h3>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${PRIORITY_CLS[detail.priority]}`}>{detail.priority}</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{detail.type}</span>
              {detail.status === 'SCHEDULED' && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                  <Clock size={10} /> Scheduled
                </span>
              )}
              {detail.status === 'PUBLISHED' && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                  <CheckCircle size={10} /> Published
                </span>
              )}
            </div>
          </div>

          {/* content */}
          <div className="bg-gray-50 dark:bg-[#0F1929]/50 rounded-xl p-4 text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
            {detail.content}
          </div>

          {/* meta */}
          <div className="grid grid-cols-2 gap-3 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-1.5"><Calendar size={12} />Created: {new Date(detail.createdAt).toLocaleString()}</div>
            <div className="flex items-center gap-1.5"><Users size={12} />By: {detail.createdBy?.fullName}</div>
            {detail.scheduledAt && <div className="flex items-center gap-1.5"><Clock size={12} />Scheduled: {new Date(detail.scheduledAt).toLocaleString()}</div>}
            {detail.publishedAt && <div className="flex items-center gap-1.5"><CheckCircle size={12} />Published: {new Date(detail.publishedAt).toLocaleString()}</div>}
            {detail.editedAt && (
              <div className="col-span-2 flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                <Edit size={12} />
                Edited {new Date(detail.editedAt).toLocaleString()}
                {detail.editedBy && ` by ${detail.editedBy.firstName} ${detail.editedBy.lastName}`}
              </div>
            )}
          </div>

          {/* viewers */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Eye size={14} className="text-gray-400" />
              <span className="text-sm font-semibold text-gray-900 dark:text-white">
                Seen by {loading ? '…' : (detail.viewers?.length ?? detail.viewCount)} people
              </span>
            </div>
            {loading ? (
              <div className="flex justify-center py-4"><div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
            ) : detail.viewers && detail.viewers.length > 0 ? (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {detail.viewers.map(v => (
                  <div key={v.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#0F1929]/50 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-[10px] font-bold text-blue-600 dark:text-blue-400">
                        {v.fullName[0]}
                      </div>
                      <span className="font-medium text-gray-800 dark:text-gray-200">{v.fullName}</span>
                      <span className="text-gray-400 dark:text-gray-500">{v.role}</span>
                    </div>
                    <span className="text-gray-400 dark:text-gray-500">{new Date(v.viewedAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">No views yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export const Announcements = () => {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [detailAnn, setDetailAnn] = useState<Announcement | null>(null);
  const [editingAnn, setEditingAnn] = useState<Announcement | null>(null);
  const [formData, setFormData] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };
  const { confirmProps, confirm } = useConfirm();

  // filters
  const [filterType, setFilterType] = useState('ALL');
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');

  const fetchAnnouncements = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (filterType !== 'ALL') params.type = filterType;
      if (filterPriority !== 'ALL') params.priority = filterPriority;
      if (filterStatus !== 'ALL') params.status = filterStatus;
      const res = await apiClient.get(`/announcements`, { params });
      if (res.data.success) setAnnouncements((res.data.data as Announcement[]) ?? []);
      else console.error('fetchAnnouncements failed:', res.data.error);
    } catch (err: any) {
      console.error('fetchAnnouncements error:', err?.response?.data?.error || err?.message);
    } finally { setLoading(false); }
  }, [filterType, filterPriority, filterStatus]);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  // Real-time: update list instantly when a new/updated announcement arrives via socket
  useEffect(() => {
    const onNew = (data: any) => {
      if (!data) { fetchAnnouncements(); return; }
      try {
        const ann: Announcement = data?.data ?? data;
        if (!ann?.id) { fetchAnnouncements(); return; }
        setAnnouncements(prev => {
          // Remove stale copy if present, then prepend
          const filtered = prev.filter(a => a.id !== ann.id);
          return [ann, ...filtered];
        });
      } catch { fetchAnnouncements(); }
    };

    const onUpdate = (data: any) => {
      if (!data) { fetchAnnouncements(); return; }
      try {
        const ann: Announcement = data?.data ?? data;
        if (!ann?.id) { fetchAnnouncements(); return; }
        setAnnouncements(prev => {
          const idx = prev.findIndex(a => a.id === ann.id);
          if (idx < 0) return [ann, ...prev]; // newly published from scheduled
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...ann };
          return updated;
        });
      } catch { fetchAnnouncements(); }
    };

    socketService.on('announcement:new', onNew);
    socketService.on('announcement:update', onUpdate);
    return () => {
      socketService.off('announcement:new', onNew);
      socketService.off('announcement:update', onUpdate);
    };
  }, [fetchAnnouncements]);

  const openNew = () => { setEditingAnn(null); setFormData({ ...emptyForm }); setShowModal(true); };

  const openEdit = (a: Announcement) => {
    setEditingAnn(a);
    setFormData({
      title: a.title, content: a.content,
      type: a.type || 'GENERAL', priority: a.priority || 'LOW',
      targetRoles: (a as any).targetRoles || ['ALL'],
      scheduledAt: a.scheduledAt ? new Date(a.scheduledAt).toISOString().slice(0, 16) : '',
      isScheduled: !!a.scheduledAt && a.status === 'SCHEDULED',
    });
    setDetailAnn(null);
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    const ok = await confirm({ title: 'Delete Announcement', message: 'This announcement will be permanently removed and employees will no longer see it.', confirmLabel: 'Delete', variant: 'danger' });
    if (!ok) return;
    try { await apiClient.delete(`/announcements/${id}`); fetchAnnouncements(); showToast('Announcement deleted'); }
    catch { showToast('Failed to delete', false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    const payload = {
      title: formData.title, content: formData.content,
      type: formData.type, priority: formData.priority,
      targetRoles: formData.targetRoles,
      scheduledAt: formData.isScheduled && formData.scheduledAt
        ? new Date(formData.scheduledAt).toISOString() : null,
    };
    try {
      if (editingAnn) await apiClient.put(`/announcements/${editingAnn.id}`, payload);
      else await apiClient.post(`/announcements`, payload);
      // Reset form and close modal, then refresh list
      setFormData({ ...emptyForm });
      setEditingAnn(null);
      setShowModal(false);
      fetchAnnouncements();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Failed to save announcement', false);
    }
    finally { setSaving(false); }
  };

  const handleExport = async () => {
    try {
      // Use apiClient with responseType blob — keeps auth headers and interceptors intact.
      // Raw fetch() was previously used here but bypassed the auth layer.
      const res = await (apiClient as any).get('/announcements/export/csv', { responseType: 'blob' });
      const blob = res instanceof Blob ? res : new Blob([res]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `announcements-${Date.now()}.csv`; a.click();
      URL.revokeObjectURL(url);
    } catch { showToast('Export failed', false); }
  };

  const selectCls = `px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40`;

  return (
    <div className="space-y-5">
      <ConfirmModal {...confirmProps} />
      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium ${toast.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300'}`}>
          {toast.ok ? <CheckCircle size={15} /> : <X size={15} />}{toast.msg}
        </div>
      )}
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Announcements</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Post and schedule announcements for your team</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium transition-colors">
            <Download size={14} /> Export
          </button>
          <button onClick={openNew}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
            <Plus size={15} /> New Announcement
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] p-3 flex flex-wrap items-center gap-3">
        <Filter size={14} className="text-gray-400 shrink-0" />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className={selectCls}>
          <option value="ALL">All Status</option>
          <option value="PUBLISHED">Published</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="DRAFT">Draft</option>
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} className={selectCls}>
          <option value="ALL">All Types</option>
          <option value="GENERAL">General</option>
          <option value="URGENT">Urgent</option>
          <option value="POLICY">Policy</option>
          <option value="EVENT">Event</option>
          <option value="SYSTEM">System</option>
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} className={selectCls}>
          <option value="ALL">All Priorities</option>
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
          <option value="CRITICAL">Critical</option>
        </select>
        {(filterStatus !== 'ALL' || filterType !== 'ALL' || filterPriority !== 'ALL') && (
          <button onClick={() => { setFilterStatus('ALL'); setFilterType('ALL'); setFilterPriority('ALL'); }}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Clear filters</button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : announcements.length > 0 ? (
        <div className="space-y-3">
          {announcements.map(a => (
            <div key={a.id}
              className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] p-5 hover:border-blue-200 dark:hover:border-blue-700 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0 mt-0.5 text-base">
                    {TYPE_ICON[a.type] ?? '📢'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{a.title}</h3>
                      {a.priority && a.priority !== 'LOW' && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${PRIORITY_CLS[a.priority]}`}>{a.priority}</span>
                      )}
                      {/* Status badge */}
                      {a.status === 'SCHEDULED' && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">
                          <Clock size={10} /> Scheduled
                        </span>
                      )}
                      {a.status === 'PUBLISHED' && (
                        <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                          <CheckCircle size={10} /> Published
                        </span>
                      )}
                      {a.editedAt && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                          Edited
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">{a.content}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400 dark:text-gray-500 flex-wrap">
                      <span className="flex items-center gap-1"><Calendar size={11} />{new Date(a.createdAt).toLocaleDateString()}</span>
                      {a.status === 'SCHEDULED' && a.scheduledAt && (
                        <span className="flex items-center gap-1 text-purple-500 dark:text-purple-400">
                          <Clock size={11} />Posts: {new Date(a.scheduledAt).toLocaleString()}
                        </span>
                      )}
                      <span className="flex items-center gap-1"><Eye size={11} />{a.viewCount} views</span>
                      {a.createdBy && <span>By: {a.createdBy.fullName}</span>}
                    </div>
                  </div>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setDetailAnn(a)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-200 dark:border-white/[0.07] transition-colors">
                    <Eye size={12} /> View
                  </button>
                  <button onClick={() => openEdit(a)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 border border-gray-200 dark:border-white/[0.07] transition-colors">
                    <Edit size={12} /> Edit
                  </button>
                  <button onClick={() => handleDelete(a.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] py-16 text-center">
          <Megaphone size={32} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">No announcements yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Create your first one using the button above</p>
          <button onClick={openNew}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
            <Plus size={14} /> New Announcement
          </button>
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-[#0F1929] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/[0.07] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.07]">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">
                {editingAnn ? 'Edit Announcement' : 'New Announcement'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              <Field label="Title">
                <input type="text" required value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Announcement title" className={cls} />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Category">
                  <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} className={cls}>
                    <option value="GENERAL">📢 General</option>
                    <option value="URGENT">🚨 Urgent</option>
                    <option value="POLICY">📋 Policy</option>
                    <option value="EVENT">🎉 Event</option>
                    <option value="SYSTEM">⚙️ System</option>
                  </select>
                </Field>
                <Field label="Priority">
                  <select value={formData.priority} onChange={e => setFormData({ ...formData, priority: e.target.value })} className={cls}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="CRITICAL">Critical</option>
                  </select>
                </Field>
              </div>

              <Field label="Content">
                <textarea rows={5} required value={formData.content}
                  onChange={e => setFormData({ ...formData, content: e.target.value })}
                  placeholder="Write your announcement..." className={`${cls} resize-none`} />
              </Field>

              <Field label="Target Audience">
                <select value={formData.targetRoles[0]}
                  onChange={e => setFormData({ ...formData, targetRoles: [e.target.value] })} className={cls}>
                  <option value="ALL">All Employees</option>
                  <option value="HR">HR Only</option>
                  <option value="EMPLOYEE">Employees Only</option>
                  <option value="ADMIN">Admin Only</option>
                </select>
              </Field>

              {/* Schedule toggle */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 dark:border-white/[0.07] bg-gray-50 dark:bg-[#0F1929]/50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 flex items-center justify-center">
                    <Clock size={15} className="text-gray-500 dark:text-gray-400" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">Schedule for Later</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {formData.isScheduled ? 'Will post at scheduled time' : 'Off — will post immediately'}
                    </p>
                  </div>
                </div>
                <button type="button"
                  onClick={() => setFormData({ ...formData, isScheduled: !formData.isScheduled })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${formData.isScheduled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${formData.isScheduled ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
              </div>

              {formData.isScheduled && (
                <Field label="Schedule Date & Time">
                  <input type="datetime-local" value={formData.scheduledAt}
                    min={new Date().toISOString().slice(0, 16)}
                    onChange={e => setFormData({ ...formData, scheduledAt: e.target.value })}
                    className={cls} required />
                </Field>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)}
                  className="px-5 py-2 text-sm rounded-xl border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 text-sm rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 transition-colors">
                  <Send size={14} />
                  {saving ? 'Saving…'
                    : formData.isScheduled ? 'Schedule'
                    : editingAnn ? 'Update & Publish'
                    : 'Post Now'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Detail Modal ── */}
      {detailAnn && (
        <DetailModal
          ann={detailAnn}
          onClose={() => setDetailAnn(null)}
          onEdit={() => openEdit(detailAnn)}
        />
      )}
    </div>
  );
};
