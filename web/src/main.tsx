import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { PermissionsProvider } from './context/PermissionsContext';
import { DataRefreshProvider } from './context/DataRefreshContext';
import { BrandingProvider } from './context/BrandingContext';
import ErrorBoundary from './components/common/ErrorBoundary';
import App from './App';
import './index.css';

// ── Enterprise Query Client Configuration ────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10,   // 10 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <BrandingProvider>
            <ThemeProvider>
            <LanguageProvider>
              <AuthProvider>
                <PermissionsProvider>
                  <DataRefreshProvider>
                    <App />
                  </DataRefreshProvider>
                </PermissionsProvider>
              </AuthProvider>
            </LanguageProvider>
          </ThemeProvider>
          </BrandingProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
