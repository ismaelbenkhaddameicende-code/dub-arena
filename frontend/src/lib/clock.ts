/**
 * Reloj de referencia del servidor. La sincronizacion de video se calcula
 * siempre contra `serverNow()`, nunca contra la hora local del navegador.
 */
let offsetMs = 0;
let samples: number[] = [];

export const serverNow = (): number => Date.now() + offsetMs;

export function addSample(rttMs: number, serverTime: number, sentAt: number): void {
  const estimatedOffset = serverTime - (sentAt + rttMs / 2);
  samples.push(estimatedOffset);
  // Quedarse con la mediana de las ultimas muestras reduce el error por picos de red.
  if (samples.length > 9) samples = samples.slice(-9);
  const sorted = [...samples].sort((a, b) => a - b);
  offsetMs = sorted[Math.floor(sorted.length / 2)];
}

export const currentOffset = (): number => offsetMs;
export const hasClockSync = (): boolean => samples.length > 0;
