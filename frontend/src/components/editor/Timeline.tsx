import { useCallback, useEffect, useRef, useState } from 'react';
import type { TimelineClip, TimelineTrack } from '@dub-arena/shared';
import type { Peaks } from '../../lib/waveform';
import { drawWaveform } from '../../lib/waveform';
import clsx from 'clsx';

const TRACK_HEIGHT = 68;

interface Props {
  tracks: TimelineTrack[];
  duration: number;
  pxPerSec: number;
  playhead: number;
  selectedClipId: string | null;
  peaks: Map<string, Peaks>;
  onSelect: (clipId: string | null) => void;
  onChangeClip: (trackId: string, clipId: string, patch: Partial<TimelineClip>) => void;
  onSeek: (position: number) => void;
  onToggleMute: (trackId: string) => void;
  onGain: (trackId: string, gain: number) => void;
  onDeleteClip: (trackId: string, clipId: string) => void;
}

type DragMode = { kind: 'move' | 'trim-left' | 'trim-right'; trackId: string; clipId: string; originX: number; start: number; inPoint: number; outPoint: number };

function TrackWave({ track, pxPerSec, duration, peaks }: { track: TimelineTrack; pxPerSec: number; duration: number; peaks: Map<string, Peaks> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, canvas.clientWidth);
    canvas.width = width * dpr;
    canvas.height = TRACK_HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, TRACK_HEIGHT);

    // Rejilla de segundos
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let second = 0; second <= duration; second += 1) {
      const x = Math.round(second * pxPerSec) + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, TRACK_HEIGHT);
      ctx.stroke();
    }

    for (const clip of track.clips) {
      const localPeaks = clip.recordingId ? peaks.get(clip.recordingId) : null;
      if (!localPeaks) continue;
      const x = clip.startTime * pxPerSec;
      const w = Math.max(2, (clip.outPoint - clip.inPoint) * pxPerSec);
      const slice = slicePeaks(localPeaks, clip);
      drawWaveformSlice(ctx, slice, x, w, TRACK_HEIGHT, track.muted ? '#4b4b5e' : track.color);
    }
  }, [track, pxPerSec, duration, peaks]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ height: TRACK_HEIGHT }} />;
}

function slicePeaks(peaks: Peaks, clip: TimelineClip): Peaks {
  const total = peaks.max.length;
  const from = Math.floor((clip.inPoint / Math.max(0.001, (clip.outPoint - clip.inPoint) + clip.inPoint)) * total);
  const to = Math.floor((clip.outPoint / Math.max(0.001, (clip.outPoint - clip.inPoint) + clip.inPoint)) * total);
  const start = Math.max(0, Math.min(total - 1, from));
  const end = Math.max(start + 1, Math.min(total, to));
  return { min: peaks.min.slice(start, end), max: peaks.max.slice(start, end), samples: peaks.samples };
}

function drawWaveformSlice(ctx: CanvasRenderingContext2D, peaks: Peaks, x: number, width: number, height: number, color: string): void {
  const mid = height / 2;
  ctx.fillStyle = color;
  const bars = Math.max(1, Math.floor(width));
  for (let i = 0; i < bars; i += 1) {
    const index = Math.floor((i / bars) * peaks.max.length);
    const max = Math.abs(peaks.max[index] ?? 0);
    const min = Math.abs(peaks.min[index] ?? 0);
    const amp = Math.min(0.5, Math.max(max, min) * 1.6) * (height - 10);
    ctx.fillRect(x + i, mid - amp, 1, Math.max(1, amp * 2));
  }
}

