import type { ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AudioLines, DoorOpen, LogOut, Plus, User, Users } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../store/auth';
import { Avatar, Button } from './ui';

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="group flex items-center gap-2.5">
      <span className="relative grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-accent to-cyan shadow-glow">
        <AudioLines className="h-5 w-5 text-white" />
      </span>
      {!compact && (
        <span className="font-display text-[15px] font-bold tracking-[0.16em] text-white group-hover:text-accent-soft transition">
          DUB<span className="text-accent-soft">ARENA</span>
        </span>
      )}
    </Link>
  );
}

const navItem = ({ isActive }: { isActive: boolean }) => clsx(
  'rounded-lg px-3 py-1.5 text-[13px] font-medium transition',
  isActive ? 'bg-ink-700/80 text-white' : 'text-zinc-400 hover:bg-ink-800/70 hover:text-zinc-100',
);

const bottomItem = ({ isActive }: { isActive: boolean }) => clsx(
  'flex flex-1 flex-col items-center gap-0.5 rounded-lg px-2 py-2 text-[10px] font-semibold transition',
  isActive ? 'text-accent-soft' : 'text-zinc-500',
);

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const activeRoom = location.pathname.match(/^\/sala\/([^/]+)/)?.[1];

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-line/70 bg-ink-950/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Logo />
            <nav className="hidden items-center gap-1 sm:flex">
              <NavLink to="/" className={navItem} end>Inicio</NavLink>
              <NavLink to="/salas" className={navItem}>Salas</NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" className="hidden sm:inline-flex" onClick={() => navigate('/?nueva=1')}>
              <Plus className="h-4 w-4" /> Nueva sala
            </Button>
            {user && (
              <div className="flex items-center gap-2">
                <Link to="/perfil" className="flex items-center gap-2 rounded-xl border border-line bg-ink-800/60 px-2 py-1.5 hover:border-accent/40 transition">
                  <Avatar name={user.displayName} color={user.avatarColor} size={26} />
                  <span className="hidden text-[13px] font-medium text-zinc-200 sm:block">{user.displayName}</span>
                </Link>
                <button
                  onClick={() => { logout(); navigate('/entrar'); }}
                  className="rounded-lg p-2 text-zinc-500 hover:bg-ink-800 hover:text-rose"
                  title="Cerrar sesion"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            )}
            {!user && (
              <Button onClick={() => navigate('/entrar')}>
                <User className="h-4 w-4" /> Entrar
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 pb-24 sm:px-6 sm:py-8 md:pb-8">{children}</main>

      {/* Navegacion inferior solo en movil */}
      {user && (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line/70 bg-ink-950/95 backdrop-blur-xl md:hidden safe-b">
          <div className="flex items-stretch px-2 py-1">
            <NavLink to="/" end className={bottomItem}>
              <AudioLines className="h-5 w-5" /> Inicio
            </NavLink>
            <NavLink to="/salas" className={bottomItem}>
              <Users className="h-5 w-5" /> Salas
            </NavLink>
            {activeRoom ? (
              <NavLink to={`/sala/${activeRoom}`} className={bottomItem}>
                <DoorOpen className="h-5 w-5" /> Sala
              </NavLink>
            ) : (
              <button onClick={() => navigate('/?nueva=1')} className={clsx(bottomItem({ isActive: false }))}>
                <Plus className="h-5 w-5" /> Nueva
              </button>
            )}
            <NavLink to="/perfil" className={bottomItem}>
              <User className="h-5 w-5" /> Perfil
            </NavLink>
          </div>
        </nav>
      )}

      <footer className="hidden border-t border-line/60 py-6 md:block">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 text-[11px] text-zinc-600 sm:flex-row sm:px-6">
          <span>DUB ARENA · doblaje colaborativo</span>
          <span>Sube solo material sobre el que tengas derechos de uso.</span>
        </div>
      </footer>
    </div>
  );
}
