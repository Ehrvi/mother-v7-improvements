import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ErrorBoundary from './components/ErrorBoundary'; // NC-ARCH-004 FIX: Error Boundaries — React docs (2024) + Nygard (2007) §4.1 Bulkheads
import { trpc } from '@/lib/trpc';
import Home from './pages/Home';
import DgmLineage from './pages/DgmLineage';
import Login from './pages/Login';
import Admin from './pages/Admin';

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
    <ErrorBoundary componentName="App">
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<GuestGuard><Login /></GuestGuard>} />
        <Route path="/" element={<AuthGuard><Home /></AuthGuard>} />
        <Route path="/lineage" element={<AuthGuard><DgmLineage /></AuthGuard>} />
        <Route path="/dgm" element={<AuthGuard><DgmLineage /></AuthGuard>} />
        <Route path="/admin" element={<AuthGuard><Admin /></AuthGuard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
