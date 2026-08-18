import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import apiClient from '../../api/client';
import { Eye, EyeOff, ArrowLeft, CheckCircle, AlertCircle, Lock, XCircle, Smartphone } from 'lucide-react';

type ResetTokenInfo = {
  email?: string;
  firstName?: string;
  expiresAt?: string;
};

// Detect if the user is on a mobile browser (not the app)
function isMobileBrowser() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export const ResetPassword = () => {
  const [searchParams]  = useSearchParams();
  const navigate        = useNavigate();
  const token           = searchParams.get('token') || '';

  const [tokenValid, setTokenValid]   = useState<boolean | null>(null);
  const [tokenEmail, setTokenEmail]   = useState('');
  const [tokenFirst, setTokenFirst]   = useState('');
  const [tokenExpiry, setTokenExpiry] = useState('');
  const [onMobile, setOnMobile]       = useState(false);

  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showNew, setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState('');
  const [appOpened, setAppOpened] = useState(false);

  useEffect(() => {
    setOnMobile(isMobileBrowser());

    if (!token) { setTokenValid(false); return; }
    apiClient.get<ResetTokenInfo>(`/auth/validate-reset-token?token=${encodeURIComponent(token)}`)
      .then(({ data: r }) => {
        if (r.success && r.data) {
          setTokenValid(true);
          setTokenEmail(r.data.email ?? '');
          setTokenFirst(r.data.firstName ?? '');
          setTokenExpiry(r.data.expiresAt ?? '');
        } else {
          setTokenValid(false);
        }
      })
      .catch(() => setTokenValid(false));
  }, [token]);

  // Try to open the Alyah app via deep link
  const handleOpenInApp = () => {
    const deepLink = `alyah://reset-password?token=${encodeURIComponent(token)}`;
    window.location.href = deepLink;
    setAppOpened(true);
    // After 2.5s, if still on this page, the app wasn't installed — show fallback
    // (user stays on the web page and can reset from here)
  };

  const strength = (() => {
    let s = 0;
    if (newPw.length >= 8)         s++;
    if (/[A-Z]/.test(newPw))       s++;
    if (/[0-9]/.test(newPw))       s++;
    if (/[^A-Za-z0-9]/.test(newPw)) s++;
    return s;
  })();
  const strengthLabels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const strengthColors = ['', 'bg-red-500', 'bg-yellow-500', 'bg-blue-500', 'bg-emerald-500'];
  const strengthTexts  = ['', 'text-red-400', 'text-yellow-400', 'text-blue-400', 'text-emerald-400'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPw.length < 8)      { setError('Password must be at least 8 characters'); return; }
    if (newPw !== confirmPw)   { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      await apiClient.post(`/auth/reset-password`, { token, newPassword: newPw });
      setDone(true);
      setTimeout(() => navigate('/login'), 4000);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.error || 'Failed to reset password. The link may have expired.';
      setError(msg);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex bg-[#06070f]">
      {/* Left panel */}
      <div className="hidden lg:flex flex-col justify-between w-[520px] shrink-0 relative overflow-hidden px-14 py-16"
        style={{ background: 'linear-gradient(145deg, #0f0a2e 0%, #160d3f 40%, #0d1940 80%, #06070f 100%)' }}>
        <div className="pointer-events-none absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.20) 0%, transparent 65%)' }} />
        <div className="pointer-events-none absolute -bottom-40 -right-20 w-[400px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.18) 0%, transparent 65%)' }} />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white text-lg"
            style={{ background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)' }}>A</div>
          <div>
            <p className="font-black text-white text-lg leading-none tracking-wide">ALYAH</p>
            <p className="text-[10px] text-accent-300/70 tracking-[0.2em] uppercase mt-0.5">Pro</p>
          </div>
        </div>

        <div className="relative z-10 space-y-4">
          <h1 className="text-5xl font-black text-white leading-[1.1] tracking-tight">
            Secure<br />
            <span style={{ background: 'linear-gradient(90deg, #a78bfa 0%, #60a5fa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Password
            </span><br />
            Reset
          </h1>
          <p className="text-gray-400 text-base leading-relaxed max-w-xs">
            Choose a strong, unique password to keep your account secure.
          </p>
        </div>

        <p className="relative z-10 text-gray-600 text-xs">© 2026 Alyah Technologies</p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 relative"
        style={{ background: 'linear-gradient(180deg, #0a0b15 0%, #06070f 100%)' }}>
        <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px]"
          style={{ background: 'radial-gradient(ellipse at top, rgba(59,130,246,0.08) 0%, transparent 70%)' }} />

        <div className="relative z-10 w-full max-w-[400px]">

          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-10 lg:hidden">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center overflow-hidden bg-white shrink-0">
              <img src="/logo.png" alt="Alyah" className="w-full h-full object-contain" />
            </div>
            <p className="font-black text-white text-base tracking-wide">Alyah Smart Attendance</p>
          </div>

          {/* Loading */}
          {tokenValid === null && (
            <div className="text-center py-12">
              <div className="w-10 h-10 rounded-full border-2 border-accent-500 border-t-transparent animate-spin mx-auto mb-4" />
              <p className="text-gray-500 text-sm">Validating reset link…</p>
            </div>
          )}

          {/* Invalid token */}
          {tokenValid === false && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
                <AlertCircle size={32} className="text-red-400" />
              </div>
              <h2 className="text-2xl font-black text-white mb-3 tracking-tight">Link Expired</h2>
              <p className="text-gray-500 text-sm mb-8 leading-relaxed">
                This password reset link is invalid or has expired. Reset links are valid for 1 hour and can only be used once.
              </p>
              <Link to="/forgot-password"
                className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-bold text-white text-sm mb-4 block transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(90deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)', boxShadow: '0 0 24px rgba(59,130,246,0.30)' }}>
                Request New Link
              </Link>
              <Link to="/login" className="text-gray-600 hover:text-gray-400 text-sm transition-colors">
                Back to Sign In
              </Link>
            </div>
          )}

          {/* Reset form */}
          {tokenValid === true && !done && (
            <>
              <Link to="/login" className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-300 text-sm mb-8 transition-colors">
                <ArrowLeft size={14} /> Back to Sign In
              </Link>

              <div className="mb-6">
                <h2 className="text-3xl font-black text-white tracking-tight">Reset password</h2>
                {tokenFirst && (
                  <p className="text-gray-500 text-sm mt-1.5">
                    Hi <span className="text-gray-300 font-semibold">{tokenFirst}</span> — choose a new password for{' '}
                    <span className="text-accent-400">{tokenEmail}</span>
                  </p>
                )}
                {tokenExpiry && (
                  <p className="text-xs text-amber-400/80 mt-1.5 flex items-center gap-1.5">
                    <span>⏱</span> Expires at {new Date(tokenExpiry).toLocaleTimeString()}
                  </p>
                )}
              </div>

              {/* Mobile banner — shown when user opened web link on a phone */}
              {onMobile && (
                <div className="mb-5 rounded-xl border border-blue-500/30 overflow-hidden"
                  style={{ background: 'rgba(59,130,246,0.08)' }}>
                  <div className="px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      <Smartphone size={18} className="text-blue-400 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-blue-300 mb-1">You're on a mobile device</p>
                        <p className="text-xs text-gray-400 leading-relaxed mb-3">
                          If you have the Alyah app installed, tap below to reset inside the app.
                          Otherwise, continue here in the browser.
                        </p>
                        <button
                          type="button"
                          onClick={handleOpenInApp}
                          className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-white transition-all hover:opacity-90 active:scale-95"
                          style={{ background: 'linear-gradient(90deg,#3B82F6,#2563EB)' }}
                        >
                          <Smartphone size={13} />
                          Open in Alyah App
                        </button>
                        {appOpened && (
                          <p className="text-xs text-gray-500 mt-2 italic">
                            If the app didn't open, continue resetting below in your browser.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="px-4 py-2 border-t border-blue-500/20"
                    style={{ background: 'rgba(59,130,246,0.04)' }}>
                    <p className="text-xs text-gray-500">Or reset password below in your browser ↓</p>
                  </div>
                </div>
              )}

              {error && (
                <div className="mb-5 flex items-start gap-3 px-4 py-3.5 rounded-xl text-sm"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                  <span className="text-red-300">{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                {/* New password */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest">
                    New Password
                  </label>
                  <div className="relative group">
                    <Lock size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-accent-400 transition-colors pointer-events-none z-10" />
                    <input type={showNew ? 'text' : 'password'} value={newPw}
                      onChange={e => setNewPw(e.target.value)} required
                      placeholder="Min 8 characters"
                      className={`w-full h-11 pl-11 pr-16 rounded-xl text-sm text-white placeholder-gray-600 outline-none transition-all border focus:ring-2 ${
                        !newPw ? 'border-white/10 focus:ring-accent-500/25'
                        : newPw.length >= 8 ? 'border-emerald-500/60 focus:ring-emerald-500/20'
                        : 'border-red-500/60 focus:ring-red-500/20'
                      }`}
                      style={{ background: 'rgba(255,255,255,0.04)' }} />
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                      <button type="button" onClick={() => setShowNew(!showNew)}
                        className="text-gray-500 hover:text-gray-300 transition-colors p-0.5">
                        {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                      {newPw && (newPw.length >= 8
                        ? <CheckCircle size={15} className="text-emerald-400" />
                        : <XCircle size={15} className="text-red-400" />)}
                    </div>
                  </div>
                  {/* Strength bar */}
                  {newPw && (
                    <div className="space-y-1 pt-1">
                      <div className="flex gap-1">
                        {[1,2,3,4].map(i => (
                          <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= strength ? strengthColors[strength] : 'bg-white/10'}`} />
                        ))}
                      </div>
                      <p className={`text-xs font-semibold ${strengthTexts[strength]}`}>{strengthLabels[strength]}</p>
                    </div>
                  )}
                </div>

                {/* Confirm password */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest">
                    Confirm Password
                  </label>
                  <div className="relative group">
                    <Lock size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-accent-400 transition-colors pointer-events-none z-10" />
                    <input type={showConfirm ? 'text' : 'password'} value={confirmPw}
                      onChange={e => setConfirmPw(e.target.value)} required
                      placeholder="Repeat new password"
                      className={`w-full h-11 pl-11 pr-16 rounded-xl text-sm text-white placeholder-gray-600 outline-none transition-all border focus:ring-2 ${
                        !confirmPw ? 'border-white/10 focus:ring-accent-500/25'
                        : confirmPw === newPw ? 'border-emerald-500/60 focus:ring-emerald-500/20'
                        : 'border-red-500/60 focus:ring-red-500/20'
                      }`}
                      style={{ background: 'rgba(255,255,255,0.04)' }} />
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                      <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                        className="text-gray-500 hover:text-gray-300 transition-colors p-0.5">
                        {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                      {confirmPw && (confirmPw === newPw
                        ? <CheckCircle size={15} className="text-emerald-400" />
                        : <XCircle size={15} className="text-red-400" />)}
                    </div>
                  </div>
                  {confirmPw && newPw !== confirmPw && (
                    <p className="text-xs text-red-400 font-medium pl-1">Passwords do not match</p>
                  )}
                  {confirmPw && confirmPw === newPw && newPw.length >= 8 && (
                    <p className="text-xs text-emerald-400 font-medium pl-1">✓ Passwords match</p>
                  )}
                </div>

                <button type="submit" disabled={loading}
                  className="relative w-full h-12 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 transition-all overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed group"
                  style={{ background: 'linear-gradient(90deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)', boxShadow: '0 0 30px rgba(59,130,246,0.35)' }}>
                  <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)' }} />
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Resetting…
                    </>
                  ) : 'Reset Password'}
                </button>
              </form>

              <p className="text-center text-xs text-gray-600 mt-5">
                All active sessions will be terminated after reset.
              </p>
            </>
          )}

          {/* Success */}
          {done && (
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
                style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <CheckCircle size={32} className="text-emerald-400" />
              </div>
              <h2 className="text-2xl font-black text-white mb-3 tracking-tight">Password Reset!</h2>
              <p className="text-gray-500 text-sm mb-2 leading-relaxed">
                Your password has been updated successfully. All active sessions have been terminated.
              </p>
              <p className="text-xs text-gray-600 mb-8">Redirecting to login in 4 seconds…</p>
              <Link to="/login"
                className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-bold text-white text-sm transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(90deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)', boxShadow: '0 0 24px rgba(59,130,246,0.30)' }}>
                Go to Sign In
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
