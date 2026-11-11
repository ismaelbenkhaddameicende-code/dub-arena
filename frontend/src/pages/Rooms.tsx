import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RoomSummary } from '@dub-arena/shared';
import { FolderOpen, Plus, Users } from 'lucide-react';
import { roomsApi } from '../services/rooms';
import { Alert, Badge, Button, EmptyState, Spinner } from '../components/ui';
import { relative } from '../lib/format';

export default function RoomsPage() {
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    roomsApi.list()
      .then((data) => setRooms(data.rooms))
      .catch((err: Error) => { setError(err.message); setRooms([]); });
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white">Salas de doblaje</h1>
          <p className="hint">Todas las salas en las que participas</p>
        </div>
        <Link to="/?nueva=1"><Button><Plus className="h-4 w-4" /> Crear sala</Button></Link>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {rooms === null && <Spinner label="Cargando salas" />}
      {rooms?.length === 0 && (
        <EmptyState icon={<FolderOpen className="h-5 w-5" />} title="Sin salas todavia"
          description="Cuando crees o te unas a una sala, aparecera aqui." />
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rooms?.map((room) => (
          <Link key={room.id} to={`/sala/${room.id}`} className="panel p-4 transition hover:border-accent/40">
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate font-display text-[15px] font-semibold text-white">{room.name}</h3>
              <Badge tone={room.status === 'closed' ? 'neutral' : room.status === 'live' ? 'live' : 'accent'}>
                {room.status === 'live' ? 'En directo' : room.status === 'closed' ? 'Cerrada' : 'Abierta'}
              </Badge>
            </div>
            <p className="mt-1 text-[11px] text-zinc-500">Creada {relative(room.createdAt)}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="chip font-display tracking-[0.2em]">{room.code}</span>
              <span className="chip"><Users className="h-3 w-3" /> {room.participantCount}/{room.maxParticipants}</span>
              {room.hasAnalysis && <Badge tone="ok">Analizada</Badge>}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
