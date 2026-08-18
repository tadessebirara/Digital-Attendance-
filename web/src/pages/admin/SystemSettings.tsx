import {
  useCallback, useEffect, useMemo, useRef, useState,
  type ReactNode, type ChangeEvent,
} from "react";
import apiClient from "../../api/client";
import {
  AlertCircle, CheckCircle, Download, Eye, EyeOff,
  Palette, Pencil, Printer, QrCode, Save, Sparkles,
  Upload, X, Building2, RefreshCw,
} from "lucide-react";

// ── Shared input style ────────────────────────────────────────────────────────
const inputCls = `w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm
  text-stone-900 shadow-sm outline-none transition focus:border-blue-500
  focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100`;

// ── Types ─────────────────────────────────────────────────────────────────────
interface Settings {
  companyName: string;
  logoUrl: string;
  primaryColor: string;
  qrEnabled: boolean;
  qrExpirySeconds: number;
  qrSecretSet: boolean;
  qrGenerationPasswordSet: boolean;
  qrAttendancePasswordSet: boolean;
}

interface Office { id: number; name: string; }

const DEFAULT: Settings = {
  companyName: "", logoUrl: "", primaryColor: "#1F2937",
  qrEnabled: true, qrExpirySeconds: 60,
  qrSecretSet: false, qrGenerationPasswordSet: false, qrAttendancePasswordSet: false,
};

