import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center py-12 px-6 text-center ${className}`}>
      {Icon && (
        <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-white/[0.05] flex items-center justify-center mb-4">
          <Icon className="w-8 h-8 text-gray-400 dark:text-gray-500" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mb-6">
          {description}
        </p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 rounded-lg bg-accent-600 hover:bg-accent-700 text-white text-sm font-medium transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

// Pre-configured empty states for common use cases
export const EmptyStateNoData = ({ onRefresh }: { onRefresh?: () => void }) => (
  <EmptyState
    title="No data available"
    description="There's no data to display at the moment."
    action={onRefresh ? { label: 'Refresh', onClick: onRefresh } : undefined}
  />
);

export const EmptyStateNoResults = ({ onClear }: { onClear?: () => void }) => (
  <EmptyState
    title="No results found"
    description="We couldn't find any matching results for your search."
    action={onClear ? { label: 'Clear filters', onClick: onClear } : undefined}
  />
);

export const EmptyStateNoNotifications = () => (
  <EmptyState
    title="No notifications"
    description="You're all caught up! No new notifications to show."
  />
);

export const EmptyStateNoMessages = () => (
  <EmptyState
    title="No messages yet"
    description="Start a conversation with HR or your team members."
  />
);

export const EmptyStateNoEmployees = ({ onAdd }: { onAdd?: () => void }) => (
  <EmptyState
    title="No employees found"
    description="Add employees to get started with workforce management."
    action={onAdd ? { label: 'Add Employee', onClick: onAdd } : undefined}
  />
);

export const EmptyStateNoAttendance = () => (
  <EmptyState
    title="No attendance records"
    description="Attendance records will appear here once employees start checking in."
  />
);

export const EmptyStateNoLeaves = ({ onRequest }: { onRequest?: () => void }) => (
  <EmptyState
    title="No leave requests"
    description="No pending or recent leave requests to display."
    action={onRequest ? { label: 'Request Leave', onClick: onRequest } : undefined}
  />
);

export const EmptyStateNoAnnouncements = ({ onCreate }: { onCreate?: () => void }) => (
  <EmptyState
    title="No announcements"
    description="Create announcements to keep your team informed."
    action={onCreate ? { label: 'Create Announcement', onClick: onCreate } : undefined}
  />
);

export const EmptyStateError = ({ onRetry }: { onRetry?: () => void }) => (
  <EmptyState
    title="Something went wrong"
    description="We encountered an error while loading the data. Please try again."
    action={onRetry ? { label: 'Try Again', onClick: onRetry } : undefined}
  />
);
