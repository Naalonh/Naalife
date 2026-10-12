import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppShell } from '@/components/layout/AppShell';
import { AuthScreen, type AuthScreenState } from '@/components/AuthScreen';
import { Skeleton } from '@/components/ui/card';
import { SheetProvider } from '@/contexts/SheetContext';
import { useAuth } from '@/contexts/AuthContext';
import { useApplyTheme } from '@/contexts/ThemeContext';
import Dashboard from '@/pages/Dashboard';
import Finance from '@/pages/Finance';
import Savings from '@/pages/Savings';
import Tasks from '@/pages/Tasks';
import Settings from '@/pages/Settings';

// Reports pulls in the heaviest chart code paths; load it on demand.
const Reports = lazy(() => import('@/pages/Reports'));

export default function App() {
  const auth = useAuth();
  useApplyTheme(auth.me?.settings.theme);

  // Dev-only preview of the auth screens: /?authPreview=loading|not-telegram|denied|error
  if (import.meta.env.DEV) {
    const p = new URLSearchParams(window.location.search).get('authPreview');
    if (p === 'loading' || p === 'not-telegram' || p === 'denied' || p === 'error') {
      return <AuthScreen state={p as AuthScreenState} steps={{ session: true, profile: false }} onRetry={() => undefined} />;
    }
  }

  if (auth.phase === 'booting' || auth.phase === 'authenticating' || (auth.phase === 'ready' && !auth.me)) {
    return <AuthScreen state="loading" steps={{ session: auth.phase === 'ready', profile: !!auth.me }} />;
  }
  if (auth.phase === 'not-telegram') return <AuthScreen state="not-telegram" message={auth.message} />;
  if (auth.phase === 'denied') return <AuthScreen state="denied" message={auth.message} />;
  if (auth.phase === 'error') return <AuthScreen state="error" message={auth.message} onRetry={auth.retry} />;

  return (
    <BrowserRouter>
      <SheetProvider>
        <Suspense fallback={<Skeleton className="m-4 h-64" />}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="finance" element={<Finance />} />
              <Route path="savings" element={<Savings />} />
              <Route path="tasks" element={<Tasks />} />
              <Route path="reports" element={<Reports />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
        <Toaster
          position="top-center"
          theme="system"
          toastOptions={{
            classNames: { toast: '!rounded-2xl !border-border !bg-card !text-foreground !shadow-soft' },
          }}
        />
      </SheetProvider>
    </BrowserRouter>
  );
}
