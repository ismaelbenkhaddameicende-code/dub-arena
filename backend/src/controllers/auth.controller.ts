import type { Request, Response } from 'express';
import { z } from 'zod';
import { loginUser, registerUser, updateProfile } from '../services/auth.service';

export const registerSchema = z.object({
  email: z.string().email('Correo no valido'),
  password: z.string().min(8, 'La contrasena debe tener al menos 8 caracteres').max(200),
  displayName: z.string().min(2, 'Nombre demasiado corto').max(40),
});

export const loginSchema = z.object({
  email: z.string().email('Correo no valido'),
  password: z.string().min(1, 'Introduce tu contrasena'),
});

export function register(req: Request, res: Response): void {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos no validos' });
    return;
  }
  const result = registerUser(parsed.data);
  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
  res.status(201).json(result.data);
}

export function login(req: Request, res: Response): void {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Datos no validos' });
    return;
  }
  const result = loginUser(parsed.data);
  if (!result.ok) { res.status(result.status).json({ error: result.error }); return; }
  res.json(result.data);
}

export function me(req: Request, res: Response): void {
  res.json({ user: req.user });
}

export function patchProfile(req: Request, res: Response): void {
  const schema = z.object({
    displayName: z.string().min(2).max(40).optional(),
    avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  });
  const parsed = schema.parse(req.body);
  const user = updateProfile(req.userId!, parsed);
  res.json({ user });
}