export function Timeline({
  tracks, duration, pxPerSec, playhead, selectedClipId, peaks,
  onSelect, onChangeClip, onSeek, onToggleMute, onGain, onDeleteClip,
}: Props) {
  const [drag, setDrag] = useState<DragMode | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const width = Math.max(600, duration * pxPerSec + 80);

  const onPointerMove = useCallback((event: React.PointerEvent) => {
    if (!drag) return;
    const delta = (event.clientX - drag.originX) / pxPerSec;
    if (drag.kind === 'move') {
      onChangeClip(drag.trackId, drag.clipId, { startTime: Math.max(0, Number((drag.start + delta).toFixed(3))) });
    } else if (drag.kind === 'trim-left') {
      const inPoint = Math.max(0, Math.min(drag.outPoint - 0.1, drag.inPoint + delta));
      onChangeClip(drag.trackId, drag.clipId, {
        inPoint: Number(inPoint.toFixed(3)),
        startTime: Math.max(0, Number((drag.start + (inPoint - drag.inPoint)).toFixed(3))),
      });
    } else {
      const outPoint = Math.max(drag.inPoint + 0.1, drag.outPoint + delta);
      onChangeClip(drag.trackId, drag.clipId, { outPoint: Number(outPoint.toFixed(3)) });
    }
  }, [drag, pxPerSec, onChangeClip]);

  useEffect(() => {
    if (!drag) return;
    const stop = (): void => setDrag(null);
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, [drag]);

  return (
    <div className="flex overflow-hidden rounded-xl border border-line bg-ink-900">
      <div className="w-24 shrink-0 border-r border-line bg-ink-850 sm:w-36">
        <div className="h-7 border-b border-line px-3 py-1 text-[10px] uppercase tracking-widest text-zinc-600">Pistas</div>
        {tracks.map((track) => (
          <div key={track.id} className="flex flex-col justify-center gap-1 border-b border-line/50 px-2" style={{ height: TRACK_HEIGHT }}>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: track.color }} />
              <span className="truncate text-[11px] font-semibold text-zinc-200">{track.label}</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onToggleMute(track.id)}
                className={clsx('rounded px-1 text-[9px] font-bold uppercase', track.muted ? 'bg-rose/20 text-rose' : 'bg-ink-700 text-zinc-400 hover:text-white')}
                title="Silenciar pista"
              >
                M
              </button>
              <input
                type="range" min={0} max={2} step={0.05} value={track.gain}
                onChange={(e) => onGain(track.id, Number(e.target.value))}
                className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
                aria-label={`Volumen de ${track.label}`}
              />
            </div>
          </div>
        ))}
      </div>

      <div ref={scrollRef} className="relative flex-1 overflow-x-auto" onPointerMove={onPointerMove}>
        <div className="relative" style={{ width }}>
          <div className="sticky top-0 z-10 h-7 border-b border-line bg-ink-850/95 backdrop-blur">
            {Array.from({ length: Math.ceil(duration) + 1 }).map((_, second) => (
              second % (pxPerSec < 18 ? 10 : pxPerSec < 40 ? 5 : 1) === 0 ? (
                <span key={second} className="absolute top-1 text-[10px] tabular-nums text-zinc-500" style={{ left: second * pxPerSec + 3 }}>
                  {Math.floor(second / 60)}:{String(second % 60).padStart(2, '0')}
                </span>
              ) : null
            ))}
          </div>

          <div
            className="relative cursor-crosshair"
            onPointerDown={(event) => {
              if (event.target !== event.currentTarget) return;
              const rect = event.currentTarget.getBoundingClientRect();
              onSeek(Math.max(0, (event.clientX - rect.left) / pxPerSec));
              onSelect(null);
            }}
          >
            {tracks.map((track) => (
              <div key={track.id} className="relative border-b border-line/50" style={{ height: TRACK_HEIGHT }}>
                <TrackWave track={track} pxPerSec={pxPerSec} duration={duration} peaks={peaks} />
                {track.clips.map((clip) => {
                  const left = clip.startTime * pxPerSec;
                  const width = Math.max(6, (clip.outPoint - clip.inPoint) * pxPerSec);
                  const selected = clip.id === selectedClipId;
                  return (
                    <div
                      key={clip.id}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        onSelect(clip.id);
                        const kind = event.nativeEvent.offsetX < 8 ? 'trim-left' : event.nativeEvent.offsetX > width - 8 ? 'trim-right' : 'move';
                        setDrag({
                          kind, trackId: track.id, clipId: clip.id, originX: event.clientX,
                          start: clip.startTime, inPoint: clip.inPoint, outPoint: clip.outPoint,
                        });
                      }}
                      onDoubleClick={() => onDeleteClip(track.id, clip.id)}
                      className={clsx(
                        'absolute top-1 cursor-grab rounded-md border-2 transition-colors',
                        selected ? 'border-white/90 shadow-glow' : 'border-white/25 hover:border-white/60',
                      )}
                      style={{
                        left, width, height: TRACK_HEIGHT - 8,
                        background: `${clip.muted ? '#3a3a4a' : track.color}33`,
                      }}
                      title={`${clip.label} · ${clip.startTime.toFixed(2)}s · doble clic para eliminar`}
                    >
                      <span className="pointer-events-none absolute inset-x-1 top-0.5 truncate text-[9px] font-semibold text-white/80">{clip.label}</span>
                      <span className="absolute inset-y-0 left-0 w-3 cursor-ew-resize rounded-l bg-white/30 sm:w-2" />
                      <span className="absolute inset-y-0 right-0 w-3 cursor-ew-resize rounded-r bg-white/30 sm:w-2" />
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="pointer-events-none absolute top-0 bottom-0 z-20 w-px bg-rose" style={{ left: playhead * pxPerSec }}>
              <span className="absolute -left-1 top-0 h-2 w-2 rounded-full bg-rose" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
