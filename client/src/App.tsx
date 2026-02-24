import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { trpc } from '@/lib/trpc';
import Home from './pages/Home';
import DgmLineage from './pages/DgmLineage';
import Login from './pages/Login';
import Admin from './pages/Admin';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { data: user, isLoading } = trpc.auth.me.useQuery();
  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#07070f', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 40, height: 40, border: '3px solid rgba(124,58,237,0.3)', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
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
  );
}

export default App;
