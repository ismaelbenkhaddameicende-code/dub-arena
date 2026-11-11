import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

export type BinarySource = 'env' | 'path' | 'package' | 'missing';

export interface ResolvedBinary {
  cmd: string;
  source: BinarySource;
}

function works(cmd: string): boolean {
  try {
    execFileSync(cmd, ['-version'], { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Localiza ffmpeg/ffprobe en este orden:
 *   1. Variable de entorno (ruta explicita del usuario)
 *   2. PATH del sistema
 *   3. Paquete npm opcional (ffmpeg-static / ffprobe-static), util en servidores
 *      donde no se pueden instalar binarios del sistema.
 */
export function resolveBinary(configured: string | undefined, name: 'ffmpeg' | 'ffprobe'): ResolvedBinary {
  if (configured && configured !== name && (existsSync(configured) || works(configured))) {
    return { cmd: configured, source: 'env' };
  }
  if (works(name)) return { cmd: name, source: 'path' };

  try {
    // Dependencias opcionales: si no estan, seguimos sin romper el arranque.
    const mod: unknown = require(name === 'ffmpeg' ? 'ffmpeg-static' : 'ffprobe-static');
    const candidate = typeof mod === 'string' ? mod : (mod as { path?: string } | null)?.path;
    if (typeof candidate === 'string' && existsSync(candidate)) return { cmd: candidate, source: 'package' };
  } catch {
    /* paquete opcional ausente */
  }
  return { cmd: name, source: 'missing' };
}
