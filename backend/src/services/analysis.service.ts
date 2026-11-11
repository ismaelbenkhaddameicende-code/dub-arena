import type { AnalyzedCharacter, Intervention, SceneAnalysis } from '@dub-arena/shared';
import { db } from '../db';
import { env } from '../config/env';
import { newId, COLORS } from '../utils/ids';
import { getMediaRow } from './media.service';
import { replaceCharacters, setRoomAnalysis } from './room.service';
import { logger } from '../utils/logger';
import { ServiceError, unavailable } from '../utils/errors';

const log = logger('analysis');

interface AiSegment { speaker: string; start: number; end: number; text: string }
interface AiResponse {
  language?: string | null;
  duration_sec?: number;
  segments?: AiSegment[];
  engine?: { transcription?: string; diarization?: string };
  warnings?: string[];
  name_suggestions?: Array<{ speaker: string; name: string; confidence: number }>;
}

interface AnalysisRow {
  id: string; room_id: string; video_id: string; language: string | null; duration_sec: number;
  engine_json: string; characters_json: string; interventions_json: string; warnings_json: string;
  created_at: string; confirmed_at: string | null;
}

export interface AiHealth {
  reachable: boolean;
  transcription: boolean;
  diarization: boolean;
  separation: boolean;
  detail: string;
}

