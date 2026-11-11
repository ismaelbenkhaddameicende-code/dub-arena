import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env';
import { MAX_AUDIO_BYTES, MAX_VIDEO_BYTES } from '@dub-arena/shared';

fs.mkdirSync(env.storage.tmp, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, env.storage.tmp),
  filename: (_req, file, cb) => {
    const safeExt = path.extname(file.originalname).replace(/[^.\w]/g, '').slice(0, 10);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`);
  },
});

const VIDEO = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska'];
const AUDIO = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/mpeg'];

export const uploadVideo = multer({
  storage,
  limits: { fileSize: MAX_VIDEO_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!VIDEO.includes(file.mimetype)) {
      cb(new Error(`Formato de video no admitido (${file.mimetype}). Usa MP4, WebM, MOV o MKV.`));
      return;
    }
    cb(null, true);
  },
});

export const uploadAudio = multer({
  storage,
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype.split(';')[0].trim();
    if (!AUDIO.includes(mime)) {
      cb(new Error(`Formato de audio no admitido (${file.mimetype}). Usa WebM, OGG, WAV, MP4 o MP3.`));
      return;
    }
    cb(null, true);
  },
});
