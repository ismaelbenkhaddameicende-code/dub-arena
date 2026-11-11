/** Extraccion de picos y dibujo de formas de onda en canvas (sin dependencias). */

export interface Peaks {
  min: Float32Array;
  max: Float32Array;
  samples: number;
}

export function extractPeaks(buffer: AudioBuffer, resolution = 1200): Peaks {
  const channel = buffer.getChannelData(0);
  const blockSize = Math.max(1, Math.floor(channel.length / resolution));
  const min = new Float32Array(resolution);
  const max = new Float32Array(resolution);

  for (let i = 0; i < resolution; i += 1) {
    let lo = 1;
    let hi = -1;
    const start = i * blockSize;
    for (let j = 0; j < blockSize; j += 1) {
      const value = channel[start + j] ?? 0;
      if (value < lo) lo = value;
      if (value > hi) hi = value;
    }
    if (hi < lo) { lo = 0; hi = 0; }
    min[i] = lo;
    max[i] = hi;
  }
  return { min, max, samples: channel.length };
}

export function drawWaveform(
  canvas: HTMLCanvasElement,
  peaks: Peaks | null,
  options: { color?: string; background?: string; progress?: number } = {},
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  if (options.background) {
    ctx.fillStyle = options.background;
    ctx.fillRect(0, 0, width, height);
  }
  if (!peaks) return;

  const color = options.color ?? '#a78bfa';
  const mid = height / 2;
  ctx.fillStyle = color;
  const bars = Math.min(peaks.max.length, Math.floor(width));
  for (let i = 0; i < bars; i += 1) {
    const index = Math.floor((i / bars) * peaks.max.length);
    const top = mid - peakHeight(peaks.max[index], height);
    const bottom = mid - peakHeight(peaks.min[index], height);
    ctx.fillRect(i, top, 1, Math.max(1, bottom - top));
  }

  if (options.progress !== undefined) {
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(0, 0, width * Math.min(1, Math.max(0, options.progress)), height);
  }
}

function peakHeight(value: number, height: number): number {
  // Escala perceptual: el habla suele estar muy por debajo del pico maximo
  const amplified = Math.min(1, Math.abs(value) * 2.4);
  return amplified * (height / 2 - 1);
}
