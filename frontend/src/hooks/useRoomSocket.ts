import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents, PlaybackState, Recording, RoomDetail, ServerToClientEvents,
} from '@dub-arena/shared';
import { getToken, API_BASE } from '../lib/api';
import { addSample } from '../lib/clock';

type RoomSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface Notice { id: number; level: 'info' | 'warn' | 'error'; message: string; at: number }

export function useRoomSocket(roomId: string | undefined, token: string | null) {
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [playback, setPlayback] = useState<PlaybackState | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<RoomSocket | null>(null);
  const noticeId = useRef(0);

  const pushNotice = useCallback((level: Notice['level'], message: string) => {
    noticeId.current += 1;
    setNotices((prev) => [...prev.slice(-5), { id: noticeId.current, level, message, at: Date.now() }]);
  }, []);

  useEffect(() => {
    if (!roomId || !token) return;
    const socket: RoomSocket = io(API_BASE || '/', {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;

    const syncClock = (): void => {
      const sentAt = Date.now();
      socket.emit('time:sync', { clientTime: sentAt }, (res) => {
        if (res) addSample(Date.now() - sentAt, res.serverTime, sentAt);
      });
    };

    socket.on('connect', () => {
      setConnected(true);
      setError(null);
      syncClock();
      socket.emit('room:join', { roomId }, (res) => {
        if (res.ok) {
          setRoom(res.data);
          setPlayback(res.data.playback);
        } else {
          setError(res.error);
        }
      });
    });

    socket.on('disconnect', () => { setConnected(false); });
    socket.on('connect_error', (err) => { setError(err.message === 'unauthorized' ? 'Sesion caducada' : 'Sin conexion con el servidor'); });

    socket.on('room:state', (state) => { setRoom(state); setPlayback(state.playback); });
    socket.on('room:participants', (participants) => {
      setRoom((prev) => (prev ? { ...prev, participants } : prev));
    });
    socket.on('room:playback', (state) => setPlayback(state));
    socket.on('room:notice', (notice) => pushNotice(notice.level, notice.message));
    socket.on('room:recording-saved', (recording: Recording) => {
      pushNotice('info', 'Nueva toma guardada');
      setRoom((prev) => (prev ? { ...prev } : prev));
      void recording;
    });
    socket.on('room:closed', (payload) => { pushNotice('error', payload.reason); setRoom(null); });

    // Resincronizar reloj periodicamente (deriva de reloj del navegador)
    const clockTimer = window.setInterval(syncClock, 20000);

    return () => {
      window.clearInterval(clockTimer);
      socket.emit('room:leave');
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, token, pushNotice]);

  const command = useCallback((action: 'play' | 'pause' | 'seek' | 'restart', position?: number) => {
    return new Promise<string | null>((resolve) => {
      const socket = socketRef.current;
      if (!socket) { resolve('Sin conexion'); return; }
      socket.emit('playback:command', { action, position }, (res) => {
        resolve(res.ok ? null : res.error);
      });
    });
  }, []);

  const refresh = useCallback(() => {
    const socket = socketRef.current;
    if (!socket) return;
    socket.emit('playback:request-sync', (res) => {
      if (res.ok) setPlayback(res.data.playback);
    });
  }, []);

  return { room, setRoom, playback, notices, connected, error, command, refresh, socket: socketRef };
}
