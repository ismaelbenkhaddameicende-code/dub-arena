// Prueba real de sincronizacion multiusuario contra la API en marcha.
import { io } from 'socket.io-client';

const API = 'http://localhost:4000';
const post = (path, body, token) => fetch(`${API}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify(body ?? {}),
}).then((r) => r.json());

const register = (email, name) => post('/api/auth/register', { email, password: 'doblaje123', displayName: name });

const stamp = Date.now();
const a = await register(`host${stamp}@test.com`, 'Host');
const b = await register(`dub${stamp}@test.com`, 'Dubber');
if (!a.token || !b.token) { console.error('registro fallo', a, b); process.exit(1); }

const room = await post('/api/rooms', { name: 'Prueba de sincronizacion' }, a.token);
const roomId = room.room.id;

const connect = (token) => io(API, { auth: { token }, transports: ['websocket'] });
const host = connect(a.token);
const guest = connect(b.token);

const join = (socket) => new Promise((resolve) => socket.emit('room:join', { roomId }, resolve));
const waitEvent = (socket, event, timeout = 6000) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(`timeout esperando ${event}`)), timeout);
  socket.once(event, (payload) => { clearTimeout(timer); resolve(payload); });
});

await new Promise((r) => host.on('connect', r));
await new Promise((r) => guest.on('connect', r));

const hostJoin = await join(host);
const guestJoin = await join(guest);
console.log('1) host unido:', hostJoin.ok, '| guest unido:', guestJoin.ok, '| participantes:', guestJoin.data.participants.length);

// Reloj: el invitado mide su offset
const offset = await new Promise((resolve) => {
  const sentAt = Date.now();
  guest.emit('time:sync', { clientTime: sentAt }, (res) => resolve(res.serverTime - (sentAt + (Date.now() - sentAt) / 2)));
});
console.log('2) offset de reloj estimado por el invitado:', Math.round(offset), 'ms');

// El invitado NO puede controlar la reproduccion
const denied = await new Promise((resolve) => guest.emit('playback:command', { action: 'play', position: 0 }, resolve));
console.log('3) invitado intenta reproducir ->', denied.ok ? 'PERMITIDO (mal)' : `rechazado: "${denied.error}"`);

// El host reproduce y ambos reciben el mismo ancla
const guestPlayback = waitEvent(guest, 'room:playback');
const result = await new Promise((resolve) => host.emit('playback:command', { action: 'play', position: 1.5 }, resolve));
const received = await guestPlayback;

const skew = Math.abs((received.anchorServerTime + received.position * 1000) - (result.data.anchorServerTime + result.data.position * 1000));
console.log('4) host reproduce en 1.5s -> invitado recibe ancla con desviacion de', skew, 'ms (debe ser 0)');

// Un tercer cliente entra tarde y recibe el estado actual
const c = await register(`late${stamp}@test.com`, 'Tarde');
const late = connect(c.token);
await new Promise((r) => late.on('connect', r));
await join(late);
const sync = await new Promise((resolve) => late.emit('playback:request-sync', resolve));
const elapsed = (Date.now() - sync.data.playback.position * 1000 - sync.data.playback.anchorServerTime) / -1000;
console.log('5) cliente tardio recibe posicion', sync.data.playback.position.toFixed(2), 's, playing =', sync.data.playback.playing,
  '| posicion efectiva ahora:', (sync.data.playback.position + (sync.data.serverTime - sync.data.playback.anchorServerTime) / 1000).toFixed(2), 's');

// Pausa sincronizada
const guestPause = waitEvent(guest, 'room:playback');
await new Promise((resolve) => host.emit('playback:command', { action: 'pause' }, resolve));
const paused = await guestPause;
console.log('6) pausa propagada:', paused.playing === false);

guest.close(); late.close(); host.close();
process.exit(0);
