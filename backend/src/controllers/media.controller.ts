import fs from 'node:fs';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { DEFAULT_EFFECTS } from '@dub-arena/shared';
import { getMediaRow, getMediaAsset, registerUploadedVideo, signMediaToken, verifyMediaToken, safeStoragePath } from '../services/media.service';
import { getRecordingRow, saveRecording } from '../services/recordings.service';
import { assertHost, getRoomRow, setRoomAnalysis, setRoomVideo } from '../services/room.service';
import { db } from '../db';
import { AppError } from '../middleware/errors';
import { streamFile } from '../utils/streamFile';
import { broadcastRoom } from '../sockets/registry';

const isMember = (roomId: string, userId: string): boolean =>
  Boolean(db.prepare('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?').get(roomId, userId));

export function mediaToken(req: Request, res: Response): void {
  const resourceId = req.params.resourceId;
  const kind = req.query.kind === 'recording' ? 'recording' : 'media';

  if (kind === 'media') {
    const media = getMediaRow(resourceId);
    if (!media) throw new AppError('Archivo no encontrado', 404);
    if (!isMember(media.room_id, req.userId!)) throw new AppError('Sin acceso a este archivo', 403);
  } else {
    const rec = getRecordingRow(resourceId);
    if (!rec) throw new AppError('Grabacion no encontrada', 404);
    if (!isMember(rec.room_id, req.userId!)) throw new AppError('Sin acceso a este archivo', 403);
  }
  res.json({ token: signMediaToken(resourceId, req.userId!), expiresIn: 3600 });
}

export function streamMedia(req: Request, res: Response): void {
  const mediaId = req.params.mediaId;
  const userId = verifyMediaToken(mediaId, req.query.token as string | undefined);
  if (!userId) throw new AppError('Enlace de archivo caducado. Recarga la pagina.', 401);
  const media = getMediaRow(mediaId);
  if (!media) throw new AppError('Archivo no encontrado', 404);
  if (!isMember(media.room_id, userId)) throw new AppError('Sin acceso a este archivo', 403);
  streamFile(req, res, safeStoragePath(media.storage_path), media.mime_type);
}

export function streamRecording(req: Request, res: Response): void {
  const id = req.params.recordingId;
  const userId = verifyMediaToken(id, req.query.token as string | undefined);
  if (!userId) throw new AppError('Enlace de audio caducado. Recarga la pagina.', 401);
  const rec = getRecordingRow(id);
  if (!rec) throw new AppError('Grabacion no encontrada', 404);
  if (!isMember(rec.room_id, userId)) throw new AppError('Sin acceso a esta grabacion', 403);
  streamFile(req, res, safeStoragePath(rec.storage_path), rec.mime_type);
}

export async function uploadVideo(req: Request, res: Response): Promise<void> {
  const roomId = req.params.roomId;
  const file = req.file;
  if (!file) throw new AppError('No se recibio ningun archivo', 400);
  try {
    assertHost(roomId, req.userId!);
    const asset = await registerUploadedVideo({
      roomId, tempPath: file.path, originalName: file.originalname,
      mimeType: file.mimetype, sizeBytes: file.size,
    });
    setRoomVideo(roomId, asset.id);
    setRoomAnalysis(roomId, null);
    db.prepare('DELETE FROM analyses WHERE room_id = ?').run(roomId);
    broadcastRoom(roomId);
    res.status(201).json({ video: asset });
  } catch (error) {
    if (fs.existsSync(file.path)) fs.rmSync(file.path, { force: true });
    throw error;
  }
}

export async function uploadRecording(req: Request, res: Response): Promise<void> {
  const roomId = req.params.roomId;
  const file = req.file;
  if (!file) throw new AppError('No se recibio ningun audio', 400);

  const schema = z.object({
    startTime: z.coerce.number().min(0),
    endTime: z.coerce.number().min(0),
    characterId: z.string().optional().nullable(),
    interventionId: z.string().optional().nullable(),
    replaceRecordingId: z.string().optional().nullable(),
    effects: z.string().optional(),
  });

  try {
    const body = schema.parse(req.body);
    if (!isMember(roomId, req.userId!)) throw new AppError('No perteneces a esta sala', 403);
    const member = db.prepare('SELECT character_id FROM room_members WHERE room_id = ? AND user_id = ?')
      .get(roomId, req.userId!) as { character_id: string | null };

    let effects = { presetId: 'natural', settings: { ...DEFAULT_EFFECTS } };
    if (body.effects) {
      try { effects = JSON.parse(body.effects); } catch { /* usa el preset natural */ }
    }

    const recording = await saveRecording({
      roomId,
      userId: req.userId!,
      characterId: body.characterId ?? member.character_id ?? null,
      interventionId: body.interventionId ?? null,
      startTime: body.startTime,
      endTime: body.endTime,
      tempPath: file.path,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      effects,
      replaceRecordingId: body.replaceRecordingId ?? null,
    });

    broadcastRoom(roomId, 'room:recording-saved', recording);
    res.status(201).json({ recording });
  } catch (error) {
    if (fs.existsSync(file.path)) fs.rmSync(file.path, { force: true });
    throw error;
  }
}

export function videoInfo(req: Request, res: Response): void {
  const room = getRoomRow(req.params.roomId);
  res.json({ video: room.video_id ? getMediaAsset(room.video_id) : null });
}
