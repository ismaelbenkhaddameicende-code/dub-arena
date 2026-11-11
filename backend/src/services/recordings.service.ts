import fs from 'node:fs';
import path from 'node:path';
import type { Recording, VoiceEffectChain } from '@dub-arena/shared';
import { DEFAULT_EFFECTS } from '@dub-arena/shared';
import { db } from '../db';
import { env } from '../config/env';
import { newId } from '../utils/ids';
import { probeMedia } from '../utils/ffprobe';
import { extensionFor } from './media.service';

interface RecordingRow {
  id: string; room_id: string; user_id: string; character_id: string | null; intervention_id: string | null;
  take_number: number; start_time: number; end_time: number; duration: number; mime_type: string;
  size_bytes: number; storage_path: string; effects_json: string; created_at: string;
}

const mapRecording = (row: RecordingRow): Recording => {
  let effects: VoiceEffectChain = { presetId: 'natural', settings: { ...DEFAULT_EFFECTS } };
  try { effects = JSON.parse(row.effects_json) as VoiceEffectChain; } catch { /* mantener default */ }
  return {
    id: row.id,
    roomId: row.room_id,
    sceneId: null,
    userId: row.user_id,
    characterId: row.character_id,
    interventionId: row.intervention_id,
    takeNumber: row.take_number,
    startTime: row.start_time,
    endTime: row.end_time,
    duration: row.duration,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    effects,
    createdAt: row.created_at,
  };
};

export function listRecordings(roomId: string): Recording[] {
  const rows = db.prepare('SELECT * FROM recordings WHERE room_id = ? ORDER BY start_time ASC').all(roomId) as RecordingRow[];
  return rows.map(mapRecording);
}

export function getRecordingRow(id: string): RecordingRow | undefined {
  return db.prepare('SELECT * FROM recordings WHERE id = ?').get(id) as RecordingRow | undefined;
}

export async function saveRecording(input: {
  roomId: string; userId: string; characterId: string | null; interventionId: string | null;
  startTime: number; endTime: number; tempPath: string; mimeType: string; sizeBytes: number;
  effects: VoiceEffectChain; replaceRecordingId?: string | null;
}): Promise<Recording> {
  const probe = await probeMedia(input.tempPath);
  if (probe.durationSec <= 0) {
    fs.rmSync(input.tempPath, { force: true });
    throw new Error('La grabacion no contiene audio valido');
  }

  const id = newId('rec');
  const dir = path.join(env.storage.recordings, input.roomId);
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `${id}${extensionFor(input.mimeType, '.webm')}`);
  fs.renameSync(input.tempPath, target);

  const previous = input.interventionId
    ? db.prepare('SELECT MAX(take_number) AS n FROM recordings WHERE intervention_id = ? AND user_id = ?').get(input.interventionId, input.userId) as { n: number | null }
    : null;
  const takeNumber = (previous?.n ?? 0) + 1;

  db.prepare(`INSERT INTO recordings (id, room_id, user_id, character_id, intervention_id, take_number,
              start_time, end_time, duration, mime_type, size_bytes, storage_path, effects_json, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, input.roomId, input.userId, input.characterId, input.interventionId, takeNumber,
      Math.max(0, input.startTime), Math.max(0, input.endTime), probe.durationSec,
      input.mimeType, input.sizeBytes, target, JSON.stringify(input.effects), new Date().toISOString());

  // Repetir toma: la version anterior se archiva en disco pero deja de ser la activa.
  if (input.replaceRecordingId) {
    const old = getRecordingRow(input.replaceRecordingId);
    if (old && old.user_id === input.userId) {
      db.prepare('DELETE FROM recordings WHERE id = ?').run(input.replaceRecordingId);
      fs.rmSync(old.storage_path, { force: true });
    }
  }

  return mapRecording(getRecordingRow(id) as RecordingRow);
}

export function deleteRecording(id: string, userId: string): boolean {
  const row = getRecordingRow(id);
  if (!row || row.user_id !== userId) return false;
  db.prepare('DELETE FROM recordings WHERE id = ?').run(id);
  fs.rmSync(row.storage_path, { force: true });
  return true;
}

export function updateRecordingEffects(id: string, userId: string, effects: VoiceEffectChain): void {
  db.prepare('UPDATE recordings SET effects_json = ? WHERE id = ? AND user_id = ?').run(JSON.stringify(effects), id, userId);
}
