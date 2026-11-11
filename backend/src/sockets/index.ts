import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents, PlaybackState } from '@dub-arena/shared';
import { env } from '../config/env';
import { verifyToken, getUserById } from '../services/auth.service';
import {
  getPlayback, getRoomDetail, setPlayback, joinRoomById, leaveRoom, getMemberRow, getRoomRow,
  assignCharacter, kickUser, RoomError,
} from '../services/room.service';
import { logger } from '../utils/logger';
import {
  type IoServer, setIo, roomChannel, registerOnline, unregisterOnline, getOnlineUserIds,
  broadcastParticipants, emitToUser,
} from './registry';

const log = logger('socket');

interface SocketData { userId: string; displayName: string; roomId: string | null }

export function createSocketServer(httpServer: HttpServer): IoServer {
  const io: IoServer = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(httpServer, {
    cors: { origin: env.corsOrigins.includes('*') ? true : env.corsOrigins, credentials: true },
    path: '/socket.io',
    pingInterval: 10000,
    pingTimeout: 20000,
    maxHttpBufferSize: 2e6,
  });

  io.use((socket, next) => {
    const token = (socket.handshake.auth as { token?: string })?.token;
    const userId = token ? verifyToken(token) : null;
    if (!userId) { next(new Error('unauthorized')); return; }
    const user = getUserById(userId);
    if (!user) { next(new Error('unauthorized')); return; }
    socket.data.userId = user.id;
    socket.data.displayName = user.displayName;
    socket.data.roomId = null;
    next();
  });

  setIo(io);

  io.on('connection', (socket) => {
    const { userId, displayName } = socket.data;
    log.info(`${displayName} conectado (${socket.id})`);

    socket.on('room:join', async (payload, ack) => {
      try {
        const roomId = payload?.roomId;
        if (!roomId) throw new RoomError('Falta el id de la sala', 400);
        const detail = getRoomDetail(roomId);
        if (!detail.participants.some((p) => p.userId === userId)) {
          joinRoomById(roomId, userId);
        }
        if (socket.data.roomId && socket.data.roomId !== roomId) {
          socket.leave(roomChannel(socket.data.roomId));
          unregisterOnline(socket.data.roomId, userId, socket.id);
        }
        socket.data.roomId = roomId;
        await socket.join(roomChannel(roomId));
        registerOnline(roomId, userId, socket.id);

        const state = getRoomDetail(roomId, getOnlineUserIds(roomId));
        ack?.({ ok: true, data: state });
        broadcastParticipants(roomId);
        socket.to(roomChannel(roomId)).emit('room:notice', {
          level: 'info', message: `${displayName} se ha unido a la sala`, userId,
        });
      } catch (error) {
        ack?.({ ok: false, error: (error as Error).message });
      }
    });

    socket.on('playback:command', (payload, ack) => {
      const roomId = socket.data.roomId;
      if (!roomId) { ack?.({ ok: false, error: 'No estas en una sala' }); return; }
      try {
        const room = getRoomRow(roomId);
        if (room.host_id !== userId) throw new RoomError('Solo el administrador controla la reproduccion', 403);
        const current = getPlayback(roomId);
        const now = Date.now();
        let position = payload.position ?? current.position;
        let playing = current.playing;

        if (payload.action === 'play') {
          position = payload.position ?? (current.playing ? current.position + (now - current.anchorServerTime) / 1000 : current.position);
          playing = true;
        } else if (payload.action === 'pause') {
          position = current.playing ? current.position + (now - current.anchorServerTime) / 1000 : current.position;
          if (payload.position !== undefined) position = payload.position;
          playing = false;
        } else if (payload.action === 'seek') {
          position = payload.position ?? 0;
        } else if (payload.action === 'restart') {
          position = 0;
          playing = false;
        }

        const state: PlaybackState = {
          playing, position: Math.max(0, position), anchorServerTime: now, rate: 1,
          updatedBy: userId, updatedAt: now,
        };
        setPlayback(roomId, state);
        io.to(roomChannel(roomId)).emit('room:playback', state);
        ack?.({ ok: true, data: state });
      } catch (error) {
        ack?.({ ok: false, error: (error as Error).message });
      }
    });

    socket.on('playback:request-sync', (ack) => {
      const roomId = socket.data.roomId;
      if (!roomId) { ack?.({ ok: false, error: 'No estas en una sala' }); return; }
      ack?.({ ok: true, data: { playback: getPlayback(roomId), serverTime: Date.now() } });
    });

    socket.on('time:sync', (payload, ack) => {
      ack?.({ clientTime: payload?.clientTime ?? 0, serverTime: Date.now() });
    });

    socket.on('room:assign-character', (payload, ack) => {
      const roomId = socket.data.roomId;
      if (!roomId) { ack?.({ ok: false, error: 'No estas en una sala' }); return; }
      try {
        const actor = getMemberRow(roomId, userId);
        const isSelf = payload.userId === userId;
        if (!isSelf && actor?.role !== 'host') throw new RoomError('Solo el administrador asigna personajes a otros', 403);
        assignCharacter(roomId, userId, payload.userId, payload.characterId);
        ack?.({ ok: true, data: null });
        io.to(roomChannel(roomId)).emit('room:state', getRoomDetail(roomId, getOnlineUserIds(roomId)));
      } catch (error) {
        ack?.({ ok: false, error: (error as Error).message });
      }
    });

    socket.on('room:kick', (payload, ack) => {
      const roomId = socket.data.roomId;
      if (!roomId) { ack?.({ ok: false, error: 'No estas en una sala' }); return; }
      try {
        kickUser(roomId, userId, payload.userId);
        emitToUser(payload.userId, 'room:closed', { reason: 'El administrador te ha expulsado de la sala' });
        ack?.({ ok: true, data: null });
        io.to(roomChannel(roomId)).emit('room:state', getRoomDetail(roomId, getOnlineUserIds(roomId)));
      } catch (error) {
        ack?.({ ok: false, error: (error as Error).message });
      }
    });

    socket.on('room:leave', () => {
      const roomId = socket.data.roomId;
      if (!roomId) return;
      socket.leave(roomChannel(roomId));
      unregisterOnline(roomId, userId, socket.id);
      leaveRoom(roomId, userId);
      socket.data.roomId = null;
      socket.to(roomChannel(roomId)).emit('room:notice', {
        level: 'warn', message: `${displayName} ha abandonado la sala`, userId,
      });
      broadcastParticipants(roomId);
    });

    socket.on('disconnect', (reason) => {
      const roomId = socket.data.roomId;
      log.info(`${displayName} desconectado (${reason})`);
      if (!roomId) return;
      const gone = unregisterOnline(roomId, userId, socket.id);
      if (gone) {
        socket.to(roomChannel(roomId)).emit('room:notice', {
          level: 'warn', message: `${displayName} se ha desconectado`, userId,
        });
      }
      broadcastParticipants(roomId);
    });
  });

  return io;
}
