import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Recording, RoomDetail, VoiceEffectSettings } from '@dub-arena/shared';
import { DEFAULT_EFFECTS } from '@dub-arena/shared';
import { AudioWaveform, Check, Copy, Film, LogOut, ScissorsLineDashed, Upload } from 'lucide-react';
import { roomsApi } from '../services/rooms';
import { useAuth } from '../store/auth';
import { useRoomSocket } from '../hooks/useRoomSocket';
import { useMediaUrl } from '../hooks/useMediaUrl';
import { expectedPosition } from '../hooks/usePlaybackSync';
import { VideoStage } from '../components/room/VideoStage';
import { PlaybackControls } from '../components/room/PlaybackControls';
import { ParticipantsPanel } from '../components/room/ParticipantsPanel';
import { NoticeFeed } from '../components/room/NoticeFeed';
import { RecorderPanel } from '../components/recorder/RecorderPanel';
import { EffectsRack } from '../components/recorder/EffectsRack';
import { Alert, Badge, Button, Modal, Spinner } from '../components/ui';
import { getToken } from '../lib/api';

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const token = getToken();

  const [initialRoom, setInitialRoom] = useState<RoomDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [effects, setEffects] = useState<VoiceEffectSettings>({ ...DEFAULT_EFFECTS });
  const [presetId, setPresetId] = useState('natural');
  const [copied, setCopied] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { room: liveRoom, playback, notices, connected, error: socketError, command, setRoom, refresh } = useRoomSocket(roomId, token);
  const room = liveRoom ?? initialRoom;

  const videoUrl = useMediaUrl(room?.videoId, 'media');

  const loadRecordings = useCallback(async () => {
    if (!roomId) return;
    try {
      const data = await roomsApi.recordings(roomId);
      setRecordings(data.recordings);
    } catch {
      setRecordings([]);
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    roomsApi.detail(roomId)
      .then((data) => { setInitialRoom(data.room); setRoom(data.room); })
      .catch((err: Error) => setLoadError(err.message));
    void loadRecordings();
  }, [roomId, setRoom, loadRecordings]);

  const isHost = Boolean(room && user && room.hostId === user.id);

  const getPosition = useCallback((): number => {
    if (!playback) return 0;
    return expectedPosition(playback);
  }, [playback]);

  const copyCode = async (): Promise<void> => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setActionError('No se pudo copiar el codigo. Copialo manualmente.');
    }
  };

  const uploadVideo = async (file: File): Promise<void> => {
    if (!roomId) return;
    setActionError(null);
    setUploadPct(0);
    try {
      await roomsApi.uploadVideo(roomId, file, setUploadPct);
      const data = await roomsApi.detail(roomId);
      setRoom(data.room);
      setInitialRoom(data.room);
      refresh();
      setUploadOpen(false);
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setUploadPct(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const leaveRoom = async (): Promise<void> => {
    if (!roomId) return;
    try {
      await roomsApi.leave(roomId);
      navigate('/salas');
    } catch (error) {
      setActionError((error as Error).message);
    }
  };

  const kick = async (userId: string): Promise<void> => {
    if (!roomId) return;
    try { await roomsApi.kick(roomId, userId); } catch (error) { setActionError((error as Error).message); }
  };

  const assign = async (userId: string, characterId: string | null): Promise<void> => {
    if (!roomId) return;
    try {
      await roomsApi.assign(roomId, userId, characterId);
      const data = await roomsApi.detail(roomId);
      setRoom(data.room);
    } catch (error) {
      setActionError((error as Error).message);
    }
  };

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Alert tone="error" title="No se pudo abrir la sala">{loadError}</Alert>
        <div className="mt-4"><Button variant="ghost" onClick={() => navigate('/salas')}>Volver a mis salas</Button></div>
      </div>
    );
  }

  if (!room || !user) return <div className="grid min-h-[40vh] place-items-center"><Spinner label="Entrando en la sala" /></div>;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="max-w-[60vw] truncate font-display text-lg font-bold text-white sm:max-w-none sm:text-xl">{room.name}</h1>
              <Badge tone={connected ? 'ok' : 'warn'}>{connected ? 'En linea' : 'Reconectando'}</Badge>
            </div>
            <button onClick={() => void copyCode()} className="mt-1 flex items-center gap-1.5 text-[12px] text-zinc-400 hover:text-accent-soft">
              <span className="font-display tracking-[0.25em] text-zinc-200">{room.code}</span>
              {copied ? <Check className="h-3 w-3 text-mint" /> : <Copy className="h-3 w-3" />}
              <span>{copied ? 'Copiado' : 'Copiar codigo'}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/sala/${room.id}/analisis`}>
            <Button variant="ghost" aria-label="Analisis de escena"><ScissorsLineDashed className="h-4 w-4" /> <span className="hidden sm:inline">Analisis</span></Button>
          </Link>
          <Link to={`/sala/${room.id}/editor`}>
            <Button variant="ghost" aria-label="Editor multipista"><AudioWaveform className="h-4 w-4" /> <span className="hidden sm:inline">Editor</span></Button>
          </Link>
          {isHost && (
            <Button onClick={() => setUploadOpen(true)} aria-label="Subir clip">
              <Upload className="h-4 w-4" /> <span className="hidden sm:inline">{room.videoId ? 'Cambiar clip' : 'Subir clip'}</span>
            </Button>
          )}
          <Button variant="danger" onClick={() => void leaveRoom()} aria-label="Salir de la sala"><LogOut className="h-4 w-4" /></Button>
        </div>
      </header>

      {(actionError || socketError || notices.some((n) => n.level === 'error')) && (
        <Alert tone="error">{actionError ?? socketError ?? notices.filter((n) => n.level === 'error').slice(-1)[0]?.message}</Alert>
      )}

      <div className="grid gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-4">
          <VideoStage src={videoUrl} playback={playback} isHost={isHost} title={room.name} onDuration={setVideoDuration} />

          {room.videoId ? (
            <PlaybackControls
              playback={playback}
              isHost={isHost}
              duration={videoDuration}
              command={async (action, position) => {
                const error = await command(action, position);
                return error;
              }}
              onError={(message) => setActionError(message)}
            />
          ) : (
            <div className="panel flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Film className="h-4 w-4 text-accent-soft" />
                {isHost ? 'Sube el clip que quereis doblar para empezar.' : 'Esperando a que el administrador suba el clip.'}
              </div>
              {isHost && <Button onClick={() => setUploadOpen(true)}><Upload className="h-4 w-4" /> Subir clip</Button>}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <RecorderPanel
              roomId={room.id}
              effects={effects}
              effectsPresetId={presetId}
              getPosition={getPosition}
              recordings={recordings}
              currentUserId={user.id}
              onSaved={() => { void loadRecordings(); refresh(); }}
              onNotify={(level, message) => {
                if (level === 'error') setActionError(message);
              }}
            />
            <EffectsRack
              settings={effects}
              presetId={presetId}
              onChange={(nextPreset, nextSettings) => { setPresetId(nextPreset); setEffects(nextSettings); }}
              pitchSupported
            />
          </div>
        </div>

        <aside className="space-y-4">
          <ParticipantsPanel
            participants={room.participants}
            characters={room.characters}
            currentUserId={user.id}
            isHost={isHost}
            onKick={(userId) => void kick(userId)}
            onAssign={(userId, characterId) => void assign(userId, characterId)}
          />

          <section className="panel p-4">
            <h3 className="mb-2 font-display text-sm font-semibold text-white">Reparto</h3>
            {room.characters.length === 0 ? (
              <p className="hint">Aun no hay personajes. Ejecuta el analisis automatico o crealos a mano en el editor.</p>
            ) : (
              <ul className="space-y-1.5">
                {room.characters.map((character) => {
                  const owner = room.participants.find((p) => p.characterId === character.id);
                  return (
                    <li key={character.id} className="flex items-center gap-2 rounded-lg border border-line/60 bg-ink-900/50 px-2.5 py-1.5">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: character.color }} />
                      <span className="flex-1 truncate text-[12px] font-medium text-zinc-200">{character.name}</span>
                      <span className="truncate text-[11px] text-zinc-500">{owner?.displayName ?? 'libre'}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <NoticeFeed notices={notices} />

          <section className="panel-tight p-3">
            <p className="text-[11px] leading-relaxed text-zinc-500">
              {room.videoId ? `Clip de ${videoDuration ? Math.round(videoDuration) : '?'}s` : 'Sin clip'} · {recordings.length} tomas guardadas ·{' '}
              {room.participants.filter((p) => p.connected).length}/{room.maxParticipants} conectados
            </p>
          </section>
        </aside>
      </div>

      <Modal open={uploadOpen} onClose={() => { if (uploadPct === null) setUploadOpen(false); }} title="Subir clip para doblar">
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            Formatos admitidos: MP4, WebM, MOV o MKV. Tamano maximo 300 MB.
            Sube solo material sobre el que tengas derechos de uso.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
            className="block w-full cursor-pointer rounded-xl border border-line bg-ink-900 p-3 text-sm text-zinc-300 file:mr-3 file:rounded-lg file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadVideo(file);
            }}
          />
          {uploadPct !== null && (
            <div>
              <div className="h-2 overflow-hidden rounded-full bg-ink-800">
                <div className="h-full bg-accent transition-all" style={{ width: `${uploadPct}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-400">Subiendo... {uploadPct}%</p>
            </div>
          )}
          {actionError && <Alert tone="error">{actionError}</Alert>}
        </div>
      </Modal>
    </div>
  );
}
