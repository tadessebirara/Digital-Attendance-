import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useLang } from '../../context/LanguageContext';
import {
  AlertCircle, Eye, EyeOff, ArrowRight,
  CheckCircle, XCircle, Mail, Lock,
  Sun, Moon, Languages,
  Zap, Shield, BarChart2, MapPin, Calendar,
} from 'lucide-react';
import type { ApiResponse } from '../../api/types';

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

const featureKeys = [
  { icon: Zap,       en: 'feat1' },
  { icon: Shield,    en: 'feat2' },
  { icon: BarChart2, en: 'feat3' },
  { icon: MapPin,    en: 'feat4' },
  { icon: Calendar,  en: 'feat5' },
] as const;

export const Login = () => {
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe]     = useState(() => localStorage.getItem('rememberMe') === 'true');
  const [error, setError]               = useState('');
  const [isLoading, setIsLoading]       = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [pwTouched, setPwTouched]       = useState(false);

  const { login }               = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const { t, toggleLang }       = useLang();
  const navigate                = useNavigate();

  const emailValid = isValidEmail(email);
  const pwValid    = password.length >= 6;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailTouched(true);
    setPwTouched(true);
    if (!emailValid || !pwValid) return;
    setError('');
    setIsLoading(true);
    try {
      const user = await login(email, password);
      if (user) {
        // Persist remember-me preference so next launch pre-checks the box
        localStorage.setItem('rememberMe', String(rememberMe));
        if (user.role === 'ADMIN')   navigate('/admin/dashboard');
        else if (user.role === 'HR') navigate('/hr/dashboard');
        else setError(t('mobileOnly'));
      } else {
        setError(t('invalidCreds'));
      }
    } catch (err: unknown) {
      const apiErr = err as ApiResponse & { code?: string; lockedUntil?: string };
      const code   = apiErr?.code as string | undefined;
      const msg    = typeof apiErr?.error === 'string' ? apiErr.error
        : (err as { message?: string })?.message ?? null;

      // Account locked — show time remaining
      if (code === 'ACCOUNT_LOCKED' || msg?.includes('ACCOUNT_LOCKED')) {
        const until = apiErr?.lockedUntil;
        if (until) {
          const mins = Math.ceil((new Date(until).getTime() - Date.now()) / 60000);
          setError(`Account temporarily locked. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`);
        } else {
          setError('Account temporarily locked. Too many failed attempts. Please try again later.');
        }
      } else if (code === 'ACCOUNT_REJECTED') {
        setError('Your account registration was not approved. Please contact HR.');
      } else if (code === 'PENDING_APPROVAL') {
        setError('Your account is pending HR approval. You will be notified by email.');
      } else if (code === 'PENDING_ACTIVATION') {
        setError('Account not yet activated. Check your email for an activation link.');
      } else if (code === 'EMAIL_NOT_VERIFIED') {
        setError('Please verify your email address before signing in.');
      } else if (
        !msg ||
        msg.toLowerCase().includes('network') ||
        msg.includes('ERR_CONNECTION_REFUSED') ||
        msg.includes('timeout') ||
        msg.includes('ECONNREFUSED')
      ) {
        setError(t('noServer'));
      } else {
        setError(msg || t('invalidCreds'));
      }
    }
    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] dark:bg-[#06070f] transition-colors duration-300 overflow-hidden select-none relative">

      {/* ── Left panel — branding ─────────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-center relative overflow-hidden shrink-0 w-[45%]">
        {/* bg */}
        <div className="absolute inset-0 bg-white dark:bg-[#0d0e1a]" />

        {/* Decorative gradients */}
        <div className="pointer-events-none absolute top-0 right-0 w-1/2 h-full"
          style={{ background: 'radial-gradient(ellipse at top right,rgba(59,130,246,.06) 0%,transparent 70%)' }} />
        <div className="pointer-events-none absolute bottom-0 left-0 w-1/2 h-full"
          style={{ background: 'radial-gradient(ellipse at bottom left,rgba(13,27,42,.05) 0%,transparent 70%)' }} />
        {/* Subtle glow behind hero */}
        <div className="pointer-events-none absolute top-1/4 left-1/4 w-1/2 h-1/2"
          style={{ background: 'radial-gradient(circle,rgba(59,130,246,.04) 0%,transparent 60%)' }} />

        {/* Content */}
        <div className="relative z-10 pl-[64px] pr-8 pt-[104px] pb-[64px] max-w-[460px] flex flex-col justify-center">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <div className="w-[56px] h-[56px] rounded-xl flex items-center justify-center shrink-0 overflow-hidden
              bg-accent-50 dark:bg-white/5 border border-accent-100 dark:border-white/10">
              <img src="/logo.png" alt="Alyah Smart Attendance" className="w-10 h-10 object-contain" />
            </div>
            <div>
              <p className="font-bold text-gray-900 dark:text-white text-[24px] leading-none tracking-wide">{t('appName')}</p>
              <p className="text-[12px] text-accent-500 dark:text-accent-400/70 uppercase tracking-[2px] mt-1">Enterprise</p>
            </div>
          </div>

          {/* Hero */}
          <h1 className="text-[60px] font-extrabold text-gray-900 dark:text-white leading-[1.05] tracking-[-2px] mb-10">
            {t('heroLine1')}<br />
            {t('heroLine2')}<br />
            <span style={{ background:'linear-gradient(90deg,#3B82F6 0%,#0D1B2A 100%)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent' }}>
              {t('heroLine3')}
            </span><br />
            {t('heroLine4')}
          </h1>

          <p className="text-[18px] font-normal text-[#64748B] dark:text-gray-400 leading-[1.75] max-w-[420px] mb-10">
            Real-time attendance tracking, intelligent scheduling, employee insights, and enterprise reporting — all in one powerful platform.
          </p>

          {/* Feature pills — 2-col equal grid */}
          <div className="grid grid-cols-2 gap-4">
            {featureKeys.map(({ icon: Icon, en: key }) => (
              <span key={key}
                className="flex items-center gap-3 px-[18px] h-[50px] rounded-[14px] text-[15px] font-medium
                  text-gray-700 dark:text-gray-300
                  bg-white border border-[#E5E7EB] dark:border-white/[0.08]
                  hover:bg-[#F8FAFF] hover:shadow-[0_4px_12px_rgba(15,23,42,.06)]
                  transition-all duration-250">
                <Icon size={18} className="text-accent-500 shrink-0" />
                <span className="truncate">{t(key)}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="relative z-10 pl-[64px] pr-8 pb-[64px] text-[14px] text-[#94A3B8] dark:text-gray-600">
          {t('copyright')}
        </p>
      </div>

      {/* ── Divider ─────────────────────────────────────── */}
      <div className="hidden lg:block w-[1px] shrink-0 bg-[rgba(15,23,42,.05)] dark:bg-white/[0.05]" />

      {/* ── Right panel — form ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 w-[55%] relative lg:w-auto">
        {/* Subtle glow behind login card */}
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px]"
          style={{ background: 'radial-gradient(circle,rgba(59,130,246,.04) 0%,transparent 60%)' }} />

        {/* Top bar */}
        <div className="flex items-center justify-end gap-3 px-6 pt-6">
          <div className="flex-1" /> {/* Spacer to push buttons to right */}
          <div className="flex items-center gap-3">

          {/* Language toggle — single click */}
          <button type="button" onClick={toggleLang}
            title={t('langLabel')}
            className="flex items-center gap-2 px-[18px] h-[40px] rounded-full text-[15px] font-semibold transition-all duration-250
              bg-white dark:bg-[#0F1929]
              text-gray-700 dark:text-gray-300
              border border-[#E5E7EB] dark:border-white/[0.08]
              hover:bg-[#F8FAFC] dark:hover:bg-white/[0.06]
              shadow-sm">
            <Languages size={18} className="text-accent-500 shrink-0" />
            {t('langLabel')}
          </button>

          {/* Theme toggle — single click */}
          <button type="button" onClick={toggleTheme}
            title={isDark ? t('dayLight') : t('night')}
            className="flex items-center gap-2 px-[18px] h-[40px] rounded-full text-[15px] font-semibold transition-all duration-250
              bg-white dark:bg-[#0F1929]
              text-gray-700 dark:text-gray-300
              border border-[#E5E7EB] dark:border-white/[0.08]
              hover:bg-[#F8FAFC] dark:hover:bg-white/[0.06]
              shadow-sm">
            {isDark
              ? <><Moon size={18} className="text-accent-400" />{t('dayLight')}</>
              : <><Sun  size={18} className="text-amber-400"  />{t('night')}</>}
          </button>
          </div>
        </div>

        {/* Form area */}
        <div className="flex-1 flex items-center justify-center px-6 py-8 -mt-8">
          <div className="w-full max-w-[520px]">

            {/* Mobile logo */}
            <div className="flex items-center gap-3 mb-8 lg:hidden">
              <div className="w-[56px] h-[56px] rounded-xl overflow-hidden bg-accent-50 dark:bg-white/5
                border border-accent-100 dark:border-white/10 flex items-center justify-center">
                <img src="/logo.png" alt="Alyah Smart Attendance" className="w-10 h-10 object-contain" />
              </div>
              <div>
                <p className="font-bold text-gray-900 dark:text-white text-[24px] leading-none tracking-wide">{t('appName')}</p>
                <p className="text-[12px] text-accent-500 dark:text-accent-400/70 uppercase tracking-[2px] mt-1">Enterprise</p>
              </div>
            </div>

            {/* Mobile hero */}
            <div className="mb-10 lg:hidden">
              <h1 className="text-[42px] font-extrabold text-gray-900 dark:text-white leading-[1.05] tracking-[-2px] mb-6">
                {t('heroLine1')}<br />
                {t('heroLine2')}<br />
                <span style={{ background:'linear-gradient(90deg,#3B82F6 0%,#0D1B2A 100%)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent' }}>
                  {t('heroLine3')}
                </span><br />
                {t('heroLine4')}
              </h1>
              <p className="text-[16px] font-normal text-[#64748B] dark:text-gray-400 leading-[1.75] mb-8">
                Real-time attendance tracking, intelligent scheduling, employee insights, and enterprise reporting — all in one powerful platform.
              </p>
              {/* Feature pills — single column on mobile */}
              <div className="grid grid-cols-1 gap-3">
                {featureKeys.map(({ icon: Icon, en: key }) => (
                  <span key={key}
                    className="flex items-center gap-3 px-[18px] h-[50px] rounded-[14px] text-[15px] font-medium
                      text-gray-700 dark:text-gray-300
                      bg-white border border-[#E5E7EB] dark:border-white/[0.08]
                      hover:bg-[#F8FAFF] hover:shadow-[0_4px_12px_rgba(15,23,42,.06)]
                      transition-all duration-250">
                    <Icon size={18} className="text-accent-500 shrink-0" />
                    <span className="truncate">{t(key)}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Card */}
            <div className="bg-white dark:bg-[#0d0e1a] rounded-[24px] px-[52px] py-[52px] shadow-[0_20px_60px_rgba(15,23,42,.08)] border border-[rgba(226,232,240,.7)] dark:border-white/[0.06] fade-in">

              {/* Heading */}
              <div className="mb-8">
                <h2 className="text-[40px] font-extrabold text-[#111827] dark:text-white tracking-tight">
                  {t('welcomeBack').split(' ').length > 1 ? (
                    <>
                      {t('welcomeBack').split(' ').slice(0, -1).join(' ')}{' '}
                      <span style={{ background:'linear-gradient(90deg,#3B82F6,#0D1B2A)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent' }}>
                        {t('welcomeBack').split(' ').slice(-1)[0]}
                      </span>
                    </>
                  ) : t('welcomeBack')}
                </h2>
                <p className="text-[18px] text-[#64748B] dark:text-gray-500 mt-3">{t('signInSubtitle')}</p>
              </div>

              {/* Error */}
              {error && (
                <div className="mb-8 flex items-start gap-3 px-4 py-3 rounded-[14px] text-[15px]
                  bg-red-50 dark:bg-red-500/[0.08] border border-red-100 dark:border-red-500/20">
                  <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                  <span className="text-red-600 dark:text-red-300 leading-snug">{error}</span>
                </div>
              )}

              <form onSubmit={e => void handleSubmit(e)} className="space-y-7">

                {/* Email */}
                <div className="space-y-2">
                  <label className="block text-[15px] font-semibold text-[#374151] dark:text-gray-400">
                    {t('emailLabel')}
                  </label>
                  <div className={`relative flex items-center rounded-[14px] border transition-all duration-250
                    bg-white dark:bg-white/[0.04]
                    ${!emailTouched
                      ? 'border-[#D9DCE3] dark:border-white/10 focus-within:border-[#3B82F6] focus-within:shadow-[0_0_0_4px_rgba(59,130,246,.10)]'
                      : emailValid
                        ? 'border-emerald-400 dark:border-emerald-500/60'
                        : 'border-red-400 dark:border-red-500/60'}`}>
                    <Mail size={18} className="absolute left-[20px] text-[#94A3B8] pointer-events-none" />
                    <input
                      type="email" value={email}
                      onChange={e => { setEmail(e.target.value); setEmailTouched(true); }}
                      onBlur={() => setEmailTouched(true)}
                      placeholder={t('emailPlaceholder')}
                      className="w-full h-[60px] pl-[56px] pr-12 rounded-[14px] text-[16px] font-medium outline-none bg-transparent
                        text-[#111827] dark:text-white placeholder-[#94A3B8] dark:placeholder-gray-600 select-text"
                    />
                    {emailTouched && (
                      <span className="absolute right-4">
                        {emailValid
                          ? <CheckCircle size={18} className="text-emerald-500" />
                          : <XCircle    size={18} className="text-red-400" />}
                      </span>
                    )}
                  </div>
                  {emailTouched && !emailValid && (
                    <p className="text-[14px] text-red-500 pl-1">{t('emailInvalid')}</p>
                  )}
                </div>

                {/* Password */}
                <div className="space-y-2">
                  <label className="block text-[15px] font-semibold text-[#374151] dark:text-gray-400">
                    {t('passwordLabel')}
                  </label>
                  <div className={`relative flex items-center rounded-[14px] border transition-all duration-250
                    bg-white dark:bg-white/[0.04]
                    ${!pwTouched
                      ? 'border-[#D9DCE3] dark:border-white/10 focus-within:border-[#3B82F6] focus-within:shadow-[0_0_0_4px_rgba(59,130,246,.10)]'
                      : pwValid
                        ? 'border-emerald-400 dark:border-emerald-500/60'
                        : 'border-red-400 dark:border-red-500/60'}`}>
                    <Lock size={18} className="absolute left-[20px] text-[#94A3B8] pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'} value={password}
                      onChange={e => { setPassword(e.target.value); setPwTouched(true); }}
                      onBlur={() => setPwTouched(true)}
                      placeholder="••••••••"
                      className="w-full h-[60px] pl-[56px] pr-20 rounded-[14px] text-[16px] font-medium outline-none bg-transparent
                        text-[#111827] dark:text-white placeholder-[#94A3B8] dark:placeholder-gray-600 select-text"
                    />
                    <div className="absolute right-4 flex items-center gap-2">
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="text-[#94A3B8] hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1"
                        aria-label={showPassword ? 'Hide' : 'Show'}>
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                      {pwTouched && (pwValid
                        ? <CheckCircle size={18} className="text-emerald-500" />
                        : <XCircle    size={18} className="text-red-400" />)}
                    </div>
                  </div>
                  {pwTouched && !pwValid && (
                    <p className="text-[14px] text-red-500 pl-1">{t('passwordShort')}</p>
                  )}
                </div>

                {/* Remember + Forgot */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-3 cursor-pointer select-none group">
                    <div className="relative w-[18px] h-[18px] rounded border-2 flex items-center justify-center transition-colors duration-250
                      border-gray-300 dark:border-gray-600 group-hover:border-accent-400 bg-white dark:bg-white/5">
                      <input type="checkbox" checked={rememberMe}
                        onChange={e => setRememberMe(e.target.checked)} className="sr-only" />
                      {rememberMe && (
                        <div className="absolute inset-0 rounded bg-accent-500 flex items-center justify-center">
                          <CheckCircle size={12} className="text-white" />
                        </div>
                      )}
                    </div>
                    <span className="text-[15px] font-medium text-gray-500 dark:text-gray-400 group-hover:text-gray-700 transition-colors">
                      {t('rememberMe')}
                    </span>
                  </label>
                  <Link to="/forgot-password"
                    className="text-[15px] font-semibold text-[#3B82F6] dark:text-primary-400 hover:text-primary-500 hover:underline transition-all duration-250">
                    {t('forgotPassword')}
                  </Link>
                </div>

                {/* Submit */}
                <button type="submit" disabled={isLoading}
                  className="relative w-full h-[60px] rounded-[14px] font-semibold text-white text-[16px] flex items-center justify-center gap-2.5 overflow-hidden transition-all duration-250 disabled:opacity-50 group hover:-translate-y-[2px] hover:shadow-[0_14px_35px_rgba(59,130,246,.35)]"
                  style={{ background:'linear-gradient(90deg,#3B82F6 0%,#0D1B2A 100%)', boxShadow:'0 12px 30px rgba(59,130,246,.30)' }}>
                  {isLoading ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>{t('signingIn')}</span>
                    </>
                  ) : (
                    <>
                      <span>{t('signIn')}</span>
                      <ArrowRight size={18} className="group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </button>
              </form>
            </div>
            {/* No footer note — removed per request */}
          </div>
        </div>
      </div>
    </div>
  );
};
