import type { Server } from 'socket.io';
import type { ServerToClientEvents, ClientToServerEvents } from '@dub-arena/shared';
import { getParticipants, getRoomDetail } from '../services/room.service';

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents>;

/** Emisor laxo para eventos dinamicos (los nombres ya estan tipados en la API publica). */
type LooseEmitter = { to: (target: string) => { emit: (event: string, payload: unknown) => void } };

let ioRef: IoServer | null = null;
const onlineByRoom = new Map<string, Set<string>>();
const socketsByUser = new Map<string, Set<string>>();

export function setIo(io: IoServer): void { ioRef = io; }
export function getIo(): IoServer | null { return ioRef; }

const loose = (): LooseEmitter | null => (ioRef as unknown as LooseEmitter | null);

export function roomChannel(roomId: string): string { return `room:${roomId}`; }

export function registerOnline(roomId: string, userId: string, socketId: string): void {
  if (!onlineByRoom.has(roomId)) onlineByRoom.set(roomId, new Set());
  onlineByRoom.get(roomId)!.add(userId);
  if (!socketsByUser.has(userId)) socketsByUser.set(userId, new Set());
  socketsByUser.get(userId)!.add(socketId);
}

/** Devuelve true si el usuario ya no tiene ninguna conexion abierta en la sala. */
export function unregisterOnline(roomId: string, userId: string, socketId: string): boolean {
  socketsByUser.get(userId)?.delete(socketId);
  const remaining = socketsByUser.get(userId)?.size ?? 0;
  const set = onlineByRoom.get(roomId);
  if (remaining === 0) set?.delete(userId);
  return !(set?.has(userId) ?? false);
}

export function getOnlineUserIds(roomId: string): Set<string> {
  return onlineByRoom.get(roomId) ?? new Set<string>();
}

export function emitToUser(userId: string, event: 'room:closed' | 'room:notice', payload: unknown): void {
  const sockets = socketsByUser.get(userId);
  const emitter = loose();
  if (!sockets || !emitter) return;
  for (const sid of sockets) emitter.to(sid).emit(event, payload);
}

/** Sin evento: reenvia el estado completo. Con evento: reenvia solo ese evento. */
export function broadcastRoom(roomId: string, event?: keyof ServerToClientEvents, payload?: unknown): void {
  const emitter = loose();
  if (!ioRef || !emitter) return;
  if (event && payload !== undefined) {
    emitter.to(roomChannel(roomId)).emit(event, payload);
    return;
  }
  const state = getRoomDetail(roomId, getOnlineUserIds(roomId));
  emitter.to(roomChannel(roomId)).emit('room:state', state);
}

export function broadcastParticipants(roomId: string): void {
  const emitter = loose();
  if (!emitter) return;
  emitter.to(roomChannel(roomId)).emit('room:participants', getParticipants(roomId, getOnlineUserIds(roomId)));
}
