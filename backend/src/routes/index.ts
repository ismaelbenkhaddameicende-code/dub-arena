import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errors';
import * as auth from '../controllers/auth.controller';
import * as rooms from '../controllers/rooms.controller';
import * as media from '../controllers/media.controller';
import * as analysis from '../controllers/analysis.controller';
import * as exportsCtl from '../controllers/export.controller';
import { uploadAudio, uploadVideo } from '../middleware/upload';

export const api = Router();

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false });
const heavyLimiter = rateLimit({ windowMs: 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false });

/* ------------------------------ Autenticacion ---------------------------- */
api.post('/auth/register', authLimiter, auth.register);
api.post('/auth/login', authLimiter, auth.login);
api.get('/auth/me', requireAuth, auth.me);
api.patch('/auth/me', requireAuth, auth.patchProfile);

/* ---------------------------------- Salas -------------------------------- */
api.post('/rooms', requireAuth, rooms.create);
api.get('/rooms', requireAuth, rooms.list);
api.post('/rooms/join', requireAuth, rooms.join);
api.get('/rooms/:roomId', requireAuth, rooms.detail);
api.patch('/rooms/:roomId', requireAuth, rooms.patchRoom);
api.post('/rooms/:roomId/leave', requireAuth, rooms.leave);
api.post('/rooms/:roomId/kick', requireAuth, rooms.kick);
api.post('/rooms/:roomId/host', requireAuth, rooms.makeHost);
api.post('/rooms/:roomId/assign', requireAuth, rooms.assign);
api.get('/rooms/:roomId/online', requireAuth, rooms.online);

/* ------------------------------- Reproduccion ---------------------------- */
api.get('/rooms/:roomId/playback', requireAuth, rooms.playback);
api.post('/rooms/:roomId/playback', requireAuth, rooms.forcePlayback);

/* ---------------------------------- Video -------------------------------- */
api.post('/rooms/:roomId/video', requireAuth, heavyLimiter, uploadVideo.single('video'), asyncHandler(media.uploadVideo));
api.get('/rooms/:roomId/video', requireAuth, media.videoInfo);

/* -------------------------------- Grabaciones ---------------------------- */
api.get('/rooms/:roomId/recordings', requireAuth, rooms.recordings);
api.post('/rooms/:roomId/recordings', requireAuth, heavyLimiter, uploadAudio.single('audio'), asyncHandler(media.uploadRecording));
api.delete('/recordings/:recordingId', requireAuth, rooms.removeRecording);
api.patch('/recordings/:recordingId/effects', requireAuth, rooms.patchRecordingEffects);

/* ----------------------- Tokens de acceso a archivos --------------------- */
api.get('/media/:resourceId/token', requireAuth, media.mediaToken);
api.get('/media/:mediaId/stream', asyncHandler(async (req, res) => media.streamMedia(req, res)));
api.get('/recordings/:recordingId/stream', asyncHandler(async (req, res) => media.streamRecording(req, res)));

/* --------------------------------- Analisis ------------------------------ */
api.get('/ai/health', requireAuth, asyncHandler(analysis.health));
api.get('/rooms/:roomId/analysis', requireAuth, analysis.current);
api.post('/rooms/:roomId/analysis', requireAuth, heavyLimiter, asyncHandler(analysis.run));
api.patch('/rooms/:roomId/analysis', requireAuth, analysis.patch);
api.post('/rooms/:roomId/separate', requireAuth, heavyLimiter, asyncHandler(analysis.separate));

/* -------------------------------- Timeline ------------------------------- */
api.get('/rooms/:roomId/timeline', requireAuth, rooms.getTimeline);
api.put('/rooms/:roomId/timeline', requireAuth, rooms.putTimeline);

/* -------------------------------- Exportar ------------------------------- */
api.post('/rooms/:roomId/exports', requireAuth, heavyLimiter, exportsCtl.createExport);
api.get('/rooms/:roomId/exports', requireAuth, exportsCtl.listExports);
api.get('/exports/:jobId', requireAuth, exportsCtl.getExport);
api.get('/exports/:jobId/download', requireAuth, exportsCtl.downloadExport);
