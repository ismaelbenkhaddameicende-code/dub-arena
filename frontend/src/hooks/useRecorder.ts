import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceEffectSettings } from '@dub-arena/shared';
import { createEffectChain, createLevelMeter, type EffectChain } from '../lib/audioEffects';

export interface TakeResult {
  blob: Blob;
  mimeType: string;
  startTime: number;
  endTime: number;
  duration: number;
}

const pickMimeType = (): string => {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
};

export function useRecorder(effects: VoiceEffectSettings) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>('');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [level, setLevel] = useState(0);
  const [pitchSupported, setPitchSupported] = useState(true);

  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const chainRef = useRef<EffectChain | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const meterRef = useRef<{ level: () => number; dispose: () => void } | null>(null);
  const startedAtRef = useRef(0);
  const rafRef = useRef(0);
  const stopResolve = useRef<((take: TakeResult | null) => void) | null>(null);

  const teardown = useCallback(() => {
    window.cancelAnimationFrame(rafRef.current);
    meterRef.current?.dispose();
    meterRef.current = null;
    chainRef.current?.dispose();
    chainRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    setReady(false);
    setLevel(0);
  }, []);

  useEffect(() => teardown, [teardown]);

  useEffect(() => {
    chainRef.current?.update(effects);
  }, [effects]);

  /** Pide permiso y prepara la cadena de audio. Devuelve true si todo fue bien. */
  const requestMicrophone = useCallback(async (selectedId?: string): Promise<boolean> => {
    setError(null);
    try {
      const constraints: MediaStreamConstraints = {
        audio: {
          deviceId: selectedId ? { exact: selectedId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;

      const ctx = ctxRef.current ?? new AudioContext();
      ctxRef.current = ctx;
      if (ctx.state === 'suspended') await ctx.resume();

      const source = ctx.createMediaStreamSource(stream);
      const chain = await createEffectChain(ctx, effects);
      chainRef.current?.dispose();
      chainRef.current = chain;
      source.connect(chain.input);
      setPitchSupported(chain.pitchSupported);

      meterRef.current?.dispose();
      meterRef.current = createLevelMeter(ctx, chain.output);

      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((d) => d.kind === 'audioinput'));
      setDeviceId(stream.getAudioTracks()[0]?.getSettings().deviceId ?? '');
      setReady(true);

      const loop = (): void => {
        setLevel(meterRef.current?.level() ?? 0);
        rafRef.current = window.requestAnimationFrame(loop);
      };
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = window.requestAnimationFrame(loop);
      return true;
    } catch (err) {
      const message = (err as Error).name === 'NotAllowedError'
        ? 'Permiso de microfono denegado. Actívalo en el candado de la barra de direcciones.'
        : `No se pudo abrir el microfono: ${(err as Error).message}`;
      setError(message);
      setReady(false);
      return false;
    }
  }, [effects]);

  const start = useCallback(async (timelineOffset: number): Promise<boolean> => {
    if (!ready || !streamRef.current || !ctxRef.current || !chainRef.current) {
      const ok = await requestMicrophone(deviceId || undefined);
      if (!ok) return false;
    }
    const ctx = ctxRef.current;
    const chain = chainRef.current;
    if (!ctx || !chain) return false;

    // Grabar SIEMPRE la salida procesada por los efectos
    const destination = ctx.createMediaStreamDestination();
    chain.output.connect(destination);

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(destination.stream, mimeType ? { mimeType, audioBitsPerSecond: 128000 } : undefined);
    chunksRef.current = [];
    startedAtRef.current = timelineOffset;

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      chain.output.disconnect(destination);
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      const endTime = parseFloat((startedAtRef.current + (Date.now() - stoppedAt) / 1000).toFixed(3));
      const take: TakeResult = {
        blob,
        mimeType: blob.type,
        startTime: startedAtRef.current,
        endTime,
        duration: Math.max(0, endTime - startedAtRef.current),
      };
      setRecording(false);
      setPaused(false);
      stopResolve.current?.(blob.size > 0 ? take : null);
      stopResolve.current = null;
    };

    let stoppedAt = Date.now();
    recorderRef.current = recorder;
    recorder.start(250);
    setRecording(true);
    setPaused(false);
    return true;
  }, [ready, requestMicrophone, deviceId]);

  const pause = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.pause();
      setPaused(true);
    }
  }, []);

  const resume = useCallback(() => {
    if (recorderRef.current?.state === 'paused') {
      recorderRef.current.resume();
      setPaused(false);
    }
  }, []);

  const stop = useCallback((): Promise<TakeResult | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current;
      if (!recorder || recorder.state === 'inactive') { resolve(null); return; }
      stopResolve.current = resolve;
      recorder.stop();
    });
  }, []);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    chunksRef.current = [];
    stopResolve.current = null;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    setRecording(false);
    setPaused(false);
  }, []);

  return {
    devices, deviceId, setDeviceId, ready, error, recording, paused, level, pitchSupported,
    requestMicrophone, start, pause, resume, stop, cancel, teardown,
  };
}
