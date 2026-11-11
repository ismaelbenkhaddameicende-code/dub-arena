/**
 * DUB ARENA - Contratos compartidos entre backend, frontend y servicios de IA.
 * Fuente única de verdad para los tipos que cruzan la red.
 */

export const ROOM_MAX_PARTICIPANTS = 4;
export const MAX_VIDEO_BYTES = 300 * 1024 * 1024; // 300 MB
export const MAX_AUDIO_BYTES = 60 * 1024 * 1024; // 60 MB
export const ACCEPTED_VIDEO_MIME = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'] as const;
export const ACCEPTED_AUDIO_MIME = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/mpeg'] as const;

/* ------------------------------- Usuarios ------------------------------- */

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  avatarColor: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: PublicUser;
}

/* --------------------------------- Salas -------------------------------- */

export type RoomStatus = 'open' | 'live' | 'closed';
export type ParticipantRole = 'host' | 'dubber' | 'viewer';

export interface Character {
  id: string;
  name: string;
  color: string;
  speakerId: string | null; // SPEAKER_00 de la diarización, si existe
  confidence: number | null;
  assignedUserId: string | null;
}

export interface Participant {
  userId: string;
  displayName: string;
  avatarColor: string;
  role: ParticipantRole;
  connected: boolean;
  characterId: string | null;
  joinedAt: string;
}

/** Estado de reproducción autoritativo. `anchorServerTime` es reloj del servidor (ms epoch). */
export interface PlaybackState {
  playing: boolean;
  position: number; // segundos en el momento del ancla
  anchorServerTime: number;
  rate: number;
  updatedBy: string;
  updatedAt: number;
}

