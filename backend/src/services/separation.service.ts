import path from 'node:path';
import type { MediaAsset } from '@dub-arena/shared';
import { db } from '../db';
import { env } from '../config/env';
import { newId } from '../utils/ids';
import { probeMedia } from '../utils/ffprobe';
import { getMediaRow, getMediaAsset } from './media.service';
import { getRoomRow } from './room.service';
import { ServiceError, unavailable } from '../utils/errors';

/**
 * Separacion de voz/instrumental delegada al servicio de IA (Demucs).
 * En esta maquina Demucs es pesado: se ejecuta como trabajo unico en la cola del servicio Python.
 */
export async function separateRoomAudio(roomId: string): Promise<MediaAsset> {
  const room = getRoomRow(roomId);
  if (!room.video_id) throw new ServiceError('La sala no tiene video', 409);
  const video = getMediaRow(room.video_id);
  if (!video) throw new ServiceError('No se encuentra el archivo de video', 404);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.aiServiceTimeoutMs);
  try {
    const res = await fetch(`${env.aiServiceUrl}/separate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: video.storage_path, output_dir: path.join(env.storage.videos, roomId) }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text();
      throw unavailable(`Servicio de IA (${res.status}): ${detail.slice(0, 300)}`, 'AI_ERROR');
    }
    const data = await res.json() as { instrumental_path?: string };
    if (!data.instrumental_path) throw unavailable('El servicio no devolvio la pista instrumental', 'AI_ERROR');

    const probe = await probeMedia(data.instrumental_path);
    const id = newId('aud');
    db.prepare(`INSERT INTO media_assets (id, room_id, kind, original_name, mime_type, size_bytes, duration_sec, width, height, storage_path, created_at)
                VALUES (?, ?, 'audio', ?, 'audio/wav', ?, ?, NULL, NULL, ?, ?)`)
      .run(id, roomId, 'instrumental-demucs.wav', 0, probe.durationSec, data.instrumental_path, new Date().toISOString());
    return getMediaAsset(id)!;
  } finally {
    clearTimeout(timer);
  }
}
