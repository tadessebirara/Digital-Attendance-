import { useState, useEffect, useCallback } from 'react';
import apiClient from '../../api/client';
import {
  Bell, AlertTriangle, Check, Info, Clock,
  Calendar, Smartphone, UserCheck, RefreshCw, Trash2, CheckCircle
} from 'lucide-react';

// ─── Notification type config ─────────────────────────────────────────────────
const NOTIF_CONFIG: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
  ABSENCE_ALERT:        { icon: <AlertTriangle size={15} />, color: 'text-red-600 dark:text-red-400',    bg: 'bg-red-100 dark:bg-red-900/30' },
  LATE_CHECKIN:         { icon: <Clock size={15} />,         color: 'text-yellow-600 dark:text-yellow-400', bg: 'bg-yellow-100 dark:bg-yellow-900/30' },
  ABSENCE:              { icon: <AlertTriangle size={15} />, color: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-100 dark:bg-orange-900/30' },
  LEAVE_REQUEST:        { icon: <Calendar size={15} />,      color: 'text-blue-600 dark:text-blue-400',   bg: 'bg-blue-100 dark:bg-blue-900/30' },
  NEW_EMPLOYEE_PENDING: { icon: <UserCheck size={15} />,     color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-100 dark:bg-purple-900/30' },
  DEVICE_REQUEST:       { icon: <Smartphone size={15} />,    color: 'text-blue-600 dark:text-blue-400',   bg: 'bg-blue-100 dark:bg-blue-900/30' },
  DEFAULT:              { icon: <Info size={15} />,          color: 'text-gray-600 dark:text-gray-400',   bg: 'bg-gray-100 dark:bg-gray-700' },
};

const CATEGORY_TABS = [
  { key: 'ALL',        label: 'All' },
  { key: 'ATTENDANCE', label: 'Attendance' },
  { key: 'LEAVE',      label: 'Leave' },
  { key: 'EMPLOYEE',   label: 'Employees' },
  { key: 'DEVICE',     label: 'Devices' },
];

export const AlertsNotifications = () => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeCategory, setActiveCategory] = useState('ALL');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await apiClient.get(`/notifications?limit=100`);
      if (res.data.success) setNotifications((res.data.data as any[]) ?? []);
    } catch { /* silent */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const handleRefresh = () => { setRefreshing(true); fetchNotifications(); };

  const markAsRead = async (id: number) => {
    try {
      await apiClient.post(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    } catch { /* silent */ }
  };

  const markAllRead = async () => {
    try {
      await apiClient.post(`/notifications/read-all`);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    } catch { /* silent */ }
  };

  const deleteNotif = async (id: number) => {
    try {
      await apiClient.delete(`/notifications/${id}`);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch { /* silent */ }
  };

  const filtered = notifications.filter(n => {
    // Exclude security/system notifications — those are admin-only
    if (n.category === 'SECURITY' || n.type === 'SECURITY_ALERT') return false;
    if (activeCategory !== 'ALL' && n.category !== activeCategory) return false;
    if (showUnreadOnly && n.isRead) return false;
    return true;
  });

  const unreadCount = notifications.filter(n =>
    !n.isRead && n.category !== 'SECURITY' && n.type !== 'SECURITY_ALERT'
  ).length;

  const getConfig = (notif: any) => NOTIF_CONFIG[notif.type] ?? NOTIF_CONFIG.DEFAULT;

  const severityBorder: Record<string, string> = {
    HIGH: 'border-l-4 border-l-red-400',
    MEDIUM: 'border-l-4 border-l-yellow-400',
    LOW: 'border-l-4 border-l-blue-400',
    INFO: '',
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            Alerts &amp; Notifications
            {unreadCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm font-bold">{unreadCount}</span>
            )}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Employee activity alerts — attendance, leaves, registrations</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
          {unreadCount > 0 && (
            <button onClick={markAllRead}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#0F1929] text-gray-600 dark:text-gray-300 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
              <CheckCircle size={14} /> Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Category tabs + unread toggle */}
      <div className="bg-white dark:bg-[#0F1929] rounded-xl border border-gray-200 dark:border-white/[0.07]">
        <div className="flex items-center justify-between px-4 pt-3 border-b border-gray-100 dark:border-white/[0.07]">
          <div className="flex items-center gap-1">
            {CATEGORY_TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveCategory(tab.key)}
                className={`px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  activeCategory === tab.key
                    ? 'text-gray-900 dark:text-white bg-gray-100 dark:bg-[#0F1929]'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 cursor-pointer pb-2">
            <input type="checkbox" checked={showUnreadOnly} onChange={e => setShowUnreadOnly(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Unread only</span>
          </label>
        </div>

        {/* Notification list */}
        {loading ? (
          <div className="flex justify-center py-16"><div className="w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : filtered.length > 0 ? (
          <div className="divide-y divide-gray-50 dark:divide-gray-700/50">
            {filtered.map(notif => {
              const cfg = getConfig(notif);
              const border = severityBorder[notif.severity] ?? '';
              return (
                <div key={notif.id}
                  className={`flex items-start gap-4 px-5 py-4 transition-colors ${border} ${!notif.isRead ? 'bg-blue-50/40 dark:bg-blue-900/5' : 'hover:bg-gray-50 dark:hover:bg-gray-800/30'}`}>
                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${cfg.bg}`}>
                    <span className={cfg.color}>{cfg.icon}</span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-semibold ${!notif.isRead ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                        {notif.title}
                      </p>
                      <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                        {new Date(notif.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{notif.message}</p>

                    {/* Category + severity badges */}
                    <div className="flex items-center gap-2 mt-1.5">
                      {notif.category && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                          {notif.category}
                        </span>
                      )}
                      {notif.severity && notif.severity !== 'INFO' && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          notif.severity === 'HIGH' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
                          notif.severity === 'MEDIUM' ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400' :
                          'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                        }`}>{notif.severity}</span>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {!notif.isRead && (
                      <button onClick={() => markAsRead(notif.id)} title="Mark as read"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                        <Check size={14} />
                      </button>
                    )}
                    <button onClick={() => deleteNotif(notif.id)} title="Delete"
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-16 text-center">
            <Bell size={32} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-400 dark:text-gray-500">
              {showUnreadOnly ? 'No unread notifications' : 'No notifications in this category'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
