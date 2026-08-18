import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { Shield, Plus, Eye, Edit, Trash2, X, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { PERMISSION_GROUPS, ALL_PERMISSIONS } from '../../context/PermissionsContext';

const SYSTEM_ROLES = ['ADMIN', 'HR', 'EMPLOYEE'];

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40';

interface Role { id: number; name: string; description: string; permissions: string[]; }

function roleGradient(name: string) {
  const u = name.toUpperCase();
  if (u === 'ADMIN') return 'from-purple-600 to-purple-700';
  if (u === 'HR') return 'from-blue-600 to-blue-700';
  if (u === 'EMPLOYEE') return 'from-emerald-600 to-emerald-700';
  return 'from-gray-500 to-gray-600';
}

// ─── Permission Group with checkboxes ─────────────────────────────────────────
function PermissionGroup({ category, perms, selected, onChange }: {
  category: string; perms: string[]; selected: string[]; onChange: (p: string[]) => void;
}) {
  const [open, setOpen] = useState(true);
  const allChecked = perms.every(p => selected.includes(p));
  const someChecked = perms.some(p => selected.includes(p));

  const toggleAll = () => {
    if (allChecked) onChange(selected.filter(p => !perms.includes(p)));
    else onChange(Array.from(new Set([...selected, ...perms])));
  };

  return (
    <div className="border border-gray-200 dark:border-white/[0.07] rounded-lg overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-[#0F1929]/60 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={allChecked}
            ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
            onChange={toggleAll} onClick={e => e.stopPropagation()}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{category}</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">({perms.filter(p => selected.includes(p)).length}/{perms.length})</span>
        </div>
        {open ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
      </button>
      {open && (
        <div className="px-4 py-2 space-y-1.5">
          {perms.map(perm => (
            <label key={perm} className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={selected.includes(perm)}
                onChange={() => onChange(selected.includes(perm) ? selected.filter(p => p !== perm) : [...selected, perm])}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-gray-600 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">{perm}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── View Modal ───────────────────────────────────────────────────────────────
function ViewModal({ role, onClose }: { role: Role; onClose: () => void }) {
  const granted = new Set(role.permissions);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-[#0F1929] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/[0.07] max-h-[90vh] flex flex-col">
        <div className={`bg-gradient-to-r ${roleGradient(role.name)} px-6 py-4 rounded-t-2xl flex items-center justify-between`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center"><Shield size={18} className="text-white" /></div>
            <div>
              <h2 className="text-base font-semibold text-white">{role.name}</h2>
              <p className="text-xs text-white/75">{role.description}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Permissions ({role.permissions.length} / {ALL_PERMISSIONS.length})
          </p>
          {Object.entries(PERMISSION_GROUPS).map(([category, perms]) => (
            <div key={category}>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">{category}</p>
              <div className="space-y-1">
                {perms.map(perm => {
                  const has = granted.has(perm);
                  return (
                    <div key={perm} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-[#0F1929]/50">
                      <span className={`text-sm ${has ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-600'}`}>{perm}</span>
                      {has ? <Check size={14} className="text-emerald-500 shrink-0" /> : <X size={14} className="text-gray-300 dark:text-gray-600 shrink-0" />}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-4 border-t border-gray-100 dark:border-white/[0.07] flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
function EditModal({ role, onClose, onSaved }: { role: Role; onClose: () => void; onSaved: () => void }) {
  const isSystem = SYSTEM_ROLES.includes(role.name.toUpperCase());
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description || '');
  const [selectedPerms, setSelectedPerms] = useState<string[]>([...role.permissions]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      await apiClient.put(`/roles/${role.id}`, {
        name: isSystem ? role.name : name,
        description,
        permissions: selectedPerms,
      });
      onSaved(); onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save role');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-[#0F1929] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/[0.07] max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.07]">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Edit Role: {role.name}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Role Name</label>
            <input type="text" value={isSystem ? role.name : name} onChange={e => setName(e.target.value)}
              disabled={isSystem} className={`${inputCls} ${isSystem ? 'opacity-60 cursor-not-allowed' : ''}`} />
            {isSystem && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">System role names cannot be changed.</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} className={inputCls} placeholder="Brief description" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Permissions</p>
            <div className="space-y-2">
              {Object.entries(PERMISSION_GROUPS).map(([cat, perms]) => (
                <PermissionGroup key={cat} category={cat} perms={perms} selected={selectedPerms} onChange={setSelectedPerms} />
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 dark:border-white/[0.07] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 transition-colors">{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Create Modal ─────────────────────────────────────────────────────────────
function CreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedPerms, setSelectedPerms] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!name.trim()) { setError('Role name is required'); return; }
    setSaving(true); setError('');
    try {
      await apiClient.post(`/roles`, { name: name.trim().toUpperCase(), description, permissions: selectedPerms });
      onSaved(); onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create role');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-white dark:bg-[#0F1929] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/[0.07] max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.07]">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">Create New Role</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && <div className="px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Role Name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="e.g. MANAGER" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} className={inputCls} placeholder="Brief description" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Permissions</p>
            <div className="space-y-2">
              {Object.entries(PERMISSION_GROUPS).map(([cat, perms]) => (
                <PermissionGroup key={cat} category={cat} perms={perms} selected={selectedPerms} onChange={setSelectedPerms} />
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 dark:border-white/[0.07] flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50 transition-colors">{saving ? 'Creating...' : 'Create Role'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────
function DeleteConfirm({ role, onClose, onDeleted }: {
  role: Role;
  onClose: () => void;
  onDeleted: (msg: string) => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [userCount, setUserCount] = useState<number | null>(null);

  useEffect(() => {
    // Fetch users with this role to show count in warning
    apiClient.get(`/users?role=${encodeURIComponent(role.name)}`)
      .then((res) => {
        const body = res.data;
        if (body.success) {
          const count = ((body.data as any[]) || []).filter((u: any) => u.role === role.name).length;
          setUserCount(count);
        } else {
          setUserCount(0);
        }
      })
      .catch(() => setUserCount(0));
  }, [role.name]);

  const handleDelete = async () => {
    setDeleting(true); setError('');
    try {
      const res = await apiClient.delete(`/roles/${role.id}`);
      onDeleted(res.data.message || 'Role deleted. Affected users are now locked.');
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete role');
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-white dark:bg-[#0F1929] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/[0.07] p-6">
        {/* Icon */}
        <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
          <Trash2 size={20} className="text-red-600 dark:text-red-400" />
        </div>

        <h2 className="text-base font-semibold text-gray-900 dark:text-white text-center mb-1">Delete Role</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-4">
          You are about to delete <strong className="text-gray-700 dark:text-gray-200">{role.name}</strong>.
        </p>

        {/* User count warning */}
        {userCount === null ? (
          <div className="mb-4 px-3 py-2 rounded-lg bg-gray-50 dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-xs text-gray-400 text-center">
            Checking affected users...
          </div>
        ) : userCount > 0 ? (
          <div className="mb-4 px-4 py-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">
              ⚠️ {userCount} user{userCount > 1 ? 's' : ''} will be locked
            </p>
            <p className="text-xs text-red-600 dark:text-red-400">
              Users under this role will be <strong>locked</strong> and unable to access the system until the role is restored or recreated.
            </p>
          </div>
        ) : (
          <div className="mb-4 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-xs text-gray-500 dark:text-gray-400 text-center">
            No users are currently assigned this role.
          </div>
        )}

        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium">
            Cancel
          </button>
          <button onClick={handleDelete} disabled={deleting || userCount === null}
            className="flex-1 px-4 py-2 text-sm rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium disabled:opacity-50 transition-colors">
            {deleting ? 'Deleting...' : userCount && userCount > 0 ? 'Delete & Lock Users' : 'Delete Role'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Role Card ────────────────────────────────────────────────────────────────
function RoleCard({ role, onView, onEdit, onDelete }: { role: Role; onView: () => void; onEdit: () => void; onDelete: () => void }) {
  const isAdmin = role.name.toUpperCase() === 'ADMIN';

  const grantedCategories = Object.entries(PERMISSION_GROUPS)
    .filter(([, perms]) => perms.some(p => role.permissions.includes(p)))
    .map(([cat]) => cat);

  return (
    <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07] overflow-hidden flex flex-col">
      <div className={`bg-gradient-to-r ${roleGradient(role.name)} px-5 py-4`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
              <Shield size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-white truncate">{role.name}</h3>
              <p className="text-xs text-white/75 mt-0.5 line-clamp-2">{role.description || 'No description'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={onView} title="View permissions" className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"><Eye size={14} /></button>
            <button onClick={onEdit} title="Edit role" className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"><Edit size={14} /></button>
            {!isAdmin && <button onClick={onDelete} title="Delete role" className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/40 text-white transition-colors"><Trash2 size={14} /></button>}
          </div>
        </div>
        <div className="mt-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-white/20 text-white">
            {role.permissions.length} / {ALL_PERMISSIONS.length} permissions
          </span>
        </div>
      </div>
      <div className="p-4 flex-1">
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Access Areas</p>
        {grantedCategories.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {grantedCategories.map(cat => (
              <span key={cat} className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{cat}</span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic">No permissions assigned</p>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export const RolesAndPermissions = () => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [viewRole, setViewRole] = useState<Role | null>(null);
  const [editRole, setEditRole] = useState<Role | null>(null);
  const [deleteRole, setDeleteRole] = useState<Role | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchRoles = useCallback(async () => {
    setError('');
    try {
      const res = await apiClient.get(`/roles`);
      const body = res.data;
      if (body.success) setRoles((body.data as Role[]) || []);
      else setError(body.error || 'Failed to fetch roles');
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) setError('Session expired — please log out and log back in.');
      else if (status === 403) setError('Access denied — Admin role required.');
      else setError(err?.response?.data?.error || 'Failed to fetch roles');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  // Auto-clear success message
  useEffect(() => {
    if (!successMsg) return;
    const t = setTimeout(() => setSuccessMsg(''), 4000);
    return () => clearTimeout(t);
  }, [successMsg]);

  return (
    <div className="space-y-6">
      {/* Success toast */}
      {successMsg && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium border bg-white dark:bg-[#0F1929] border-green-200 dark:border-green-800 text-green-700 dark:text-green-400">
          <Check size={15} />
          {successMsg}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Roles &amp; Permissions</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage roles and their associated permissions</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
          <Plus size={15} /> Add Role
        </button>
      </div>

      {error && <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {roles.map(role => (
            <RoleCard key={role.id} role={role}
              onView={() => setViewRole(role)}
              onEdit={() => setEditRole(role)}
              onDelete={() => setDeleteRole(role)} />
          ))}
          {roles.length === 0 && (
            <div className="col-span-3 py-16 text-center text-sm text-gray-400 dark:text-gray-500">No roles found</div>
          )}
        </div>
      )}

      {viewRole && <ViewModal role={viewRole} onClose={() => setViewRole(null)} />}
      {editRole && <EditModal role={editRole} onClose={() => setEditRole(null)} onSaved={fetchRoles} />}
      {deleteRole && (
        <DeleteConfirm
          role={deleteRole}
          onClose={() => setDeleteRole(null)}
          onDeleted={(msg) => {
            setRoles(prev => prev.filter(r => r.id !== deleteRole.id));
            setSuccessMsg(msg);
            setDeleteRole(null);
          }}
        />
      )}
      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onSaved={fetchRoles} />}
    </div>
  );
};
