import React, { createContext, useContext, useState } from 'react';

export type Lang = 'en' | 'am';

// ── Translation dictionary ────────────────────────────────────────────────────
// Keep keys semantic, not literal. Amharic translations are natural/idiomatic.
export const translations = {
  en: {
    // Auth
    welcomeBack:      'Welcome back',
    signInSubtitle:   'Sign in to your portal',
    emailLabel:       'Email Address',
    emailPlaceholder: 'admin@company.com',
    passwordLabel:    'Password',
    rememberMe:       'Remember me',
    forgotPassword:   'Forgot password?',
    signIn:           'Sign In',
    signingIn:        'Signing in…',
    invalidCreds:     'Incorrect email or password.',
    noServer:         'Cannot reach the server. Check your connection.',
    mobileOnly:       'Staff log in through the mobile app, not the web portal.',

    // Login left panel
    heroLine1:  'Smart',
    heroLine2:  'Attendance',
    heroLine3:  'Management',
    heroLine4:  'System',
    heroSub:    'Real-time tracking, intelligent scheduling, and powerful analytics — all in one platform.',
    feat1: 'Real-time Tracking',
    feat2: 'Secure Check-in',
    feat3: 'Analytics & Reports',
    feat4: 'Geofencing',
    feat5: 'Leave Management',
    copyright: '© 2026 Alyah Smart Attendance. All rights reserved.',

    // Theme
    dayLight: 'Day Light',
    night:    'Night',

    // Language toggle
    langLabel: 'አማርኛ',

    // Sidebar
    appName:     'Alyah Smart Attendance',
    adminPortal: 'Admin Portal',
    hrPortal:    'HR Portal',
    signOut:     'Sign Out',

    // Nav labels
    navHome:          'Dashboard',
    navDirectory:     'Team',
    navPeople:        'People',
    navAttendance:    'Attendance',
    navLeaves:        'Leaves',
    navSalary:        'Salary',
    navHolidays:      'Holidays',
    navAnnouncements: 'Announcements',
    navAlerts:        'Alerts',
    navMessages:      'Messages',
    navReports:       'Reports',
    navDashboard:     'Dashboard',
    navUsers:         'Users',
    navRoles:         'Roles',
    navAuditLogs:     'Audit Logs',
    navSecurity:      'Security',
    navSettings:      'Settings',
    navPenalties:     'Penalties',
    navIntegrations:  'Integrations',

    // Validation
    emailInvalid: 'Please enter a valid email address.',
    passwordShort: 'Password must be at least 6 characters.',
  },
  am: {
    // Auth
    welcomeBack:      'እንኳን ደህና መጡ',
    signInSubtitle:   'ወደ ፖርታልዎ ይግቡ',
    emailLabel:       'የኢሜይል አድራሻ',
    emailPlaceholder: 'admin@company.com',
    passwordLabel:    'የሚስጥር ቃል',
    rememberMe:       'አስታውሰኝ',
    forgotPassword:   'የሚስጥር ቃል ረሱ?',
    signIn:           'ግባ',
    signingIn:        'በመግባት ላይ…',
    invalidCreds:     'ኢሜይሉ ወይም የሚስጥር ቃሉ ትክክል አይደለም።',
    noServer:         'ከሰርቨር ጋር ግንኙነት አልተቻለም። ኔትወርክዎን ያረጋግጡ።',
    mobileOnly:       'ሠራተኞች ወደ ሥርዓቱ የሚገቡት በሞባይል አፕ ብቻ ነው።',

    // Login left panel
    heroLine1:  'ዘመናዊ',
    heroLine2:  'የAttendance',
    heroLine3:  'አስተዳደር',
    heroLine4:  'ሥርዓት',
    heroSub:    'ቀጥታ ክትትል፣ ብልጥ ጊዜ ሰሌዳ እና ሃይለኛ ትንታኔ — ሁሉ በአንድ መድረክ።',
    feat1: 'ቀጥታ ክትትል',
    feat2: 'ደህንነቱ የተጠበቀ',
    feat3: 'ትንታኔ እና ሪፖርት',
    feat4: 'ጂኦፌንሲንግ',
    feat5: 'የፈቃድ አስተዳደር',
    copyright: '© 2026 Alyah Smart Attendance. መብቱ በሕግ የተጠበቀ ነው።',

    // Theme
    dayLight: 'ቀን',
    night:    'ሌሊት',

    // Language toggle
    langLabel: 'English',

    // Sidebar
    appName:     'አልያህ ስማርት አቴንዳንስ',
    adminPortal: 'አስተዳደር ፖርታል',
    hrPortal:    'HR ፖርታል',
    signOut:     'ውጣ',

    // Nav labels
    navHome:          'ዳሽቦርድ',
    navDirectory:     'ቡድን',
    navPeople:        'ሰዎች',
    navAttendance:    'ክትትል',
    navLeaves:        'ፈቃዶች',
    navSalary:        'ደሞዝ',
    navHolidays:      'ዓመት በዓላት',
    navAnnouncements: 'ማስታወቂያዎች',
    navAlerts:        'ማንቂያዎች',
    navMessages:      'መልዕክቶች',
    navReports:       'ሪፖርቶች',
    navDashboard:     'ዳሽቦርድ',
    navUsers:         'ተጠቃሚዎች',
    navRoles:         'ሚናዎች',
    navAuditLogs:     'ኦዲት ምዝግቦች',
    navSecurity:      'ደህንነት',
    navSettings:      'ቅንብሮች',
    navPenalties:     'ቅጣቶች',
    navIntegrations:  'ውህደቶች',

    // Validation
    emailInvalid: 'ትክክለኛ ኢሜይል አድራሻ ያስገቡ።',
    passwordShort: 'የሚስጥር ቃሉ ቢያንስ 6 ቁምፊዎች መሆን አለበት።',
  },
} satisfies Record<Lang, Record<string, string>>;

export type TranslationKey = keyof typeof translations.en;

interface LanguageContextType {
  lang: Lang;
  toggleLang: () => void;
  t: (key: TranslationKey) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<Lang>(() => {
    const stored = localStorage.getItem('lang');
    return stored === 'am' ? 'am' : 'en';
  });

  const toggleLang = () => setLang(prev => {
    const next = prev === 'en' ? 'am' : 'en';
    localStorage.setItem('lang', next);
    return next;
  });

  const t = (key: TranslationKey): string => translations[lang][key] ?? translations.en[key] ?? key;

  return (
    <LanguageContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLang = () => {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used within LanguageProvider');
  return ctx;
};
