import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { PublicUser } from '@dub-arena/shared';
import { db } from '../db';
import { env } from '../config/env';
import { newId, pickColor } from '../utils/ids';

interface UserRow {
  id: string; email: string; password_hash: string; display_name: string;
  avatar_color: string; created_at: string;
}

const SCRYPT_KEYLEN = 64;

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [algo, saltHex, hashHex] = stored.split('$');
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, { N: 16384, r: 8, p: 1 });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

const toPublic = (row: UserRow): PublicUser => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  avatarColor: row.avatar_color,
  createdAt: row.created_at,
});

export type Result<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

export function registerUser(input: { email: string; password: string; displayName: string }): Result<{ token: string; user: PublicUser }> {
  const email = input.email.trim().toLowerCase();
  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return { ok: false, error: 'Ese correo ya esta registrado', status: 409 };

  const id = newId('usr');
  const createdAt = new Date().toISOString();
  const color = pickColor(email);
  db.prepare(`INSERT INTO users (id, email, password_hash, display_name, avatar_color, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(id, email, hashPassword(input.password), input.displayName.trim(), color, createdAt);

  const user: PublicUser = { id, email, displayName: input.displayName.trim(), avatarColor: color, createdAt };
  return { ok: true, data: { token: signToken(id), user } };
}

export function loginUser(input: { email: string; password: string }): Result<{ token: string; user: PublicUser }> {
  const email = input.email.trim().toLowerCase();
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  if (!row || !verifyPassword(input.password, row.password_hash)) {
    return { ok: false, error: 'Credenciales incorrectas', status: 401 };
  }
  return { ok: true, data: { token: signToken(row.id), user: toPublic(row) } };
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: '7d' });
}

export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (typeof payload === 'string' || !payload.sub) return null;
    return String(payload.sub);
  } catch {
    return null;
  }
}

export function getUserById(id: string): PublicUser | null {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? toPublic(row) : null;
}

export function updateProfile(userId: string, patch: { displayName?: string; avatarColor?: string }): PublicUser | null {
  const current = getUserById(userId);
  if (!current) return null;
  db.prepare('UPDATE users SET display_name = ?, avatar_color = ? WHERE id = ?').run(
    patch.displayName?.trim() || current.displayName,
    patch.avatarColor || current.avatarColor,
    userId,
  );
  return getUserById(userId);
}
