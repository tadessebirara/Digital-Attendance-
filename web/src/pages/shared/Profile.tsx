import { useState, useEffect, useRef, useCallback } from 'react';
import apiClient from '../../api/client';
import {
  Shield, Palette, Info, Camera, Save, Eye, EyeOff,
  AlertCircle, CheckCircle, Mail, Phone, Briefcase,
  Hash, Calendar, LogOut, ChevronRight, Sun, Moon, Monitor,
  Lock, Fingerprint, Bell, Building2,
  UserCircle, HelpCircle, FileText, MessageSquare
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLang } from '../../context/LanguageContext';

// --- Types --------------------------------------------------------------------
type Tab = 'account' | 'security' | 'appearance' | 'about';
type ToastType = { type: 'success' | 'error'; msg: string };
type AccentColor = 'blue' | 'purple' | 'green' | 'orange' | 'red' | 'teal';
type FontSize = 'small' | 'medium' | 'large';
type UIStyle = 'compact' | 'spacious';

interface UserPreferences {
  theme?: string;
  accentColor?: AccentColor;
  fontSize?: FontSize;
  uiStyle?: UIStyle;
  language?: string;
  notifications?: { email: boolean; push: boolean; sms: boolean };
}

interface UserProfile {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: string;
  status: string;
  profilePicture?: string;
  phone?: string;
  department?: string;
  position?: string;
  employeeId?: string;
  createdAt?: string;
  preferences: UserPreferences;
  twoFactorEnabled: boolean;
  twoFactorMethod: 'sms' | 'email' | 'app';
  biometricEnabled: boolean;
}

// --- Constants ----------------------------------------------------------------
const ACCENT_COLORS: { key: AccentColor; hex: string; label: string }[] = [
  { key: 'blue',   hex: '#3b82f6', label: 'Blue'   },
  { key: 'purple', hex: '#8b5cf6', label: 'Purple' },
  { key: 'green',  hex: '#22c55e', label: 'Green'  },
  { key: 'orange', hex: '#f97316', label: 'Orange' },
  { key: 'red',    hex: '#ef4444', label: 'Red'    },
  { key: 'teal',   hex: '#3b82f6', label: 'Teal'   },
];

const APP_VERSION = '2.3.1';
const APP_NAME    = 'Alyah Smart Attendance';

