import crypto from 'node:crypto';

export const newId = (prefix: string): string => `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newRoomCode(length = 6): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export const COLORS = ['#7c5cff', '#22d3ee', '#f59e0b', '#f472b6', '#34d399', '#60a5fa', '#fb7185', '#a3e635'];

export function pickColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
}
