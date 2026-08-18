import React from 'react';

interface TableProps {
  headers: string[];
  children: React.ReactNode;
  isLoading?: boolean;
  emptyMessage?: string;
}

export const DataTable: React.FC<TableProps> = ({ 
  headers, children, isLoading, emptyMessage = 'No records found' 
}) => {
  if (isLoading) return <TableLoader />;

  return (
    <div className="w-full overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#151929]">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-800">
            {headers.map((h) => (
              <th key={h} className="px-6 py-4 text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
          {children}
        </tbody>
      </table>
      {!React.Children.count(children) && !isLoading && (
        <div className="py-20 text-center text-sm text-gray-400 font-medium">
          {emptyMessage}
        </div>
      )}
    </div>
  );
};

const TableLoader = () => (
  <div className="space-y-4 animate-pulse">
    <div className="h-12 bg-gray-100 dark:bg-gray-800 rounded-lg w-full" />
    {[1, 2, 3, 4, 5].map(i => (
      <div key={i} className="h-16 bg-gray-50 dark:bg-gray-900/50 rounded-lg w-full" />
    ))}
  </div>
);

export const DataRow: React.FC<{ children: React.ReactNode; onClick?: () => void }> = ({ children, onClick }) => (
  <tr 
    onClick={onClick}
    className={`group hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors ${onClick ? 'cursor-pointer' : ''}`}
  >
    {children}
  </tr>
);

export const DataCell: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <td className={`px-6 py-4 text-sm text-gray-700 dark:text-gray-300 ${className}`}>
    {children}
  </td>
);
