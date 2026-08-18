/**
 * BrandingContext
 * Loads company name, logo URL, and primary color from /admin/public-config
 * (no auth required) and makes them available app-wide.
 *
 * Primary color is also injected as --brand-primary CSS variable so Tailwind
 * arbitrary value classes like `bg-[var(--brand-primary)]` work everywhere.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

interface Branding {
  companyName: string;
  logoUrl: string;
  primaryColor: string;
}

const DEFAULT: Branding = {
  companyName: 'Alyah Smart Attendance',
  logoUrl: '',
  primaryColor: '#0F172A',
};

const BrandingCtx = createContext<Branding>(DEFAULT);

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(DEFAULT);

  useEffect(() => {
    const load = async () => {
      try {
        // Determine the API base (same origin in production, or from VITE env)
        const base = (import.meta as any).env?.VITE_API_URL ?? '';
        const res = await fetch(`${base}/api/admin/public-config`);
        if (!res.ok) return;
        const json = await res.json();
        if (!json.success) return;
        const d = json.data ?? {};
        const next: Branding = {
          companyName:  d.companyName  || DEFAULT.companyName,
          logoUrl:      d.logoUrl      || DEFAULT.logoUrl,
          primaryColor: d.primaryColor || DEFAULT.primaryColor,
        };
        setBranding(next);

        // Inject CSS variable — applies instantly to all var(--brand-primary) usages
        document.documentElement.style.setProperty('--brand-primary', next.primaryColor);
        // Also set a lighter tint for hover/active backgrounds
        document.title = next.companyName;
      } catch {
        // silently keep defaults
      }
    };

    load();

    // Re-fetch when admin emits config:update via socket
    const handler = () => load();
    window.addEventListener('branding:refresh', handler);
    return () => window.removeEventListener('branding:refresh', handler);
  }, []);

  return (
    <BrandingCtx.Provider value={branding}>
      {children}
    </BrandingCtx.Provider>
  );
}

export const useBranding = () => useContext(BrandingCtx);
