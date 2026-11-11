import http from 'node:http';
import { createApp } from './app';
import { env } from './config/env';
import { createSocketServer } from './sockets';
import { logger } from './utils/logger';
import { probeMedia } from './utils/ffprobe';

const log = logger('boot');

async function checkFfmpeg(): Promise<void> {
  try {
    const { run } = await import('./utils/ffprobe');
    const { code, stdout } = await run(env.ffmpegPath, ['-version']);
    if (code !== 0) throw new Error('ffmpeg no responde');
    log.info(`FFmpeg (${env.ffmpegSource}) -> ${env.ffmpegPath}: ${stdout.split('\n')[0].slice(0, 50)}`);
  } catch {
    log.warn('FFmpeg no disponible: la exportacion de video fallara. Instala FFmpeg o define FFMPEG_PATH.');
  }
}

async function main(): Promise<void> {
  await checkFfmpeg();
  const app = createApp();
  const server = http.createServer(app);
  createSocketServer(server);
  server.listen(env.port, '0.0.0.0', () => {
    log.info(`API DUB ARENA escuchando en 0.0.0.0:${env.port}`);
    log.info(`Origenes permitidos: ${env.corsOrigins.join(', ')}`);
  });
}

main().catch((error) => {
  log.error('No se pudo arrancar el servidor', error);
  process.exit(1);
});
