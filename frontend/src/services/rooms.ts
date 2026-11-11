import type {
  MediaAsset, Recording, RoomDetail, RoomSummary, SceneAnalysis, ExportJob, TimelineTrack,
} from '@dub-arena/shared';
import { api } from '../lib/api';

export const roomsApi = {
  list: () => api.get<{ rooms: RoomSummary[] }>('/api/rooms'),
  create: (name: string) => api.post<{ room: RoomDetail }>('/api/rooms', { name }),
  joinByCode: (code: string) => api.post<{ room: RoomDetail }>('/api/rooms/join', { code }),
  detail: (roomId: string) => api.get<{ room: RoomDetail; preview?: boolean }>(`/api/rooms/${roomId}`),
  leave: (roomId: string) => api.post<{ deleted: boolean }>(`/api/rooms/${roomId}/leave`),
  kick: (roomId: string, userId: string) => api.post<{ ok: true }>(`/api/rooms/${roomId}/kick`, { userId }),
  assign: (roomId: string, userId: string, characterId: string | null) =>
    api.post<{ ok: true }>(`/api/rooms/${roomId}/assign`, { userId, characterId }),
  patch: (roomId: string, body: { name?: string; status?: 'open' | 'live' | 'closed' }) =>
    api.patch<{ room: RoomSummary }>(`/api/rooms/${roomId}`, body),
  online: (roomId: string) => api.get<{ online: string[] }>(`/api/rooms/${roomId}/online`),

  video: (roomId: string) => api.get<{ video: MediaAsset | null }>(`/api/rooms/${roomId}/video`),
  uploadVideo: (roomId: string, file: File, onProgress?: (pct: number) => void) =>
    new Promise<{ video: MediaAsset }>((resolve, reject) => {
      const form = new FormData();
      form.append('video', file);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/rooms/${roomId}/video`);
      const token = localStorage.getItem('dub-arena-token');
      if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) onProgress(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText) as { video: MediaAsset });
        else {
          try { reject(new Error((JSON.parse(xhr.responseText) as { error?: string }).error ?? `Error ${xhr.status}`)); }
          catch { reject(new Error(`Error ${xhr.status}`)); }
        }
      };
      xhr.onerror = () => reject(new Error('Fallo de red durante la subida'));
      xhr.send(form);
    }),

  recordings: (roomId: string) => api.get<{ recordings: Recording[] }>(`/api/rooms/${roomId}/recordings`),
  uploadRecording: (
    roomId: string,
    blob: Blob,
    meta: { startTime: number; endTime: number; interventionId?: string | null; replaceRecordingId?: string | null; effects?: unknown },
  ) => {
    const form = new FormData();
    const extension = blob.type.includes('ogg') ? 'ogg' : 'webm';
    form.append('audio', blob, `toma.${extension}`);
    form.append('startTime', String(meta.startTime));
    form.append('endTime', String(meta.endTime));
    if (meta.interventionId) form.append('interventionId', meta.interventionId);
    if (meta.replaceRecordingId) form.append('replaceRecordingId', meta.replaceRecordingId);
    if (meta.effects) form.append('effects', JSON.stringify(meta.effects));
    return api.post<{ recording: Recording }>(`/api/rooms/${roomId}/recordings`, form);
  },
  deleteRecording: (recordingId: string) => api.del<{ ok: true }>(`/api/recordings/${recordingId}`),

  analysis: (roomId: string) => api.get<{ analysis: SceneAnalysis | null }>(`/api/rooms/${roomId}/analysis`),
  runAnalysis: (roomId: string, body: { model?: 'tiny' | 'base' | 'small'; language?: string; diarize?: boolean }) =>
    api.post<{ analysis: SceneAnalysis }>(`/api/rooms/${roomId}/analysis`, body),
  patchAnalysis: (roomId: string, body: { characters?: unknown; interventions?: unknown; confirm?: boolean }) =>
    api.patch<{ analysis: SceneAnalysis }>(`/api/rooms/${roomId}/analysis`, body),
  aiHealth: () => api.get<{ reachable: boolean; transcription: boolean; diarization: boolean; separation: boolean; detail: string }>('/api/ai/health'),
  separate: (roomId: string) => api.post<{ asset: MediaAsset }>(`/api/rooms/${roomId}/separate`),

  timeline: (roomId: string) => api.get<{ timeline: { tracks: TimelineTrack[] } | null }>(`/api/rooms/${roomId}/timeline`),
  saveTimeline: (roomId: string, tracks: TimelineTrack[]) => api.put<{ ok: true }>(`/api/rooms/${roomId}/timeline`, { tracks }),

  exports: (roomId: string) => api.get<{ jobs: ExportJob[] }>(`/api/rooms/${roomId}/exports`),
  createExport: (roomId: string, body: { keepOriginalAudio: boolean; originalGain: number; clips: unknown[] }) =>
    api.post<{ job: ExportJob }>(`/api/rooms/${roomId}/exports`, body),
  exportStatus: (jobId: string) => api.get<{ job: ExportJob }>(`/api/exports/${jobId}`),
};
