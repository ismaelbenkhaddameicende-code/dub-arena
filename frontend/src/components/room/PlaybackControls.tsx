import { useEffect, useState } from 'react';
import type { PlaybackState } from '@dub-arena/shared';
import { Pause, Play, RotateCcw, SkipBack } from 'lucide-react';
import { Button } from '../ui';
import { clockMs } from '../../lib/format';
import { expectedPosition } from '../../hooks/usePlaybackSync';

interface Props {
  playback: PlaybackState | null;
  isHost: boolean;
  duration: number;
  command: (action: 'play' | 'pause' | 'seek' | 'restart', position?: number) => Promise<string | null>;
  onError: (message: string) => void;
}

export function PlaybackControls({ playback, isHost, duration, command, onError }: Props) {
  const [, force] = useState(0);

  useEffect(() => {
    if (!playback?.playing) return;
    const timer = window.setInterval(() => force((n) => n + 1), 200);
    return () => window.clearInterval(timer);
  }, [playback]);

  const position = playback ? expectedPosition(playback) : 0;
  const total = duration > 0 ? duration : 0;

  const run = async (action: 'play' | 'pause' | 'seek' | 'restart', value?: number): Promise<void> => {
    const error = await command(action, value);
    if (error) onError(error);
  };

  return (
    <div className="panel-tight p-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => void run('restart')}
          disabled={!isHost}
          className="rounded-lg p-2.5 text-zinc-400 hover:bg-ink-700 hover:text-white disabled:opacity-40 sm:p-2"
          title="Volver al inicio"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          onClick={() => void run('seek', Math.max(0, position - 5))}
          disabled={!isHost}
          className="rounded-lg p-2.5 text-zinc-400 hover:bg-ink-700 hover:text-white disabled:opacity-40 sm:p-2"
          title="Retroceder 5s"
        >
          <SkipBack className="h-4 w-4" />
        </button>
        <Button
          variant={playback?.playing ? 'ghost' : 'primary'}
          onClick={() => void run(playback?.playing ? 'pause' : 'play', position)}
          disabled={!isHost}
          className="px-3"
        >
          {playback?.playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playback?.playing ? 'Pausar' : 'Reproducir'}
        </Button>
        <span className="ml-1 font-display text-xs tabular-nums text-zinc-400">
          {clockMs(position)} <span className="text-zinc-600">/</span> {clockMs(total)}
        </span>
        <div className="flex-1" />
        {!isHost && <span className="hidden text-[11px] text-zinc-500 sm:inline">El administrador controla la reproduccion</span>}
      </div>

      <div className="mt-3">
        <input
          type="range"
          min={0}
          max={Math.max(total, 1)}
          step={0.1}
          value={Math.min(position, Math.max(total, 1))}
          disabled={!isHost || total === 0}
          onChange={(e) => void run('seek', Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent disabled:cursor-not-allowed sm:h-1.5"
          aria-label="Posicion de la escena"
        />
      </div>
    </div>
  );
}