export interface RoomSummary {
  id: string;
  code: string;
  name: string;
  hostId: string;
  status: RoomStatus;
  maxParticipants: number;
  videoId: string | null;
  hasAnalysis: boolean;
  participantCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoomDetail extends RoomSummary {
  participants: Participant[];
  characters: Character[];
  playback: PlaybackState;
}

/* -------------------------------- Medios -------------------------------- */

export interface MediaAsset {
  id: string;
  roomId: string;
  kind: 'video' | 'audio';
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  durationSec: number;
  width: number | null;
  height: number | null;
  createdAt: string;
}

/* ----------------------- Análisis inteligente de escena ------------------ */

export interface Intervention {
  id: string;
  speakerId: string;
  characterId: string | null;
  text: string;
  start: number;
  end: number;
  order: number;
  overlapWith: string[]; // ids de otras intervenciones solapadas
  edited: boolean;
}

export interface AnalyzedCharacter {
  id: string;
  speakerId: string;
  proposedName: string | null;
  confidence: number; // 0..1
  firstAppearance: number;
  interventionCount: number;
  color: string;
}

export interface SceneAnalysis {
  id: string;
  videoId: string;
  roomId: string;
  language: string | null;
  durationSec: number;
  engine: {
    transcription: string;
    diarization: string;
  };
  characters: AnalyzedCharacter[];
  interventions: Intervention[];
  warnings: string[];
  createdAt: string;
  confirmedAt: string | null;
}

/* ------------------------------ Grabaciones ----------------------------- */

export interface Recording {
  id: string;
  roomId: string;
  sceneId: string | null;
  userId: string;
  characterId: string | null;
  interventionId: string | null;
  takeNumber: number;
  startTime: number; // respecto al inicio del vídeo
  endTime: number;
  duration: number;
  mimeType: string;
  sizeBytes: number;
  effects: VoiceEffectChain;
  createdAt: string;
}

/* -------------------------------- Efectos ------------------------------- */

export interface VoiceEffectSettings {
  enabled: boolean;
  semitones: number; // -12..12
  robot: boolean;
  echo: boolean;
  reverb: boolean;
  distortion: boolean;
  radio: boolean;
  gain: number; // 0..2
}

export const DEFAULT_EFFECTS: VoiceEffectSettings = {
  enabled: false, semitones: 0, robot: false, echo: false,
  reverb: false, distortion: false, radio: false, gain: 1,
};

export interface VoiceEffectChain {
  presetId: string;
  settings: VoiceEffectSettings;
}

export interface EffectPreset {
  id: string;
  label: string;
  description: string;
  settings: VoiceEffectSettings;
}

export const EFFECT_PRESETS: EffectPreset[] = [
  { id: 'natural', label: 'Natural', description: 'Sin procesado', settings: { ...DEFAULT_EFFECTS } },
  { id: 'deep', label: 'Grave', description: 'Tono más profundo', settings: { ...DEFAULT_EFFECTS, enabled: true, semitones: -5, gain: 1.05 } },
  { id: 'high', label: 'Agudo', description: 'Tono más alto', settings: { ...DEFAULT_EFFECTS, enabled: true, semitones: 5 } },
  { id: 'robot', label: 'Robot', description: 'Modulación metálica', settings: { ...DEFAULT_EFFECTS, enabled: true, robot: true, semitones: -2 } },
  { id: 'echo', label: 'Eco', description: 'Repetición retardada', settings: { ...DEFAULT_EFFECTS, enabled: true, echo: true } },
  { id: 'reverb', label: 'Reverb', description: 'Sala amplia', settings: { ...DEFAULT_EFFECTS, enabled: true, reverb: true } },
  { id: 'distorted', label: 'Distorsión', description: 'Saturación agresiva', settings: { ...DEFAULT_EFFECTS, enabled: true, distortion: true } },
  { id: 'radio', label: 'Radio', description: 'Banda estrecha tipo walkie', settings: { ...DEFAULT_EFFECTS, enabled: true, radio: true, gain: 1.15 } },
];

/* -------------------------------- Timeline ------------------------------ */

export interface TimelineClip {
  id: string;
  recordingId: string | null;
  trackId: string;
  label: string;
  startTime: number;
  inPoint: number;
  outPoint: number;
  gain: number;
  muted: boolean;
  sourceUrl: string | null;
}

export interface TimelineTrack {
  id: string;
  kind: 'original' | 'voice';
  label: string;
  userId: string | null;
  characterId: string | null;
  color: string;
  muted: boolean;
  gain: number;
  clips: TimelineClip[];
}

export interface ExportJob {
  id: string;
  roomId: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  progress: number;
  message: string;
  fileName: string | null;
  sizeBytes: number | null;
  durationSec: number | null;
  error: string | null;
  keepOriginalAudio: boolean;
  createdAt: string;
}

/* --------------------------------- Eventos ------------------------------ */

export interface ServerToClientEvents {
  'room:state': (state: RoomDetail) => void;
  'room:playback': (state: PlaybackState) => void;
  'room:participants': (participants: Participant[]) => void;
  'room:characters': (characters: Character[]) => void;
  'room:notice': (notice: { level: 'info' | 'warn' | 'error'; message: string; userId?: string }) => void;
  'room:recording-saved': (recording: Recording) => void;
  'room:closed': (payload: { reason: string }) => void;
  'server:time': (payload: { serverTime: number; rttSample: number }) => void;
}

export interface ClientToServerEvents {
  'room:join': (payload: { roomId: string }, ack?: (res: AckResponse<RoomDetail>) => void) => void;
  'room:leave': () => void;
  'playback:command': (payload: { action: 'play' | 'pause' | 'seek' | 'restart'; position?: number }, ack?: (res: AckResponse<PlaybackState>) => void) => void;
  'playback:request-sync': (ack?: (res: AckResponse<{ playback: PlaybackState; serverTime: number }>) => void) => void;
  'time:sync': (payload: { clientTime: number }, ack?: (res: { clientTime: number; serverTime: number }) => void) => void;
  'recording:saved': (payload: { recordingId: string }) => void;
  'room:kick': (payload: { userId: string }, ack?: (res: AckResponse<null>) => void) => void;
  'room:assign-character': (payload: { userId: string; characterId: string | null }, ack?: (res: AckResponse<null>) => void) => void;
}

export type AckResponse<T> = { ok: true; data: T } | { ok: false; error: string };
