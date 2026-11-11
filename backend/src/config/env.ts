import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import { resolveBinary } from '../utils/binaries';

const ROOT = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(ROOT, '.env') });

/**
 * Secreto de firma. Si el hosting no define JWT_SECRET se genera uno y se guarda
 * en el almacenamiento, para que la aplicacion arranque igualmente. En un disco
 * efimero eso invalida las sesiones al reiniciar: define JWT_SECRET en produccion.
 */
function devSecret(prod = false): string {
  const file = path.join(ROOT, 'storage', '.dev-secret');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, secret, { mode: 0o600 });
  if (prod) console.warn('[aviso] JWT_SECRET no definido: se genero uno temporal. Define el secreto para conservar las sesiones.');
  return secret;
}

const isProd = process.env.NODE_ENV === 'production';
const storageDir = path.resolve(ROOT, process.env.STORAGE_DIR ?? 'storage');
const ffmpegBinary = resolveBinary(process.env.FFMPEG_PATH, 'ffmpeg');
const ffprobeBinary = resolveBinary(process.env.FFPROBE_PATH, 'ffprobe');

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd,
  port: Number(process.env.PORT ?? 4000),
  root: ROOT,
  storageDir,
  jwtSecret: process.env.JWT_SECRET?.trim() || devSecret(isProd),
  mediaTokenTtlSec: Number(process.env.MEDIA_TOKEN_TTL ?? 3600),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',').map((s) => s.trim()).filter(Boolean),
  aiServiceUrl: process.env.AI_SERVICE_URL ?? 'http://127.0.0.1:8001',
  aiServiceTimeoutMs: Number(process.env.AI_SERVICE_TIMEOUT ?? 1_800_000),
  ffmpegPath: ffmpegBinary.cmd,
  ffprobePath: ffprobeBinary.cmd,
  ffmpegSource: ffmpegBinary.source,
  ffprobeSource: ffprobeBinary.source,
  // Servir la web compilada desde el mismo proceso: un solo despliegue, un solo origen.
  serveStatic: process.env.SERVE_STATIC === '1' || process.env.NODE_ENV === 'production',
  storage: {
    videos: path.join(storageDir, 'videos'),
    recordings: path.join(storageDir, 'recordings'),
    exports: path.join(storageDir, 'exports'),
    tmp: path.join(storageDir, 'tmp'),
    database: path.join(storageDir, 'dub-arena.db'),
  },
};

for (const dir of [env.storage.videos, env.storage.recordings, env.storage.exports, env.storage.tmp]) {
  fs.mkdirSync(dir, { recursive: true });
}
