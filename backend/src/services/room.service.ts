import type {
  Character, Participant, PlaybackState, RoomDetail, RoomSummary, RoomStatus, ParticipantRole,
} from '@dub-arena/shared';
import { ROOM_MAX_PARTICIPANTS } from '@dub-arena/shared';
import { db } from '../db';
import { newId, newRoomCode, pickColor, COLORS } from '../utils/ids';
import { getUserById } from './auth.service';

export class RoomError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

interface RoomRow {
  id: string; code: string; name: string; host_id: string; status: RoomStatus;
  max_participants: number; video_id: string | null; analysis_id: string | null;
  playback_json: string; created_at: string; updated_at: string;
}

interface MemberRow {
  room_id: string; user_id: string; role: ParticipantRole; character_id: string | null; joined_at: string;
}

interface CharacterRow {
  id: string; room_id: string; name: string; color: string; speaker_id: string | null;
  confidence: number | null; assigned_user_id: string | null; sort_order: number; created_at: string;
}

interface MediaRow { id: string; duration_sec: number }

export const IDLE_PLAYBACK = (): PlaybackState => ({
  playing: false, position: 0, anchorServerTime: Date.now(), rate: 1, updatedBy: 'system', updatedAt: Date.now(),
});

function mapCharacter(row: CharacterRow): Character {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    speakerId: row.speaker_id,
    confidence: row.confidence,
    assignedUserId: row.assigned_user_id,
  };
}

const getRoomRow = (roomId: string): RoomRow => {
  const row = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as RoomRow | undefined;
  if (!row) throw new RoomError('Sala no encontrada', 404);
  return row;
};

const getMemberRow = (roomId: string, userId: string): MemberRow | undefined =>
  db.prepare('SELECT * FROM room_members WHERE room_id = ? AND user_id = ?').get(roomId, userId) as MemberRow | undefined;

export function getPlayback(roomId: string): PlaybackState {
  const row = getRoomRow(roomId);
  try {
    const parsed = JSON.parse(row.playback_json) as Partial<PlaybackState>;
    return { ...IDLE_PLAYBACK(), ...parsed };
  } catch {
    return IDLE_PLAYBACK();
  }
}

export function setPlayback(roomId: string, state: PlaybackState): PlaybackState {
  db.prepare('UPDATE rooms SET playback_json = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(state), new Date().toISOString(), roomId);
  return state;
}

export function getCharacters(roomId: string): Character[] {
  const rows = db.prepare('SELECT * FROM characters WHERE room_id = ? ORDER BY sort_order ASC').all(roomId) as CharacterRow[];
  return rows.map(mapCharacter);
}

export function getParticipants(roomId: string, online: Set<string> = new Set()): Participant[] {
  const members = db.prepare('SELECT * FROM room_members WHERE room_id = ? ORDER BY joined_at ASC').all(roomId) as MemberRow[];
  const out: Participant[] = [];
  for (const m of members) {
    const user = getUserById(m.user_id);
    if (!user) continue;
    out.push({
      userId: user.id,
      displayName: user.displayName,
      avatarColor: user.avatarColor,
      role: m.role,
      characterId: m.character_id,
      connected: online.has(user.id),
      joinedAt: m.joined_at,
    });
  }
  const order: Record<ParticipantRole, number> = { host: 0, dubber: 1, viewer: 2 };
  return out.sort((a, b) => order[a.role] - order[b.role]);
}

export function toSummary(row: RoomRow): RoomSummary {
  const count = (db.prepare('SELECT COUNT(*) AS c FROM room_members WHERE room_id = ?').get(row.id) as { c: number }).c;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    hostId: row.host_id,
    status: row.status,
    maxParticipants: row.max_participants,
    videoId: row.video_id,
    hasAnalysis: Boolean(row.analysis_id),
    participantCount: count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getRoomDetail(roomId: string, online: Set<string> = new Set()): RoomDetail {
  const row = getRoomRow(roomId);
  return {
    ...toSummary(row),
    participants: getParticipants(roomId, online),
    characters: getCharacters(roomId),
    playback: getPlayback(roomId),
  };
}

export function assertMember(roomId: string, userId: string): MemberRow {
  const member = getMemberRow(roomId, userId);
  if (!member) throw new RoomError('No perteneces a esta sala', 403);
  return member;
}

export function assertHost(roomId: string, userId: string): void {
  const row = getRoomRow(roomId);
  if (row.host_id !== userId) throw new RoomError('Solo el administrador de la sala puede hacer esto', 403);
}

export function createRoom(hostId: string, input: { name: string; maxParticipants?: number }): RoomDetail {
  const name = input.name.trim() || 'Sala sin titulo';
  const max = Math.min(Math.max(input.maxParticipants ?? ROOM_MAX_PARTICIPANTS, 2), 8);
  const id = newId('rm');
  let code = newRoomCode();
  while (db.prepare('SELECT 1 FROM rooms WHERE code = ?').get(code)) code = newRoomCode();
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`INSERT INTO rooms (id, code, name, host_id, status, max_participants, playback_json, created_at, updated_at)
                VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?)`)
      .run(id, code, name, hostId, max, JSON.stringify(IDLE_PLAYBACK()), now, now);
    db.prepare(`INSERT INTO room_members (room_id, user_id, role, joined_at) VALUES (?, ?, 'host', ?)`)
      .run(id, hostId, now);
  });
  tx();
  return getRoomDetail(id);
}

