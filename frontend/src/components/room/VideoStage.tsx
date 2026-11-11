import { useEffect, useRef, useState } from 'react';
import type { PlaybackState } from '@dub-arena/shared';
import { Maximize2, Volume2, VolumeX } from 'lucide-react';
import { usePlaybackSync } from '../../hooks/usePlaybackSync';
import { clock } from '../../lib/format';

interface Props {
  src: string | null;
  playback: PlaybackState | null;
  isHost: boolean;
  title: string;
  onDuration?: (seconds: number) => void;
}

export function VideoStage({ src, playback, isHost, title, onDuration }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [localVolume, setLocalVolume] = useState(0.9);
  const [muted, setMuted] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [current, setCurrent] = useState(0);

  usePlaybackSync(videoRef, playback, isHost);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = localVolume;
    video.muted = muted;
  }, [localVolume, muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = (): void => setCurrent(video.currentTime);
    video.addEventListener('timeupdate', onTime);
    return () => video.removeEventListener('timeupdate', onTime);
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playback?.playing) { setBlocked(false); return; }
    const check = window.setTimeout(() => setBlocked(video.paused), 600);
    return () => window.clearTimeout(check);
  }, [playback, current]);

  return (
    <div className="space-y-3">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-line bg-black">
        {src ? (
          <video
            ref={videoRef}
            src={src}
            className="h-full w-full"
            playsInline
            preload="auto"
            controls={isHost}
            onLoadedMetadata={() => {
              setCurrent(videoRef.current?.currentTime ?? 0);
              onDuration?.(videoRef.current?.duration ?? 0);
            }}
          />
        ) : (
          <div className="grid h-full place-items-center gap-2 text-center">
            <div>
              <p className="font-display text-sm font-semibold text-zinc-300">{title}</p>
              <p className="mt-1 text-xs text-zinc-500">Aun no hay clip en esta sala</p>
            </div>
          </div>
        )}

        {blocked && (
          <button
            onClick={() => { void videoRef.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true)); }}
            className="absolute inset-0 grid place-items-center bg-black/70 backdrop-blur-sm"
          >
            <span className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white">Pulsa para unirte a la reproduccion</span>
          </button>
        )}

        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
          <span className="rounded-md bg-black/60 px-2 py-1 font-display text-[11px] tabular-nums text-white">
            {clock(current)} / {clock(videoRef.current?.duration ?? 0)}
          </span>
          {!isHost && <span className="rounded-md bg-black/60 px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-300">Sincronizado</span>}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => setMuted((v) => !v)}
          className="rounded-lg border border-line bg-ink-800/70 p-2 text-zinc-300 hover:text-white"
          title={muted ? 'Activar audio original' : 'Silenciar audio original'}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
        <input
          type="range" min={0} max={1} step={0.01} value={localVolume}
          onChange={(e) => setLocalVolume(Number(e.target.value))}
          className="h-1.5 w-28 cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
          aria-label="Volumen del audio original (solo para ti)"
        />
        <span className="text-[11px] text-zinc-500">Audio original (solo tu)</span>
        <div className="flex-1" />
        <button
          onClick={() => void videoRef.current?.requestFullscreen?.()}
          className="rounded-lg border border-line bg-ink-800/70 p-2 text-zinc-300 hover:text-white"
          title="Pantalla completa"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
