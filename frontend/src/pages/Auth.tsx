import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AudioLines, Lock, Mail, User } from 'lucide-react';
import { useAuth } from '../store/auth';
import { Alert, Button, Field, Input } from '../components/ui';

export default function AuthPage() {
  const { login, register, user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) { navigate('/', { replace: true }); }

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, displayName);
      navigate('/', { replace: true });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-10 py-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
      <section className="space-y-6">
        <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-accent-soft">
          <AudioLines className="h-3.5 w-3.5" /> Doblaje colaborativo
        </div>
        <h1 className="font-display text-4xl font-bold leading-tight text-white sm:text-5xl">
          Graba, sincroniza y dobla<br />
          <span className="bg-gradient-to-r from-accent-soft to-cyan bg-clip-text text-transparent">la misma escena</span> a la vez.
        </h1>
        <p className="max-w-md text-[15px] leading-relaxed text-zinc-400">
          Crea una sala, sube el clip, reparte personajes y grabad juntos. Cada voz se guarda en su
          propia pista y el editor multipista une todo en un unico video.
        </p>
        <ul className="space-y-2 text-sm text-zinc-400">
          {[
            'Reproduccion sincronizada al reloj del servidor',
            'Analisis automatico de voces y dialogos con IA local',
            'Efectos de voz y editor multipista con formas de onda',
            'Exportacion final MP4 desde el servidor con FFmpeg',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <div className="panel p-6">
        <div className="mb-5 flex rounded-xl border border-line bg-ink-900 p-1">
          {(['login', 'register'] as const).map((value) => (
            <button
              key={value}
              onClick={() => { setMode(value); setError(null); }}
              className={`flex-1 rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
                mode === value ? 'bg-accent text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {value === 'login' ? 'Iniciar sesion' : 'Crear cuenta'}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="space-y-4">
          {mode === 'register' && (
            <Field label="Nombre visible">
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-600" />
                <Input className="pl-9" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Como te veran tus companeros" required minLength={2} maxLength={40} />
              </div>
            </Field>
          )}
          <Field label="Correo">
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-600" />
              <Input className="pl-9" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com" required autoComplete="email" />
            </div>
          </Field>
          <Field label="Contrasena" hint={mode === 'register' ? 'Minimo 8 caracteres.' : undefined}>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-zinc-600" />
              <Input className="pl-9" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="********" required minLength={mode === 'register' ? 8 : 1}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'} />
            </div>
          </Field>

          {error && <Alert tone="error">{error}</Alert>}

          <Button type="submit" loading={loading} className="w-full">
            {mode === 'login' ? 'Entrar en DUB ARENA' : 'Crear mi cuenta'}
          </Button>
        </form>

        <p className="mt-4 hint">
          Tu cuenta se guarda en la base de datos local del proyecto (SQLite). No se envia nada a servicios externos.
        </p>
      </div>
    </div>
  );
}
