import type { Request, Response } from 'express';
import { z } from 'zod';
import { analyzeRoomVideo, aiHealth, getAnalysis, patchAnalysis } from '../services/analysis.service';
import { separateRoomAudio } from '../services/separation.service';
import { assertHost } from '../services/room.service';
import { broadcastRoom } from '../sockets/registry';

export async function health(_req: Request, res: Response): Promise<void> {
  res.json(await aiHealth());
}

export function current(req: Request, res: Response): void {
  res.json({ analysis: getAnalysis(req.params.roomId) });
}

export async function run(req: Request, res: Response): Promise<void> {
  assertHost(req.params.roomId, req.userId!);
  const schema = z.object({
    language: z.string().min(2).max(8).optional(),
    model: z.enum(['tiny', 'base', 'small']).optional(),
    diarize: z.boolean().optional(),
  });
  const body = schema.parse(req.body ?? {});
  const analysis = await analyzeRoomVideo(req.params.roomId, body);
  broadcastRoom(req.params.roomId);
  res.json({ analysis });
}

export function patch(req: Request, res: Response): void {
  assertHost(req.params.roomId, req.userId!);
  const analysis = patchAnalysis(req.params.roomId, req.body ?? {});
  broadcastRoom(req.params.roomId);
  res.json({ analysis });
}

export async function separate(req: Request, res: Response): Promise<void> {
  assertHost(req.params.roomId, req.userId!);
  const asset = await separateRoomAudio(req.params.roomId);
  res.json({ asset });
}
