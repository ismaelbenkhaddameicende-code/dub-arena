import { useEffect, useRef } from 'react';
import type { PlaybackState } from '@dub-arena/shared';
import { serverNow } from '../lib/clock';

/** Posicion esperada del video segun el ancla del servidor. */
export function expectedPosition(playback: PlaybackState): number {
  if (!playback.playing) return playback.position;
  const elapsed = (serverNow() - playback.anchorServerTime) / 1000;
  return Math.max(0, playback.position + elapsed * playback.rate);
}

/**
 * Mantiene el elemento <video> alineado con el reloj del servidor.
 * - Saltos grandes (>0.6s): seek directo.
 * - Desviaciones pequenas (0.15-0.6s): corrige con playbackRate, sin cortes visibles.
 */
export function usePlaybackSync(
  videoRef: React.RefObject<HTMLVideoElement>,
  playback: PlaybackState | null,
  isHost: boolean,
): void {
  const lastAnchor = useRef<number>(-1);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playback) return;
    const target = expectedPosition(playback);

    if (video.readyState >= 1 && Math.abs(video.currentTime - target) > 0.6) {
      video.currentTime = target;
    }
    if (playback.playing && video.paused) {
      void video.play().catch(() => { /* el navegador puede exigir un gesto del usuario */ });
    }
    if (!playback.playing && !video.paused) {
      video.pause();
    }
    lastAnchor.current = playback.anchorServerTime;
  }, [playback, videoRef, isHost]);

  useEffect(() => {
    if (!playback) return;
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || !playback.playing) return;
      const target = expectedPosition(playback);
      const drift = video.currentTime - target;
      if (Math.abs(drift) > 0.6) {
        video.currentTime = target;
        video.playbackRate = 1;
      } else if (Math.abs(drift) > 0.15) {
        video.playbackRate = drift > 0 ? 0.96 : 1.04;
      } else {
        video.playbackRate = 1;
      }
    }, 900);
    return () => window.clearInterval(timer);
  }, [playback, videoRef]);
}