export function listRoomsForUser(userId: string): RoomSummary[] {
  const rows = db.prepare(`
    SELECT r.* FROM rooms r
    JOIN room_members m ON m.room_id = r.id
    WHERE m.user_id = ?
    ORDER BY r.updated_at DESC LIMIT 50
  `).all(userId) as RoomRow[];
  return rows.map(toSummary);
}

export function listRoomRecordingsCount(roomId: string): number {
  return (db.prepare('SELECT COUNT(*) AS c FROM recordings WHERE room_id = ?').get(roomId) as { c: number }).c;
}

export function joinRoomByCode(code: string, userId: string): RoomDetail {
  const row = db.prepare('SELECT * FROM rooms WHERE code = ?').get(code.trim().toUpperCase()) as RoomRow | undefined;
  if (!row) throw new RoomError('Codigo de sala incorrecto', 404);
  if (row.status === 'closed') throw new RoomError('Esta sala ya se ha cerrado', 410);
  if (getMemberRow(row.id, userId)) return getRoomDetail(row.id);

  const members = (db.prepare('SELECT COUNT(*) AS c FROM room_members WHERE room_id = ?').get(row.id) as { c: number }).c;
  if (members >= row.max_participants) throw new RoomError('La sala esta completa', 409);

  db.prepare(`INSERT INTO room_members (room_id, user_id, role, joined_at) VALUES (?, ?, 'dubber', ?)`)
    .run(row.id, userId, new Date().toISOString());

  // Personajes sin asignar: el nuevo participante toma el primero libre.
  const free = db.prepare(`SELECT * FROM characters WHERE room_id = ? AND (assigned_user_id IS NULL OR assigned_user_id = '')
                           ORDER BY sort_order ASC LIMIT 1`).get(row.id) as CharacterRow | undefined;
  if (free) autoAssign(row.id, userId, free.id);

  return getRoomDetail(row.id);
}

export function joinRoomById(roomId: string, userId: string): RoomDetail {
  const row = getRoomRow(roomId);
  return joinRoomByCode(row.code, userId);
}

function autoAssign(roomId: string, userId: string, characterId: string): void {
  db.prepare('UPDATE room_members SET character_id = ? WHERE room_id = ? AND user_id = ?').run(characterId, roomId, userId);
  db.prepare('UPDATE characters SET assigned_user_id = ? WHERE id = ?').run(userId, characterId);
}

