import { useState } from 'react';
import type { Character, Participant } from '@dub-arena/shared';
import { Crown, Mic2, UserMinus, Wifi, WifiOff } from 'lucide-react';
import { Avatar, Badge } from '../ui';

interface Props {
  participants: Participant[];
  characters: Character[];
  currentUserId: string;
  isHost: boolean;
  onKick: (userId: string) => void;
  onAssign: (userId: string, characterId: string | null) => void;
}

export function ParticipantsPanel({ participants, characters, currentUserId, isHost, onKick, onAssign }: Props) {
  const [openFor, setOpenFor] = useState<string | null>(null);
  const online = participants.filter((p) => p.connected).length;

  return (
    <section className="panel p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-white">Participantes</h3>
        <Badge tone={online > 0 ? 'ok' : 'neutral'}>{online} en linea</Badge>
      </header>

      <ul className="space-y-2">
        {participants.map((participant) => {
          const character = characters.find((c) => c.id === participant.characterId);
          const isMe = participant.userId === currentUserId;
          return (
            <li key={participant.userId} className="rounded-xl border border-line/70 bg-ink-900/60 p-2.5">
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <Avatar name={participant.displayName} color={participant.avatarColor} size={34} />
                  <span className={`absolute -bottom-0.5 -right-0.5 grid h-4 w-4 place-items-center rounded-full border-2 border-ink-900 ${participant.connected ? 'bg-mint' : 'bg-zinc-600'}`}>
                    {participant.connected ? <Wifi className="h-2 w-2 text-ink-950" /> : <WifiOff className="h-2 w-2 text-ink-950" />}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-zinc-100">
                    {participant.displayName}
                    {participant.role === 'host' && <Crown className="h-3 w-3 text-amber" />}
                    {isMe && <span className="text-[10px] text-zinc-500">(tu)</span>}
                  </p>
                  <button
                    onClick={() => setOpenFor(openFor === participant.userId ? null : participant.userId)}
                    disabled={!isHost && !isMe}
                    className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500 hover:text-accent-soft disabled:cursor-default"
                  >
                    <Mic2 className="h-3 w-3" />
                    {character ? character.name : 'Sin personaje'}
                  </button>
                </div>
                {isHost && !isMe && (
                  <button onClick={() => onKick(participant.userId)} className="rounded-md p-1.5 text-zinc-600 hover:bg-rose/10 hover:text-rose" title="Expulsar">
                    <UserMinus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {openFor === participant.userId && (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-line/60 pt-2">
                  {characters.length === 0 && <p className="text-[11px] text-zinc-500">Sin personajes. Analiza el video o crealos en el editor.</p>}
                  {characters.map((character) => (
                    <button
                      key={character.id}
                      onClick={() => { onAssign(participant.userId, character.id); setOpenFor(null); }}
                      className={`rounded-lg border px-2 py-1 text-[11px] font-medium transition ${
                        character.id === participant.characterId
                          ? 'border-accent bg-accent/15 text-white'
                          : 'border-line bg-ink-800 text-zinc-300 hover:border-accent/40'
                      }`}
                      style={{ borderLeftColor: character.color, borderLeftWidth: 3 }}
                    >
                      {character.name}
                    </button>
                  ))}
                  <button
                    onClick={() => { onAssign(participant.userId, null); setOpenFor(null); }}
                    className="rounded-lg border border-line px-2 py-1 text-[11px] text-zinc-500 hover:text-rose"
                  >
                    Quitar
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
