import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { ServiceError } from '../utils/errors';

const log = logger('http');

export class AppError extends ServiceError {}

export const asyncHandler = <T extends Request>(fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as T, res, next)).catch(next);
  };

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(422).json({
      error: 'Datos invalidos',
      details: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    return;
  }
  if (err instanceof ServiceError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  const anyErr = err as { status?: number; message?: string; code?: string };
  if (anyErr?.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'El archivo supera el limite permitido' });
    return;
  }
  const status = typeof anyErr?.status === 'number' ? anyErr.status : 500;
  const message = status >= 500 ? (anyErr?.message ?? 'Error interno del servidor') : (anyErr?.message ?? 'Error');
  if (status >= 500) log.error(anyErr?.message ?? 'Error desconocido', env.isProd ? undefined : err);
  res.status(status).json({ error: message });
}
