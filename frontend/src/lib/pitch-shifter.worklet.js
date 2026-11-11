// Desplazador de tono granular de dos cabezas con ventana triangular.
// Se ejecuta en el AudioWorklet (hilo de audio), sin bloquear la interfaz.
class PitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'pitch', defaultValue: 1, minValue: 0.4, maxValue: 2.6 }];
  }

  constructor() {
    super();
    this.bufferSize = 8192;
    this.buffer = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.phase = 0;
  }

  read(delaySamples) {
    let index = this.writeIndex - delaySamples;
    while (index < 0) index += this.bufferSize;
    return this.buffer[Math.floor(index) % this.bufferSize];
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0) return true;

    const pitch = parameters.pitch.length > 1 ? parameters.pitch[0] : parameters.pitch[0] || 1;
    const blockSize = output[0].length;
    const half = this.bufferSize / 2;

    for (let i = 0; i < blockSize; i += 1) {
      for (let ch = 0; ch < input.length; ch += 1) {
        this.buffer[this.writeIndex] = input[ch][i] || 0;
        if (ch === 0) this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
      }

      // Avance de fase: si el tono sube (pitch > 1) las cabezas se mueven mas rapido
      this.phase = (this.phase + (1 - pitch)) % this.bufferSize;
      if (this.phase < 0) this.phase += this.bufferSize;

      const d1 = this.phase;
      const d2 = (this.phase + half) % this.bufferSize;
      const w1 = 1 - Math.abs((d1 / half) - 0.5) * 2;
      const w2 = 1 - w1;

      const sample = this.read(d1) * w1 + this.read(d2) * w2;
      for (let ch = 0; ch < output.length; ch += 1) output[ch][i] = sample;
    }
    return true;
  }
}

registerProcessor('pitch-shifter', PitchShifter);
