import type { Request, Response } from 'express';
import { z } from 'zod';
import { enqueueExport, getJob, getJobFile, listJobs } from '../services/export.service';
import { AppError } from '../middleware/errors';
import { streamFile } from '../utils/streamFile';

const exportSchema = z.object({
  keepOriginalAudio: z.boolean().default(true),
  originalGain: z.number().min(0).max(2).default(1),
  clips: z.array(z.object({
    recordingId: z.string().min(1),
    start: z.number().min(0),
    inPoint: z.number().min(0),
    outPoint: z.number().min(0),
    gain: z.number().min(0).max(4).default(1),
    muted: z.boolean().default(false),
  })).min(1, 'No hay grabaciones en la linea de tiempo'),
});

export function createExport(req: Request, res: Response): void {
  const body = exportSchema.parse(req.body);
  const job = enqueueExport(req.params.roomId, body);
  res.status(202).json({ job });
}

export function listExports(req: Request, res: Response): void {
  res.json({ jobs: listJobs(req.params.roomId) });
}

export function getExport(req: Request, res: Response): void {
  const job = getJob(req.params.jobId);
  if (!job) throw new AppError('Trabajo de exportacion no encontrado', 404);
  res.json({ job });
}

export function downloadExport(req: Request, res: Response): void {
  const file = getJobFile(req.params.jobId);
  if (!file) throw new AppError('La exportacion aun no esta lista o el archivo fue eliminado', 404);
  streamFile(req, res, file.filePath, 'video/mp4', file.fileName);
}
