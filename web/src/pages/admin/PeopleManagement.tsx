import { useState, useEffect } from 'react';
import apiClient from '../../api/client';
import { Search, Plus, Edit, Trash2, X, AlertCircle, Clock, Sliders, RefreshCw, Settings } from 'lucide-react';
import { useDataRefresh } from '../../context/DataRefreshContext';
import { Pagination, ConfirmModal, useConfirm } from '../../components/common';

// ─── Work Schedule ────────────────────────────────────────────────────────────

type ShiftType = 'Regular' | 'Flexible' | 'ShiftWork' | 'Custom';

const SHIFT_CARDS = [
  { id: 'Regular' as ShiftType, title: 'Regular', description: 'Fixed schedule, Mon-Fri', icon: <Clock size={18} />, color: 'text-blue-600 dark:text-blue-400', selectedBorder: 'border-blue-500', selectedBg: 'bg-blue-50 dark:bg-blue-900/20' },
  { id: 'Flexible' as ShiftType, title: 'Flexible', description: 'Custom hours, choose your own start/end', icon: <Sliders size={18} />, color: 'text-purple-600 dark:text-purple-400', selectedBorder: 'border-purple-500', selectedBg: 'bg-purple-50 dark:bg-purple-900/20' },
  { id: 'ShiftWork' as ShiftType, title: 'Shift Work', description: 'Rotating shifts (Morning/Evening/Night)', icon: <RefreshCw size={18} />, color: 'text-orange-600 dark:text-orange-400', selectedBorder: 'border-orange-500', selectedBg: 'bg-orange-50 dark:bg-orange-900/20' },
  { id: 'Custom' as ShiftType, title: 'Custom', description: 'Fully customizable days and times', icon: <Settings size={18} />, color: 'text-emerald-600 dark:text-emerald-400', selectedBorder: 'border-emerald-500', selectedBg: 'bg-emerald-50 dark:bg-emerald-900/20' },
];

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DEFAULT_WORK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

interface WorkSchedule {
  shiftType: ShiftType;
  workDays?: string[];
  startTime?: string;
  endTime?: string;
  gracePeriod?: number;
  coreStart?: string;
  coreEnd?: string;
  flexWindow?: number;
  shift?: 'Morning' | 'Evening' | 'Night';
  rotation?: 'Weekly' | 'Bi-weekly';
  dayTimes?: Record<string, { start: string; end: string }>;
}

function defaultSchedule(shiftType: ShiftType): WorkSchedule {
  switch (shiftType) {
    case 'Regular': return { shiftType, workDays: [...DEFAULT_WORK_DAYS], startTime: '08:30', endTime: '17:30', gracePeriod: 0 };
    case 'Flexible': return { shiftType, workDays: [...DEFAULT_WORK_DAYS], coreStart: '10:00', coreEnd: '15:00', flexWindow: 2 };
    case 'ShiftWork': return { shiftType, shift: 'Morning', rotation: 'Weekly' };
    case 'Custom': return { shiftType, workDays: [...DEFAULT_WORK_DAYS], gracePeriod: 0, dayTimes: Object.fromEntries(DEFAULT_WORK_DAYS.map(d => [d, { start: '08:30', end: '17:30' }])) };
  }
}

interface RoleOption {
  id: number;
  name: string;
}

interface FormData {
  firstName: string; lastName: string; email: string; password: string;
  role: string; phone: string; department: string; position: string;
  workSchedule?: WorkSchedule;
}

const emptyForm: FormData = { firstName: '', lastName: '', email: '', password: '', role: 'EMPLOYEE', phone: '', department: '', position: '', workSchedule: defaultSchedule('Regular') };

// ─── Main Component ───────────────────────────────────────────────────────────

