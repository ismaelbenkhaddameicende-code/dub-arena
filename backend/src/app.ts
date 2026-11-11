import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { api } from './routes';
import { errorHandler, notFound } from './middleware/errors';
import { logger } from './utils/logger';
import path from 'node:path';
import fs from 'node:fs';

const log = logger('server');

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  const allowAll = env.corsOrigins.includes('*');
  app.use(cors({ origin: allowAll ? true : env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false }));

  app.use((req, _res, next) => {
    if (req.path.startsWith('/api')) log.info(`${req.method} ${req.path}`);
    next();
  });

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'dub-arena-api', version: '0.1.0', time: new Date().toISOString() });
  });

  app.use('/api', api);

  // Un solo proceso sirve la API y la web compilada: un unico origen, sin CORS
  // ni URLs cruzadas. Es el modo que usan los despliegues (SERVE_STATIC=1).
  if (env.serveStatic) {
    const distDir = path.join(env.root, 'frontend', 'dist');
    const indexHtml = path.join(distDir, 'index.html');
    if (fs.existsSync(indexHtml)) {
      app.use(express.static(distDir, {
        index: false,
        maxAge: '1y',
        setHeaders: (res, filePath) => {
          if (/\.(html|webmanifest|js)$/.test(filePath) && /(index\.html|sw\.js|workbox-|manifest\.webmanifest)/.test(filePath)) {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }));
      app.use((req, res, next) => {
        if (req.method !== 'GET' || req.path.startsWith('/api') || req.path.startsWith('/socket.io')) return next();
        res.sendFile(indexHtml);
      });
      log.info(`Web compilada servida desde ${distDir}`);
    } else {
      log.warn('SERVE_STATIC activo pero falta frontend/dist. Ejecuta npm run build.');
    }
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
