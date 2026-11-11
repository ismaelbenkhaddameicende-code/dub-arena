import type { EffectPreset, VoiceEffectSettings } from '@dub-arena/shared';
import { EFFECT_PRESETS } from '@dub-arena/shared';
import { Sliders, Sparkles } from 'lucide-react';
import clsx from 'clsx';

interface Props {
  settings: VoiceEffectSettings;
  presetId: string;
  onChange: (presetId: string, settings: VoiceEffectSettings) => void;
  pitchSupported: boolean;
}

const TOGGLES: Array<{ key: keyof VoiceEffectSettings; label: string }> = [
  { key: 'robot', label: 'Robot' },
  { key: 'echo', label: 'Eco' },
  { key: 'reverb', label: 'Reverb' },
  { key: 'distortion', label: 'Distorsion' },
  { key: 'radio', label: 'Radio' },
];

export function EffectsRack({ settings, presetId, onChange, pitchSupported }: Props) {
  const applyPreset = (preset: EffectPreset): void => onChange(preset.id, { ...preset.settings });

  const patch = (partial: Partial<VoiceEffectSettings>): void => {
    onChange('custom', { ...settings, ...partial, enabled: true });
  };

  return (
    <section className="panel p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-white">
          <Sparkles className="h-4 w-4 text-accent-soft" /> Efectos de voz
        </h3>
        <button
          onClick={() => onChange('natural', { ...EFFECT_PRESETS[0].settings })}
          className="text-[11px] font-semibold text-zinc-500 hover:text-white"
        >
          Restablecer
        </button>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {EFFECT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            onClick={() => applyPreset(preset)}
            title={preset.description}
            className={clsx(
              'rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition',
              presetId === preset.id
                ? 'border-accent bg-accent/15 text-white'
                : 'border-line bg-ink-800/70 text-zinc-400 hover:border-accent/40 hover:text-zinc-200',
            )}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="label flex items-center gap-1.5"><Sliders className="h-3 w-3" /> Tono</span>
            <span className="font-display text-[11px] text-zinc-400">
              {settings.semitones > 0 ? '+' : ''}{settings.semitones} st
            </span>
          </div>
          <input
            type="range" min={-12} max={12} step={1} value={settings.semitones}
            onChange={(e) => patch({ semitones: Number(e.target.value) })}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
            aria-label="Desplazamiento de tono en semitonos"
          />
          {!pitchSupported && <p className="mt-1 text-[10px] text-amber">El navegador no soporta el desplazador de tono; el resto de efectos si funcionan.</p>}
        </div>

        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {TOGGLES.map((toggle) => (
            <button
              key={toggle.key}
              onClick={() => patch({ [toggle.key]: !settings[toggle.key] } as Partial<VoiceEffectSettings>)}
              className={clsx(
                'rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition',
                settings[toggle.key] && settings.enabled
                  ? 'border-accent/60 bg-accent/15 text-white'
                  : 'border-line bg-ink-800/60 text-zinc-400 hover:text-zinc-200',
              )}
            >
              {toggle.label}
            </button>
          ))}
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="label">Volumen</span>
            <span className="font-display text-[11px] text-zinc-400">{Math.round(settings.gain * 100)}%</span>
          </div>
          <input
            type="range" min={0} max={2} step={0.05} value={settings.gain}
            onChange={(e) => patch({ gain: Number(e.target.value) })}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
            aria-label="Volumen de la voz"
          />
        </div>
      </div>

      <p className="mt-3 hint">
        Los efectos se aplican antes de grabar, asi que la toma y la exportacion final suenan igual que lo que escuchas.
      </p>
    </section>
  );
}