export const PeopleManagement = () => {
  const { notify } = useDataRefresh();
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3500); };
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editingPerson, setEditingPerson] = useState<any>(null);
  const [formData, setFormData] = useState<FormData>({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const { confirmProps, confirm } = useConfirm();

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => { fetchPeople(); fetchRoles(); }, []);

  const fetchPeople = async () => {
    setError('');
    try {
      const res = await apiClient.get(`/users`);
      const body = res.data;
      if (body.success) setPeople((body.data as any[]) || []);
    } catch { setError('Failed to fetch people'); }
    finally { setLoading(false); }
  };

  const fetchRoles = async () => {
    try {
      const res = await apiClient.get(`/roles`);
      const body = res.data;
      if (body.success) setRoleOptions((body.data as RoleOption[]) || []);
    } catch {
      // fallback to defaults if fetch fails
      setRoleOptions([
        { id: 1, name: 'EMPLOYEE' },
        { id: 2, name: 'HR' },
        { id: 3, name: 'ADMIN' },
      ]);
    }
  };

  const filtered = people.filter(p => {
    const matchSearch = p.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) || p.email?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchSearch && (roleFilter === 'ALL' || p.role === roleFilter) && (statusFilter === 'ALL' || p.status === statusFilter);
  });

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, roleFilter, statusFilter]);

  // Data slicing for pagination
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = startIndex + rowsPerPage;
  const paginatedPeople = filtered.slice(startIndex, endIndex);

  const openAdd = () => { setEditingPerson(null); setFormData({ ...emptyForm, workSchedule: defaultSchedule('Regular') }); fetchRoles(); setShowModal(true); };
  const openEdit = (person: any) => {
    setEditingPerson(person);
    setFormData({ firstName: person.firstName, lastName: person.lastName, email: person.email, password: '', role: person.role, phone: person.phone || '', department: person.department || '', position: person.position || '', workSchedule: person.workSchedule || defaultSchedule('Regular') });
    fetchRoles();
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    const ok = await confirm({ title: 'Delete Person', message: 'This will permanently remove the person and all their data. This cannot be undone.', confirmLabel: 'Delete', variant: 'danger' });
    if (!ok) return;
    try { await apiClient.delete(`/users/${id}`); fetchPeople(); notify('users'); showToast('Person deleted'); } catch { showToast('Failed to delete', false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editingPerson) await apiClient.put(`/users/${editingPerson.id}`, formData);
      else await apiClient.post(`/users`, formData);
      setShowModal(false); fetchPeople(); notify('users'); showToast(editingPerson ? 'Person updated' : 'Person added');
    } catch { showToast('Failed to save', false); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-5">
      <ConfirmModal {...confirmProps} />
      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium ${toast.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-300'}`}>
          {toast.ok ? '✓' : '✕'} {toast.msg}
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">People Management</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage all users (Admin, HR, Employees)</p>
        </div>
        <button onClick={openAdd} className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
          <Plus size={15} /> Add Person
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
          <AlertCircle size={15} />{error}
        </div>
      )}

      <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] p-3 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="Search by name or email..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg bg-gray-50 dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
        </div>
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className={selCls}>
          <option value="ALL">All Roles</option>
          {roleOptions.map(r => (
            <option key={r.id} value={r.name}>{r.name}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={selCls}>
          <option value="ALL">All Status</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option>
        </select>
      </div>

      <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-white/[0.07]">
                {['Name', 'Email', 'Role', 'Status', 'Department', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-10 text-center"><div className="flex justify-center"><div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div></td></tr>
              ) : paginatedPeople.length > 0 ? paginatedPeople.map(person => (
                <tr key={person.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-blue-600 dark:text-blue-400">{person.firstName?.[0]}{person.lastName?.[0]}</span>
                      </div>
                      <span className="font-medium text-gray-900 dark:text-white">{person.fullName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{person.email}</td>
                  <td className="px-4 py-3"><RoleBadge role={person.role} /></td>
                  <td className="px-4 py-3"><StatusBadge status={person.status} /></td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{person.department || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(person)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"><Edit size={14} /></button>
                      <button onClick={() => handleDelete(person.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-500">No people found</td></tr>
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

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-[#0F1929] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/[0.07] max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.07]">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">{editingPerson ? 'Edit Person' : 'Add New Person'}</h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X size={16} /></button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="First Name"><input type="text" required value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} className={inputCls} /></Field>
                <Field label="Last Name"><input type="text" required value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} className={inputCls} /></Field>
              </div>
              <Field label="Email"><input type="email" required value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} className={inputCls} /></Field>
              {!editingPerson && <Field label="Password"><input type="password" required minLength={6} value={formData.password} onChange={e => setFormData({ ...formData, password: e.target.value })} className={inputCls} /></Field>}
              <Field label="Role">
                <select value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })} className={inputCls}>
                  {roleOptions.length > 0
                    ? roleOptions.map(r => (
                        <option key={r.id} value={r.name}>{r.name}</option>
                      ))
                    : (
                      <>
                        <option value="EMPLOYEE">EMPLOYEE</option>
                        <option value="HR">HR</option>
                        <option value="ADMIN">ADMIN</option>
                      </>
                    )
                  }
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Phone"><input type="tel" value={formData.phone} onChange={e => setFormData({ ...formData, phone: e.target.value })} className={inputCls} /></Field>
                <Field label="Department"><input type="text" value={formData.department} onChange={e => setFormData({ ...formData, department: e.target.value })} className={inputCls} /></Field>
              </div>
              <Field label="Position"><input type="text" value={formData.position} onChange={e => setFormData({ ...formData, position: e.target.value })} className={inputCls} /></Field>

              {formData.role === 'EMPLOYEE' && (
                <WorkScheduleSection
                  schedule={formData.workSchedule || defaultSchedule('Regular')}
                  onChange={ws => setFormData({ ...formData, workSchedule: ws })}
                />
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
                <button type="submit" disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 transition-colors">{saving ? 'Saving...' : editingPerson ? 'Update' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Work Schedule Section ────────────────────────────────────────────────────

function WorkScheduleSection({ schedule, onChange }: { schedule: WorkSchedule; onChange: (ws: WorkSchedule) => void }) {
  const set = <K extends keyof WorkSchedule>(key: K, value: WorkSchedule[K]) => onChange({ ...schedule, [key]: value });

  const toggleDay = (day: string) => {
    const days = schedule.workDays ?? [];
    const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day];
    const newSched: WorkSchedule = { ...schedule, workDays: next };
    if (schedule.shiftType === 'Custom') {
      const dt = { ...(schedule.dayTimes ?? {}) };
      if (!days.includes(day)) dt[day] = { start: '08:30', end: '17:30' };
      else delete dt[day];
      newSched.dayTimes = dt;
    }
    onChange(newSched);
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center gap-2">
        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-2">Work Schedule</span>
        <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {SHIFT_CARDS.map(card => {
          const selected = schedule.shiftType === card.id;
          return (
            <button key={card.id} type="button" onClick={() => onChange(defaultSchedule(card.id))}
              className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${selected ? `${card.selectedBorder} ${card.selectedBg}` : 'border-gray-200 dark:border-white/[0.07] hover:border-gray-300 dark:hover:border-gray-600'}`}>
              <span className={`mt-0.5 ${card.color}`}>{card.icon}</span>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{card.title}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{card.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {schedule.shiftType === 'Regular' && (
        <div className="space-y-3">
          <DayCheckboxes days={schedule.workDays ?? []} onToggle={toggleDay} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Time"><input type="time" value={schedule.startTime ?? '08:30'} onChange={e => set('startTime', e.target.value)} className={inputCls} /></Field>
            <Field label="End Time"><input type="time" value={schedule.endTime ?? '17:30'} onChange={e => set('endTime', e.target.value)} className={inputCls} /></Field>
          </div>
          <Field label="Grace Period (min)"><input type="number" min={0} value={schedule.gracePeriod ?? 15} onChange={e => set('gracePeriod', Number(e.target.value))} className={inputCls} /></Field>
        </div>
      )}

      {schedule.shiftType === 'Flexible' && (
        <div className="space-y-3">
          <DayCheckboxes days={schedule.workDays ?? []} onToggle={toggleDay} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Core Start"><input type="time" value={schedule.coreStart ?? '10:00'} onChange={e => set('coreStart', e.target.value)} className={inputCls} /></Field>
            <Field label="Core End"><input type="time" value={schedule.coreEnd ?? '15:00'} onChange={e => set('coreEnd', e.target.value)} className={inputCls} /></Field>
          </div>
          <Field label="Flex Window (± hours)"><input type="number" min={0} max={4} value={schedule.flexWindow ?? 2} onChange={e => set('flexWindow', Number(e.target.value))} className={inputCls} /></Field>
        </div>
      )}

      {schedule.shiftType === 'ShiftWork' && (
        <div className="space-y-3">
          <Field label="Shift">
            <select value={schedule.shift ?? 'Morning'} onChange={e => set('shift', e.target.value as WorkSchedule['shift'])} className={inputCls}>
              <option value="Morning">Morning (6am – 2pm)</option>
              <option value="Evening">Evening (2pm – 10pm)</option>
              <option value="Night">Night (10pm – 6am)</option>
            </select>
          </Field>
          <Field label="Rotation">
            <select value={schedule.rotation ?? 'Weekly'} onChange={e => set('rotation', e.target.value as WorkSchedule['rotation'])} className={inputCls}>
              <option value="Weekly">Weekly</option>
              <option value="Bi-weekly">Bi-weekly</option>
            </select>
          </Field>
        </div>
      )}

      {schedule.shiftType === 'Custom' && (
        <div className="space-y-3">
          <DayCheckboxes days={schedule.workDays ?? []} onToggle={toggleDay} />
          <Field label="Grace Period (min)"><input type="number" min={0} value={schedule.gracePeriod ?? 15} onChange={e => set('gracePeriod', Number(e.target.value))} className={inputCls} /></Field>
          {(schedule.workDays ?? []).map(day => (
            <div key={day} className="grid grid-cols-2 gap-3">
              <Field label={`${day} Start`}><input type="time" value={schedule.dayTimes?.[day]?.start ?? '08:30'} onChange={e => onChange({ ...schedule, dayTimes: { ...schedule.dayTimes, [day]: { start: e.target.value, end: schedule.dayTimes?.[day]?.end ?? '17:30' } } })} className={inputCls} /></Field>
              <Field label={`${day} End`}><input type="time" value={schedule.dayTimes?.[day]?.end ?? '17:30'} onChange={e => onChange({ ...schedule, dayTimes: { ...schedule.dayTimes, [day]: { start: schedule.dayTimes?.[day]?.start ?? '08:30', end: e.target.value } } })} className={inputCls} /></Field>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DayCheckboxes({ days, onToggle }: { days: string[]; onToggle: (day: string) => void }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Work Days</label>
      <div className="flex flex-wrap gap-2">
        {ALL_DAYS.map(day => {
          const checked = days.includes(day);
          return (
            <button key={day} type="button" onClick={() => onToggle(day)}
              className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${checked ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white dark:bg-[#0F1929] border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-400 hover:border-blue-400'}`}>
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

const inputCls = `w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40`;
const selCls = `px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/40`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">{label}</label>{children}</div>;
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = { ADMIN: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400', HR: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400', EMPLOYEE: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300' };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[role] ?? 'bg-gray-100 text-gray-600'}`}>{role}</span>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${status === 'ACTIVE' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>{status}</span>;
}
