import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import apiClient from '../api/client';
import { useAuth } from './AuthContext';

export const PERMISSION_GROUPS: Record<string, string[]> = {
  Dashboard: ['dashboard.view'],
  'User Management': ['users.view', 'users.create', 'users.edit', 'users.delete'],
  Attendance: ['attendance.view', 'attendance.manage', 'attendance.manual_checkin', 'attendance.export'],
  'Leave Management': ['leaves.view', 'leaves.approve', 'leaves.manage'],
  Reports: ['reports.view', 'reports.export'],
  Announcements: ['announcements.view', 'announcements.create', 'announcements.manage'],
  'Roles & Permissions': ['roles.view', 'roles.manage'],
  'Audit Logs': ['audit.view'],
  'System Settings': ['settings.manage'],
  Devices: ['devices.view', 'devices.manage'],
  Chat: ['chat.access'],
  Integrations: ['integrations.manage'],
};

export const ALL_PERMISSIONS = Object.values(PERMISSION_GROUPS).flat();

interface PermissionsContextType {
  permissions: string[];
  hasPermission: (perm: string) => boolean;
  hasAnyPermission: (perms: string[]) => boolean;
  isAdmin: boolean;
  loadPermissions: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

export const PermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [permissions, setPermissions] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadPermissions = useCallback(async () => {
    if (!isAuthenticated) {
      setPermissions([]);
      setIsAdmin(false);
      return;
    }

    if (user?.role === 'ADMIN') {
      setPermissions(ALL_PERMISSIONS);
      setIsAdmin(true);
      return;
    }

    try {
      const r = await apiClient.get<{ permissions: string[]; isAdmin: boolean }>(`/roles/my-permissions`);
      const body = r.data;
      if (body.success && body.data) {
        const { permissions: perms, isAdmin: adminFlag } = body.data;
        if (adminFlag || perms.includes('*')) {
          setPermissions(ALL_PERMISSIONS);
          setIsAdmin(true);
        } else {
          setPermissions(perms || []);
          setIsAdmin(false);
        }
      }
    } catch {
      setPermissions([]);
      setIsAdmin(false);
    }
  }, [isAuthenticated, user?.role]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  const hasPermission = useCallback(
    (perm: string): boolean => {
      if (isAdmin) return true;
      return permissions.includes(perm);
    },
    [permissions, isAdmin]
  );

  const hasAnyPermission = useCallback(
    (perms: string[]): boolean => {
      if (isAdmin) return true;
      return perms.some((p) => permissions.includes(p));
    },
    [permissions, isAdmin]
  );

  return (
    <PermissionsContext.Provider value={{ permissions, hasPermission, hasAnyPermission, isAdmin, loadPermissions }}>
      {children}
    </PermissionsContext.Provider>
  );
};

export const usePermissions = () => {
  const context = useContext(PermissionsContext);
  if (context === undefined) throw new Error('usePermissions must be used within a PermissionsProvider');
  return context;
};
