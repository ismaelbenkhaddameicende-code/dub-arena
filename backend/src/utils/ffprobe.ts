import { spawn } from 'node:child_process';
import { env } from '../config/env';

export interface ProbeResult {
  durationSec: number;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  hasAudio: boolean;
}

/** Ejecuta un proceso y devuelve {code, stdout, stderr}. Sin shell para evitar inyeccion. */
export function run(bin: string, args: string[], opts: { onStdout?: (s: string) => void; timeoutMs?: number } = {}) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = opts.timeoutMs
      ? setTimeout(() => { child.kill('SIGKILL'); }, opts.timeoutMs)
      : null;

    child.stdout.on('data', (d: Buffer) => {
      const s = d.toString();
      stdout += s;
      opts.onStdout?.(s);
    });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('error', (err) => { if (timer) clearTimeout(timer); reject(err); });
    child.on('close', (code) => { if (timer) clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr }); });
  });
}

export async function probeMedia(filePath: string): Promise<ProbeResult> {
  const { code, stdout, stderr } = await run(env.ffprobePath, [
    '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath,
  ]);
  if (code !== 0) throw new Error(`ffprobe fallo: ${stderr.slice(0, 400)}`);
  const data = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type: string; codec_name?: string; width?: number; height?: number; duration?: string }>;
  };
  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  const audio = streams.find((s) => s.codec_type === 'audio');
  const rawDuration = Number(data.format?.duration ?? video?.duration ?? audio?.duration ?? 0);
  return {
    durationSec: Number.isFinite(rawDuration) ? rawDuration : 0,
    width: video?.width ?? null,
    height: video?.height ?? null,
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
    hasAudio: Boolean(audio),
  };
}
