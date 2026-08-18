import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import { useAuth } from '../../context/AuthContext';import {
  Mail, MessageSquare, DollarSign, Cloud,
  CheckCircle2, XCircle, Loader2, RefreshCw,
  Eye, EyeOff, Zap, AlertTriangle, X, Settings,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface IntStatus {
  connected: boolean;
  config: Record<string, string>;
  source?: string;
}
interface AllStatus {
  email: IntStatus;
  sms: IntStatus;
  payroll: IntStatus;
  cloud: IntStatus;
}

const card = 'bg-white dark:bg-[#0F1929] rounded-2xl border border-gray-200 dark:border-white/[0.07]';
const inputCls = 'w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-[#0F1929] border border-gray-200 dark:border-white/[0.07] text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  );
}

function SecretField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <Field label={label}>
      <div className="relative">
        <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} className={inputCls + ' pr-10'} />
        <button type="button" onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          {show ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </Field>
  );
}

function Msg({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 ${ok
      ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
      : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
      {ok ? <CheckCircle2 size={13} className="shrink-0 mt-0.5" /> : <XCircle size={13} className="shrink-0 mt-0.5" />}
      {text}
    </div>
  );
}

// ─── Configure Modal wrapper ──────────────────────────────────────────────────
function ConfigModal({ title, icon, onClose, children }: {
  title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-[#0F1929] rounded-2xl shadow-2xl border border-gray-200 dark:border-white/[0.07] max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-white/[0.07] shrink-0">
          <div className="flex items-center gap-3">
            {icon}
            <h2 className="text-base font-bold text-gray-900 dark:text-white">{title}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── Integration Card ─────────────────────────────────────────────────────────
function IntCard({ icon, iconBg, name, desc, connected, detail, onConfigure }: {
  icon: React.ReactNode; iconBg: string; name: string; desc: string;
  connected: boolean; detail?: string; onConfigure: () => void;
}) {
  return (
    <div className={`${card} p-5 flex flex-col gap-4`}>
      <div className="flex items-start gap-4">
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-bold text-gray-900 dark:text-white">{name}</h3>
            {connected ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                Connected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 dark:bg-[#0F1929] text-gray-500 dark:text-gray-400">
                <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                Not connected
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{connected && detail ? detail : desc}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-gray-100 dark:border-white/[0.07]/60">
        <p className="text-xs text-gray-400 dark:text-gray-500">
          {connected ? 'Click Configure to update credentials' : 'Click Configure to connect'}
        </p>
        <button onClick={onConfigure}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors
                     bg-gray-900 dark:bg-white text-white dark:text-gray-900
                     hover:bg-gray-700 dark:hover:bg-gray-100">
          <Settings size={14} /> Configure
        </button>
      </div>
    </div>
  );
}

// ─── Email modal ──────────────────────────────────────────────────────────────
function EmailModal({ status, onClose, onSaved }: { status: IntStatus; onClose: () => void; onSaved: () => void }) {
  const cfg = status.config;
  const [form, setForm] = useState({
    host: cfg.host || '', port: cfg.port || '587',
    user: cfg.user || '', pass: '',
    from: cfg.from || '',
  });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const f = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const test = async () => {
    setTesting(true); setMsg(null);
    try {
      const res = await apiClient.post('/integrations/email/test', form);
      setMsg({ ok: true, text: res.data.message || 'SMTP connection verified!' });
    } catch (e: any) { setMsg({ ok: false, text: e?.error || e?.message || 'Test failed' }); }
    finally { setTesting(false); }
  };

  const save = async () => {
    if (!form.host || !form.user || !form.pass) { setMsg({ ok: false, text: 'Host, email, and password are required' }); return; }
    setSaving(true); setMsg(null);
    try {
      await apiClient.post('/integrations/email/save', form);
      setMsg({ ok: true, text: 'Email configuration saved and applied!' });
      setTimeout(() => { onSaved(); onClose(); }, 1200);
    } catch (e: any) { setMsg({ ok: false, text: e?.error || e?.message || 'Save failed' }); }
    finally { setSaving(false); }
  };

  return (
    <ConfigModal title="Email (SMTP)" icon={<Mail size={20} className="text-blue-600 dark:text-blue-400" />} onClose={onClose}>
      <Field label="SMTP Host">
        <input type="text" value={form.host} onChange={e => f('host')(e.target.value)} placeholder="smtp.gmail.com" className={inputCls} />
      </Field>
      <Field label="SMTP Port">
        <select value={form.port} onChange={e => f('port')(e.target.value)} className={inputCls}>
          <option value="587">587 — STARTTLS (recommended)</option>
          <option value="465">465 — SSL</option>
          <option value="25">25 — Plain</option>
        </select>
      </Field>
      <Field label="Email Address (SMTP User)">
        <input type="email" value={form.user} onChange={e => f('user')(e.target.value)} placeholder="you@gmail.com" className={inputCls} />
      </Field>
      <SecretField label="App Password" value={form.pass} onChange={f('pass')} placeholder={status.connected ? '(leave blank to keep current)' : 'Gmail App Password (16 chars)'} />
      <Field label="From Name (optional)">
        <input type="text" value={form.from} onChange={e => f('from')(e.target.value)} placeholder="Alyah Smart Attendance <you@gmail.com>" className={inputCls} />
      </Field>
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-xs text-blue-700 dark:text-blue-400 space-y-1">
        <p className="font-semibold">📋 Gmail App Password setup:</p>
        <p>1. Go to <strong>myaccount.google.com</strong> → Security</p>
        <p>2. Enable 2-Step Verification</p>
        <p>3. Search for "App passwords" → create one for "Mail"</p>
        <p>4. Paste the 16-character password above</p>
      </div>
      {msg && <Msg ok={msg.ok} text={msg.text} />}
      <div className="flex items-center gap-3 pt-2">
        <button onClick={test} disabled={testing || !form.host || !form.user}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-white/[0.07] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors">
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} Test first
        </button>
        <button onClick={save} disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          {status.connected ? 'Update & Apply' : 'Connect'}
        </button>
      </div>
    </ConfigModal>
  );
}

// ─── SMS modal ────────────────────────────────────────────────────────────────
function SmsModal({ status, onClose, onSaved }: { status: IntStatus; onClose: () => void; onSaved: () => void }) {
  const cfg = status.config;
  const [form, setForm] = useState({ accountSid: cfg.accountSid || '', authToken: '', fromNumber: cfg.fromNumber || '' });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const f = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const test = async () => {
    setTesting(true); setMsg(null);
    try {
      const res = await apiClient.post('/integrations/sms/test', form);
      setMsg({ ok: true, text: res.data.message || 'Twilio credentials valid!' });
    } catch (e: any) { setMsg({ ok: false, text: e?.error || e?.message || 'Test failed' }); }
    finally { setTesting(false); }
  };

  const save = async () => {
    if (!form.accountSid || !form.authToken || !form.fromNumber) { setMsg({ ok: false, text: 'All fields are required' }); return; }
    setSaving(true); setMsg(null);
    try {
      await apiClient.post('/integrations/sms/save', form);
      setMsg({ ok: true, text: 'Twilio SMS connected and applied!' });
      setTimeout(() => { onSaved(); onClose(); }, 1200);
    } catch (e: any) { setMsg({ ok: false, text: e?.error || e?.message || 'Save failed' }); }
    finally { setSaving(false); }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect SMS? Stored Twilio credentials will be deleted.')) return;
    await apiClient.delete('/integrations/sms_twilio');
    onSaved(); onClose();
  };

  return (
    <ConfigModal title="SMS — Twilio" icon={<MessageSquare size={20} className="text-green-600 dark:text-green-400" />} onClose={onClose}>
      <SecretField label="Account SID" value={form.accountSid} onChange={f('accountSid')} placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" />
      <SecretField label="Auth Token" value={form.authToken} onChange={f('authToken')} placeholder={status.connected ? '(leave blank to keep current)' : 'Your Twilio auth token'} />
      <Field label="From Phone Number">
        <input type="text" value={form.fromNumber} onChange={e => f('fromNumber')(e.target.value)} placeholder="+1234567890" className={inputCls} />
      </Field>
      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-3 text-xs text-green-700 dark:text-green-400 space-y-1">
        <p className="font-semibold">📱 Get Twilio credentials:</p>
        <p>1. Sign up at <strong>console.twilio.com</strong></p>
        <p>2. Copy <strong>Account SID</strong> and <strong>Auth Token</strong> from dashboard</p>
        <p>3. Buy or use a trial phone number as "From"</p>
        <p>Used for OTP verification SMS on employee login</p>
      </div>
      {msg && <Msg ok={msg.ok} text={msg.text} />}
      <div className="flex items-center gap-3 pt-2 flex-wrap">
        <button onClick={test} disabled={testing || !form.accountSid}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-white/[0.07] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors">
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} Test
        </button>
        <button onClick={save} disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          {status.connected ? 'Update' : 'Connect'}
        </button>
        {status.connected && (
          <button onClick={disconnect} className="px-4 py-2 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            Disconnect
          </button>
        )}
      </div>
    </ConfigModal>
  );
}

// ─── Payroll modal ────────────────────────────────────────────────────────────
function PayrollModal({ status, onClose, onSaved }: { status: IntStatus; onClose: () => void; onSaved: () => void }) {
  const cfg = status.config;
  const [form, setForm] = useState({ webhookUrl: cfg.webhookUrl || '', secret: '' });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const f = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const test = async () => {
    setTesting(true); setMsg(null);
    try {
      const res = await apiClient.post('/integrations/payroll/test', form);
      setMsg({ ok: true, text: res.data.message || 'Webhook reachable!' });
    } catch (e: any) { setMsg({ ok: false, text: e?.error || e?.message || 'Test failed' }); }
    finally { setTesting(false); }
  };

  const save = async () => {
    if (!form.webhookUrl) { setMsg({ ok: false, text: 'Webhook URL is required' }); return; }
    setSaving(true); setMsg(null);
    try {
      await apiClient.post('/integrations/payroll/save', { ...form, enabled: true });
      setMsg({ ok: true, text: 'Payroll webhook connected!' });
      setTimeout(() => { onSaved(); onClose(); }, 1200);
    } catch (e: any) { setMsg({ ok: false, text: e?.error || e?.message || 'Save failed' }); }
    finally { setSaving(false); }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect payroll webhook?')) return;
    await apiClient.delete('/integrations/payroll_webhook');
    onSaved(); onClose();
  };

  return (
    <ConfigModal title="Payroll Webhook" icon={<DollarSign size={20} className="text-purple-600 dark:text-purple-400" />} onClose={onClose}>
      <Field label="Webhook URL">
        <input type="url" value={form.webhookUrl} onChange={e => f('webhookUrl')(e.target.value)}
          placeholder="https://your-payroll-system.com/webhook/alyah" className={inputCls} />
      </Field>
      <SecretField label="Signing Secret (optional)" value={form.secret} onChange={f('secret')} placeholder="Used to verify webhook authenticity" />
      <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-3 text-xs text-purple-700 dark:text-purple-400 space-y-1">
        <p className="font-semibold">📤 What gets sent:</p>
        <p>Alyah POSTs a JSON payload to this URL on every payroll calculation:</p>
        <code className="block bg-purple-100 dark:bg-purple-900/40 rounded px-2 py-1 mt-1 font-mono text-[11px]">
          {'{ event, source, employeeId, fullName, month, year, baseSalary, netSalary, deductions }'}
        </code>
        <p className="mt-1">Works with: QuickBooks, SAP, custom ERP, Zapier, n8n, Make.com</p>
      </div>
      {msg && <Msg ok={msg.ok} text={msg.text} />}
      <div className="flex items-center gap-3 pt-2 flex-wrap">
        <button onClick={test} disabled={testing || !form.webhookUrl}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-white/[0.07] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors">
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} Test webhook
        </button>
        <button onClick={save} disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          {status.connected ? 'Update' : 'Connect'}
        </button>
        {status.connected && (
          <button onClick={disconnect} className="px-4 py-2 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            Disconnect
          </button>
        )}
      </div>
    </ConfigModal>
  );
}

// ─── Cloud modal ──────────────────────────────────────────────────────────────
function CloudModal({ status, onClose, onSaved }: { status: IntStatus; onClose: () => void; onSaved: () => void }) {
  const cfg = status.config;
  const [form, setForm] = useState({
    bucket: cfg.bucket || '', region: cfg.region || 'us-east-1',
    endpoint: cfg.endpoint || '', accessKey: '', secretKey: '',
  });
  const [testing, setTesting] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const f = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }));

  const test = async () => {
    setTesting(true); setMsg(null);
    try {
      const res = await apiClient.post('/integrations/cloud/test', form);
      setMsg({ ok: true, text: res.data.message || 'S3 bucket reachable!' });
    } catch (e: any) { setMsg({ ok: false, text: e?.error || e?.message || 'Test failed' }); }
    finally { setTesting(false); }
  };

  const save = async () => {
    if (!form.bucket || !form.accessKey || !form.secretKey) { setMsg({ ok: false, text: 'Bucket, Access Key, and Secret Key are required' }); return; }
    setSaving(true); setMsg(null);
    try {
      await apiClient.post('/integrations/cloud/save', form);
      setMsg({ ok: true, text: 'Cloud backup connected!' });
      setTimeout(() => { onSaved(); onClose(); }, 1200);
    } catch (e: any) { setMsg({ ok: false, text: e?.error || e?.message || 'Save failed' }); }
    finally { setSaving(false); }
  };

  const disconnect = async () => {
    if (!confirm('Disconnect cloud backup?')) return;
    await apiClient.delete('/integrations/cloud_backup');
    onSaved(); onClose();
  };

  return (
    <ConfigModal title="Cloud Backup (S3)" icon={<Cloud size={20} className="text-sky-600 dark:text-sky-400" />} onClose={onClose}>
      <Field label="S3 Bucket Name">
        <input type="text" value={form.bucket} onChange={e => f('bucket')(e.target.value)} placeholder="my-attendance-backups" className={inputCls} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Region">
          <select value={form.region} onChange={e => f('region')(e.target.value)} className={inputCls}>
            {['us-east-1','us-west-2','eu-west-1','eu-central-1','ap-southeast-1','ap-northeast-1'].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Custom Endpoint (optional)">
          <input type="url" value={form.endpoint} onChange={e => f('endpoint')(e.target.value)} placeholder="https://s3.cloudflare.com" className={inputCls} />
        </Field>
      </div>
      <SecretField label="Access Key ID" value={form.accessKey} onChange={f('accessKey')} placeholder={status.connected ? '(leave blank to keep current)' : 'AKIAIOSFODNN7EXAMPLE'} />
      <SecretField label="Secret Access Key" value={form.secretKey} onChange={f('secretKey')} placeholder={status.connected ? '(leave blank to keep current)' : 'wJalrXUtnFEMI...'} />
      <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 rounded-xl p-3 text-xs text-sky-700 dark:text-sky-400 space-y-1">
        <p className="font-semibold">☁️ Compatible with:</p>
        <p>AWS S3 · Cloudflare R2 · Backblaze B2 · MinIO · DigitalOcean Spaces · Wasabi</p>
        <p className="mt-1">Backups include: database dumps, uploaded documents (leave files, profile pictures)</p>
      </div>
      {msg && <Msg ok={msg.ok} text={msg.text} />}
      <div className="flex items-center gap-3 pt-2 flex-wrap">
        <button onClick={test} disabled={testing || !form.bucket}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-white/[0.07] text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors">
          {testing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} Test connection
        </button>
        <button onClick={save} disabled={saving}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold disabled:opacity-50 transition-colors">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          {status.connected ? 'Update' : 'Connect'}
        </button>
        {status.connected && (
          <button onClick={disconnect} className="px-4 py-2 rounded-xl border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm font-semibold hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
            Disconnect
          </button>
        )}
      </div>
    </ConfigModal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
type ModalKey = 'email' | 'sms' | 'payroll' | 'cloud' | null;

export const Integrations = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [status, setStatus] = useState<AllStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [modal, setModal] = useState<ModalKey>(null);

  const fetchStatus = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    setFetchError(false);
    try {
      const res = await apiClient.get('/integrations/status');
      if (res.data?.success && res.data?.data) {
        setStatus(res.data.data as AllStatus);
        setFetchError(false);
      } else {
        throw new Error(`API returned: ${JSON.stringify(res?.data)?.slice(0, 100)}`);
      }
    } catch (err: any) {
      console.error('[Integrations] FAILED status=%s msg=%s', err?.response?.status, err?.message);
      console.error('[Integrations] err detail:', JSON.stringify(err?.response?.data)?.slice(0, 200));
      setStatus(prev => prev ?? {
        email:   { connected: false, config: {} },
        sms:     { connected: false, config: {} },
        payroll: { connected: false, config: {} },
        cloud:   { connected: false, config: {} },
      });
      setFetchError(true);
    }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  // Fetch once auth is fully resolved
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    fetchStatus();
  }, [fetchStatus, authLoading, isAuthenticated]);

  // Hard fallback after 3s — catches any auth timing edge cases
  useEffect(() => {
    const t = setTimeout(() => fetchStatus(true), 3000);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connected = status
    ? [status.email, status.sms, status.payroll, status.cloud].filter(i => i.connected).length : 0;

  const DEFS = [
    {
      key: 'email' as ModalKey,
      icon: <Mail size={26} className="text-blue-600 dark:text-blue-400" />,
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      name: 'Email (SMTP)',
      desc: 'Send password resets, OTPs, and approval emails via Gmail or any SMTP server',
      detail: status?.email ? `${status.email.config.user} → ${status.email.config.host}:${status.email.config.port}` : '',
    },
    {
      key: 'sms' as ModalKey,
      icon: <MessageSquare size={26} className="text-green-600 dark:text-green-400" />,
      iconBg: 'bg-green-100 dark:bg-green-900/30',
      name: 'SMS — Twilio',
      desc: 'Send OTP codes and attendance alerts via SMS to employee phones',
      detail: status?.sms ? `From: ${status.sms.config.fromNumber || '—'}` : '',
    },
    {
      key: 'payroll' as ModalKey,
      icon: <DollarSign size={26} className="text-purple-600 dark:text-purple-400" />,
      iconBg: 'bg-purple-100 dark:bg-purple-900/30',
      name: 'Payroll Webhook',
      desc: 'Push salary calculations to QuickBooks, SAP, or any payroll system via webhook',
      detail: status?.payroll ? `→ ${(status.payroll.config.webhookUrl || '').slice(0, 38)}…` : '',
    },
    {
      key: 'cloud' as ModalKey,
      icon: <Cloud size={26} className="text-sky-600 dark:text-sky-400" />,
      iconBg: 'bg-sky-100 dark:bg-sky-900/30',
      name: 'Cloud Backup (S3)',
      desc: 'Auto-backup database and uploaded files to AWS S3, Cloudflare R2, or MinIO',
      detail: status?.cloud ? `Bucket: ${status.cloud.config.bucket} (${status.cloud.config.region || 'us-east-1'})` : '',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Integrations</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Live connection status — configure each service directly from here
          </p>
        </div>
        <button onClick={() => fetchStatus(true)} disabled={refreshing}
          className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50">
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Connected', value: loading ? '—' : connected, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-100 dark:bg-green-900/30', icon: <CheckCircle2 size={18} /> },
          { label: 'Not connected', value: loading ? '—' : 4 - connected, color: 'text-gray-500 dark:text-gray-400', bg: 'bg-gray-100 dark:bg-[#0F1929]', icon: <XCircle size={18} /> },
          { label: 'Total', value: 4, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30', icon: <Zap size={18} /> },
          {
            label: 'Health',
            value: loading ? '—' : `${Math.round((connected / 4) * 100)}%`,
            color: connected >= 3 ? 'text-green-600 dark:text-green-400' : connected >= 1 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400',
            bg: connected >= 3 ? 'bg-green-100 dark:bg-green-900/30' : connected >= 1 ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-red-100 dark:bg-red-900/30',
            icon: <Zap size={18} />,
          },
        ].map(s => (
          <div key={s.label} className={`${card} p-4 flex items-center gap-3`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${s.bg}`}>
              <span className={s.color}>{s.icon}</span>
            </div>
            <div>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Cards grid — always visible */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => (
            <div key={i} className={`${card} p-5 space-y-4 animate-pulse`}>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-gray-200 dark:bg-gray-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                  <div className="h-3 bg-gray-100 dark:bg-[#0F1929] rounded w-full" />
                </div>
              </div>
              <div className="h-px bg-gray-100 dark:bg-gray-700" />
              <div className="h-9 bg-gray-100 dark:bg-[#0F1929] rounded-xl w-32 ml-auto" />
            </div>
          ))}
        </div>
      ) : status ? (
        <>
          {/* Small warning banner if fetch failed but cards still show */}
          {fetchError && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-sm mb-1">
              <AlertTriangle size={15} className="shrink-0" />
              <span>Could not fetch live status — showing last known state. <button onClick={() => fetchStatus(true)} className="underline font-semibold">Retry</button></span>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DEFS.map(d => (
              <IntCard
                key={d.key}
                icon={d.icon}
                iconBg={d.iconBg}
                name={d.name}
                desc={d.desc}
                connected={status[d.key as keyof AllStatus].connected}
                detail={d.detail}
                onConfigure={() => setModal(d.key)}
              />
            ))}
          </div>
        </>
      ) : (
        <div className={`${card} p-10 text-center`}>
          <AlertTriangle size={36} className="text-amber-400 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-600 dark:text-gray-400">Failed to load integration status</p>
          <button onClick={() => fetchStatus()}
            className="mt-4 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
            Retry
          </button>
        </div>
      )}

      {/* Configure modals */}
      {modal === 'email'   && status && <EmailModal   status={status.email}   onClose={() => setModal(null)} onSaved={() => fetchStatus(true)} />}
      {modal === 'sms'     && status && <SmsModal     status={status.sms}     onClose={() => setModal(null)} onSaved={() => fetchStatus(true)} />}
      {modal === 'payroll' && status && <PayrollModal status={status.payroll} onClose={() => setModal(null)} onSaved={() => fetchStatus(true)} />}
      {modal === 'cloud'   && status && <CloudModal   status={status.cloud}   onClose={() => setModal(null)} onSaved={() => fetchStatus(true)} />}
    </div>
  );
};