// --- Shared helpers -----------------------------------------------------------
function Toast({ toast }: { toast: ToastType | null }) {
  if (!toast) return null;
  return (
    <div className={`fixed top-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-xl text-sm font-medium border
      ${toast.type === 'success'
        ? 'bg-white dark:bg-[#0F1929] border-green-200 dark:border-green-700 text-green-700 dark:text-green-400'
        : 'bg-white dark:bg-[#0F1929] border-red-200 dark:border-red-700 text-red-600 dark:text-red-400'}`}>
      {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
      {toast.msg}
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onChange} disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50
        ${checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
        ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function PasswordInput({ value, onChange, show, onToggle, placeholder, label }: {
  value: string; onChange: (v: string) => void;
  show: boolean; onToggle: () => void;
  placeholder?: string; label: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">{label}</label>
      <div className="relative">
        <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full pl-9 pr-10 py-2.5 text-sm rounded-xl bg-gray-50 dark:bg-[#0F1929]/60 border border-gray-200 dark:border-white/[0.07] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all" />
        <button type="button" onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-100 dark:border-white/[0.07]/50 last:border-0">
      <span className="text-gray-400 dark:text-gray-500 shrink-0">{icon}</span>
      <span className="text-xs text-gray-500 dark:text-gray-400 w-28 shrink-0">{label}</span>
      <span className="text-sm font-medium text-gray-900 dark:text-white">{value}</span>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    ADMIN:    'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-700',
    HR:       'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-700',
    EMPLOYEE: 'bg-gray-100 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600',
  };
  return <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${map[role] ?? 'bg-gray-100 text-gray-600'}`}>{role}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === 'ACTIVE';
  return (
    <span className={`flex items-center gap-1.5 text-xs font-semibold ${isActive ? 'text-green-600 dark:text-green-400' : 'text-yellow-600 dark:text-yellow-400'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-yellow-500'}`} />
      {status}
    </span>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-5">
      <h3 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h3>
      {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

// --- Account Tab --------------------------------------------------------------
function AccountTab({ user, onRefresh, showToast }: {
  user: UserProfile; onRefresh: () => void;
  showToast: (t: 'success' | 'error', m: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: user.firstName,
    lastName:  user.lastName,
    phone:     user.phone || '',
  });

  // ── Email change state ─────────────────────────────────────────────────────
  const [emailStep, setEmailStep]       = useState<'idle' | 'input' | 'otp'>('idle');
  const [newEmail, setNewEmail]         = useState('');
  const [emailOtp, setEmailOtp]         = useState('');
  const [emailBusy, setEmailBusy]       = useState(false);
  const [emailError, setEmailError]     = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');

  // Sync form when user data refreshes
  useEffect(() => {
    setForm({ firstName: user.firstName, lastName: user.lastName, phone: user.phone || '' });
  }, [user.firstName, user.lastName, user.phone]);

  const avatarInitials = `${form.firstName?.[0] ?? ''}${form.lastName?.[0] ?? ''}`.toUpperCase();

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { showToast('error', 'File exceeds 10 MB limit'); return; }
    setUploadingPhoto(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const res = await apiClient.post('/users/profile/avatar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (res.data.success) { showToast('success', 'Photo updated'); onRefresh(); }
      else showToast('error', res.data.error || 'Upload failed');
    } catch (err: any) {
      showToast('error', err?.error || err?.response?.data?.error || 'Upload failed');
    } finally {
      setUploadingPhoto(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient.put('/users/profile/me', {
        firstName: form.firstName.trim(),
        lastName:  form.lastName.trim(),
        phone:     form.phone.trim(),
      });
      showToast('success', 'Profile updated successfully');
      setEditMode(false);
      onRefresh();
    } catch (err: any) {
      showToast('error', err?.error || 'Failed to update profile');
    } finally { setSaving(false); }
  };

  // ── Email change handlers ──────────────────────────────────────────────────
  const handleRequestEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    setEmailSuccess('');
    if (!newEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      setEmailError('Please enter a valid email address.');
      return;
    }
    setEmailBusy(true);
    try {
      const res = await apiClient.post('/users/profile/request-email-change', { newEmail: newEmail.trim() });
      if (res.data.success) {
        setEmailStep('otp');
        setEmailOtp('');
        setEmailSuccess(res.data.message || `Verification code sent to ${newEmail.trim()}`);
      } else {
        setEmailError(res.data.error || 'Failed to send verification code.');
      }
    } catch (err: any) {
      setEmailError(err?.response?.data?.error || err?.error || 'Failed to send verification code.');
    } finally { setEmailBusy(false); }
  };

  const handleConfirmEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');
    if (!emailOtp.trim() || !/^\d{6}$/.test(emailOtp.trim())) {
      setEmailError('Please enter the 6-digit code.');
      return;
    }
    setEmailBusy(true);
    try {
      const res = await apiClient.post('/users/profile/confirm-email-change', { otpCode: emailOtp.trim() });
      if (res.data.success) {
        showToast('success', 'Email updated. Please sign in again with your new email.');
        setEmailStep('idle');
        setNewEmail('');
        setEmailOtp('');
        setEmailSuccess('');
        onRefresh();
      } else {
        setEmailError(res.data.error || 'Incorrect code.');
      }
    } catch (err: any) {
      setEmailError(err?.response?.data?.error || err?.error || 'Failed to confirm email change.');
    } finally { setEmailBusy(false); }
  };

  const cancelEmailChange = () => {
    setEmailStep('idle');
    setNewEmail('');
    setEmailOtp('');
    setEmailError('');
    setEmailSuccess('');
  };

  const inputCls = "w-full px-3 py-2.5 text-sm rounded-xl bg-gray-50 dark:bg-[#0F1929]/60 border border-gray-200 dark:border-white/[0.07] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all";

  return (
    <div className="space-y-5">
      {/* Profile card */}
      <div className="bg-white dark:bg-[#0F1929] rounded-2xl border border-gray-200 dark:border-white/[0.07]/60 shadow-sm p-6">
        <div className="flex items-start gap-5">
          <div className="relative shrink-0">
            <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-gray-200 dark:border-gray-600 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              {user.profilePicture
                ? <img src={user.profilePicture} alt="Profile" className="w-full h-full object-cover" />
                : <span className="text-2xl font-bold text-white">{avatarInitials || '?'}</span>}
            </div>
            <button onClick={() => fileRef.current?.click()} disabled={uploadingPhoto}
              className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center shadow-md transition-colors disabled:opacity-50"
              title="Change photo">
              {uploadingPhoto
                ? <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
                : <Camera size={13} />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-white truncate">{user.fullName}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{user.position || user.role}</p>
                <div className="flex items-center gap-2 mt-2">
                  <RoleBadge role={user.role} />
                  <StatusBadge status={user.status} />
                </div>
              </div>
              <button onClick={() => setEditMode(!editMode)}
                className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                {editMode ? 'Cancel' : 'Edit'}
              </button>
            </div>
            {user.employeeId && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 font-mono">EMP ID: {user.employeeId}</p>
            )}
          </div>
        </div>
      </div>

      {/* Edit form */}
      {editMode && (
        <div className="bg-white dark:bg-[#0F1929] rounded-2xl border border-gray-200 dark:border-white/[0.07]/60 shadow-sm p-6">
          <SectionHeader title="Edit Personal Information" subtitle="Update your name and phone number" />
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">First Name</label>
                <input type="text" value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })}
                  className={inputCls} placeholder="First name" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Last Name</label>
                <input type="text" value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })}
                  className={inputCls} placeholder="Last name" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">Phone Number</label>
              <div className="relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input type="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
                  className={`${inputCls} pl-9`} placeholder="+1 234 567 8900" />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button type="submit" disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 transition-colors">
                <Save size={14} />{saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button type="button" onClick={() => setEditMode(false)}
                className="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Profile overview */}
      <div className="bg-white dark:bg-[#0F1929] rounded-2xl border border-gray-200 dark:border-white/[0.07]/60 shadow-sm p-6">
        <SectionHeader title="Profile Overview" subtitle="Your personal information and contacts" />
        <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
          <InfoRow icon={<Mail size={15} />}      label="Email"       value={user.email} />
          <InfoRow icon={<Phone size={15} />}     label="Phone"       value={user.phone} />
          <InfoRow icon={<Building2 size={15} />} label="Department"  value={user.department} />
          <InfoRow icon={<Briefcase size={15} />} label="Position"    value={user.position} />
          <InfoRow icon={<Hash size={15} />}      label="Employee ID" value={user.employeeId} />
          <InfoRow icon={<Calendar size={15} />}  label="Join Date"
            value={user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : undefined} />
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 pt-4 border-t border-gray-100 dark:border-white/[0.07]/50">
          This information is used across the system and for attendance records.
        </p>
      </div>

      {/* ── Change Email ─────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-[#0F1929] rounded-2xl border border-gray-200 dark:border-white/[0.07]/60 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Email Address</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Current: <span className="font-semibold text-gray-700 dark:text-gray-300">{user.email}</span>
            </p>
          </div>
          {emailStep === 'idle' && (
            <button
              type="button"
              onClick={() => setEmailStep('input')}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors">
              <Mail size={12} /> Change Email
            </button>
          )}
        </div>

        {/* Step 1 — enter new email */}
        {emailStep === 'input' && (
          <form onSubmit={handleRequestEmailChange} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">New Email Address</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => { setNewEmail(e.target.value); setEmailError(''); }}
                  className={`${inputCls} pl-9`}
                  placeholder="new@example.com"
                  autoFocus
                  required
                />
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                A 6-digit verification code will be sent to this address.
              </p>
            </div>
            {emailError && (
              <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800">
                <AlertCircle size={13} className="shrink-0" />{emailError}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={emailBusy}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 transition-colors">
                {emailBusy
                  ? <><div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />Sending…</>
                  : <><Mail size={14} />Send Code</>}
              </button>
              <button type="button" onClick={cancelEmailChange}
                className="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Step 2 — enter OTP */}
        {emailStep === 'otp' && (
          <form onSubmit={handleConfirmEmailChange} className="space-y-4">
            {emailSuccess && (
              <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg border border-green-200 dark:border-green-800">
                <CheckCircle size={13} className="shrink-0" />{emailSuccess}
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Verification Code <span className="text-gray-400">(sent to {newEmail})</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={emailOtp}
                onChange={e => { setEmailOtp(e.target.value.replace(/\D/g, '')); setEmailError(''); }}
                className={`${inputCls} text-center text-2xl font-black tracking-[0.5em]`}
                placeholder="000000"
                autoFocus
                required
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                Code expires in 15 minutes.{' '}
                <button
                  type="button"
                  onClick={() => { setEmailStep('input'); setEmailOtp(''); setEmailError(''); setEmailSuccess(''); }}
                  className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
                  Use a different email
                </button>
              </p>
            </div>
            {emailError && (
              <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800">
                <AlertCircle size={13} className="shrink-0" />{emailError}
              </div>
            )}
            <div className="flex items-center gap-3">
              <button type="submit" disabled={emailBusy || emailOtp.length !== 6}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-medium disabled:opacity-50 transition-colors">
                {emailBusy
                  ? <><div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />Verifying…</>
                  : <><CheckCircle size={14} />Verify &amp; Update Email</>}
              </button>
              <button type="button" onClick={cancelEmailChange}
                className="px-5 py-2.5 rounded-xl border border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// --- Security Tab -------------------------------------------------------------
function SecurityTab({ user, onRefresh, showToast }: {
  user: UserProfile; onRefresh: () => void;
  showToast: (t: 'success' | 'error', m: string) => void;
}) {
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [showPw, setShowPw] = useState({ current: false, newPw: false, confirm: false });
  const [pwError, setPwError] = useState('');
  const [savingPw, setSavingPw] = useState(false);

  // 2FA state � seeded from DB via user prop
  const [twoFAEnabled, setTwoFAEnabled] = useState(user.twoFactorEnabled);
  const [twoFAMethod, setTwoFAMethod] = useState<'sms' | 'email' | 'app'>(user.twoFactorMethod);
  const [saving2FA, setSaving2FA] = useState(false);

  // Biometric state � seeded from DB
  const [biometricEnabled, setBiometricEnabled] = useState(user.biometricEnabled);
  const [savingBio, setSavingBio] = useState(false);

  const strength = (() => {
    const p = pwForm.newPw;
    if (!p) return 0;
    let s = 0;
    if (p.length >= 8) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  })();
  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'][strength];
  const strengthColor = ['', 'bg-red-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'][strength];

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');
    if (pwForm.newPw === pwForm.current) { setPwError('New password must differ from current'); return; }
    if (pwForm.newPw.length < 8) { setPwError('Password must be at least 8 characters'); return; }
    if (pwForm.newPw !== pwForm.confirm) { setPwError('Passwords do not match'); return; }
    setSavingPw(true);
    try {
      await apiClient.post('/auth/change-password', {
        currentPassword: pwForm.current,
        newPassword: pwForm.newPw,
      });
      showToast('success', 'Password updated. Please log in again on all devices.');
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (err: any) {
      showToast('error', err?.error || err?.response?.data?.error || 'Failed to update password');
    } finally { setSavingPw(false); }
  };

  const handle2FAToggle = async () => {
    const next = !twoFAEnabled;
    setSaving2FA(true);
    try {
      await apiClient.put('/users/profile/two-factor', { enabled: next, method: twoFAMethod });
      setTwoFAEnabled(next);
      showToast('success', next ? 'Two-factor authentication enabled' : '2FA disabled');
      onRefresh();
    } catch (err: any) {
      showToast('error', err?.error || 'Failed to update 2FA');
    } finally { setSaving2FA(false); }
  };

  const handle2FAMethod = async (method: 'sms' | 'email' | 'app') => {
    setSaving2FA(true);
    try {
      await apiClient.put('/users/profile/two-factor', { enabled: twoFAEnabled, method });
      setTwoFAMethod(method);
      showToast('success', `2FA method set to ${method.toUpperCase()}`);
      onRefresh();
    } catch (err: any) {
      showToast('error', err?.error || 'Failed to update 2FA method');
    } finally { setSaving2FA(false); }
  };

  const handleBiometricToggle = async () => {
    const next = !biometricEnabled;
    setSavingBio(true);
    try {
      await apiClient.put('/users/profile/biometric', { enabled: next });
      setBiometricEnabled(next);
      showToast('success', next ? 'Biometric login enabled' : 'Biometric login disabled');
      onRefresh();
    } catch (err: any) {
      showToast('error', err?.error || 'Failed to update biometric setting');
    } finally { setSavingBio(false); }
  };

  return (
    <div className="space-y-5">
      {/* Change Password */}
      <div className="bg-white dark:bg-[#0F1929] rounded-2xl border border-gray-200 dark:border-white/[0.07]/60 shadow-sm p-6">
        <SectionHeader title="Change Password" subtitle="Update and secure your account password" />
        <form onSubmit={handleChangePassword} className="space-y-4">
          <PasswordInput label="Current Password" value={pwForm.current}
            onChange={v => setPwForm({ ...pwForm, current: v })}
            show={showPw.current} onToggle={() => setShowPw({ ...showPw, current: !showPw.current })}
            placeholder="Current password" />
          <div>
            <PasswordInput label="New Password" value={pwForm.newPw}
              onChange={v => setPwForm({ ...pwForm, newPw: v })}
              show={showPw.newPw} onToggle={() => setShowPw({ ...showPw, newPw: !showPw.newPw })}
              placeholder="Min 8 characters" />
            {pwForm.newPw && (
              <div className="mt-2">
                <div className="flex gap-1 mb-1">
                  {[1,2,3,4].map(i => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${i <= strength ? strengthColor : 'bg-gray-200 dark:bg-gray-700'}`} />
                  ))}
                </div>
                <p className={`text-xs font-medium ${strength <= 1 ? 'text-red-500' : strength === 2 ? 'text-yellow-500' : strength === 3 ? 'text-blue-500' : 'text-green-500'}`}>
                  {strengthLabel}
                </p>
              </div>
            )}
          </div>
          <PasswordInput label="Confirm New Password" value={pwForm.confirm}
            onChange={v => setPwForm({ ...pwForm, confirm: v })}
            show={showPw.confirm} onToggle={() => setShowPw({ ...showPw, confirm: !showPw.confirm })}
            placeholder="Repeat new password" />
          {pwError && (
            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              <AlertCircle size={13} />{pwError}
            </div>
          )}
          <button type="submit" disabled={savingPw}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 transition-colors">
            <Lock size={14} />{savingPw ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {/* Two-Factor Authentication */}
      <div className="bg-white dark:bg-[#0F1929] rounded-2xl border border-gray-200 dark:border-white/[0.07]/60 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Two-Factor Authentication</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Add an extra layer of security to your account</p>
          </div>
          <Toggle checked={twoFAEnabled} onChange={handle2FAToggle} disabled={saving2FA} />
        </div>
        {twoFAEnabled && (
          <div className="space-y-2 pt-4 border-t border-gray-100 dark:border-white/[0.07]/50">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-3">Select Method</p>
            {([
              { key: 'sms'   as const, label: 'SMS OTP',          icon: <Phone size={14} /> },
              { key: 'email' as const, label: 'Email OTP',         icon: <Mail size={14} /> },
              { key: 'app'   as const, label: 'Authenticator App', icon: <Shield size={14} /> },
            ]).map(m => (
              <button key={m.key} type="button" onClick={() => handle2FAMethod(m.key)} disabled={saving2FA}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all text-left disabled:opacity-60
                  ${twoFAMethod === m.key
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                    : 'border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'}`}>
                <span className={twoFAMethod === m.key ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}>{m.icon}</span>
                {m.label}
                {twoFAMethod === m.key && <CheckCircle size={14} className="ml-auto text-blue-600 dark:text-blue-400" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Biometric Login */}
      <div className="bg-white dark:bg-[#0F1929] rounded-2xl border border-gray-200 dark:border-white/[0.07]/60 shadow-sm p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
              <Fingerprint size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Biometric Login</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Use fingerprint or Face ID to log in</p>
            </div>
          </div>
          <Toggle checked={biometricEnabled} onChange={handleBiometricToggle} disabled={savingBio} />
        </div>
        {biometricEnabled && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/[0.07]/50">
            <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg">
              <CheckCircle size={13} />Biometric authentication is enabled for this device
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Appearance Tab -----------------------------------------------------------
// Applies accent color as a CSS custom property so it actually affects the UI
function applyAccent(c: AccentColor) {
  const map: Record<AccentColor, string> = {
    blue:   '#3b82f6', purple: '#8b5cf6', green: '#22c55e',
    orange: '#f97316', red:    '#ef4444', teal:  '#3b82f6',
  };
  document.documentElement.style.setProperty('--accent', map[c]);
  document.documentElement.style.setProperty('--accent-hover', map[c]);
}

function AppearanceTab({ user, onRefresh, showToast }: {
  user: UserProfile; onRefresh: () => void;
  showToast: (t: 'success' | 'error', m: string) => void;
}) {
  const { theme, setTheme } = useTheme();
  const { lang, toggleLang } = useLang();

  const prefs = user.preferences;
  const [accent,     setAccent]     = useState<AccentColor>(prefs.accentColor ?? 'blue');
  const [fontSize,   setFontSize]   = useState<FontSize>(prefs.fontSize       ?? 'medium');
  const [uiStyle,    setUIStyle]    = useState<UIStyle>(prefs.uiStyle         ?? 'compact');
  const [notifPrefs, setNotifPrefs] = useState(prefs.notifications ?? { email: true, push: true, sms: false });
  const [saving, setSaving] = useState(false);

  // Apply saved accent on mount
  useEffect(() => { applyAccent(prefs.accentColor ?? 'blue'); }, []);

  const savePrefs = useCallback(async (patch: Partial<UserPreferences>) => {
    setSaving(true);
    try { await apiClient.put('/users/profile/preferences', patch); onRefresh(); }
    catch { /* silent */ }
    finally { setSaving(false); }
  }, [onRefresh]);

  const handleTheme = (t: 'light' | 'dark' | 'system') => {
    setTheme(t);
    savePrefs({ theme: t });
  };

  const handleAccent = (c: AccentColor) => {
    setAccent(c);
    applyAccent(c);
    localStorage.setItem('accent_color', c);
    savePrefs({ accentColor: c });
    showToast('success', `Accent color set to ${c}`);
  };

  const handleFontSize = (s: FontSize) => {
    setFontSize(s);
    const map = { small: '14px', medium: '16px', large: '18px' };
    document.documentElement.style.fontSize = map[s];
    localStorage.setItem('font_size', s);
    savePrefs({ fontSize: s });
    showToast('success', `Font size set to ${s}`);
  };

  const handleUIStyle = (s: UIStyle) => {
    setUIStyle(s);
    localStorage.setItem('ui_style', s);
    savePrefs({ uiStyle: s });
    showToast('success', `UI style set to ${s}`);
  };

  const handleLang = (newLang: 'en' | 'am') => {
    if (newLang !== lang) toggleLang();
    const label = newLang === 'en' ? 'English' : 'Amharic';
    localStorage.setItem('language', label);
    savePrefs({ language: label });
    showToast('success', `Language set to ${label}`);
  };

  const handleNotif = async (key: keyof typeof notifPrefs) => {
    const next = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(next);
    await savePrefs({ notifications: next });
  };

  const themeOptions = [
    { key: 'light'  as const, label: 'Light',  icon: <Sun size={16} />,     bg: 'bg-yellow-100 text-yellow-600' },
    { key: 'dark'   as const, label: 'Dark',   icon: <Moon size={16} />,    bg: 'bg-gray-800 text-gray-300' },
    { key: 'system' as const, label: 'System', icon: <Monitor size={16} />, bg: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' },
  ];

  return (
    <div className="space-y-5">
      {saving && (
        <div className="flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-3 py-2 rounded-lg">
          <div className="w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin" />
          Saving preferences�
        </div>
      )}

      {/* Theme */}
      <div className="bg-white dark:bg-[#0F1929] rounded-2xl border border-gray-200 dark:border-white/[0.07]/60 shadow-sm p-6">
        <SectionHeader title="Theme" subtitle="Choose your preferred color scheme" />
        <div className="grid grid-cols-3 gap-3">
          {themeOptions.map(t => (
            <button key={t.key} type="button" onClick={() => handleTheme(t.key)}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                ${theme === t.key
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-white/[0.07] hover:border-gray-300 dark:hover:border-gray-600'}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.bg}`}>
                {t.icon}
              </div>
              <span className={`text-xs font-medium ${theme === t.key ? 'text-blue-700 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'}`}>{t.label}</span>
              {theme === t.key && <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
            </button>
          ))}
        </div>
      </div>

      {/* Color Accent */}
      <div className="bg-white dark:bg-[#0F1929] rounded-2xl border border-gray-200 dark:border-white/[0.07]/60 shadow-sm p-6">
        <SectionHeader title="Color Accent" subtitle="Personalize your interface accent color" />
        <div className="flex items-center gap-3 flex-wrap">
          {ACCENT_COLORS.map(c => (
            <button key={c.key} type="button" onClick={() => handleAccent(c.key)} title={c.label}
              className={`w-10 h-10 rounded-full transition-all hover:scale-110 flex items-center justify-center
                ${accent === c.key ? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-[#1a1d2e] scale-110 shadow-lg' : 'opacity-80 hover:opacity-100'}`}
              style={{ backgroundColor: c.hex }}>
              {accent === c.key && <CheckCircle size={17} className="text-white drop-shadow" />}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
          Selected: <span className="font-semibold capitalize text-gray-700 dark:text-gray-300">{accent}</span>
        </p>
      </div>

      {/* UI Style + Font Size */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-[#0F1929] rounded-2xl border border-gray-200 dark:border-white/[0.07]/60 shadow-sm p-6">
          <SectionHeader title="UI Style" subtitle="Layout density preference" />
          <div className="space-y-2">
            {(['compact', 'spacious'] as UIStyle[]).map(s => (
              <button key={s} type="button" onClick={() => handleUIStyle(s)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all
                  ${uiStyle === s
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                    : 'border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-400 hover:border-gray-300'}`}>
                <span className="capitalize">{s}</span>
                {uiStyle === s && <CheckCircle size={14} />}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-[#0F1929] rounded-2xl border border-gray-200 dark:border-white/[0.07]/60 shadow-sm p-6">
          <SectionHeader title="Font Size" subtitle="Text size preference" />
          <div className="space-y-2">
            {([
              { key: 'small'  as FontSize, label: 'A Small'  },
              { key: 'medium' as FontSize, label: 'A Medium' },
              { key: 'large'  as FontSize, label: 'A Large'  },
            ]).map(s => (
              <button key={s.key} type="button" onClick={() => handleFontSize(s.key)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all
                  ${fontSize === s.key
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                    : 'border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-400 hover:border-gray-300'}`}>
                {s.label}
                {fontSize === s.key && <CheckCircle size={14} />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Language (only English + Amharic) + Notifications */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="bg-white dark:bg-[#0F1929] rounded-2xl border border-gray-200 dark:border-white/[0.07]/60 shadow-sm p-6">
          <SectionHeader title="Language" subtitle="Interface language � ???" />
          <div className="space-y-2">
            {([
              { key: 'en' as const, label: 'English',  flag: '????' },
              { key: 'am' as const, label: '???? (Amharic)', flag: '????' },
            ]).map(l => (
              <button key={l.key} type="button" onClick={() => handleLang(l.key)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border-2 text-sm font-medium transition-all
                  ${lang === l.key
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                    : 'border-gray-200 dark:border-white/[0.07] text-gray-600 dark:text-gray-400 hover:border-gray-300'}`}>
                <span className="text-lg">{l.flag}</span>
                <span className="flex-1 text-left">{l.label}</span>
                {lang === l.key && <CheckCircle size={15} />}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white dark:bg-[#0F1929] rounded-2xl border border-gray-200 dark:border-white/[0.07]/60 shadow-sm p-6">
          <SectionHeader title="Notifications" subtitle="Alert preferences" />
          <div className="space-y-3">
            {([
              { key: 'email' as const, label: 'Email alerts',       icon: <Mail size={13} /> },
              { key: 'push'  as const, label: 'Push notifications', icon: <Bell size={13} /> },
              { key: 'sms'   as const, label: 'SMS alerts',         icon: <Phone size={13} /> },
            ]).map(({ key, label, icon }) => (
              <div key={key} className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                  <span className="text-gray-400">{icon}</span>{label}
                </div>
                <Toggle checked={notifPrefs[key]} onChange={() => handleNotif(key)} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- About Tab ----------------------------------------------------------------
function AboutTab() {
  const links = [
    { label: 'Terms & Conditions', icon: <FileText size={16} />,    href: '#' },
    { label: 'Privacy Policy',     icon: <Shield size={16} />,      href: '#' },
    { label: 'Support / Help Center', icon: <HelpCircle size={16} />, href: '#' },
    { label: 'Contact Us',         icon: <MessageSquare size={16} />, href: '#' },
  ];

  return (
    <div className="space-y-5">
      <div className="bg-white dark:bg-[#0F1929] rounded-2xl border border-gray-200 dark:border-white/[0.07]/60 shadow-sm p-6">
        <div className="flex flex-col items-center text-center py-4">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg">
            <Shield size={36} className="text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{APP_NAME}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Version {APP_VERSION}</p>
          <div className="mt-3 px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium">
            Up to date
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/[0.07]/50">
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center leading-relaxed">
            A smart attendance management system designed to simplify employee attendance tracking, leave management and payroll integration.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-[#0F1929] rounded-2xl border border-gray-200 dark:border-white/[0.07]/60 shadow-sm overflow-hidden">
        {links.map((link, i) => (
          <a key={link.label} href={link.href}
            className={`flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group
              ${i < links.length - 1 ? 'border-b border-gray-100 dark:border-white/[0.07]/50' : ''}`}>
            <div className="flex items-center gap-3">
              <span className="text-gray-400 dark:text-gray-500 group-hover:text-blue-500 transition-colors">{link.icon}</span>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{link.label}</span>
            </div>
            <ChevronRight size={16} className="text-gray-400 group-hover:text-blue-500 transition-colors" />
          </a>
        ))}
      </div>

      <div className="text-center py-2">
        <p className="text-xs text-gray-400 dark:text-gray-500">&copy; {new Date().getFullYear()} {APP_NAME}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">All rights reserved.</p>
      </div>
    </div>
  );
}

// --- Main Profile Page --------------------------------------------------------
export const Profile = () => {
  const { user: authUser, logout } = useAuth();
  const { setTheme } = useTheme();
  const { lang, toggleLang } = useLang();
  const [activeTab, setActiveTab] = useState<Tab>('account');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastType | null>(null);

  useEffect(() => { fetchProfile(); }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const showToast = (type: 'success' | 'error', msg: string) => setToast({ type, msg });

  const fetchProfile = async () => {
    try {
      const res = await apiClient.get('/users/profile/me');
      if (res.data.success) {
        const data = res.data.data as UserProfile;
        setUser(data);
        const prefs = data.preferences || {};

        // Apply theme
        if (prefs.theme && ['light', 'dark', 'system'].includes(prefs.theme)) {
          setTheme(prefs.theme as 'light' | 'dark' | 'system');
        }
        // Apply accent color as CSS var immediately
        if (prefs.accentColor) {
          const map: Record<string, string> = {
            blue: '#3b82f6', purple: '#8b5cf6', green: '#22c55e',
            orange: '#f97316', red: '#ef4444', teal: '#3b82f6',
          };
          if (map[prefs.accentColor]) {
            document.documentElement.style.setProperty('--accent', map[prefs.accentColor]);
          }
          localStorage.setItem('accent_color', prefs.accentColor);
        }
        // Apply font size
        if (prefs.fontSize) {
          const fmap: Record<string, string> = { small: '14px', medium: '16px', large: '18px' };
          if (fmap[prefs.fontSize]) document.documentElement.style.fontSize = fmap[prefs.fontSize];
          localStorage.setItem('font_size', prefs.fontSize);
        }
        // Sync language � DB stores 'English' or 'Amharic', context uses 'en'/'am'
        if (prefs.language) {
          const dbLang = prefs.language === 'Amharic' ? 'am' : 'en';
          if (dbLang !== lang) toggleLang();
          localStorage.setItem('language', prefs.language);
        }
        if (prefs.uiStyle)       localStorage.setItem('ui_style', prefs.uiStyle);
        if (prefs.notifications) localStorage.setItem('notificationPrefs', JSON.stringify(prefs.notifications));
      }
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  const tabs: { key: Tab; label: string; icon: React.ReactNode; desc: string }[] = [
    { key: 'account',    label: 'Account',    icon: <UserCircle size={18} />, desc: 'Personal information and contacts' },
    { key: 'security',   label: 'Security',   icon: <Shield size={18} />,    desc: 'Password, 2FA & biometric' },
    { key: 'appearance', label: 'Appearance', icon: <Palette size={18} />,   desc: 'Customize app appearance' },
    { key: 'about',      label: 'About',      icon: <Info size={18} />,      desc: 'App info, privacy and terms' },
  ];

  const avatarInitials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`.toUpperCase();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gray-500 dark:text-gray-400">
        Failed to load profile. Please refresh the page.
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <Toast toast={toast} />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Profile</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Manage your account settings and preferences</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="lg:w-72 shrink-0 space-y-4">
          {/* Profile summary */}
          <div className="bg-gradient-to-br from-blue-600 to-purple-700 rounded-2xl p-5 text-white shadow-lg">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl overflow-hidden border-2 border-white/30 bg-white/20 flex items-center justify-center shrink-0">
                {user.profilePicture
                  ? <img src={user.profilePicture} alt="Profile" className="w-full h-full object-cover" />
                  : <span className="text-xl font-bold text-white">{avatarInitials || '?'}</span>}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-base truncate">{user.fullName || authUser?.fullName}</p>
                <p className="text-blue-100 text-xs mt-0.5 truncate">{user.position || user.role}</p>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  <span className="text-xs text-blue-100">Active</span>
                </div>
              </div>
            </div>
            {user.employeeId && (
              <div className="mt-3 pt-3 border-t border-white/20">
                <p className="text-xs text-blue-200 font-mono">EMP ID: {user.employeeId}</p>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="bg-white dark:bg-[#0F1929] rounded-2xl border border-gray-200 dark:border-white/[0.07]/60 shadow-sm overflow-hidden">
            {tabs.map((tab, i) => (
              <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-all group
                  ${i < tabs.length - 1 ? 'border-b border-gray-100 dark:border-white/[0.07]/50' : ''}
                  ${activeTab === tab.key ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                <span className={`shrink-0 transition-colors ${activeTab === tab.key ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-400'}`}>
                  {tab.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${activeTab === tab.key ? 'text-blue-700 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                    {tab.label}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{tab.desc}</p>
                </div>
                <ChevronRight size={14} className={`shrink-0 transition-colors ${activeTab === tab.key ? 'text-blue-500' : 'text-gray-300 dark:text-gray-600'}`} />
              </button>
            ))}

            {/* Logout */}
            <button type="button" onClick={logout}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left border-t border-gray-100 dark:border-white/[0.07]/50 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors group">
              <LogOut size={18} className="text-red-400 group-hover:text-red-500 transition-colors shrink-0" />
              <span className="text-sm font-medium text-red-500 dark:text-red-400 group-hover:text-red-600 dark:group-hover:text-red-300">
                Sign Out
              </span>
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 min-w-0">
          {activeTab === 'account'    && <AccountTab    user={user} onRefresh={fetchProfile} showToast={showToast} />}
          {activeTab === 'security'   && <SecurityTab   user={user} onRefresh={fetchProfile} showToast={showToast} />}
          {activeTab === 'appearance' && <AppearanceTab user={user} onRefresh={fetchProfile} showToast={showToast} />}
          {activeTab === 'about'      && <AboutTab />}
        </div>
      </div>
    </div>
  );
};
