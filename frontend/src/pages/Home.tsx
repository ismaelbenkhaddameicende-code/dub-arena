import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { RoomSummary } from '@dub-arena/shared';
import { ArrowRight, Film, KeyRound, Mic2, Plus, Sparkles, Users } from 'lucide-react';
import { roomsApi } from '../services/rooms';
import { useAuth } from '../store/auth';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Spinner, Avatar } from '../components/ui';
import { InstallPrompt } from '../components/InstallPrompt';
import { relative } from '../lib/format';

export default function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await roomsApi.list();
      setRooms(data.rooms);
    } catch (err) {
      setError((err as Error).message);
      setRooms([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (params.get('nueva')) setCreating(true); }, [params]);

  const closeModal = (): void => {
    setCreating(false);
    if (params.get('nueva')) { params.delete('nueva'); setParams(params, { replace: true }); }
  };

  const createRoom = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const { room } = await roomsApi.create(name.trim() || 'Sala sin titulo');
      navigate(`/sala/${room.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const joinRoom = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    setBusy(true); setError(null);
    try {
      const { room } = await roomsApi.joinByCode(code.trim().toUpperCase());
      navigate(`/sala/${room.id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      <InstallPrompt />
      <section className="panel relative overflow-hidden p-0">
        <div className="grid-noise absolute inset-0 opacity-40" />
        <div className="relative grid gap-8 p-6 sm:p-9 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <div className="space-y-5">
            <Badge tone="live"><span className="h-1.5 w-1.5 rounded-full bg-rose animate-pulse-live" /> Estudio abierto</Badge>
            <h1 className="font-display text-3xl font-bold leading-tight text-white sm:text-[40px]">
              Hola, {user?.displayName.split(' ')[0]}.<br />
              <span className="text-zinc-400">Tu proxima escena te espera.</span>
            </h1>
            <p className="max-w-lg text-sm leading-relaxed text-zinc-400">
              Abre una sala, comparte el codigo y doblad juntos con el video sincronizado al milisegundo.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Crear sala</Button>
              <Button variant="ghost" onClick={() => document.getElementById('join-code')?.focus()}>
                <KeyRound className="h-4 w-4" /> Unirme con codigo
              </Button>
            </div>
          </div>

          <Card className="bg-ink-900/80">
            <h3 className="mb-3 font-display text-sm font-semibold text-white">Unirme a una sala</h3>
            <form onSubmit={joinRoom} className="space-y-3">
              <Field label="Codigo de sala">
                <Input id="join-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABC123" maxLength={8} className="text-center font-display text-lg tracking-[0.4em]" />
              </Field>
              <Button type="submit" loading={busy} className="w-full" disabled={code.trim().length < 4}>
                Entrar en la sala
              </Button>
            </form>
          </Card>
        </div>
      </section>

      {error && <Alert tone="error">{error}</Alert>}

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: <Film className="h-4 w-4" />, label: 'Video sincronizado', value: 'Reloj de servidor' },
          { icon: <Users className="h-4 w-4" />, label: 'Aforo por sala', value: '4 dobladores' },
          { icon: <Mic2 className="h-4 w-4" />, label: 'Pistas independientes', value: 'Una por personaje' },
        ].map((item) => (
          <div key={item.label} className="panel-tight flex items-center gap-3 p-4">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/10 text-accent-soft">{item.icon}</span>
            <div>
              <p className="text-[11px] uppercase tracking-widest text-zinc-500">{item.label}</p>
              <p className="text-sm font-semibold text-white">{item.value}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-white">Proyectos recientes</h2>
            <p className="hint">Salas en las que participas</p>
          </div>
          <Link to="/salas" className="text-[13px] font-semibold text-accent-soft hover:text-white">Ver todas</Link>
        </div>

        {rooms === null && <Spinner label="Cargando proyectos" />}
        {rooms?.length === 0 && (
          <EmptyState
            icon={<Sparkles className="h-5 w-5" />}
            title="Todavia no hay proyectos"
            description="Crea tu primera sala, sube un clip y empieza a doblar con tus companeros."
            action={<Button onClick={() => setCreating(true)}><Plus className="h-4 w-4" /> Crear sala</Button>}
          />
        )}
        {rooms && rooms.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rooms.slice(0, 6).map((room) => (
              <Link key={room.id} to={`/sala/${room.id}`} className="panel group p-4 transition hover:border-accent/40 hover:shadow-glow">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-display text-[15px] font-semibold text-white group-hover:text-accent-soft">{room.name}</h3>
                    <p className="mt-0.5 text-[11px] text-zinc-500">Actualizada {relative(room.updatedAt)}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-accent-soft" />
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <span className="chip font-display tracking-[0.2em]">{room.code}</span>
                  <span className="chip"><Users className="h-3 w-3" /> {room.participantCount}/{room.maxParticipants}</span>
                  {room.videoId ? <Badge tone="ok">Clip listo</Badge> : <Badge tone="warn">Sin clip</Badge>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <Modal open={creating} onClose={closeModal} title="Nueva sala de doblaje">
        <form onSubmit={createRoom} className="space-y-4">
          <Field label="Nombre de la sala" hint="Por ejemplo: Escena 3 - La batalla final">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mi primera escena" autoFocus maxLength={80} />
          </Field>
          <div className="panel-tight flex items-center gap-3 p-3">
            <Avatar name={user?.displayName ?? 'Yo'} color={user?.avatarColor ?? '#7c5cff'} size={30} />
            <div className="text-xs text-zinc-400">
              Seras el administrador: podras subir el video, controlar la reproduccion y asignar personajes.
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={closeModal}>Cancelar</Button>
            <Button type="submit" loading={busy}>Crear sala</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
