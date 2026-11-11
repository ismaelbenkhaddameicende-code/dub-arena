import fs from 'node:fs';
import path from 'node:path';
import type { ExportJob } from '@dub-arena/shared';
import { db } from '../db';
import { env } from '../config/env';
import { newId } from '../utils/ids';
import { run, probeMedia } from '../utils/ffprobe';
import { getMediaRow } from './media.service';
import { getRecordingRow } from './recordings.service';
import { getRoomRow } from './room.service';
import { logger } from '../utils/logger';
import { ServiceError } from '../utils/errors';

const log = logger('export');

export interface ExportClip {
  recordingId: string;
  start: number;
  inPoint: number;
  outPoint: number;
  gain: number;
  muted: boolean;
}

export interface ExportRequest {
  keepOriginalAudio: boolean;
  originalGain: number;
  clips: ExportClip[];
}

interface JobRow {
  id: string; room_id: string; status: ExportJob['status']; progress: number; message: string;
  file_name: string | null; size_bytes: number | null; duration_sec: number | null; error: string | null;
  keep_original: number; params_json: string; created_at: string;
}

const mapJob = (row: JobRow): ExportJob => ({
  id: row.id,
  roomId: row.room_id,
  status: row.status,
  progress: row.progress,
  message: row.message,
  fileName: row.file_name,
  sizeBytes: row.size_bytes,
  durationSec: row.duration_sec,
  error: row.error,
  keepOriginalAudio: Boolean(row.keep_original),
  createdAt: row.created_at,
});

export function getJob(jobId: string): ExportJob | null {
  const row = db.prepare('SELECT * FROM export_jobs WHERE id = ?').get(jobId) as JobRow | undefined;
  return row ? mapJob(row) : null;
}

export function listJobs(roomId: string): ExportJob[] {
  const rows = db.prepare('SELECT * FROM export_jobs WHERE room_id = ? ORDER BY created_at DESC LIMIT 20').all(roomId) as JobRow[];
  return rows.map(mapJob);
}

export function getJobFile(jobId: string): { filePath: string; fileName: string } | null {
  const row = db.prepare('SELECT * FROM export_jobs WHERE id = ?').get(jobId) as JobRow | undefined;
  if (!row || row.status !== 'done' || !row.file_name) return null;
  const filePath = path.join(env.storage.exports, row.room_id, row.file_name);
  if (!fs.existsSync(filePath)) return null;
  return { filePath, fileName: row.file_name };
}

const QUEUE: string[] = [];
let working = false;

export function enqueueExport(roomId: string, request: ExportRequest): ExportJob {
  const room = getRoomRow(roomId);
  if (!room.video_id) throw new ServiceError('La sala no tiene video: sube un clip antes de exportar', 409);
  const usable = request.clips.filter((c) => !c.muted && c.outPoint > c.inPoint);
  if (usable.length === 0) throw new ServiceError('No hay grabaciones activas en la linea de tiempo', 422);

  const id = newId('exp');
  const createdAt = new Date().toISOString();
  db.prepare(`INSERT INTO export_jobs (id, room_id, status, progress, message, keep_original, params_json, created_at)
              VALUES (?, ?, 'queued', 0, ?, ?, ?, ?)`)
    .run(id, roomId, 'En cola de exportacion', request.keepOriginalAudio ? 1 : 0,
      JSON.stringify(request), createdAt);

  QUEUE.push(id);
  void pump();
  return getJob(id)!;
}

async function pump(): Promise<void> {
  if (working) return;
  working = true;
  try {
    while (QUEUE.length > 0) {
      const jobId = QUEUE.shift()!;
      try {
        await processJob(jobId);
      } catch (error) {
        const message = (error as Error).message || 'Error desconocido durante la exportacion';
        log.error(`Job ${jobId} fallo: ${message}`);
        db.prepare(`UPDATE export_jobs SET status = 'error', error = ?, message = ? WHERE id = ?`)
          .run(message, 'Exportacion fallida', jobId);
      }
    }
  } finally {
    working = false;
  }
}

function sanitizeName(name: string): string {
  return name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'dub-arena';
}

const secondsToClock = (sec: number): string => {
  const s = Math.max(0, sec);
  const hh = Math.floor(s / 3600).toString().padStart(2, '0');
  const mm = Math.floor((s % 3600) / 60).toString().padStart(2, '0');
  const ss = Math.floor(s % 60).toString().padStart(2, '0');
  const ms = Math.floor((s % 1) * 100).toString().padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
};

