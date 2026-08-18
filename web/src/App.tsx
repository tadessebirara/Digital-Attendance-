import { useEffect, Component, ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { useSocket } from './hooks/useSocket';
import { Layout } from './components/layout/Layout';
import { PrivateRoute } from './components/auth/PrivateRoute';
import { RoleRoute } from './components/auth/RoleRoute';

// Auth Pages
import { Login } from './pages/auth/Login';
import { ForgotPassword } from './pages/auth/ForgotPassword';
import { ResetPassword } from './pages/auth/ResetPassword';

// HR Pages
import { HRDashboard } from './pages/hr/Dashboard';
import { EmployeeDirectory } from './pages/hr/EmployeeDirectory';
import { HRPeopleManagement } from './pages/hr/PeopleManagement';
import { AttendanceMonitoring } from './pages/hr/AttendanceMonitoring';
import { LeaveManagement } from './pages/hr/LeaveManagement';
import { Announcements } from './pages/hr/Announcements';
import { AlertsNotifications } from './pages/hr/AlertsNotifications';
import { Messages } from './pages/hr/Messages';
import { ReportsAndAnalytics as HRReportsAndAnalytics } from './pages/hr/ReportsAndAnalytics';
import { SalaryManagement } from './pages/hr/SalaryManagement';
import { SalaryDetails } from './pages/hr/SalaryDetails';
import { HolidayCalendar } from './pages/hr/HolidayCalendar';

// Admin Pages
import { AdminDashboard } from './pages/admin/Dashboard';
import { UserManagement } from './pages/admin/UserManagement';
import { RolesAndPermissions } from './pages/admin/RolesAndPermissions';
import { ReportsAndAnalytics as AdminReportsAndAnalytics } from './pages/admin/ReportsAndAnalytics';
import { AuditLogs } from './pages/admin/AuditLogs';
import { SystemSettings } from './pages/admin/SystemSettings';
import { Integrations } from './pages/admin/Integrations';
import { SecurityAlerts } from './pages/admin/SecurityAlerts';
import { PenaltySettings } from './pages/admin/PenaltySettings'; // still accessible via admin redirect
import { OfficeManagement } from './pages/admin/OfficeManagement';
import { PeopleManagement as AdminPeopleManagement } from './pages/admin/PeopleManagement';

// Shared Pages
import { Profile } from './pages/shared/Profile';
import { NotFound } from './pages/shared/NotFound';
import { Unauthorized } from './pages/shared/Unauthorized';

// ─── Error Boundary ───────────────────────────────────────────────────────────
class PageErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 p-8">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <span className="text-red-600 dark:text-red-400 text-xl">!</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Page Error</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-md">
            {this.state.error.message}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Wrapped page helper ──────────────────────────────────────────────────────
function Page({ children }: { children: ReactNode }) {
  return <PageErrorBoundary>{children}</PageErrorBoundary>;
}

function App() {
  const { isAuthenticated } = useAuth();
  const { connect, disconnect } = useSocket();

  useEffect(() => {
    if (isAuthenticated) connect();
    return () => disconnect();
  }, [isAuthenticated, connect, disconnect]);

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* Admin Routes */}
      <Route
        path="/admin/*"
        element={
          <PrivateRoute>
            <RoleRoute allowedRoles={['ADMIN']}>
              <Layout />
            </RoleRoute>
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard"         element={<Page><AdminDashboard /></Page>} />
        <Route path="user-management"   element={<Page><UserManagement /></Page>} />
        <Route path="people-management" element={<Page><AdminPeopleManagement /></Page>} />
        <Route path="roles-permissions" element={<Page><RolesAndPermissions /></Page>} />
        <Route path="reports-analytics" element={<Page><AdminReportsAndAnalytics /></Page>} />
        <Route path="audit-logs"        element={<Page><AuditLogs /></Page>} />
        <Route path="security-alerts"   element={<Page><SecurityAlerts /></Page>} />
        <Route path="office-locations"  element={<Page><OfficeManagement /></Page>} />
        <Route path="system-settings"   element={<Page><SystemSettings /></Page>} />
        <Route path="integrations"      element={<Page><Integrations /></Page>} />
        <Route path="penalty-settings"  element={<Navigate to="/hr/penalty-settings" replace />} />
        <Route path="profile"           element={<Page><Profile /></Page>} />
      </Route>

      {/* HR Routes */}
      <Route
        path="/hr/*"
        element={
          <PrivateRoute>
            <RoleRoute allowedRoles={['HR', 'ADMIN']}>
              <Layout />
            </RoleRoute>
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard"            element={<Page><HRDashboard /></Page>} />
        <Route path="employee-directory"   element={<Page><EmployeeDirectory /></Page>} />
        <Route path="people-management"    element={<Page><HRPeopleManagement /></Page>} />
        <Route path="attendance-monitoring"element={<Page><AttendanceMonitoring /></Page>} />
        <Route path="leave-management"     element={<Page><LeaveManagement /></Page>} />
        <Route path="announcements"        element={<Page><Announcements /></Page>} />
        <Route path="alerts-notifications" element={<Page><AlertsNotifications /></Page>} />
        <Route path="messages"             element={<Page><Messages /></Page>} />
        <Route path="reports-analytics"    element={<Page><HRReportsAndAnalytics /></Page>} />
        <Route path="salary"               element={<Page><SalaryManagement /></Page>} />
        <Route path="salary/:userId"       element={<Page><SalaryDetails /></Page>} />
        <Route path="holiday-calendar"     element={<Page><HolidayCalendar /></Page>} />
        <Route path="penalty-settings"     element={<Page><PenaltySettings /></Page>} />
        <Route path="profile"              element={<Page><Profile /></Page>} />
      </Route>

      {/* Default Redirect */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default App;
