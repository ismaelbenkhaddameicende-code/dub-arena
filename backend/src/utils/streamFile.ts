import fs from 'node:fs';
import type { Request, Response } from 'express';

const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
};

export function mimeFromPath(filePath: string, fallback = 'application/octet-stream'): string {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
  return MIME_BY_EXT[ext] ?? fallback;
}

/**
 * Sirve un archivo con soporte de Range (necesario para que <video> pueda buscar
 * y para que ffmpeg/el editor lean solo la parte necesaria).
 */
export function streamFile(req: Request, res: Response, filePath: string, mimeType?: string, downloadName?: string): void {
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'Archivo no encontrado' }); return; }
  const stat = fs.statSync(filePath);
  const total = stat.size;
  const type = mimeType ?? mimeFromPath(filePath);
  const range = req.headers.range;

  res.setHeader('Content-Type', type);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  if (downloadName) {
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(downloadName)}"`);
  }

  if (!range) {
    res.setHeader('Content-Length', total);
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  if (!match) { res.status(416).setHeader('Content-Range', `bytes */${total}`); res.end(); return; }
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : total - 1;
  if (start >= total || end >= total || start > end) {
    res.status(416).setHeader('Content-Range', `bytes */${total}`);
    res.end();
    return;
  }
  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
  res.setHeader('Content-Length', end - start + 1);
  fs.createReadStream(filePath, { start, end }).pipe(res);
}