async function processJob(jobId: string): Promise<void> {
  const row = db.prepare('SELECT * FROM export_jobs WHERE id = ?').get(jobId) as JobRow | undefined;
  if (!row) return;
  const request = JSON.parse(row.params_json) as ExportRequest;
  const room = getRoomRow(row.room_id);
  const video = room.video_id ? getMediaRow(room.video_id) : undefined;
  if (!video) throw new Error('No se encuentra el video de la sala');

  const videoDuration = video.duration_sec > 0 ? video.duration_sec : await probeMedia(video.storage_path).then((p) => p.durationSec);
  const clips = request.clips.filter((c) => !c.muted && c.outPoint > c.inPoint);

  const inputs: string[] = ['-i', video.storage_path];
  const filterParts: string[] = [];
  const mixLabels: string[] = [];

  clips.forEach((clip, index) => {
    const recording = getRecordingRow(clip.recordingId);
    if (!recording) throw new Error(`Grabacion ${clip.recordingId} no encontrada`);
    if (recording.room_id !== row.room_id) throw new Error('Una grabacion no pertenece a esta sala');
    if (!fs.existsSync(recording.storage_path)) throw new Error(`Archivo de grabacion ausente: ${recording.id}`);
    inputs.push('-i', recording.storage_path);
    const inputIndex = index + 1;
    const delayMs = Math.max(0, Math.round(clip.start * 1000));
    const label = `v${index}`;
    const gain = Number.isFinite(clip.gain) ? Math.min(Math.max(clip.gain, 0), 4) : 1;
    filterParts.push(
      `[${inputIndex}:a]atrim=start=${clip.inPoint.toFixed(3)}:end=${clip.outPoint.toFixed(3)},` +
      `asetpts=PTS-STARTPTS,volume=${gain.toFixed(3)},aresample=48000,` +
      `adelay=delays=${delayMs}:all=1[${label}]`,
    );
    mixLabels.push(`[${label}]`);
  });

  if (request.keepOriginalAudio) {
    const gain = Number.isFinite(request.originalGain) ? Math.min(Math.max(request.originalGain, 0), 2) : 1;
    // Si el video no tiene audio, ffmpeg fallara al mapear [0:a]; se filtra antes con probe.
    const probe = await probeMedia(video.storage_path);
    if (probe.hasAudio) {
      filterParts.push(`[0:a]volume=${gain.toFixed(3)},aresample=48000[orig]`);
      mixLabels.push('[orig]');
    }
  }

  if (mixLabels.length === 0) throw new Error('No hay audio que mezclar: activa el audio original o alguna pista');

  filterParts.push(`${mixLabels.join('')}amix=inputs=${mixLabels.length}:normalize=0:dropout_transition=0:duration=longest[aout]`);

  const outDir = path.join(env.storage.exports, row.room_id);
  fs.mkdirSync(outDir, { recursive: true });
  const fileName = `${sanitizeName(room.name)}-${jobId.slice(-6)}.mp4`;
  const outPath = path.join(outDir, fileName);

  const args = [
    '-y', '-hide_banner', '-nostdin',
    ...inputs,
    '-filter_complex', filterParts.join(';'),
    '-map', '0:v:0', '-map', '[aout]',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-t', secondsToClock(videoDuration),
    '-movflags', '+faststart',
    '-progress', 'pipe:1', '-nostats',
    outPath,
  ];

  db.prepare(`UPDATE export_jobs SET status = 'processing', progress = 0.02, message = ? WHERE id = ?`)
    .run('Renderizando video con FFmpeg', jobId);

  let lastProgress = 0;
  const { code, stderr } = await run(env.ffmpegPath, args, {
    timeoutMs: 30 * 60 * 1000,
    onStdout: (chunk) => {
      const match = /out_time=(\d+):(\d+):(\d+)\.(\d+)/.exec(chunk);
      if (!match) return;
      const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 100;
      const progress = videoDuration > 0 ? Math.min(0.98, seconds / videoDuration) : 0.5;
      if (progress - lastProgress > 0.03) {
        lastProgress = progress;
        db.prepare('UPDATE export_jobs SET progress = ? WHERE id = ?').run(progress, jobId);
      }
    },
  });

  if (code !== 0) {
    fs.rmSync(outPath, { force: true });
    throw new Error(`FFmpeg termino con codigo ${code}: ${stderr.split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 500)}`);
  }

  // Verificacion real del archivo antes de declarar exito.
  if (!fs.existsSync(outPath)) throw new Error('FFmpeg no genero el archivo de salida');
  const stat = fs.statSync(outPath);
  if (stat.size < 1024) throw new Error('El archivo generado esta vacio');
  const probe = await probeMedia(outPath);
  if (!probe.videoCodec || probe.durationSec <= 0) throw new Error('El archivo generado no es un video valido');

  db.prepare(`UPDATE export_jobs SET status = 'done', progress = 1, message = ?, file_name = ?, size_bytes = ?, duration_sec = ? WHERE id = ?`)
    .run('Exportacion completada y verificada', fileName, stat.size, probe.durationSec, jobId);
  log.info(`Export ${jobId} listo: ${fileName} (${Math.round(stat.size / 1024)} KB, ${probe.durationSec.toFixed(1)}s)`);
}
