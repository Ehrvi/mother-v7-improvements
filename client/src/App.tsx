import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary'; // NC-ARCH-004 FIX: Error Boundaries — React docs (2024) + Nygard (2007) §4.1 Bulkheads
import { ThemeProvider } from '@/contexts/ThemeContext'; // C239: WCAG AA — Theme toggle (NC-WCAG-001)
import { trpc } from '@/lib/trpc';
import HomeV2 from './pages/HomeV2';
import DgmLineage from './pages/DgmLineage';
import Login from './pages/Login';
import Admin from './pages/Admin';
import SHMSPage from './pages/SHMSPage';
import SHMS2DEnvironment from './pages/SHMS2DEnvironment';
import SHMS3DEnvironment from './pages/SHMS3DEnvironment';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = trpc.auth.me.useQuery();
  if (isLoading) {
    return (
      <div className="mother-auth-loading">
        <div className="mother-auth-spinner" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function GuestGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = trpc.auth.me.useQuery();
  if (isLoading) return null;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function App() {
  return (
    // C239: ThemeProvider wraps entire app — defaultTheme=dark preserves existing UX
    // switchable=true enables user to toggle to light mode (WCAG 1.4.3 Contrast)
    <ThemeProvider defaultTheme="dark" switchable={true}>
      <ErrorBoundary componentName="App">
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<GuestGuard><Login /></GuestGuard>} />
            <Route path="/" element={<AuthGuard><HomeV2 /></AuthGuard>} />
            <Route path="/shms" element={<AuthGuard><SHMSPage /></AuthGuard>} />
            <Route path="/shms/2d" element={<AuthGuard><SHMS2DEnvironment /></AuthGuard>} />
            <Route path="/shms/3d" element={<AuthGuard><SHMS3DEnvironment /></AuthGuard>} />
            <Route path="/lineage" element={<AuthGuard><DgmLineage /></AuthGuard>} />
            <Route path="/dgm" element={<AuthGuard><DgmLineage /></AuthGuard>} />
            <Route path="/admin" element={<AuthGuard><Admin /></AuthGuard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
