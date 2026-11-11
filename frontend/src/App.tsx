import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Spinner } from './components/ui';
import { useAuth } from './store/auth';
import AuthPage from './pages/Auth';
import HomePage from './pages/Home';
import RoomsPage from './pages/Rooms';
import RoomPage from './pages/Room';
import AnalysisPage from './pages/Analysis';
import StudioPage from './pages/Studio';
import ProfilePage from './pages/Profile';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return <div className="grid min-h-[50vh] place-items-center"><Spinner label="Comprobando sesion" /></div>;
  }
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  return <>{children}</>;
}

export default function App() {
  const init = useAuth((s) => s.init);

  useEffect(() => { void init(); }, [init]);

  return (
    <AppShell>
      <Routes>
        <Route path="/entrar" element={<AuthPage />} />
        <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
        <Route path="/salas" element={<RequireAuth><RoomsPage /></RequireAuth>} />
        <Route path="/sala/:roomId" element={<RequireAuth><RoomPage /></RequireAuth>} />
        <Route path="/sala/:roomId/analisis" element={<RequireAuth><AnalysisPage /></RequireAuth>} />
        <Route path="/sala/:roomId/editor" element={<RequireAuth><StudioPage /></RequireAuth>} />
        <Route path="/perfil" element={<RequireAuth><ProfilePage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
