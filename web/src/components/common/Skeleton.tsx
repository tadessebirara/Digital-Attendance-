import React from 'react';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string;
  height?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ 
  className = '', 
  variant = 'rectangular',
  width,
  height 
}) => {
  const baseClass = 'animate-pulse bg-gray-200 dark:bg-gray-700/50 transition-colors duration-300';
  const variantClass = {
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
    rounded: 'rounded-xl',
    text: 'rounded'
  }[variant];
  
  const style = {
    width: width || '100%',
    height: height || '100%'
  };
  
  return <div className={`${baseClass} ${variantClass} ${className}`} style={style} />;
};

// Card skeleton for dashboard cards
export const CardSkeleton = () => (
  <div className="card p-6 space-y-4">
    <div className="flex items-start justify-between">
      <Skeleton variant="circular" className="w-10 h-10" />
      <Skeleton className="h-6 w-16" />
    </div>
    <div className="space-y-2">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-32" />
    </div>
    <Skeleton className="h-2 w-full" />
  </div>
);

// Table skeleton
export const TableSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-3">
    <div className="flex gap-4 p-4 border-b border-gray-200 dark:border-white/[0.06]">
      {[1, 2, 3, 4, 5].map(i => (
        <Skeleton key={i} className="h-4 flex-1" />
      ))}
    </div>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex gap-4 p-4">
        {[1, 2, 3, 4, 5].map(j => (
          <Skeleton key={j} className="h-4 flex-1" />
        ))}
      </div>
    ))}
  </div>
);

// Avatar skeleton with text
export const AvatarSkeleton = () => (
  <div className="flex items-center gap-3">
    <Skeleton variant="circular" className="w-10 h-10" />
    <div className="space-y-2 flex-1">
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-3 w-24" />
    </div>
  </div>
);

export const DashboardSkeleton = () => (
  <div className="space-y-6">
    <div className="flex justify-between items-center">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <Skeleton className="h-10 w-24" />
    </div>
    
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {[1, 2, 3, 4].map(i => (
        <CardSkeleton key={i} />
      ))}
    </div>
    
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="card p-6 space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
      <div className="card p-6 space-y-4">
        <Skeleton className="h-6 w-32" />
        <TableSkeleton rows={4} />
      </div>
    </div>
  </div>
);