// ── Per-office QR Card ────────────────────────────────────────────────────────
function OfficeQrCard({
  office, password, companyName,
}: { office: Office; password: string; companyName: string }) {
  const [qr, setQr]         = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const loadQr = useCallback(async () => {
    if (!password) return;
    setLoading(true);
    try {
      const res = await apiClient.get(
        `/admin/settings/preview-qr?password=${encodeURIComponent(password)}&officeId=${office.id}`
      );
      if (res.data?.success) setQr((res.data.data as any)?.qrCode ?? null);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [password, office.id]);

  useEffect(() => { loadQr(); }, [loadQr]);

  const handlePrint = () => {
    if (!printRef.current) return;
    const win = window.open("", "_blank", "width=520,height=640");
    if (!win) return;
    win.document.write(`<html><head><title>${office.name} QR</title>
      <style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;
      justify-content:center;min-height:100vh;margin:0;background:#fff;}
      img{width:300px;height:300px;}h2{font-size:18px;font-weight:900;margin:14px 0 3px;color:#0f172a;}
      p{font-size:11px;color:#64748b;margin:0;}</style></head><body>
      ${printRef.current.innerHTML}
      <script>window.onload=()=>{window.print();window.close();};<\/script></body></html>`);
    win.document.close();
  };

  const handleDownload = () => {
    if (!qr) return;
    const a = document.createElement("a");
    a.href = qr;
    a.download = `qr-${office.name.toLowerCase().replace(/\s+/g, "-")}.svg`;
    a.click();
  };

  return (
    <div className="flex flex-col items-center rounded-3xl border border-stone-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <Building2 size={15} className="text-stone-400" />
          <span className="text-sm font-black text-stone-800 dark:text-white">{office.name}</span>
        </div>
        <button onClick={loadQr} title="Refresh" className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 hover:bg-stone-100 dark:hover:bg-slate-800 transition">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      <div ref={printRef} className="flex flex-col items-center">
        {loading ? (
          <div className="flex h-48 w-48 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : qr ? (
          <img src={qr} alt={`${office.name} QR`} className="h-48 w-48 rounded-xl" />
        ) : (
          <div className="flex h-48 w-48 items-center justify-center rounded-xl border-2 border-dashed border-stone-200 text-stone-300">
            <QrCode size={36} />
          </div>
        )}
        <p className="mt-3 text-xs font-black text-stone-700 dark:text-white">{companyName || "Alyah"}</p>
        <p className="text-[10px] text-stone-400">{office.name}</p>
      </div>
      {qr && (
        <div className="mt-3 flex w-full gap-2">
          <button onClick={handlePrint} className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-stone-200 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition">
            <Printer size={12} /> Print
          </button>
          <button onClick={handleDownload} className="flex flex-1 items-center justify-center gap-1 rounded-xl border border-stone-200 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 transition">
            <Download size={12} /> Save
          </button>
        </div>
      )}
    </div>
  );
}

// ── QR Tab ────────────────────────────────────────────────────────────────────
function QrTab({
  initialPasswordSet, initialQrSaved, onQrSaved, onPasswordSet, companyName,
}: {
  initialPasswordSet: boolean; initialQrSaved: string | null;
  onQrSaved: (qr: string) => void; onPasswordSet: () => void; companyName: string;
}) {
  const [qrSaved, setQrSaved]               = useState<string | null>(initialQrSaved);
  const [passwordSet, setPasswordSet]       = useState(initialPasswordSet);
  const [changing, setChanging]             = useState(!initialPasswordSet);
  const [pw, setPw]                         = useState("");
  const [pwVisible, setPwVisible]           = useState(false);
  const [savedPwVisible, setSavedPwVisible] = useState(false);
  const [savedPwText, setSavedPwText]       = useState<string | null>(null);
  const [savedPwLoading, setSavedPwLoading] = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [err, setErr]                       = useState("");
  const [ok, setOk]                         = useState(false);
  const [offices, setOffices]               = useState<Office[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQrSaved(initialQrSaved); }, [initialQrSaved]);
  useEffect(() => { setPasswordSet(initialPasswordSet); if (!initialPasswordSet) setChanging(true); }, [initialPasswordSet]);

  // Load offices for per-office QR
  useEffect(() => {
    apiClient.get("/offices").then(res => {
      if (res.data?.success) setOffices((res.data.data as Office[]) ?? []);
    }).catch(() => {});
  }, []);

  // Silently pre-load the saved password so per-office QRs auto-render
  // without requiring the admin to click the eye icon first
  useEffect(() => {
    if (!passwordSet || savedPwText) return;
    apiClient.get("/admin/settings/qr-password")
      .then(res => {
        if (res.data?.success) {
          setSavedPwText((res.data.data as any)?.password ?? null);
        }
      })
      .catch(() => {});
  }, [passwordSet, savedPwText]);

  const handleToggleSavedPw = async () => {
    if (savedPwVisible) { setSavedPwVisible(false); return; }
    if (savedPwText) { setSavedPwVisible(true); return; }
    setSavedPwLoading(true);
    try {
      const res = await apiClient.get("/admin/settings/qr-password");
      if (res.data?.success) { setSavedPwText((res.data.data as any)?.password ?? "••••••••"); setSavedPwVisible(true); }
    } catch { setSavedPwText("(unavailable)"); setSavedPwVisible(true); }
    finally { setSavedPwLoading(false); }
  };

  const handleSave = async () => {
    if (!pw.trim()) return;
    setSaving(true); setErr(""); setOk(false);
    try {
      const res = await apiClient.post("/admin/settings/set-qr-password", { password: pw.trim() });
      if (res.data.success) {
        const qr = (res.data.data as any)?.qrCode ?? null;
        setQrSaved(qr); if (qr) onQrSaved(qr);
        setPasswordSet(true); onPasswordSet(); setChanging(false); setPw("");
        setSavedPwText(null); setSavedPwVisible(false);
        setOk(true); setTimeout(() => setOk(false), 3000);
      }
    } catch (e: any) { setErr(e?.error || "Failed to save."); }
    finally { setSaving(false); }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const win = window.open("", "_blank", "width=520,height=640");
    if (!win) return;
    win.document.write(`<html><head><title>Attendance QR</title>
      <style>body{font-family:sans-serif;display:flex;flex-direction:column;align-items:center;
      justify-content:center;min-height:100vh;margin:0;background:#fff;}
      img{width:320px;height:320px;}h2{font-size:20px;font-weight:900;margin:16px 0 4px;color:#0f172a;}
      p{font-size:12px;color:#64748b;margin:0;}</style></head><body>
      ${printRef.current.innerHTML}
      <script>window.onload=()=>{window.print();window.close();};<\/script></body></html>`);
    win.document.close();
  };

  const handleDownload = () => {
    if (!qrSaved) return;
    const a = document.createElement("a"); a.href = qrSaved;
    a.download = `attendance-qr-${(companyName || "alyah").toLowerCase().replace(/\s+/g, "-")}.svg`; a.click();
  };

  // Get current saved password text for per-office QR generation
  const savedPw = savedPwText ?? "";

  return (
    <div className="space-y-8">
      {/* ── Password + default QR ── */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Left: password panel */}
        <div className="space-y-3 lg:w-64 shrink-0">
          <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-stone-400">Active Password</p>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-mono font-bold text-stone-800 dark:text-slate-100 truncate">
                {passwordSet ? (savedPwVisible && savedPwText ? savedPwText : "••••••••") : <span className="font-normal text-stone-400">Not set</span>}
              </span>
              {passwordSet && (
                <button onClick={handleToggleSavedPw} disabled={savedPwLoading} className="shrink-0 text-stone-400 hover:text-stone-700 transition">
                  {savedPwLoading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-stone-400 border-t-transparent" /> : savedPwVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              )}
            </div>
          </div>
          {!changing ? (
            <button onClick={() => { setChanging(true); setPw(""); setErr(""); }}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl bg-stone-900 py-2 text-xs font-semibold text-white hover:bg-stone-700 dark:bg-blue-700 dark:hover:bg-blue-600 transition">
              <Pencil size={12} /> Change Password
            </button>
          ) : passwordSet && (
            <button onClick={() => { setChanging(false); setPw(""); setErr(""); }}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-2xl border border-stone-200 py-2 text-xs font-semibold text-stone-500 hover:bg-stone-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 transition">
              <X size={12} /> Cancel
            </button>
          )}
          {changing && (
            <div className="space-y-2">
              <div className="relative">
                <input type={pwVisible ? "text" : "password"} value={pw}
                  onChange={e => setPw(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSave()}
                  placeholder="New password…" autoFocus autoComplete="new-password"
                  className={`${inputCls} pr-10 text-sm`} />
                <button type="button" onClick={() => setPwVisible(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 transition">
                  {pwVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {err && <p className="flex items-center gap-1 text-xs text-rose-600"><AlertCircle size={11} />{err}</p>}
              <button onClick={handleSave} disabled={saving || !pw.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 py-2.5 text-sm font-semibold text-white hover:bg-stone-700 disabled:opacity-50 dark:bg-blue-700 dark:hover:bg-blue-600 transition">
                {saving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Save size={13} />}
                {saving ? "Saving…" : "Save & Generate"}
              </button>
            </div>
          )}
          {ok && (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
              <CheckCircle size={13} /> QR updated. Old QR is now invalid.
            </div>
          )}
          {qrSaved && (
            <div className="flex gap-2 pt-1">
              <button onClick={handlePrint} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 transition">
                <Printer size={13} /> Print
              </button>
              <button onClick={handleDownload} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 transition">
                <Download size={13} /> Download
              </button>
            </div>
          )}
        </div>
        {/* Right: default QR */}
        <div className="flex flex-1 justify-center">
          {qrSaved ? (
            <div ref={printRef} className="flex flex-col items-center rounded-3xl border border-stone-200 bg-white px-8 py-8 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <img src={qrSaved} alt="Attendance QR" className="h-72 w-72 rounded-2xl" />
              <p className="mt-5 text-lg font-black tracking-tight text-stone-900 dark:text-white">{companyName || "Alyah Technologies"}</p>
              <p className="mt-0.5 text-xs text-stone-400">Scan with the mobile app to check in</p>
            </div>
          ) : (
            <div className="flex h-72 w-72 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-stone-200 bg-stone-50 text-stone-300 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-600">
              <QrCode size={52} />
              <p className="mt-3 text-sm font-medium">No QR generated yet</p>
              <p className="mt-1 text-xs opacity-70">Set a password to generate</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Per-office QR codes ── */}
      {offices.length > 0 && passwordSet && (
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Building2 size={16} className="text-stone-500" />
            <h3 className="text-sm font-black uppercase tracking-wider text-stone-600 dark:text-slate-400">Per-Office QR Codes</h3>
            <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-500 dark:bg-slate-800 dark:text-slate-400">{offices.length}</span>
          </div>
          {/* Explain the per-office uniqueness */}
          <div className="mb-4 flex items-start gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 dark:border-blue-900/40 dark:bg-blue-950/20">
            <div className="mt-0.5 h-4 w-4 shrink-0 rounded-full bg-blue-500 flex items-center justify-center">
              <span className="text-[9px] font-black text-white">i</span>
            </div>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              <strong>Each office has a unique, cryptographically isolated QR code.</strong> One password controls all, but Office A's QR cannot be used to check in at Office B. Changing the password invalidates all offices at once.
            </p>
          </div>
          {savedPw ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {offices.map(o => (
                <OfficeQrCard key={o.id} office={o} password={savedPw} companyName={companyName} />
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-5 py-4 text-sm text-stone-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-stone-600 dark:border-slate-600 dark:border-t-slate-400" />
              Loading office QR codes…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main SystemSettings ───────────────────────────────────────────────────────
export const SystemSettings = () => {
  const [s, setS]         = useState<Settings>(DEFAULT);
  const [saved, setSaved] = useState<Settings>(DEFAULT); // last-saved snapshot
  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [toast,   setToast]     = useState<{ msg: string; ok: boolean } | null>(null);
  const [tab, setTab]           = useState<"qr" | "branding">("qr");
  const [qrSaved, setQrSaved]               = useState<string | null>(null);
  const [qrPasswordIsSet, setQrPasswordIsSet] = useState(false);
  const [logoPreview, setLogoPreview]         = useState<string>("");
  const [uploadingLogo, setUploadingLogo]     = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Track dirty state
  const isDirty = JSON.stringify(s) !== JSON.stringify(saved);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    window.setTimeout(() => setToast(null), 3500);
  };

  // Live-apply color to CSS var so sidebar updates immediately while typing
  useEffect(() => {
    if (s.primaryColor && /^#[0-9a-fA-F]{6}$/.test(s.primaryColor)) {
      document.documentElement.style.setProperty("--brand-primary", s.primaryColor);
    }
  }, [s.primaryColor]);

  // Live-apply logo preview
  useEffect(() => {
    setLogoPreview(s.logoUrl || "");
  }, [s.logoUrl]);

  // Warn on browser navigation if dirty
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get("/admin/settings");
      if (res.data.success) {
        const d = res.data.data as Partial<Settings>;
        const merged = { ...DEFAULT, ...d };
        setS(merged);
        setSaved(merged);
        setLogoPreview((merged as any).logoUrl || "");
        const pwSet = !!(d as any).qrAttendancePasswordSet;
        setQrPasswordIsSet(pwSet);
        if (pwSet) {
          try {
            const pwRes = await apiClient.get("/admin/settings/qr-password");
            if (pwRes.data?.success) {
              const plain = (pwRes.data.data as any)?.password;
              if (plain) {
                const qrRes = await apiClient.get(`/admin/settings/preview-qr?password=${encodeURIComponent(plain)}`);
                if (qrRes.data?.success) setQrSaved((qrRes.data.data as any)?.qrCode ?? null);
              }
            }
          } catch { /* silent */ }
        }
      }
    } catch { showToast("Failed to load settings", false); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Handle logo file upload — converts to base64 data URL for immediate preview,
  // then uploads to server and stores the resulting URL
  const handleLogoFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Validate type
    if (!file.type.startsWith("image/")) { showToast("Please select an image file", false); return; }
    if (file.size > 2 * 1024 * 1024) { showToast("Logo must be under 2MB", false); return; }

    setUploadingLogo(true);
    // Show local preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setLogoPreview(dataUrl);
      // Store data URL as logoUrl so it works offline / without a CDN
      // In production you'd upload to S3/CDN and store the returned URL instead
      setS(p => ({ ...p, logoUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
    setUploadingLogo(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put("/admin/settings", {
        companyName: s.companyName,
        logoUrl: s.logoUrl,
        primaryColor: s.primaryColor,
        qrEnabled: s.qrEnabled,
        qrExpirySeconds: s.qrExpirySeconds,
      });
      setSaved({ ...s }); // clear dirty flag
      window.dispatchEvent(new Event("branding:refresh"));
      showToast("Settings saved", true);
      // Regenerate QR with new branding if password exists
      if (qrPasswordIsSet) {
        try {
          const pwRes = await apiClient.get("/admin/settings/qr-password");
          if (pwRes.data?.success) {
            const plain = (pwRes.data.data as any)?.password;
            if (plain) {
              const qrRes = await apiClient.get(`/admin/settings/preview-qr?password=${encodeURIComponent(plain)}`);
              if (qrRes.data?.success) {
                const freshQr = (qrRes.data.data as any)?.qrCode ?? null;
                if (freshQr) setQrSaved(freshQr);
              }
            }
          }
        } catch { /* non-critical */ }
      }
    } catch { showToast("Failed to save settings", false); }
    finally { setSaving(false); }
  };

  // Intercept tab navigation when dirty
  const handleTabChange = (newTab: "qr" | "branding") => {
    if (isDirty && newTab !== tab) {
      const ok = window.confirm("You have unsaved changes. Discard them?");
      if (!ok) return;
      setS({ ...saved }); // revert
    }
    setTab(newTab);
  };

  const tabs = useMemo(() => [
    { id: "qr",       label: "QR Codes", icon: <QrCode size={15} /> },
    { id: "branding", label: "Branding",  icon: <Palette size={15} /> },
  ] as const, []);

  if (loading) {
    return <div className="flex h-72 items-center justify-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
    </div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-[28px] border border-stone-200 bg-gradient-to-br from-stone-50 via-white to-emerald-50 p-6 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-stone-500 dark:bg-slate-900 dark:text-slate-400">
              <Sparkles size={12} /> Admin Control Center
            </div>
            <h1 className="text-3xl font-black tracking-tight text-stone-900 dark:text-white">System Settings</h1>
          </div>
          <div className="flex items-center gap-3">
            {isDirty && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                Unsaved changes
              </span>
            )}
            <button onClick={handleSave} disabled={saving}
              className="inline-flex items-center gap-2 rounded-2xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-60 dark:bg-blue-700 dark:hover:bg-blue-600">
              <Save size={16} />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium ${
          toast.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                   : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
        }`}>
          {toast.ok ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Tab panel */}
      <div className="rounded-[28px] border border-stone-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="border-b border-stone-200 p-3 dark:border-slate-800">
          <nav className="flex flex-wrap gap-2">
            {tabs.map(t => (
              <button key={t.id} onClick={() => handleTabChange(t.id)}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                  tab === t.id ? "bg-stone-900 text-white dark:bg-blue-700"
                               : "bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}>
                {t.icon}{t.label}
                {t.id === "branding" && isDirty && (
                  <span className="ml-1 h-1.5 w-1.5 rounded-full bg-amber-400" />
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {tab === "qr" && (
            <QrTab initialPasswordSet={qrPasswordIsSet} initialQrSaved={qrSaved}
              onQrSaved={qr => setQrSaved(qr)} onPasswordSet={() => setQrPasswordIsSet(true)}
              companyName={s.companyName} />
          )}

          {tab === "branding" && (
            <div className="space-y-6 max-w-xl">
              <Field label="Company Name">
                <input type="text" value={s.companyName}
                  onChange={e => setS(p => ({ ...p, companyName: e.target.value }))}
                  placeholder="Alyah Technologies" className={inputCls} />
              </Field>

              <Field label="Logo">
                <div className="space-y-3">
                  {/* URL input */}
                  <input type="url" value={s.logoUrl.startsWith("data:") ? "" : s.logoUrl}
                    onChange={e => setS(p => ({ ...p, logoUrl: e.target.value }))}
                    placeholder="https://cdn.example.com/logo.png" className={inputCls} />
                  {/* Divider */}
                  <div className="flex items-center gap-3">
                    <div className="h-px flex-1 bg-stone-200 dark:bg-slate-700" />
                    <span className="text-xs text-stone-400">or upload a file</span>
                    <div className="h-px flex-1 bg-stone-200 dark:bg-slate-700" />
                  </div>
                  {/* File upload */}
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoFile} />
                  <button onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingLogo}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-200 bg-stone-50 py-3 text-sm font-semibold text-stone-500 transition hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-blue-500 dark:hover:text-blue-400">
                    <Upload size={16} />
                    {uploadingLogo ? "Uploading…" : "Click to upload PNG / JPG / SVG"}
                  </button>
                  {/* Preview */}
                  {logoPreview && (
                    <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                      <img src={logoPreview} alt="Logo preview"
                        className="h-14 w-14 rounded-xl bg-stone-50 object-contain p-1 shadow-sm dark:bg-slate-800" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-stone-700 dark:text-white truncate">
                          {s.companyName || "Company Name"}
                        </p>
                        <p className="text-xs text-stone-400">Logo preview</p>
                      </div>
                      <button onClick={() => { setS(p => ({ ...p, logoUrl: "" })); setLogoPreview(""); }}
                        className="p-1.5 rounded-lg text-stone-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </Field>

              <Field label="Primary Color">
                <div className="flex items-center gap-3">
                  <input type="color" value={s.primaryColor}
                    onChange={e => setS(p => ({ ...p, primaryColor: e.target.value }))}
                    className="h-12 w-16 cursor-pointer rounded-2xl border border-stone-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900" />
                  <input type="text" value={s.primaryColor}
                    onChange={e => setS(p => ({ ...p, primaryColor: e.target.value }))}
                    placeholder="#1F2937" className={`${inputCls} flex-1 font-mono`} />
                  {/* Live preview swatch */}
                  <div className="h-12 w-12 shrink-0 rounded-2xl border border-stone-200 shadow-sm dark:border-slate-700 transition-colors"
                    style={{ backgroundColor: s.primaryColor }} />
                </div>
                <p className="mt-2 text-xs text-stone-400 dark:text-slate-500">
                  Live preview — sidebar colors update as you type. Changes apply to all users after Save.
                </p>
              </Field>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-slate-400">
        {label}
      </label>
      {children}
    </div>
  );
}
