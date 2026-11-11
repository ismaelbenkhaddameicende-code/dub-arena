import type { VoiceEffectSettings } from '@dub-arena/shared';

export interface EffectChain {
  input: AudioNode;
  output: AudioNode;
  update: (settings: VoiceEffectSettings) => void;
  dispose: () => void;
  pitchSupported: boolean;
}

/**
 * Cadena de efectos con Web Audio API:
 *   entrada -> pitch -> modulacion robot -> filtro radio -> saturacion -> master
 *   master -> [eco] -> salida
 *   master -> [reverb] -> salida
 *
 * Se usa para monitorizar el microfono y, sobre todo, para grabar el audio ya
 * procesado (MediaRecorder sobre MediaStreamAudioDestinationNode), de modo que
 * la exportacion suene igual que lo escuchado.
 */
export async function createEffectChain(ctx: AudioContext, settings: VoiceEffectSettings): Promise<EffectChain> {
  const input = ctx.createGain();
  const output = ctx.createGain();
  output.gain.value = 1;

  const master = ctx.createGain();
  const bandpass = ctx.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 20000;
  bandpass.Q.value = 0.7;

  const shaper = ctx.createWaveShaper();
  shaper.oversample = '2x';

  const curves: Record<'soft' | 'hard', Float32Array> = {
    soft: new Float32Array(1024),
    hard: new Float32Array(1024),
  };
  for (let i = 0; i < 1024; i += 1) {
    const x = (i * 2) / 1024 - 1;
    curves.soft[i] = Math.tanh(x * 1.2);
    curves.hard[i] = Math.tanh(x * 6);
  }
  // El tipo de WaveShaperNode.curve cambia entre versiones de TypeScript; el valor es valido en runtime.
  const setCurve = (curve: Float32Array): void => { shaper.curve = curve as unknown as never; };
  setCurve(curves.soft);

  // Modulacion tipo robot
  const ringGain = ctx.createGain();
  ringGain.gain.value = 1;
  const ringOsc = ctx.createOscillator();
  ringOsc.type = 'sine';
  ringOsc.frequency.value = 50;
  const ringDepth = ctx.createGain();
  ringDepth.gain.value = 0;
  ringOsc.connect(ringDepth);
  ringDepth.connect(ringGain.gain);
  ringOsc.start();

  // Eco
  const echoSend = ctx.createGain();
  echoSend.gain.value = 0;
  const delay = ctx.createDelay(1.5);
  delay.delayTime.value = 0.26;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.3;
  echoSend.connect(delay);
  delay.connect(feedback);
  feedback.connect(delay);

  // Reverb con impulso sintetico
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0;
  const convolver = ctx.createConvolver();
  const length = Math.floor(ctx.sampleRate * 1.3);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch += 1) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.8);
  }
  convolver.buffer = impulse;
  reverbSend.connect(convolver);
  convolver.connect(output);

  // Pitch por AudioWorklet (granular). Si falla, el resto funciona igual.
  let pitchNode: AudioWorkletNode | null = null;
  try {
    await ctx.audioWorklet.addModule(new URL('./pitch-shifter.worklet.js', import.meta.url).href);
    pitchNode = new AudioWorkletNode(ctx, 'pitch-shifter');
  } catch {
    pitchNode = null;
  }

  // Grafo
  input.connect(pitchNode ?? ringGain);
  if (pitchNode) pitchNode.connect(ringGain);
  ringGain.connect(bandpass);
  bandpass.connect(shaper);
  shaper.connect(master);
  master.connect(output);
  master.connect(echoSend);
  delay.connect(output);
  master.connect(reverbSend);

  const update = (s: VoiceEffectSettings): void => {
    const on = s.enabled;
    master.gain.value = Math.min(Math.max(s.gain, 0), 2);
    bandpass.frequency.value = on && s.radio ? 1750 : 20000;
    bandpass.Q.value = on && s.radio ? 1.5 : 0.7;
    setCurve(on && s.distortion ? curves.hard : curves.soft);
    echoSend.gain.value = on && s.echo ? 0.6 : 0;
    feedback.gain.value = on && s.echo ? 0.32 : 0;
    reverbSend.gain.value = on && s.reverb ? 0.55 : 0;
    ringDepth.gain.value = on && s.robot ? 0.45 : 0;
    ringOsc.frequency.value = on && s.robot ? 52 : 50;
    if (pitchNode) {
      const ratio = on ? Math.pow(2, s.semitones / 12) : 1;
      pitchNode.parameters.get('pitch')?.setTargetAtTime(ratio, ctx.currentTime, 0.01);
    }
  };
  update(settings);

  return {
    input,
    output,
    update,
    pitchSupported: Boolean(pitchNode),
    dispose: () => {
      try { ringOsc.stop(); } catch { /* ya detenido */ }
      input.disconnect();
      output.disconnect();
    },
  };
}

/** Medidor de nivel (RMS) para el indicador de microfono. */
export function createLevelMeter(ctx: AudioContext, node: AudioNode): { level: () => number; dispose: () => void } {
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  node.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  return {
    level: () => {
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) sum += data[i] * data[i];
      return Math.min(1, Math.sqrt(sum / data.length) * 3.2);
    },
    dispose: () => analyser.disconnect(),
  };
}
