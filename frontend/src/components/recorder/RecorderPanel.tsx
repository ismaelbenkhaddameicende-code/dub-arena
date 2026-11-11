import { useEffect, useMemo, useRef, useState } from 'react';
import type { Recording, VoiceEffectSettings } from '@dub-arena/shared';
import { Circle, Mic, MicOff, Pause, Play, Square, Trash2, Upload } from 'lucide-react';
import clsx from 'clsx';
import { useRecorder } from '../../hooks/useRecorder';
import { roomsApi } from '../../services/rooms';
import { signedUrl } from '../../lib/api';
import { Alert, Button } from '../ui';
import { clock } from '../../lib/format';

interface Props {
  roomId: string;
  effects: VoiceEffectSettings;
  effectsPresetId: string;
  getPosition: () => number;
  recordings: Recording[];
  currentUserId: string;
  onSaved: () => void;
  onNotify: (level: 'info' | 'warn' | 'error', message: string) => void;
}

export function RecorderPanel({
  roomId, effects, effectsPresetId, getPosition, recordings, currentUserId, onSaved, onNotify,
}: Props) {
  const recorder = useRecorder(effects);
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [takeUrl, setTakeUrl] = useState<{ id: string; url: string } | null>(null);
  const startedAt = useRef(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!recorder.recording || recorder.paused) return;
    const timer = window.setInterval(() => setElapsed((Date.now() - startedAt.current) / 1000), 100);
    return () => window.clearInterval(timer);
  }, [recorder.recording, recorder.paused]);

  const myTakes = useMemo(() => recordings.filter((r) => r.userId === currentUserId).slice(-4).reverse(), [recordings, currentUserId]);

  const startRecording = async (): Promise<void> => {
    const position = getPosition();
    const ok = await recorder.start(position);
    if (!ok) { onNotify('error', 'No se pudo iniciar la grabacion. Revisa el microfono.'); return; }
    startedAt.current = Date.now();
    setElapsed(0);
    onNotify('info', `Grabando desde ${clock(position)}`);
  };

  const stopRecording = async (): Promise<void> => {
    const take = await recorder.stop();
    if (!take) { onNotify('warn', 'La toma quedo vacia.'); return; }
    setUploading(true);
    try {
      await roomsApi.uploadRecording(roomId, take.blob, {
        startTime: take.startTime,
        endTime: take.endTime,
        effects: { presetId: effectsPresetId, settings: effects },
      });
      onNotify('info', `Toma guardada (${take.duration.toFixed(1)}s)`);
      onSaved();
    } catch (error) {
      onNotify('error', `No se pudo subir la toma: ${(error as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const playTake = async (recording: Recording): Promise<void> => {
    const url = await signedUrl(recording.id, 'recording');
    setTakeUrl({ id: recording.id, url });
    window.setTimeout(() => void audioRef.current?.play(), 60);
  };

  const removeTake = async (recording: Recording): Promise<void> => {
    try {
      await roomsApi.deleteRecording(recording.id);
      onNotify('info', 'Toma eliminada');
      onSaved();
    } catch (error) {
      onNotify('error', (error as Error).message);
    }
  };

  return (
    <section className="panel p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-white">
          <Mic className="h-4 w-4 text-accent-soft" /> Estudio de grabacion
        </h3>
        {recorder.ready ? (
          <span className="chip border-mint/40 text-mint"><span className="h-1.5 w-1.5 rounded-full bg-mint" /> Micro listo</span>
        ) : (
          <span className="chip"><MicOff className="h-3 w-3" /> Micro apagado</span>
        )}
      </header>

      {recorder.error && <div className="mb-3"><Alert tone="error">{recorder.error}</Alert></div>}

      {!recorder.ready && (
        <div className="mb-3 space-y-2">
          <Button className="w-full" onClick={() => void recorder.requestMicrophone()}>
            <Mic className="h-4 w-4" /> Activar microfono
          </Button>
          <p className="hint">El navegador pedira permiso. Usa auriculares para evitar eco con el video.</p>
        </div>
      )}

      {recorder.ready && (
        <div className="mb-3 space-y-2">
          {recorder.devices.length > 1 && (
            <select
              value={recorder.deviceId}
              onChange={(e) => { recorder.setDeviceId(e.target.value); void recorder.requestMicrophone(e.target.value); }}
              className="input text-xs"
              aria-label="Seleccionar microfono"
            >
              {recorder.devices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microfono ${index + 1}`}
                </option>
              ))}
            </select>
          )}

          <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-ink-800">
            {Array.from({ length: 24 }).map((_, index) => {
              const active = recorder.level * 24 > index;
              const hot = index > 19;
              return (
                <span
                  key={index}
                  className={clsx('h-full flex-1 transition-colors', active ? (hot ? 'bg-rose' : index > 14 ? 'bg-amber' : 'bg-mint') : 'bg-transparent')}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        {!recorder.recording ? (
          <Button onClick={() => void startRecording()} disabled={uploading} className="flex-1 py-3.5 text-[15px] sm:py-2.5 sm:text-sm">
            <Circle className="h-4 w-4 fill-current" /> Grabar mi personaje
          </Button>
        ) : (
          <>
            <div className="flex flex-1 items-center gap-2 rounded-xl border border-rose/40 bg-rose/10 px-3 py-2">
              <span className="h-2 w-2 rounded-full bg-rose animate-pulse-live" />
              <span className="font-display text-sm tabular-nums text-rose">{clock(elapsed)}</span>
              <span className="text-[11px] text-rose/80">{recorder.paused ? 'en pausa' : 'grabando'}</span>
            </div>
            {recorder.paused ? (
              <Button variant="ghost" onClick={recorder.resume}><Play className="h-4 w-4" /></Button>
            ) : (
              <Button variant="ghost" onClick={recorder.pause}><Pause className="h-4 w-4" /></Button>
            )}
            <Button variant="danger" onClick={() => void stopRecording()} loading={uploading}><Square className="h-4 w-4" /></Button>
          </>
        )}
      </div>

      {uploading && <p className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-400"><Upload className="h-3 w-3" /> Subiendo tu toma al servidor...</p>}

      {myTakes.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <p className="label">Mis ultimas tomas</p>
          {myTakes.map((take) => (
            <div key={take.id} className="flex items-center gap-2 rounded-lg border border-line/70 bg-ink-900/60 px-2.5 py-1.5">
              <button onClick={() => void playTake(take)} className="rounded-md p-1 text-zinc-400 hover:text-accent-soft" title="Escuchar">
                <Play className="h-3.5 w-3.5" />
              </button>
              <span className="font-display text-[11px] tabular-nums text-zinc-400">
                {clock(take.startTime)} - {clock(take.endTime)}
              </span>
              <span className="text-[10px] text-zinc-600">toma {take.takeNumber}</span>
              <div className="flex-1" />
              <button onClick={() => void removeTake(take)} className="rounded-md p-1 text-zinc-600 hover:text-rose" title="Eliminar toma">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {takeUrl && <audio ref={audioRef} src={takeUrl.url} controls className="mt-2 w-full" />}
        </div>
      )}
    </section>
  );
}
