import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { MediaAsset } from '@dub-arena/shared';
import { db } from '../db';
import { env } from '../config/env';
import { newId } from '../utils/ids';
import { probeMedia } from '../utils/ffprobe';

interface MediaRow {
  id: string; room_id: string; kind: 'video' | 'audio'; original_name: string; mime_type: string;
  size_bytes: number; duration_sec: number; width: number | null; height: number | null;
  storage_path: string; created_at: string;
}

const EXT_BY_MIME: Record<string, string> = {
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov', 'video/x-matroska': '.mkv',
  'audio/webm': '.webm', 'audio/ogg': '.ogg', 'audio/mp4': '.m4a', 'audio/wav': '.wav',
  'audio/wave': '.wav', 'audio/x-wav': '.wav', 'audio/mpeg': '.mp3',
};

export function extensionFor(mime: string, fallback = '.bin'): string {
  return EXT_BY_MIME[mime.split(';')[0].trim()] ?? fallback;
}

function mapAsset(row: MediaRow): MediaAsset {
  return {
    id: row.id,
    roomId: row.room_id,
    kind: row.kind,
    originalName: row.original_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    durationSec: row.duration_sec,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
  };
}

export function getMediaRow(mediaId: string): MediaRow | undefined {
  return db.prepare('SELECT * FROM media_assets WHERE id = ?').get(mediaId) as MediaRow | undefined;
}

export function getMediaAsset(mediaId: string): MediaAsset | null {
  const row = getMediaRow(mediaId);
  return row ? mapAsset(row) : null;
}

export function getRoomVideo(roomId: string): MediaAsset | null {
  const row = db.prepare(`SELECT * FROM media_assets WHERE room_id = ? AND kind = 'video' ORDER BY created_at DESC LIMIT 1`)
    .get(roomId) as MediaRow | undefined;
  return row ? mapAsset(row) : null;
}

export async function registerUploadedVideo(input: {
  roomId: string; tempPath: string; originalName: string; mimeType: string; sizeBytes: number;
}): Promise<MediaAsset> {
  const probe = await probeMedia(input.tempPath);
  if (!probe.videoCodec) {
    fs.rmSync(input.tempPath, { force: true });
    throw new Error('El archivo no contiene una pista de video valida');
  }
  const id = newId('vid');
  const dir = path.join(env.storage.videos, input.roomId);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${id}${extensionFor(input.mimeType, '.mp4')}`);
  fs.renameSync(input.tempPath, target);

  db.prepare('DELETE FROM media_assets WHERE room_id = ? AND kind = ?').run(input.roomId, 'video');
  db.prepare(`INSERT INTO media_assets (id, room_id, kind, original_name, mime_type, size_bytes, duration_sec, width, height, storage_path, created_at)
              VALUES (?, ?, 'video', ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.roomId, input.originalName, input.mimeType, input.sizeBytes, probe.durationSec,
      probe.width, probe.height, target, new Date().toISOString());

  return getMediaAsset(id)!;
}

/* ------------------------- Tokens de acceso a medios ---------------------- */

export function signMediaToken(resourceId: string, userId: string, ttlSec = env.mediaTokenTtlSec): string {
  const exp = Date.now() + ttlSec * 1000;
  const sig = crypto.createHmac('sha256', env.jwtSecret).update(`${resourceId}.${userId}.${exp}`).digest('base64url');
  return `${exp}.${userId}.${sig}`;
}

/** Verifica el token y devuelve el userId que lo firmo, o null. */
export function verifyMediaToken(resourceId: string, token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [expRaw, userId, sig] = parts;
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  const expected = crypto.createHmac('sha256', env.jwtSecret).update(`${resourceId}.${userId}.${exp}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return userId;
}

/** Resuelve una ruta de almacenamiento garantizando que no sale del directorio raiz. */
export function safeStoragePath(storedPath: string): string {
  const resolved = path.resolve(storedPath);
  const root = path.resolve(env.storageDir);
  if (!resolved.startsWith(root + path.sep)) throw new Error('Ruta de almacenamiento no permitida');
  return resolved;
}
