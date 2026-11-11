import type { NextFunction, Request, Response } from 'express';
import { verifyToken, getUserById } from '../services/auth.service';
import type { PublicUser } from '@dub-arena/shared';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { user?: PublicUser; userId?: string }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const userId = token ? verifyToken(token) : null;
  if (!userId) { res.status(401).json({ error: 'Sesion no valida o expirada' }); return; }
  const user = getUserById(userId);
  if (!user) { res.status(401).json({ error: 'Usuario no encontrado' }); return; }
  req.user = user;
  req.userId = user.id;
  next();
}
