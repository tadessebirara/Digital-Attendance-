import { Outlet, useLocation, Link, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNotificationStore } from '../../store/useNotificationStore';
import { useTheme } from '../../context/ThemeContext';
import { usePermissions } from '../../context/PermissionsContext';
import { useLang } from '../../context/LanguageContext';
import { useBranding } from '../../context/BrandingContext';
import { toEthiopian, ETH_MONTHS_AM } from '../../utils/ethiopianCalendar';
import {
  LayoutDashboard, Users, FileText, Settings, Bell,
  Calendar, Clock, Search, Sun, Moon, Menu, Shield, BarChart2,
  Megaphone, MessageSquare, UserCog, Link2, BookUser, User,
  ChevronDown, DollarSign, X, Star, Languages, LogOut, Building2,
} from 'lucide-react';

export const Layout = () => {
  const { user, logout }       = useAuth();
  const {
    notifications, unreadCount, chatUnreadCount,
    fetchNotifications, markAsRead, markAllAsRead, initSocketListeners,
  }                             = useNotificationStore();
  const { isDark, toggleTheme } = useTheme();
  const { hasPermission, isAdmin } = usePermissions();
  const { t, toggleLang } = useLang();
  const location                = useLocation();
  const navigate                = useNavigate();

  const [sidebarW, setSidebarW]   = useState(220);
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
  const [mobileOpen, setMobileOpen]   = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifOpen, setNotifOpen]     = useState(false);

  const dragging   = useRef(false);
  const startX     = useRef(0);
  const startW     = useRef(0);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef   = useRef<HTMLDivElement>(null);

  const MIN_W  = 72;
  const MAX_W  = 260;
  const SNAP_W = 100;
  const isCollapsed = sidebarW <= SNAP_W;
  const basePath    = location.pathname.split('/')[1];

  useEffect(() => { fetchNotifications(); initSocketListeners(); }, [fetchNotifications, initSocketListeners]);
  useEffect(() => {
    const h = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (notifRef.current   && !notifRef.current.contains(e.target as Node))   setNotifOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const onMouseDownHandle = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current   = e.clientX;
    startW.current   = sidebarW;
    document.body.style.cursor = 'col-resize';
  };
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const next = Math.min(MAX_W, Math.max(MIN_W, startW.current + (e.clientX - startX.current)));
      setSidebarW(next < SNAP_W ? MIN_W : next);
    };
    const onUp = () => { dragging.current = false; document.body.style.cursor = ''; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  const hrLinks = [
    { to: '/hr/dashboard',             icon: LayoutDashboard, label: t('navHome'),          perm: 'attendance.view' },
    { to: '/hr/employee-directory',    icon: BookUser,        label: t('navDirectory'),     perm: 'users.view'      },
    { to: '/hr/people-management',     icon: Users,           label: t('navPeople'),        perm: 'users.view'      },
    { to: '/hr/attendance-monitoring', icon: Clock,           label: t('navAttendance'),    perm: 'attendance.view' },
    { to: '/hr/leave-management',      icon: Calendar,        label: t('navLeaves'),        perm: 'leaves.view'     },
    { to: '/hr/salary',                icon: DollarSign,      label: t('navSalary'),        perm: 'reports.view'    },
    { to: '/hr/penalty-settings',      icon: DollarSign,      label: t('navPenalties'),     perm: 'reports.view'    },
    { to: '/hr/holiday-calendar',      icon: Star,            label: t('navHolidays'),      perm: 'attendance.view' },
    { to: '/hr/announcements',         icon: Megaphone,       label: t('navAnnouncements'), perm: 'announcements.view' },
    { to: '/hr/alerts-notifications',  icon: Bell,            label: t('navAlerts'),        perm: 'attendance.view' },
    { to: '/hr/messages',              icon: MessageSquare,   label: t('navMessages'),      perm: 'attendance.view' },
    { to: '/hr/reports-analytics',     icon: BarChart2,       label: t('navReports'),       perm: 'reports.view'    },
  ];
  const adminLinks = [
    { to: '/admin/dashboard',          icon: LayoutDashboard, label: t('navDashboard'),    perm: 'attendance.view' },
    { to: '/admin/user-management',    icon: Users,           label: t('navUsers'),        perm: 'users.view'      },
    { to: '/admin/people-management',  icon: UserCog,         label: t('navPeople'),       perm: 'users.view'      },
    { to: '/admin/roles-permissions',  icon: UserCog,         label: t('navRoles'),        perm: 'roles.view'      },
    { to: '/admin/reports-analytics',  icon: BarChart2,       label: t('navReports'),      perm: 'reports.view'    },
    { to: '/admin/audit-logs',         icon: FileText,        label: t('navAuditLogs'),    perm: 'audit.view'      },
    { to: '/admin/security-alerts',    icon: Shield,          label: t('navSecurity'),     perm: 'audit.view'      },
    { to: '/admin/office-locations',   icon: Building2,       label: 'Offices',            perm: 'settings.view'   },
    { to: '/admin/system-settings',    icon: Settings,        label: t('navSettings'),     perm: 'settings.view'   },
    { to: '/admin/integrations',       icon: Link2,           label: t('navIntegrations'), perm: 'settings.view'   },
  ];
  const links = (basePath === 'admin' ? adminLinks : hrLinks)
    .filter(l => isAdmin || hasPermission(l.perm));

  const handleNotifClick = async (n: { id: number; isRead?: boolean; category?: string; type?: string }) => {
    if (!n.isRead) await markAsRead(n.id);
    setNotifOpen(false);
    navigate(basePath === 'admin'
      ? (n.category === 'SECURITY' || n.type === 'SECURITY_ALERT' ? '/admin/security-alerts' : '/admin/audit-logs')
      : '/hr/alerts-notifications'
    );
  };

  const initials    = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`;
  const totalUnread = unreadCount + chatUnreadCount;
  const branding    = useBranding();

  // ── Sidebar content — theme-aware ─────────────────────────────────────────
  const SidebarContent = () => (
    <div className="flex flex-col h-full">

      {/* Logo */}
      <div className={`flex items-center h-16 px-4 shrink-0 border-b border-gray-100 dark:border-white/[0.07] ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 select-none overflow-hidden"
          style={{ background: branding.primaryColor || '#0F172A' }}>
          {branding.logoUrl
            ? <img src={branding.logoUrl} alt={branding.companyName}
                className="w-full h-full object-contain p-0.5"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            : <span className="text-white font-black text-sm select-none">
                {(branding.companyName || 'A').charAt(0).toUpperCase()}
              </span>
          }
        </div>
        {!isCollapsed && (
          <div className="min-w-0">
            <p className="font-black text-gray-900 dark:text-white text-sm leading-none tracking-wide">{branding.companyName}</p>
            <p className="text-[9px] uppercase tracking-widest mt-0.5 opacity-60"
               style={{ color: branding.primaryColor }}>
              {basePath === 'admin' ? t('adminPortal') : t('hrPortal')}
            </p>
          </div>
        )}
      </div>

      {/* User chip */}

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto scrollbar-thin">
        {links.map(l => {
          const active    = location.pathname === l.to || location.pathname.startsWith(l.to + '/');
          const hasUnread = l.label === 'Messages' && chatUnreadCount > 0;
          return (
            <Link key={l.to} to={l.to} title={isCollapsed ? l.label : undefined}
              className={`relative flex items-center rounded-xl px-3 py-2.5 transition-all group ${
                active
                  ? 'dark:text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
              style={active ? {
                color: branding.primaryColor || '#7c3aed',
                background: isDark
                  ? `${branding.primaryColor}30`
                  : `${branding.primaryColor}14`,
                boxShadow: `inset 2px 0 0 ${branding.primaryColor || '#7c3aed'}`,
              } : {}}>
              {/* hover bg */}
              {!active && (
                <span className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity
                  bg-gray-100 dark:bg-white/[0.06]" />
              )}
              <l.icon size={17} className={`relative z-10 shrink-0 transition-colors ${
                active
                  ? ''
                  : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-200'
              }`} style={active ? { color: branding.primaryColor || '#7c3aed' } : {}} />
              {!isCollapsed && <span className="relative z-10 ml-3 text-sm font-medium flex-1 truncate">{l.label}</span>}
              {hasUnread && !isCollapsed && (
                <span className="relative z-10 ml-auto text-[10px] font-black px-1.5 py-0.5 rounded-full text-white"
                  style={{ background: branding.primaryColor || '#7c3aed' }}>
                  {chatUnreadCount > 99 ? '99+' : chatUnreadCount}
                </span>
              )}
              {hasUnread && isCollapsed && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-violet-500 z-10" />
              )}
            </Link>
          );
        })}
      </nav>


      {/* Sign out */}
      <div className="shrink-0 px-2 py-3 border-t border-gray-200/80 dark:border-white/[0.07]">
        <button
          type="button"
          onClick={() => void logout()}
          title={isCollapsed ? 'Sign Out' : undefined}
          className={`w-full flex items-center rounded-xl px-3 py-2.5 transition-all group
            text-red-500 dark:text-red-400
            hover:bg-red-50 dark:hover:bg-red-500/10
            hover:text-red-600 dark:hover:text-red-300
            ${isCollapsed ? 'justify-center' : 'gap-3'}`}
        >
          <LogOut size={17} className="shrink-0" />
          {!isCollapsed && <span className="text-sm font-medium">Sign Out</span>}
        </button>
      </div>

      {/* Resize handle */}
      {isDesktop && (
        <div role="separator" aria-hidden onMouseDown={onMouseDownHandle}
          className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-violet-400/40 dark:hover:bg-violet-500/40 transition-colors" />
      )}
    </div>
  );

  return (
    // Root: white in light, near-black in dark
    <div className="min-h-screen flex bg-[#F8FAFC] dark:bg-[#0a0b10]">

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)} />
      )}

      {/* ── Sidebar: slightly different color from main page ── */}
      <aside className="fixed top-0 left-0 h-full z-50 flex flex-col transition-all duration-250 ease-in-out bg-[#E8EDF5] dark:bg-[#0b0c17] border-r border-gray-200/80 dark:border-white/[0.08]"
        style={{ width: isDesktop ? sidebarW : 220, transform: !isDesktop && !mobileOpen ? 'translateX(-100%)' : 'none' }}>
        {isDesktop
          ? <SidebarContent />
          : (
            <div className="flex flex-col h-full relative">
              <SidebarContent />
              <button type="button" onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors">
                <X size={16} />
              </button>
            </div>
          )}
      </aside>

      {/* Floating sidebar toggle button */}
      {isDesktop && (
        <button
          type="button"
          onClick={() => setSidebarW(isCollapsed ? 220 : 72)}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="fixed top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-250 z-60 hover:scale-105 active:scale-95"
          style={{
            left: `${sidebarW}px`,
            background: '#FFFFFF',
            border: '1px solid #E5E7EB',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = '#F9FAFB'}
          onMouseLeave={(e) => e.currentTarget.style.background = '#FFFFFF'}
        >
          {isCollapsed ? (
            <ChevronDown size={16} className="text-gray-500 rotate-90" />
          ) : (
            <ChevronDown size={16} className="text-gray-500 -rotate-90" />
          )}
        </button>
      )}

      {/* ── Main area ── */}
      <div className="flex-1 flex flex-col min-w-0 transition-all duration-250 ease-in-out"
        style={{ marginLeft: isDesktop ? sidebarW : 0 }}>

        {/* ── Topbar — light/dark aware ── */}
        <header className="h-14 flex items-center gap-3 px-5 shrink-0 sticky top-0 z-30 bg-white/90 dark:bg-[#0d0e18]/90 border-b border-gray-200 dark:border-white/[0.06] backdrop-blur-md">

          <button type="button" onClick={() => setMobileOpen(true)}
            className="lg:hidden p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors shrink-0">
            <Menu size={18} />
          </button>

          {/* Search */}
          <div className="relative flex-1 max-w-sm group">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-600 group-focus-within:text-violet-500 transition-colors pointer-events-none" />
            <input type="text" placeholder="Search…"
              className="w-full h-9 pl-9 pr-4 rounded-xl text-sm outline-none transition-all
                bg-gray-100 dark:bg-white/[0.04]
                text-gray-700 dark:text-gray-300
                placeholder-gray-400 dark:placeholder-gray-600
                border border-gray-200 dark:border-white/[0.07]
                focus:border-violet-400 dark:focus:border-violet-500/50
                focus:ring-2 focus:ring-violet-500/15"
            />
          </div>

          {/* Live clock */}
          <LiveClock />

          <div className="ml-auto flex items-center gap-2">

            {/* Language toggle */}
            <button type="button" onClick={toggleLang}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all
                text-gray-500 dark:text-gray-400
                hover:text-gray-700 dark:hover:text-gray-200
                bg-gray-100 dark:bg-white/[0.04]
                border border-gray-200 dark:border-white/[0.06]
                hover:bg-gray-200 dark:hover:bg-white/10">
              <Languages size={16} />
            </button>

            {/* Theme toggle */}
            <button type="button" onClick={toggleTheme}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all
                text-gray-500 dark:text-gray-400
                hover:text-gray-700 dark:hover:text-gray-200
                bg-gray-100 dark:bg-white/[0.04]
                border border-gray-200 dark:border-white/[0.06]
                hover:bg-gray-200 dark:hover:bg-white/10">
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Bell */}
            <div className="relative" ref={notifRef}>
              <button type="button" onClick={() => setNotifOpen(v => !v)}
                className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-all
                  text-gray-500 dark:text-gray-400
                  hover:text-gray-700 dark:hover:text-gray-200
                  bg-gray-100 dark:bg-white/[0.04]
                  border border-gray-200 dark:border-white/[0.06]
                  hover:bg-gray-200 dark:hover:bg-white/10">
                <Bell size={16} />
                {totalUnread > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-black text-white px-1"
                    style={{ background: branding.primaryColor || '#7c3aed' }}>
                    {totalUnread > 99 ? '99+' : totalUnread}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2.5 w-80 rounded-2xl shadow-2xl z-50 overflow-hidden
                  bg-white dark:bg-[#13151f]
                  border border-gray-200 dark:border-white/[0.08]">
                  <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 dark:border-white/[0.06]">
                    <span className="text-sm font-bold text-gray-900 dark:text-white">Notifications</span>
                    <div className="flex items-center gap-3">
                      <button type="button"
                        onClick={() => { setNotifOpen(false); navigate(basePath === 'hr' ? '/hr/alerts-notifications' : '/admin/audit-logs'); }}
                        className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-500 font-medium transition-colors">
                        View all
                      </button>
                      <button type="button" onClick={() => void markAllAsRead()}
                        className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto scrollbar-thin">
                    {chatUnreadCount > 0 && (
                      <button type="button"
                        onClick={() => { setNotifOpen(false); navigate(basePath === 'hr' ? '/hr/messages' : '/admin/messages'); }}
                        className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: 'rgba(124,58,237,0.15)' }}>
                          <MessageSquare size={13} className="text-violet-500 dark:text-violet-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-gray-900 dark:text-white">New Messages</p>
                          <p className="text-[11px] text-violet-600 dark:text-violet-400">
                            {chatUnreadCount} unread message{chatUnreadCount !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <span className="shrink-0 min-w-[20px] h-5 rounded-full flex items-center justify-center text-[10px] font-black text-white px-1.5"
                          style={{ background: 'linear-gradient(135deg,#7c3aed,#4f46e5)' }}>
                          {chatUnreadCount}
                        </span>
                      </button>
                    )}
                    {notifications.length === 0 && chatUnreadCount === 0 && (
                      <p className="text-xs text-gray-400 text-center py-8">No notifications</p>
                    )}
                    {notifications.map(n => (
                      <button type="button" key={n.id} onClick={() => void handleNotifClick(n)}
                        className={`w-full text-left flex flex-col px-4 py-3 hover:bg-gray-50 dark:hover:bg-white/5 transition-colors ${!n.isRead ? 'bg-violet-50 dark:bg-violet-500/5' : ''}`}>
                        <div className="flex items-start gap-2">
                          {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-violet-500 mt-1.5 shrink-0" />}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{n.title}</p>
                            <p className="text-[11px] text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Profile button */}
            <div className="relative" ref={profileRef}>
              <button type="button" onClick={() => setProfileOpen(v => !v)}
                className="flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-xl transition-all
                  bg-gray-100 dark:bg-white/[0.04]
                  border border-gray-200 dark:border-white/[0.06]
                  hover:bg-gray-200 dark:hover:bg-white/10
                  hover:border-violet-300 dark:hover:border-violet-500/40">
                <div className="w-7 h-7 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold text-violet-600 dark:text-violet-300 shrink-0"
                  style={{ background: isDark
                    ? 'linear-gradient(135deg,rgba(124,58,237,0.4),rgba(79,70,229,0.4))'
                    : 'linear-gradient(135deg,rgba(124,58,237,0.15),rgba(79,70,229,0.15))' }}>
                  {user?.profilePicture
                    ? <img src={user.profilePicture} alt="" className="w-full h-full object-cover" />
                    : initials}
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-xs font-bold text-gray-800 dark:text-white leading-tight">
                    {user?.firstName} {user?.lastName}
                  </p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-500 leading-tight">{user?.role}</p>
                </div>
                <ChevronDown size={12} className={`text-gray-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2.5 w-60 rounded-2xl shadow-2xl z-50 overflow-hidden
                  bg-white dark:bg-[#13151f]
                  border border-gray-200 dark:border-white/[0.08]">
                  {/* User info */}
                  <div className="px-4 py-4 border-b border-gray-100 dark:border-white/[0.06]
                    bg-gray-50 dark:bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center text-sm font-black shrink-0
                        text-violet-600 dark:text-violet-300"
                        style={{ background: isDark
                          ? 'linear-gradient(135deg,rgba(124,58,237,0.4),rgba(79,70,229,0.4))'
                          : 'linear-gradient(135deg,rgba(124,58,237,0.12),rgba(79,70,229,0.12))' }}>
                        {user?.profilePicture
                          ? <img src={user.profilePicture} alt="" className="w-full h-full object-cover" />
                          : initials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
                          {user?.firstName} {user?.lastName}
                        </p>
                        <p className="text-[11px] text-gray-500 truncate">{user?.email}</p>
                        <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[9px] font-black tracking-wide text-white"
                          style={{ background: branding.primaryColor || '#7c3aed' }}>
                          {user?.role}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Menu */}
                  <div className="py-1.5 px-1.5 space-y-0.5">
                    <Link to={`/${basePath}/profile`} onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm
                        text-gray-600 dark:text-gray-400
                        hover:text-gray-900 dark:hover:text-white
                        hover:bg-gray-100 dark:hover:bg-white/[0.05]
                        transition-colors group">
                      <User size={15} className="text-gray-400 group-hover:text-violet-500 dark:group-hover:text-violet-400 transition-colors" />
                      My Profile
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── Page content ── */}
        <main className="flex-1 p-6 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

// ─── Live Clock ───────────────────────────────────────────────────────────────
const ETH_MONTHS_SHORT = ETH_MONTHS_AM.map(m => m.slice(0, 3));
function LiveClock() {
  const [now,  setNow]  = useState(() => new Date());
  const [mode, setMode] = useState<'GC' | 'ETH'>('GC');

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Gregorian ──
  const hours  = now.getHours();
  const mins   = String(now.getMinutes()).padStart(2, '0');
  const secs   = String(now.getSeconds()).padStart(2, '0');
  const ampm   = hours >= 12 ? 'PM' : 'AM';
  const h12    = String(hours % 12 || 12).padStart(2, '0');
  const grDate = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // ── Ethiopian ──
  // Ethiopian clock starts at dawn: 6 AM civil = 1:00 ET
  const ethHourRaw = (hours + 18) % 24;
  const ethH12     = ethHourRaw % 12 || 12;
  const ethAmpm    = ethHourRaw < 12 ? 'ጠዋት' : 'ከሰዓት';
  const eth        = toEthiopian(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const ethDateStr = `${eth.d} ${ETH_MONTHS_SHORT[(eth.m - 1) % 13]} ${eth.y} ዓ.ም`;

  const isEth = mode === 'ETH';

  return (
    <div className="hidden sm:flex items-center gap-1 shrink-0 select-none">
      {/* Clock display */}
      <div className="flex flex-col items-end px-3 py-1.5 rounded-xl border border-gray-200 dark:border-white/[0.07] bg-gray-50 dark:bg-white/[0.03] min-w-[130px]">
        <div className="flex items-baseline gap-1">
          <span className={`text-base font-black tabular-nums leading-none ${isEth ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
            {isEth ? `${String(ethH12).padStart(2,'0')}:${mins}` : `${h12}:${mins}`}
          </span>
          <span className={`text-[11px] font-bold tabular-nums leading-none ${isEth ? 'text-amber-500/80' : 'text-violet-500 dark:text-violet-400'}`}>
            {secs}
          </span>
          <span className={`text-[10px] font-bold leading-none ${isEth ? 'text-amber-500/70 dark:text-amber-400/60' : 'text-gray-400 dark:text-gray-500'}`}>
            {isEth ? ethAmpm : ampm}
          </span>
        </div>
        <div className={`text-[10px] font-medium leading-none mt-0.5 ${isEth ? 'text-amber-600/70 dark:text-amber-400/60' : 'text-gray-400 dark:text-gray-500'}`}>
          {isEth ? ethDateStr : grDate}
        </div>
      </div>

      {/* ETH / GC toggle */}
      <div className="flex flex-col gap-0.5">
        {(['ETH', 'GC'] as const).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-2 py-0.5 rounded-md text-[10px] font-black leading-none transition-all ${
              mode === m
                ? m === 'ETH'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'bg-violet-600 text-white shadow-sm'
                : 'text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10'
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );
}
