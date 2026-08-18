import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';

export const NotFound = () => (
  <div className="min-h-screen bg-gray-50 dark:bg-[#0f1117] flex items-center justify-center">
    <div className="text-center">
      <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
      <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">404</h1>
      <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">Page not found</p>
      <Link to="/" className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium">
        Go Home
      </Link>
    </div>
  </div>
);
