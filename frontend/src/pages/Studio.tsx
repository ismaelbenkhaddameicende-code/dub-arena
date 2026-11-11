import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ExportJob, Recording, RoomDetail, TimelineClip, TimelineTrack } from '@dub-arena/shared';
import {
  ArrowLeft, Download, Film, Pause, Play, Redo2, Save, SkipBack, Trash2, Undo2, Upload, ZoomIn, ZoomOut,
} from 'lucide-react';
import { roomsApi } from '../services/rooms';
import { signedUrl } from '../lib/api';
import { extractPeaks, type Peaks } from '../lib/waveform';
import { Timeline } from '../components/editor/Timeline';
import { Alert, Badge, Button, Card, Modal, Spinner } from '../components/ui';
import { bytes, clockMs } from '../lib/format';

export default function StudioPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [tracks, setTracks] = useState<TimelineTrack[]>([]);
  const [peaks, setPeaks] = useState<Map<string, Peaks>>(new Map());
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pxPerSec, setPxPerSec] = useState(48);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [keepOriginal, setKeepOriginal] = useState(true);
  const [originalGain, setOriginalGain] = useState(0.8);
  const [job, setJob] = useState<ExportJob | null>(null);
  const [exporting, setExporting] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const historyRef = useRef<{ past: TimelineTrack[][]; future: TimelineTrack[][] }>({ past: [], future: [] });
  const rafRef = useRef(0);

  const videoDuration = useMemo(() => {
    const original = tracks.find((t) => t.kind === 'original');
    void original;
    return Math.max(10, videoRef.current?.duration || room?.videoId ? (videoRef.current?.duration ?? 10) : 10);
  }, [tracks, room?.videoId, playhead]);

  const buildTracks = useCallback((detail: RoomDetail, recs: Recording[], saved: TimelineTrack[] | null): TimelineTrack[] => {
    if (saved && saved.length > 0) return saved;
    const byUser = new Map<string, Recording[]>();
    for (const recording of recs) {
      const list = byUser.get(recording.userId) ?? [];
      list.push(recording);
      byUser.set(recording.userId, list);
    }

    const voiceTracks: TimelineTrack[] = Array.from(byUser.entries()).map(([userId, list], index) => {
      const participant = detail.participants.find((p) => p.userId === userId);
      const character = detail.characters.find((c) => c.id === list[0]?.characterId);
      return {
        id: `track_${userId}`,
        kind: 'voice',
        label: character?.name ?? participant?.displayName ?? `Doblador ${index + 1}`,
        userId,
        characterId: character?.id ?? null,
        color: participant?.avatarColor ?? '#7c5cff',
        muted: false,
        gain: 1,
        clips: list.map<TimelineClip>((recording) => ({
          id: `clip_${recording.id}`,
          recordingId: recording.id,
          trackId: `track_${userId}`,
          label: `Toma ${recording.takeNumber}`,
          startTime: recording.startTime,
          inPoint: 0,
          outPoint: recording.duration,
          gain: 1,
          muted: false,
          sourceUrl: null,
        })),
      };
    });

    return [{
      id: 'track_original',
      kind: 'original',
      label: 'Audio original',
      userId: null,
      characterId: null,
      color: '#22d3ee',
      muted: false,
      gain: 1,
      clips: [],
    }, ...voiceTracks];
  }, []);

  const load = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    try {
      const [detail, recs, timeline] = await Promise.all([
        roomsApi.detail(roomId), roomsApi.recordings(roomId), roomsApi.timeline(roomId),
      ]);
      setRoom(detail.room);
      setRecordings(recs.recordings);
      setTracks(buildTracks(detail.room, recs.recordings, timeline.timeline?.tracks ?? null));
      if (detail.room.videoId) setVideoUrl(await signedUrl(detail.room.videoId, 'media'));

      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const map = new Map<string, Peaks>();
      for (const recording of recs.recordings) {
        try {
          const url = await signedUrl(recording.id, 'recording');
          const buffer = await fetch(url).then((res) => res.arrayBuffer());
          const decoded = await ctx.decodeAudioData(buffer);
          buffersRef.current.set(recording.id, decoded);
          map.set(recording.id, extractPeaks(decoded, 600));
        } catch {
          // Un archivo ilegible no bloquea el editor: se omite su forma de onda
        }
      }
      setPeaks(map);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [roomId, buildTracks]);

  useEffect(() => {
    void load();
    return () => {
      window.cancelAnimationFrame(rafRef.current);
      sourcesRef.current.forEach((source) => { try { source.stop(); } catch { /* ya parada */ } });
      void ctxRef.current?.close();
    };
  }, [load]);

  const snapshot = (): void => {
    historyRef.current.past.push(JSON.parse(JSON.stringify(tracks)) as TimelineTrack[]);
    historyRef.current.future = [];
    if (historyRef.current.past.length > 40) historyRef.current.past.shift();
  };

  const undo = (): void => {
    const previous = historyRef.current.past.pop();
    if (!previous) return;
    historyRef.current.future.push(JSON.parse(JSON.stringify(tracks)) as TimelineTrack[]);
    setTracks(previous);
  };

  const redo = (): void => {
    const next = historyRef.current.future.pop();
    if (!next) return;
    historyRef.current.past.push(JSON.parse(JSON.stringify(tracks)) as TimelineTrack[]);
    setTracks(next);
  };

  const stopSources = (): void => {
    sourcesRef.current.forEach((source) => { try { source.stop(); } catch { /* ya parada */ } });
    sourcesRef.current = [];
  };

  const scheduleClips = useCallback((fromPosition: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    stopSources();
    for (const track of tracks) {
      if (track.kind !== 'voice' || track.muted) continue;
      for (const clip of track.clips) {
        if (clip.muted || !clip.recordingId) continue;
        const buffer = buffersRef.current.get(clip.recordingId);
        if (!buffer) continue;
        const clipEnd = clip.startTime + (clip.outPoint - clip.inPoint);
        if (clipEnd <= fromPosition) continue;
        const startAt = ctx.currentTime + Math.max(0, clip.startTime - fromPosition);
        const offset = clip.inPoint + Math.max(0, fromPosition - clip.startTime);
        const duration = clip.outPoint - offset;
        if (duration <= 0) continue;
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = track.gain * clip.gain;
        source.connect(gain).connect(ctx.destination);
        source.start(startAt, offset, duration);
        sourcesRef.current.push(source);
      }
    }
  }, [tracks]);

  const play = async (): Promise<void> => {
    const ctx = ctxRef.current;
    const video = videoRef.current;
    if (!ctx) return;
    await ctx.resume();
    if (video) {
      video.currentTime = playhead;
      video.volume = keepOriginal ? originalGain : 0;
      await video.play().catch(() => undefined);
    }
    scheduleClips(playhead);
    setPlaying(true);

    const tick = (): void => {
      const current = video?.currentTime ?? playhead;
      setPlayhead(current);
      rafRef.current = window.requestAnimationFrame(tick);
    };
    window.cancelAnimationFrame(rafRef.current);
    rafRef.current = window.requestAnimationFrame(tick);
  };

  const pause = (): void => {
    videoRef.current?.pause();
    stopSources();
    window.cancelAnimationFrame(rafRef.current);
    setPlaying(false);
  };

  const seek = (position: number): void => {
    const wasPlaying = playing;
    stopSources();
    setPlayhead(position);
    if (videoRef.current) videoRef.current.currentTime = position;
    if (wasPlaying) scheduleClips(position);
  };

  const changeClip = (trackId: string, clipId: string, patch: Partial<TimelineClip>): void => {
    if (!historyRef.current.past.length) snapshot();
    setTracks((prev) => prev.map((track) => track.id !== trackId ? track : {
      ...track,
      clips: track.clips.map((clip) => clip.id === clipId ? { ...clip, ...patch } : clip),
    }));
  };

  const deleteClip = (trackId: string, clipId: string): void => {
    snapshot();
    setTracks((prev) => prev.map((track) => track.id !== trackId ? track : {
      ...track, clips: track.clips.filter((clip) => clip.id !== clipId),
    }));
    setSelectedClipId(null);
  };

  const addRecordingToTimeline = (recording: Recording): void => {
    snapshot();
    const trackId = `track_${recording.userId}`;
    setTracks((prev) => {
      const exists = prev.some((t) => t.id === trackId);
      const clip: TimelineClip = {
        id: `clip_${recording.id}`,
        recordingId: recording.id,
        trackId,
        label: `Toma ${recording.takeNumber}`,
        startTime: recording.startTime,
        inPoint: 0,
        outPoint: recording.duration,
        gain: 1,
        muted: false,
        sourceUrl: null,
      };
      const base = exists ? prev : [...prev, {
        id: trackId, kind: 'voice' as const, label: `Doblador`, userId: recording.userId,
        characterId: recording.characterId, color: '#7c5cff', muted: false, gain: 1, clips: [],
      }];
      return base.map((track) => track.id === trackId ? { ...track, clips: [...track.clips, clip] } : track);
    });
  };

  const save = async (): Promise<void> => {
    if (!roomId) return;
    setSaving(true);
    try {
      await roomsApi.saveTimeline(roomId, tracks);
      setSavedAt(new Date().toISOString());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const startExport = async (): Promise<void> => {
    if (!roomId) return;
    setExporting(true);
    setError(null);
    try {
      const clips = tracks
        .filter((track) => track.kind === 'voice')
        .flatMap((track) => track.clips.map((clip) => ({
          recordingId: clip.recordingId ?? '',
          start: clip.startTime,
          inPoint: clip.inPoint,
          outPoint: clip.outPoint,
          gain: Number((track.gain * clip.gain).toFixed(3)),
          muted: clip.muted || track.muted,
        })))
        .filter((clip) => clip.recordingId);

      if (clips.length === 0) throw new Error('No hay tomas colocadas en la linea de tiempo');

      const { job: created } = await roomsApi.createExport(roomId, {
        keepOriginalAudio: keepOriginal, originalGain, clips,
      });
      setJob(created);

      const poll = window.setInterval(async () => {
        try {
          const { job: current } = await roomsApi.exportStatus(created.id);
          setJob(current);
          if (current.status === 'done' || current.status === 'error') {
            window.clearInterval(poll);
            setExporting(false);
          }
        } catch {
          window.clearInterval(poll);
          setExporting(false);
        }
      }, 1500);
    } catch (err) {
      setError((err as Error).message);
      setExporting(false);
    }
  };

  const unplaced = useMemo(() => {
    const placed = new Set(tracks.flatMap((track) => track.clips.map((clip) => clip.recordingId)));
    return recordings.filter((recording) => !placed.has(recording.id));
  }, [tracks, recordings]);

  const selectedClip = useMemo(() => {
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId);
      if (clip) return { track, clip };
    }
    return null;
  }, [tracks, selectedClipId]);

  if (loading) return <div className="grid min-h-[50vh] place-items-center"><Spinner label="Preparando el editor" /></div>;
  if (!room) return <Alert tone="error">{error ?? 'Sala no encontrada'}</Alert>;

  return (
    <div className="space-y-4">
      <div className="panel-tight flex items-center gap-2 p-3 text-[12px] text-amber lg:hidden">
        <Film className="h-4 w-4 shrink-0" />
        <span>En el movil el editor funciona, pero girar el telefono o usar el ordenador da mucha mas precision.</span>
      </div>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to={`/sala/${room.id}`} className="mb-1 inline-flex items-center gap-1 text-[12px] text-zinc-500 hover:text-white">
            <ArrowLeft className="h-3 w-3" /> Volver a la sala
          </Link>
          <h1 className="font-display text-xl font-bold text-white">Editor multipista</h1>
          <p className="hint">{room.name} · {recordings.length} tomas · {tracks.filter((t) => t.kind === 'voice').length} dobladores</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={undo} title="Deshacer"><Undo2 className="h-4 w-4" /></Button>
          <Button variant="ghost" onClick={redo} title="Rehacer"><Redo2 className="h-4 w-4" /></Button>
          <Button variant="ghost" onClick={() => void save()} loading={saving}><Save className="h-4 w-4" /> Guardar</Button>
          <Button onClick={() => setExportOpen(true)} disabled={!room.videoId}><Film className="h-4 w-4" /> Exportar video</Button>
        </div>
      </header>

      {error && <Alert tone="error">{error}</Alert>}
      {!room.videoId && <Alert tone="warn" title="Esta sala no tiene clip">Sube un video en la sala antes de exportar.</Alert>}
      {savedAt && <Alert tone="success">Linea de tiempo guardada.</Alert>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          <div className="panel overflow-hidden p-0">
            <div className="relative bg-black">
              {videoUrl ? (
                <video ref={videoRef} src={videoUrl} className="aspect-video w-full" preload="auto" onLoadedMetadata={() => setPlayhead(0)} />
              ) : (
                <div className="grid aspect-video place-items-center text-sm text-zinc-600">Sin video</div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2">
              <Button variant={playing ? 'ghost' : 'primary'} className="px-3 py-2" onClick={() => (playing ? pause() : void play())}>
                {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" className="px-2 py-2" onClick={() => seek(0)} title="Inicio"><SkipBack className="h-4 w-4" /></Button>
              <span className="font-display text-[11px] tabular-nums text-zinc-400">{clockMs(playhead)}</span>
              <div className="flex-1" />
              <ZoomOut className="h-4 w-4 text-zinc-500" />
              <input
                type="range" min={16} max={160} step={4} value={pxPerSec}
                onChange={(e) => setPxPerSec(Number(e.target.value))}
                className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
                aria-label="Zoom de la linea de tiempo"
              />
              <ZoomIn className="h-4 w-4 text-zinc-500" />
            </div>
          </div>

          <Timeline
            tracks={tracks}
            duration={Math.max(10, videoRef.current?.duration ?? 10, ...tracks.flatMap((t) => t.clips.map((c) => c.startTime + (c.outPoint - c.inPoint))))}
            pxPerSec={pxPerSec}
            playhead={playhead}
            selectedClipId={selectedClipId}
            peaks={peaks}
            onSelect={setSelectedClipId}
            onChangeClip={changeClip}
            onSeek={seek}
            onToggleMute={(trackId) => {
              snapshot();
              setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)));
            }}
            onGain={(trackId, gain) => setTracks((prev) => prev.map((t) => (t.id === trackId ? { ...t, gain } : t)))}
            onDeleteClip={deleteClip}
          />

          <p className="hint">
            Arrastra los clips para moverlos en el tiempo, usa los bordes blancos para recortar y haz doble clic para eliminar.
            La posicion se guarda respecto al video original.
          </p>
        </div>

        <aside className="space-y-3">
          <Card>
            <h3 className="mb-2 font-display text-sm font-semibold text-white">Clip seleccionado</h3>
            {selectedClip ? (
              <div className="space-y-2 text-[12px] text-zinc-300">
                <p className="font-semibold text-white">{selectedClip.clip.label}</p>
                <p className="text-zinc-500">{selectedClip.track.label}</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="label">Inicio (s)</span>
                    <input
                      type="number" step={0.05} min={0} value={selectedClip.clip.startTime}
                      onChange={(e) => changeClip(selectedClip.track.id, selectedClip.clip.id, { startTime: Math.max(0, Number(e.target.value)) })}
                      className="w-full rounded-md border border-line bg-ink-900 px-2 py-1 text-[12px] tabular-nums"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="label">Fin recorte (s)</span>
                    <input
                      type="number" step={0.05} min={0} value={selectedClip.clip.outPoint}
                      onChange={(e) => changeClip(selectedClip.track.id, selectedClip.clip.id, { outPoint: Math.max(0.1, Number(e.target.value)) })}
                      className="w-full rounded-md border border-line bg-ink-900 px-2 py-1 text-[12px] tabular-nums"
                    />
                  </label>
                </div>
                <Button variant="danger" className="w-full px-2 py-1.5 text-[12px]" onClick={() => deleteClip(selectedClip.track.id, selectedClip.clip.id)}>
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar clip
                </Button>
              </div>
            ) : <p className="hint">Selecciona un clip en la linea de tiempo.</p>}
          </Card>

          <Card>
            <h3 className="mb-2 font-display text-sm font-semibold text-white">Tomas sin colocar</h3>
            {unplaced.length === 0 ? <p className="hint">Todas las tomas estan en la linea de tiempo.</p> : (
              <ul className="space-y-1.5">
                {unplaced.map((recording) => (
                  <li key={recording.id} className="flex items-center gap-2 rounded-lg border border-line/60 bg-ink-900/50 px-2 py-1.5">
                    <span className="text-[11px] tabular-nums text-zinc-400">{clockMs(recording.startTime)}</span>
                    <span className="flex-1 truncate text-[11px] text-zinc-300">toma {recording.takeNumber}</span>
                    <button onClick={() => addRecordingToTimeline(recording)} className="rounded p-1 text-zinc-500 hover:text-accent-soft" title="Anadir">
                      <Upload className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h3 className="mb-2 font-display text-sm font-semibold text-white">Audio original</h3>
            <label className="flex items-center justify-between text-[12px] text-zinc-300">
              Incluir en la mezcla
              <input type="checkbox" checked={keepOriginal} onChange={(e) => setKeepOriginal(e.target.checked)} className="h-4 w-4 accent-accent" />
            </label>
            <div className="mt-2">
              <span className="label">Volumen original</span>
              <input
                type="range" min={0} max={1} step={0.05} value={originalGain}
                onChange={(e) => setOriginalGain(Number(e.target.value))}
                className="mt-1 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
                aria-label="Volumen del audio original"
              />
            </div>
            <p className="mt-2 hint">Si has separado la voz con Demucs, sube aqui la pista instrumental como clip de fondo.</p>
          </Card>
        </aside>
      </div>

      <Modal open={exportOpen} onClose={() => { if (!exporting) setExportOpen(false); }} title="Exportar doblaje">
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            El servidor mezclara el video con todas las pistas activas usando FFmpeg y generara un MP4 (H.264 + AAC).
          </p>
          <div className="panel-tight space-y-1 p-3 text-[12px] text-zinc-400">
            <p>Tomas en la mezcla: <span className="text-white">{tracks.filter((t) => t.kind === 'voice').flatMap((t) => t.clips).filter((c) => !c.muted).length}</span></p>
            <p>Audio original: <span className="text-white">{keepOriginal ? `si (${Math.round(originalGain * 100)}%)` : 'no'}</span></p>
          </div>

          {job && (
            <div className="space-y-2">
              <div className="h-2 overflow-hidden rounded-full bg-ink-800">
                <div className="h-full bg-accent transition-all" style={{ width: `${Math.round(job.progress * 100)}%` }} />
              </div>
              <p className="text-[12px] text-zinc-400">{job.message} {job.status === 'processing' && `· ${Math.round(job.progress * 100)}%`}</p>
              {job.status === 'done' && (
                <div className="flex items-center justify-between rounded-lg border border-mint/30 bg-mint/10 px-3 py-2">
                  <span className="text-[12px] text-mint">{job.fileName} · {bytes(job.sizeBytes ?? 0)} · {job.durationSec?.toFixed(1)}s</span>
                  <a href={`/api/exports/${job.id}/download`} className="inline-flex items-center gap-1 text-[12px] font-semibold text-white hover:text-mint">
                    <Download className="h-3.5 w-3.5" /> Descargar
                  </a>
                </div>
              )}
              {job.status === 'error' && <Alert tone="error">{job.error}</Alert>}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setExportOpen(false)} disabled={exporting}>Cerrar</Button>
            <Button onClick={() => void startExport()} loading={exporting || job?.status === 'processing'}>
              <Film className="h-4 w-4" /> {job?.status === 'done' ? 'Exportar de nuevo' : 'Generar MP4'}
            </Button>
          </div>
          {job?.status === 'done' && <Badge tone="ok">Archivo verificado con ffprobe</Badge>}
        </div>
      </Modal>
    </div>
  );
}