export function assignCharacter(roomId: string, actorId: string, userId: string, characterId: string | null): void {
  const room = getRoomRow(roomId);
  const member = assertMember(roomId, userId);
  if (actorId !== userId) assertHost(roomId, actorId);

  const tx = db.transaction(() => {
    if (member.character_id) {
      db.prepare('UPDATE characters SET assigned_user_id = NULL WHERE id = ? AND assigned_user_id = ?')
        .run(member.character_id, userId);
    }
    if (characterId) {
      const ch = db.prepare('SELECT * FROM characters WHERE id = ? AND room_id = ?').get(characterId, roomId) as CharacterRow | undefined;
      if (!ch) throw new RoomError('Personaje no encontrado en esta sala', 404);
      if (ch.assigned_user_id && ch.assigned_user_id !== userId) {
        db.prepare('UPDATE room_members SET character_id = NULL WHERE room_id = ? AND user_id = ?')
          .run(roomId, ch.assigned_user_id);
      }
      db.prepare('UPDATE characters SET assigned_user_id = ? WHERE id = ?').run(userId, characterId);
      db.prepare('UPDATE room_members SET character_id = ? WHERE room_id = ? AND user_id = ?').run(characterId, roomId, userId);
    } else {
      db.prepare('UPDATE room_members SET character_id = NULL WHERE room_id = ? AND user_id = ?').run(roomId, userId);
    }
    db.prepare('UPDATE rooms SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), roomId);
  });
  tx();
  void room;
}

export function leaveRoom(roomId: string, userId: string): { deleted: boolean } {
  const row = getRoomRow(roomId);
  const member = getMemberRow(roomId, userId);
  if (member?.character_id) {
    db.prepare('UPDATE characters SET assigned_user_id = NULL WHERE id = ?').run(member.character_id);
  }
  db.prepare('DELETE FROM room_members WHERE room_id = ? AND user_id = ?').run(roomId, userId);

  if (row.host_id === userId) {
    const next = db.prepare('SELECT user_id FROM room_members WHERE room_id = ? ORDER BY joined_at ASC LIMIT 1')
      .get(roomId) as { user_id: string } | undefined;
    if (next) {
      db.prepare(`UPDATE rooms SET host_id = ?, updated_at = ? WHERE id = ?`).run(next.user_id, new Date().toISOString(), roomId);
      db.prepare(`UPDATE room_members SET role = 'host' WHERE room_id = ? AND user_id = ?`).run(roomId, next.user_id);
    } else {
      deleteRoom(roomId);
      return { deleted: true };
    }
  }
  return { deleted: false };
}

export function kickUser(roomId: string, actorId: string, targetUserId: string): void {
  assertHost(roomId, actorId);
  const row = getRoomRow(roomId);
  if (row.host_id === targetUserId) throw new RoomError('El administrador no puede expulsarse a si mismo', 400);
  const member = getMemberRow(roomId, targetUserId);
  if (!member) throw new RoomError('Ese usuario no esta en la sala', 404);
  if (member.character_id) {
    db.prepare('UPDATE characters SET assigned_user_id = NULL WHERE id = ?').run(member.character_id);
  }
  db.prepare('DELETE FROM room_members WHERE room_id = ? AND user_id = ?').run(roomId, targetUserId);
}

export function transferHost(roomId: string, actorId: string, targetUserId: string): void {
  assertHost(roomId, actorId);
  if (!getMemberRow(roomId, targetUserId)) throw new RoomError('Ese usuario no esta en la sala', 404);
  db.prepare('UPDATE rooms SET host_id = ?, updated_at = ? WHERE id = ?').run(targetUserId, new Date().toISOString(), roomId);
  db.prepare(`UPDATE room_members SET role = 'dubber' WHERE room_id = ? AND user_id = ?`).run(roomId, actorId);
  db.prepare(`UPDATE room_members SET role = 'host' WHERE room_id = ? AND user_id = ?`).run(roomId, targetUserId);
}

export function setRoomStatus(roomId: string, actorId: string, status: RoomStatus): void {
  assertHost(roomId, actorId);
  db.prepare('UPDATE rooms SET status = ?, updated_at = ? WHERE id = ?').run(status, new Date().toISOString(), roomId);
}

export function renameRoom(roomId: string, actorId: string, name: string): void {
  assertHost(roomId, actorId);
  db.prepare('UPDATE rooms SET name = ?, updated_at = ? WHERE id = ?').run(name.trim().slice(0, 80), new Date().toISOString(), roomId);
}

export function setRoomVideo(roomId: string, videoId: string | null): void {
  db.prepare('UPDATE rooms SET video_id = ?, updated_at = ? WHERE id = ?').run(videoId, new Date().toISOString(), roomId);
}

export function setRoomAnalysis(roomId: string, analysisId: string | null): void {
  db.prepare('UPDATE rooms SET analysis_id = ?, updated_at = ? WHERE id = ?').run(analysisId, new Date().toISOString(), roomId);
}

export function deleteRoom(roomId: string): void {
  db.prepare('DELETE FROM rooms WHERE id = ?').run(roomId);
}

export function getRoomVideoDuration(roomId: string): number {
  const row = getRoomRow(roomId);
  if (!row.video_id) return 0;
  const media = db.prepare('SELECT id, duration_sec FROM media_assets WHERE id = ?').get(row.video_id) as MediaRow | undefined;
  return media?.duration_sec ?? 0;
}

/** Crea una lista de personajes SPEAKER_x con colores estables. */
export function replaceCharacters(roomId: string, list: Array<{ name: string; speakerId: string | null; confidence: number | null }>): Character[] {
  const tx = db.transaction(() => {
    db.prepare('UPDATE room_members SET character_id = NULL WHERE room_id = ?').run(roomId);
    db.prepare('DELETE FROM characters WHERE room_id = ?').run(roomId);
    const now = new Date().toISOString();
    list.forEach((item, index) => {
      db.prepare(`INSERT INTO characters (id, room_id, name, color, speaker_id, confidence, assigned_user_id, sort_order, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`)
        .run(newId('chr'), roomId, item.name, COLORS[index % COLORS.length], item.speakerId, item.confidence, index, now);
    });
  });
  tx();
  return getCharacters(roomId);
}

export { pickColor, getRoomRow, getMemberRow };
