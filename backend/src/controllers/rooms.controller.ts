import type { Request, Response } from 'express';
import { z } from 'zod';
import { ROOM_MAX_PARTICIPANTS, type PlaybackState } from '@dub-arena/shared';
import {
  assignCharacter, createRoom, getRoomDetail, joinRoomByCode, joinRoomById, kickUser, leaveRoom,
  listRoomsForUser, renameRoom, setPlayback, setRoomStatus, toSummary, transferHost, assertHost,
  getRoomRow, getPlayback, RoomError,
} from '../services/room.service';
import { saveRecording, listRecordings, deleteRecording, updateRecordingEffects } from '../services/recordings.service';
import { db } from '../db';
import { AppError } from '../middleware/errors';
import { getOnlineUserIds } from '../sockets/registry';

export function create(req: Request, res: Response): void {
  const schema = z.object({
    name: z.string().min(2, 'Ponle un nombre a la sala').max(80),
    maxParticipants: z.number().int().min(2).max(8).optional(),
  });
  const body = schema.parse(req.body);
  const room = createRoom(req.userId!, { name: body.name, maxParticipants: body.maxParticipants ?? ROOM_MAX_PARTICIPANTS });
  res.status(201).json({ room });
}

export function list(req: Request, res: Response): void {
  res.json({ rooms: listRoomsForUser(req.userId!) });
}

export function join(req: Request, res: Response): void {
  const schema = z.object({ code: z.string().min(4).max(12).optional(), roomId: z.string().optional() })
    .refine((v) => v.code || v.roomId, { message: 'Indica un codigo o una sala' });
  const body = schema.parse(req.body);
  const room = body.code
    ? joinRoomByCode(body.code, req.userId!)
    : joinRoomById(body.roomId!, req.userId!);
  res.json({ room: { ...room, participants: room.participants } });
}

export function detail(req: Request, res: Response): void {
  const room = getRoomDetail(req.params.roomId);
  const isMember = room.participants.some((p) => p.userId === req.userId);
  if (!isMember) {
    // Permite previsualizar una sala por enlace sin unirse, pero sin datos sensibles.
    res.json({ room: { ...room, characters: room.characters.map((c) => ({ ...c, assignedUserId: null })) }, preview: true });
    return;
  }
  res.json({ room });
}

export function leave(req: Request, res: Response): void {
  const result = leaveRoom(req.params.roomId, req.userId!);
  res.json(result);
}

export function kick(req: Request, res: Response): void {
  const schema = z.object({ userId: z.string().min(1) });
  const { userId } = schema.parse(req.body);
  kickUser(req.params.roomId, req.userId!, userId);
  res.json({ ok: true });
}

export function makeHost(req: Request, res: Response): void {
  const schema = z.object({ userId: z.string().min(1) });
  const { userId } = schema.parse(req.body);
  transferHost(req.params.roomId, req.userId!, userId);
  res.json({ ok: true });
}

export function assign(req: Request, res: Response): void {
  const schema = z.object({ userId: z.string().min(1), characterId: z.string().nullable() });
  const body = schema.parse(req.body);
  assignCharacter(req.params.roomId, req.userId!, body.userId, body.characterId);
  res.json({ ok: true });
}

export function patchRoom(req: Request, res: Response): void {
  const schema = z.object({
    name: z.string().min(2).max(80).optional(),
    status: z.enum(['open', 'live', 'closed']).optional(),
  });
  const body = schema.parse(req.body);
  if (body.name) renameRoom(req.params.roomId, req.userId!, body.name);
  if (body.status) setRoomStatus(req.params.roomId, req.userId!, body.status);
  res.json({ room: toSummary(getRoomRow(req.params.roomId)) });
}

export function playback(req: Request, res: Response): void {
  const room = getRoomRow(req.params.roomId);
  res.json({ playback: getPlayback(room.id) });
}

export function forcePlayback(req: Request, res: Response): void {
  const schema = z.object({
    playing: z.boolean(),
    position: z.number().min(0),
    action: z.enum(['play', 'pause', 'seek', 'restart']).optional(),
  });
  const body = schema.parse(req.body);
  assertHost(req.params.roomId, req.userId!);
  const state: PlaybackState = {
    playing: body.playing,
    position: Math.max(0, body.position),
    anchorServerTime: Date.now(),
    rate: 1,
    updatedBy: req.userId!,
    updatedAt: Date.now(),
  };
  setPlayback(req.params.roomId, state);
  res.json({ playback: state });
}

/* ----------------------------- Grabaciones ------------------------------ */

export function recordings(req: Request, res: Response): void {
  getRoomDetail(req.params.roomId); // valida que la sala existe
  const isMember = db.prepare('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?').get(req.params.roomId, req.userId!);
  if (!isMember) throw new AppError('No perteneces a esta sala', 403);
  res.json({ recordings: listRecordings(req.params.roomId) });
}

export function removeRecording(req: Request, res: Response): void {
  const ok = deleteRecording(req.params.recordingId, req.userId!);
  if (!ok) throw new AppError('Grabacion no encontrada o sin permisos', 404);
  res.json({ ok: true });
}

export function patchRecordingEffects(req: Request, res: Response): void {
  const schema = z.object({
    presetId: z.string(),
    settings: z.object({
      enabled: z.boolean(), semitones: z.number().min(-12).max(12), robot: z.boolean(),
      echo: z.boolean(), reverb: z.boolean(), distortion: z.boolean(), radio: z.boolean(),
      gain: z.number().min(0).max(2),
    }),
  });
  const body = schema.parse(req.body);
  updateRecordingEffects(req.params.recordingId, req.userId!, body);
  res.json({ ok: true });
}

/* -------------------------------- Timeline ------------------------------- */

export function getTimeline(req: Request, res: Response): void {
  const row = db.prepare('SELECT * FROM timeline_docs WHERE room_id = ?').get(req.params.roomId) as { payload_json: string } | undefined;
  res.json({ timeline: row ? JSON.parse(row.payload_json) : null });
}

export function putTimeline(req: Request, res: Response): void {
  const schema = z.object({ tracks: z.array(z.any()) });
  const body = schema.parse(req.body);
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO timeline_docs (room_id, payload_json, updated_at) VALUES (?, ?, ?)
              ON CONFLICT(room_id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`)
    .run(req.params.roomId, JSON.stringify(body), now);
  res.json({ ok: true, updatedAt: now });
}

export function online(req: Request, res: Response): void {
  res.json({ online: Array.from(getOnlineUserIds(req.params.roomId)) });
}

export { saveRecording, RoomError };
