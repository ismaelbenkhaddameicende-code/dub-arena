import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { AnalyzedCharacter, Intervention, SceneAnalysis } from '@dub-arena/shared';
import { ArrowLeft, Bot, Check, Cpu, GitMerge, Plus, Save, Scissors, Trash2, Wand2 } from 'lucide-react';
import { roomsApi } from '../services/rooms';
import { useAuth } from '../store/auth';
import { Alert, Badge, Button, Card, EmptyState, Field, Input, Modal, Spinner } from '../components/ui';
import { clock } from '../lib/format';

export default function AnalysisPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const [analysis, setAnalysis] = useState<SceneAnalysis | null>(null);
  const [roomName, setRoomName] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ai, setAi] = useState<{ reachable: boolean; transcription: boolean; diarization: boolean; detail: string } | null>(null);
  const [model, setModel] = useState<'tiny' | 'base' | 'small'>('base');
  const [language, setLanguage] = useState('');
  const [running, setRunning] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [characters, setCharacters] = useState<AnalyzedCharacter[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeFrom, setMergeFrom] = useState('');
  const [mergeTo, setMergeTo] = useState('');

  const load = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    try {
      const [detail, data, health] = await Promise.all([
        roomsApi.detail(roomId), roomsApi.analysis(roomId), roomsApi.aiHealth().catch(() => null),
      ]);
      setRoomName(detail.room.name);
      setIsHost(Boolean(user && detail.room.hostId === user.id));
      setAnalysis(data.analysis);
      setCharacters(data.analysis?.characters ?? []);
      setInterventions(data.analysis?.interventions ?? []);
      setAi(health);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [roomId, user]);

  useEffect(() => { void load(); }, [load]);

  const runAnalysis = async (): Promise<void> => {
    if (!roomId) return;
    setRunning(true); setError(null);
    try {
      const data = await roomsApi.runAnalysis(roomId, {
        model, diarize: true, ...(language ? { language } : {}),
      });
      setAnalysis(data.analysis);
      setCharacters(data.analysis.characters);
      setInterventions(data.analysis.interventions);
      setDirty(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const save = async (confirm = false): Promise<void> => {
    if (!roomId) return;
    setSaving(true); setError(null);
    try {
      const data = await roomsApi.patchAnalysis(roomId, { characters, interventions, confirm });
      setAnalysis(data.analysis);
      setCharacters(data.analysis.characters);
      setInterventions(data.analysis.interventions);
      setDirty(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const renameCharacter = (id: string, name: string): void => {
    setCharacters((prev) => prev.map((c) => (c.id === id ? { ...c, proposedName: name || null } : c)));
    setDirty(true);
  };

  const mergeCharacters = (): void => {
    if (!mergeFrom || !mergeTo || mergeFrom === mergeTo) return;
    setInterventions((prev) => prev.map((i) => (i.characterId === mergeFrom || i.speakerId === mergeFrom
      ? { ...i, characterId: mergeTo, speakerId: mergeTo } : i)));
    setCharacters((prev) => prev.filter((c) => c.id !== mergeFrom));
    setMergeOpen(false);
    setDirty(true);
  };

  const splitSelected = (): void => {
    if (selected.length === 0) return;
    const sourceSpeaker = interventions.find((i) => i.id === selected[0])?.speakerId;
    const sourceCharacter = characters.find((c) => c.speakerId === sourceSpeaker);
    const id = `SPEAKER_${String(characters.length).padStart(2, '0')}`;
    const newCharacter: AnalyzedCharacter = {
      id,
      speakerId: id,
      proposedName: null,
      confidence: 0,
      firstAppearance: Math.min(...selected.map((sid) => interventions.find((i) => i.id === sid)?.start ?? 0)),
      interventionCount: selected.length,
      color: '#22d3ee',
    };
    setCharacters((prev) => [...prev, newCharacter]);
    setInterventions((prev) => prev.map((i) => (selected.includes(i.id)
      ? { ...i, speakerId: id, characterId: id } : i)));
    void sourceCharacter;
    setSelected([]);
    setDirty(true);
  };

  const updateIntervention = (id: string, patch: Partial<Intervention>): void => {
    setInterventions((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch, edited: true } : i)));
    setDirty(true);
  };

  const removeIntervention = (id: string): void => {
    setInterventions((prev) => prev.filter((i) => i.id !== id));
    setSelected((prev) => prev.filter((sid) => sid !== id));
    setDirty(true);
  };

  const addIntervention = (): void => {
    const last = interventions[interventions.length - 1];
    const start = last ? Number((last.end + 0.4).toFixed(2)) : 0;
    const id = `itv_manual_${Date.now()}`;
    setInterventions((prev) => [...prev, {
      id, speakerId: characters[0]?.speakerId ?? 'SPEAKER_00', characterId: characters[0]?.id ?? null,
      text: 'Nueva intervencion', start, end: start + 2, order: prev.length, overlapWith: [], edited: true,
    }]);
    setDirty(true);
  };

  const ordered = useMemo(() => [...interventions].sort((a, b) => a.start - b.start), [interventions]);

  const speakerLabel = (speakerId: string): string => {
    const character = characters.find((c) => c.speakerId === speakerId || c.id === speakerId);
    return character?.proposedName ?? character?.speakerId ?? speakerId;
  };

  if (loading) return <div className="grid min-h-[40vh] place-items-center"><Spinner label="Cargando analisis" /></div>;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to={`/sala/${roomId}`} className="mb-1 inline-flex items-center gap-1 text-[12px] text-zinc-500 hover:text-white">
            <ArrowLeft className="h-3 w-3" /> Volver a la sala
          </Link>
          <h1 className="font-display text-xl font-bold text-white">Analisis de escena</h1>
          <p className="hint">{roomName}</p>
        </div>
        <div className="flex items-center gap-2">
          {analysis?.confirmedAt && <Badge tone="ok"><Check className="h-3 w-3" /> Confirmado</Badge>}
          {analysis && (
            <>
              <Button variant="ghost" onClick={() => void save(false)} loading={saving} disabled={!dirty}>
                <Save className="h-4 w-4" /> Guardar
              </Button>
              <Button onClick={() => void save(true)} disabled={!dirty && Boolean(analysis.confirmedAt)}>
                <Check className="h-4 w-4" /> Confirmar reparto
              </Button>
            </>
          )}
        </div>
      </header>

      {error && <Alert tone="error">{error}</Alert>}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-white">
              <Cpu className="h-4 w-4 text-accent-soft" /> Motor de analisis
            </h3>
            {ai ? (
              <div className="space-y-1 text-[12px] text-zinc-400">
                <p>{ai.reachable ? 'Servicio de IA local activo.' : ai.detail}</p>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={ai.transcription ? 'ok' : 'warn'}>Transcripcion {ai.transcription ? 'lista' : 'no instalada'}</Badge>
                  <Badge tone={ai.diarization ? 'ok' : 'warn'}>Diarizacion {ai.diarization ? 'lista' : 'no instalada'}</Badge>
                </div>
              </div>
            ) : <p className="hint">No se pudo consultar el servicio de IA.</p>}
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Field label="Modelo">
              <select value={model} onChange={(e) => setModel(e.target.value as typeof model)} className="input py-2 text-xs">
                <option value="tiny">tiny (mas rapido)</option>
                <option value="base">base (recomendado)</option>
                <option value="small">small (mejor calidad)</option>
              </select>
            </Field>
            <Field label="Idioma (opcional)">
              <Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder="es" className="w-20 py-2 text-xs" maxLength={5} />
            </Field>
            <Button onClick={() => void runAnalysis()} loading={running} disabled={!isHost} title={isHost ? '' : 'Solo el administrador puede analizar'}>
              <Wand2 className="h-4 w-4" /> {analysis ? 'Reanalizar' : 'Analizar escena'}
            </Button>
          </div>
        </div>
      </Card>

      {!analysis ? (
        <EmptyState
          icon={<Bot className="h-5 w-5" />}
          title="Sin analisis todavia"
          description="El analisis transcribe los dialogos y separa las voces con IA local. Puede tardar varios minutos en un portatil de 8 GB: se ejecuta en el servidor, no en tu navegador."
          action={isHost ? <Button onClick={() => void runAnalysis()} loading={running}><Wand2 className="h-4 w-4" /> Analizar ahora</Button> : undefined}
        />
      ) : (
        <>
          {analysis.warnings.length > 0 && (
            <Alert tone="warn" title="Avisos del analisis">
              <ul className="list-disc space-y-1 pl-4">
                {analysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </Alert>
          )}

          <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-display text-sm font-semibold text-white">Personajes detectados</h3>
                <Button variant="subtle" className="px-2 py-1 text-[11px]" onClick={() => setMergeOpen(true)}>
                  <GitMerge className="h-3 w-3" /> Fusionar
                </Button>
              </div>
              <ul className="space-y-2">
                {characters.map((character) => (
                  <li key={character.id} className="rounded-xl border border-line/70 bg-ink-900/60 p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: character.color }} />
                      <Input
                        value={character.proposedName ?? ''}
                        placeholder={character.speakerId}
                        onChange={(e) => renameCharacter(character.id, e.target.value)}
                        className="py-1 text-[12px]"
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] text-zinc-500">
                      {character.speakerId} · {character.interventionCount} intervenciones · desde {clock(character.firstAppearance)}
                      {character.confidence > 0 && ` · confianza ${Math.round(character.confidence * 100)}%`}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-3 hint">
                Los nombres son propuestas: SPEAKER_x es una voz detectada, no una identidad confirmada. Renombra a mano.
              </p>
            </Card>

            <Card className="p-0">
              <div className="flex items-center justify-between border-b border-line/70 px-4 py-3">
                <h3 className="font-display text-sm font-semibold text-white">Intervenciones ({ordered.length})</h3>
                <div className="flex gap-2">
                  <Button variant="subtle" className="px-2 py-1 text-[11px]" onClick={splitSelected} disabled={selected.length === 0}>
                    <Scissors className="h-3 w-3" /> Separar ({selected.length})
                  </Button>
                  <Button variant="subtle" className="px-2 py-1 text-[11px]" onClick={addIntervention}>
                    <Plus className="h-3 w-3" /> Anadir
                  </Button>
                </div>
              </div>

              <div className="max-h-[560px] overflow-y-auto">
                {ordered.map((intervention) => (
                  <div key={intervention.id} className="border-b border-line/40 px-4 py-2.5 last:border-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selected.includes(intervention.id)}
                        onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, intervention.id] : prev.filter((id) => id !== intervention.id))}
                        className="h-3.5 w-3.5 accent-accent"
                        aria-label="Seleccionar intervencion"
                      />
                      <input
                        type="number" step="0.1" min={0} value={intervention.start}
                        onChange={(e) => updateIntervention(intervention.id, { start: Number(e.target.value) })}
                        className="w-16 rounded-md border border-line bg-ink-900 px-1.5 py-1 text-[11px] tabular-nums text-zinc-300"
                      />
                      <span className="text-[11px] text-zinc-600">-</span>
                      <input
                        type="number" step="0.1" min={0} value={intervention.end}
                        onChange={(e) => updateIntervention(intervention.id, { end: Number(e.target.value) })}
                        className="w-16 rounded-md border border-line bg-ink-900 px-1.5 py-1 text-[11px] tabular-nums text-zinc-300"
                      />
                      <select
                        value={intervention.speakerId}
                        onChange={(e) => updateIntervention(intervention.id, { speakerId: e.target.value, characterId: e.target.value })}
                        className="rounded-md border border-line bg-ink-900 px-1.5 py-1 text-[11px] text-zinc-300"
                      >
                        {characters.map((c) => <option key={c.id} value={c.speakerId}>{speakerLabel(c.speakerId)}</option>)}
                      </select>
                      <div className="flex-1" />
                      {intervention.overlapWith.length > 0 && <Badge tone="warn">solape</Badge>}
                      <button onClick={() => removeIntervention(intervention.id)} className="rounded-md p-1 text-zinc-600 hover:text-rose" title="Eliminar">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <input
                      value={intervention.text}
                      onChange={(e) => updateIntervention(intervention.id, { text: e.target.value })}
                      className="mt-1.5 w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[13px] text-zinc-200 hover:border-line focus:border-accent/50 focus:bg-ink-900"
                    />
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}

      <Modal open={mergeOpen} onClose={() => setMergeOpen(false)} title="Fusionar dos voces">
        <div className="space-y-3">
          <p className="text-sm text-zinc-400">Si la IA separo una misma voz en dos, fusiona sus intervenciones en una sola.</p>
          <Field label="Voz a absorber">
            <select value={mergeFrom} onChange={(e) => setMergeFrom(e.target.value)} className="input">
              <option value="">Selecciona...</option>
              {characters.map((c) => <option key={c.id} value={c.speakerId}>{speakerLabel(c.speakerId)}</option>)}
            </select>
          </Field>
          <Field label="Voz final">
            <select value={mergeTo} onChange={(e) => setMergeTo(e.target.value)} className="input">
              <option value="">Selecciona...</option>
              {characters.map((c) => <option key={c.id} value={c.speakerId}>{speakerLabel(c.speakerId)}</option>)}
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMergeOpen(false)}>Cancelar</Button>
            <Button onClick={mergeCharacters} disabled={!mergeFrom || !mergeTo || mergeFrom === mergeTo}>Fusionar</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