export async function aiHealth(): Promise<AiHealth> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(`${env.aiServiceUrl}/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as Partial<AiHealth> & { detail?: string };
    return {
      reachable: true,
      transcription: Boolean(data.transcription),
      diarization: Boolean(data.diarization),
      separation: Boolean(data.separation),
      detail: data.detail ?? 'Servicio de IA activo',
    };
  } catch (error) {
    return {
      reachable: false,
      transcription: false,
      diarization: false,
      separation: false,
      detail: `Servicio de IA no disponible en ${env.aiServiceUrl}. Arrancalo con: python ai-services/main.py (${(error as Error).message})`,
    };
  }
}

function buildCharacters(segments: AiSegment[], suggestions: AiResponse['name_suggestions']): AnalyzedCharacter[] {
  const order: string[] = [];
  const stats = new Map<string, { first: number; count: number }>();
  for (const seg of segments) {
    if (!stats.has(seg.speaker)) { order.push(seg.speaker); stats.set(seg.speaker, { first: seg.start, count: 0 }); }
    const s = stats.get(seg.speaker)!;
    s.count += 1;
    if (seg.start < s.first) s.first = seg.start;
  }
  return order.map((speaker, index) => {
    const suggestion = suggestions?.find((s) => s.speaker === speaker);
    return {
      id: speaker,
      speakerId: speaker,
      proposedName: suggestion?.name ?? null,
      confidence: suggestion?.confidence ?? 0,
      firstAppearance: stats.get(speaker)!.first,
      interventionCount: stats.get(speaker)!.count,
      color: COLORS[index % COLORS.length],
    };
  });
}

function buildInterventions(segments: AiSegment[]): Intervention[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const out: Intervention[] = sorted.map((seg, index) => ({
    id: `itv_${index.toString().padStart(4, '0')}`,
    speakerId: seg.speaker,
    characterId: null,
    text: seg.text.trim(),
    start: Number(seg.start.toFixed(2)),
    end: Number(seg.end.toFixed(2)),
    order: index,
    overlapWith: [],
    edited: false,
  }));

  // Solapamientos reales entre intervenciones de distinto hablante
  for (let i = 0; i < out.length; i += 1) {
    for (let j = i + 1; j < out.length; j += 1) {
      if (out[j].start >= out[i].end) break;
      if (out[j].speakerId !== out[i].speakerId) {
        out[i].overlapWith.push(out[j].id);
        out[j].overlapWith.push(out[i].id);
      }
    }
  }
  return out;
}

const mapAnalysis = (row: AnalysisRow): SceneAnalysis => ({
  id: row.id,
  videoId: row.video_id,
  roomId: row.room_id,
  language: row.language,
  durationSec: row.duration_sec,
  engine: JSON.parse(row.engine_json) as SceneAnalysis['engine'],
  characters: JSON.parse(row.characters_json) as AnalyzedCharacter[],
  interventions: JSON.parse(row.interventions_json) as Intervention[],
  warnings: JSON.parse(row.warnings_json) as string[],
  createdAt: row.created_at,
  confirmedAt: row.confirmed_at,
});

export function getAnalysis(roomId: string): SceneAnalysis | null {
  const row = db.prepare('SELECT * FROM analyses WHERE room_id = ? ORDER BY created_at DESC LIMIT 1').get(roomId) as AnalysisRow | undefined;
  return row ? mapAnalysis(row) : null;
}

export async function analyzeRoomVideo(roomId: string, opts: { language?: string; model?: string; diarize?: boolean }): Promise<SceneAnalysis> {
  const room = db.prepare('SELECT video_id FROM rooms WHERE id = ?').get(roomId) as { video_id: string | null } | undefined;
  if (!room?.video_id) throw new ServiceError('La sala no tiene video subido', 409);
  const media = getMediaRow(room.video_id);
  if (!media) throw new ServiceError('No se encuentra el archivo de video', 404);

  const health = await aiHealth();
  if (!health.reachable) throw unavailable(health.detail, 'AI_OFFLINE');
  if (!health.transcription) throw unavailable('El servicio de IA esta activo pero sin motor de transcripcion instalado (faster-whisper).', 'AI_NO_MODEL');

  log.info(`Analizando video ${media.id} de la sala ${roomId}`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.aiServiceTimeoutMs);
  let payload: AiResponse;
  try {
    const res = await fetch(`${env.aiServiceUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: media.storage_path,
        language: opts.language ?? null,
        model: opts.model ?? 'base',
        diarize: opts.diarize !== false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const detail = await res.text();
      throw unavailable(`El servicio de IA respondio ${res.status}: ${detail.slice(0, 300)}`, 'AI_ERROR');
    }
    payload = await res.json() as AiResponse;
  } finally {
    clearTimeout(timer);
  }

  const segments = (payload.segments ?? []).filter((s) => s.text && s.text.trim().length > 0 && s.end > s.start);
  if (segments.length === 0) throw new ServiceError('La transcripcion no devolvio ninguna intervencion con voz. Revisa que el video tenga dialogo.', 422);

  const characters = buildCharacters(segments, payload.name_suggestions);
  const interventions = buildInterventions(segments);
  const id = newId('anl');
  const now = new Date().toISOString();

  db.prepare(`INSERT INTO analyses (id, room_id, video_id, language, duration_sec, engine_json,
              characters_json, interventions_json, warnings_json, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, roomId, media.id, payload.language ?? null, payload.duration_sec ?? media.duration_sec,
      JSON.stringify({ transcription: payload.engine?.transcription ?? 'faster-whisper', diarization: payload.engine?.diarization ?? 'none' }),
      JSON.stringify(characters), JSON.stringify(interventions), JSON.stringify(payload.warnings ?? []), now);

  replaceCharacters(roomId, characters.map((c) => ({ name: c.proposedName ?? c.speakerId, speakerId: c.speakerId, confidence: c.confidence })));
  setRoomAnalysis(roomId, id);
  log.info(`Analisis completado: ${characters.length} voces, ${interventions.length} intervenciones`);
  return getAnalysis(roomId)!;
}

export interface AnalysisPatch {
  characters?: AnalyzedCharacter[];
  interventions?: Intervention[];
  confirm?: boolean;
}

export function patchAnalysis(roomId: string, patch: AnalysisPatch): SceneAnalysis {
  const row = db.prepare('SELECT * FROM analyses WHERE room_id = ? ORDER BY created_at DESC LIMIT 1').get(roomId) as AnalysisRow | undefined;
  if (!row) throw new ServiceError('Esta sala todavia no tiene analisis', 404);

  const characters = patch.characters ?? (JSON.parse(row.characters_json) as AnalyzedCharacter[]);
  const interventions = patch.interventions ?? (JSON.parse(row.interventions_json) as Intervention[]);
  const confirmedAt = patch.confirm ? new Date().toISOString() : row.confirmed_at;

  db.prepare('UPDATE analyses SET characters_json = ?, interventions_json = ?, confirmed_at = ? WHERE id = ?')
    .run(JSON.stringify(characters), JSON.stringify(interventions), confirmedAt, row.id);

  if (patch.characters) {
    replaceCharacters(roomId, characters.map((c) => ({
      name: c.proposedName ?? c.speakerId,
      speakerId: c.speakerId,
      confidence: c.confidence,
    })));
  }
  return getAnalysis(roomId)!;
}
