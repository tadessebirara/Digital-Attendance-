import { useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/client';
import { Mail, ArrowLeft, CheckCircle, AlertCircle, XCircle } from 'lucide-react';

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

export const ForgotPassword = () => {
  const [email, setEmail]             = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [sent, setSent]               = useState(false);
  const [error, setError]             = useState('');

  const emailValid = isValidEmail(email);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailTouched(true);
    if (!emailValid) return;
    setError('');
    setLoading(true);
    try {
      await apiClient.post(`/auth/forgot-password`, { email });
      setSent(true);
    } catch {
      setError('Unable to process request. Please try again.');
    } finally {
      setLoading(false);
    }
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
            Account<br />
            <span style={{ background: 'linear-gradient(90deg, #a78bfa 0%, #60a5fa 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Recovery
            </span>
          </h1>
          <p className="text-gray-400 text-base leading-relaxed max-w-xs">
            We'll send a secure reset link to your registered email address.
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

          {!sent ? (
            <>
              <Link to="/login" className="inline-flex items-center gap-2 text-gray-500 hover:text-gray-300 text-sm mb-8 transition-colors">
                <ArrowLeft size={14} /> Back to Sign In
              </Link>

              <div className="mb-8">
                <h2 className="text-3xl font-black text-white tracking-tight">Forgot password?</h2>
                <p className="text-gray-500 text-sm mt-1.5">Enter your email and we'll send a reset link.</p>
              </div>

              {error && (
                <div className="mb-6 flex items-start gap-3 px-4 py-3.5 rounded-xl text-sm"
                  style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)' }}>
                  <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
                  <span className="text-red-300">{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-widest">
                    Email Address
                  </label>
                  <div className="relative group">
                    <Mail size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-accent-400 transition-colors pointer-events-none z-10" />
                    <input type="email" value={email}
                      onChange={e => { setEmail(e.target.value); setEmailTouched(true); }}
                      onBlur={() => setEmailTouched(true)}
                      placeholder="admin@company.com"
                      className={`w-full h-11 pl-11 pr-10 rounded-xl text-sm text-white placeholder-gray-600 outline-none transition-all border focus:ring-2 ${
                        !emailTouched ? 'border-white/10 focus:ring-accent-500/25'
                        : emailValid ? 'border-emerald-500/60 focus:ring-emerald-500/20'
                        : 'border-red-500/60 focus:ring-red-500/20'
                      }`}
                      style={{ background: 'rgba(255,255,255,0.04)' }} />
                    {emailTouched && (
                      <span className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                        {emailValid
                          ? <CheckCircle size={15} className="text-emerald-400" />
                          : <XCircle size={15} className="text-red-400" />}
                      </span>
                    )}
                  </div>
                  {emailTouched && !emailValid && (
                    <p className="text-xs text-red-400 font-medium pl-1">Enter a valid email address</p>
                  )}
                </div>

                <button type="submit" disabled={loading}
                  className="relative w-full h-12 rounded-xl font-bold text-white text-sm flex items-center justify-center gap-2 transition-all overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed group"
                  style={{ background: 'linear-gradient(90deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)', boxShadow: '0 0 30px rgba(59,130,246,0.35)' }}>
                  <span className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)' }} />
                  {loading ? (
                    <>
                      <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Sending…
                    </>
                  ) : 'Send Reset Link'}
                </button>
              </form>

              <p className="text-center text-xs text-gray-600 mt-6">
                A reset link will be sent to your registered email.
              </p>
            </>
          ) : (
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
                style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.25)' }}>
                <CheckCircle size={32} className="text-emerald-400" />
              </div>
              <h2 className="text-2xl font-black text-white mb-2 tracking-tight">Check Your Email</h2>
              <p className="text-gray-500 text-sm mb-6 leading-relaxed">
                If an account exists for{' '}
                <span className="text-gray-300 font-semibold">{email}</span>
                , a reset link has been sent. It expires in 1 hour.
              </p>
              <div className="px-4 py-3.5 rounded-xl text-xs text-gray-500 mb-8 leading-relaxed"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                Didn't receive it? Check your spam folder or wait a few minutes.
              </div>
              <Link to="/login"
                className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-bold text-white text-sm transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(90deg, #3B82F6 0%, #2563EB 50%, #1D4ED8 100%)', boxShadow: '0 0 24px rgba(59,130,246,0.30)' }}>
                <ArrowLeft size={15} /> Back to Sign In
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
