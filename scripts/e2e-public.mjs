// Bateria de pruebas contra una instancia real (local o publica).
// Uso: BASE_URL=https://tu-servicio.onrender.com node scripts/e2e-public.mjs
import { io } from 'socket.io-client';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const BASE = process.env.BASE_URL || 'http://localhost:4000';
const stamp = Date.now();
const results = [];
function check(name, cond, extra = '') {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? 'OK   ' : 'FALLO'} ${name}${extra ? ' -> ' + extra : ''}`);
}

async function req(path, { method = 'GET', token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(BASE + path, { method, headers, body: payload });
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json().catch(() => null) : await r.arrayBuffer();
  return { status: r.status, data, headers: r.headers };
}

console.log(`Objetivo: ${BASE}\n`);

// --- 1. Salud y portada ---
const health = await req('/health');
check('servicio responde /health', health.status === 200 && health.data?.ok === true, `HTTP ${health.status}`);
const portada = await req('/');
check('sirve la web', portada.status === 200, `HTTP ${portada.status}`);

// --- 2. Registro y validacion ---
const a = await req('/api/auth/register', { method: 'POST', body: { email: `host${stamp}@e2e.dev`, password: 'doblaje123', displayName: 'Host' } });
const b = await req('/api/auth/register', { method: 'POST', body: { email: `dub${stamp}@e2e.dev`, password: 'doblaje123', displayName: 'Dubber' } });
check('registro de dos usuarios', a.status === 201 && b.status === 201, `HTTP ${a.status}/${b.status}`);
const tokenA = a.data?.token, tokenB = b.data?.token;
const corta = await req('/api/auth/register', { method: 'POST', body: { email: `x${stamp}@e2e.dev`, password: '123', displayName: 'X' } });
check('rechaza contrasena debil', corta.status === 400, `HTTP ${corta.status}`);

// --- 3. Sala y union con codigo ---
const sala = await req('/api/rooms', { method: 'POST', token: tokenA, body: { name: 'Prueba automatica' } });
const roomId = sala.data?.room?.id, code = sala.data?.room?.code;
check('crear sala', sala.status === 201 && !!roomId, `codigo ${code}`);
const union = await req('/api/rooms/join', { method: 'POST', token: tokenB, body: { code } });
check('unirse con el codigo', union.status === 200 && union.data?.room?.id === roomId, `HTTP ${union.status}`);
const sinAuth = await req(`/api/rooms/${roomId}`);
check('protege rutas sin sesion', sinAuth.status === 401, `HTTP ${sinAuth.status}`);

// --- 4. Sockets: reloj, permisos y sincronizacion ---
const connect = (token) => io(BASE, { auth: { token }, transports: ['websocket'], reconnection: false });
const host = connect(tokenA), guest = connect(tokenB);
const joined = (s) => new Promise((r) => s.emit('room:join', { roomId }, r));
const once = (s, ev, ms = 8000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`timeout ${ev}`)), ms);
  s.once(ev, (p) => { clearTimeout(t); res(p); });
});
await Promise.all([once(host, 'connect'), once(guest, 'connect')]);
const j1 = await joined(host), j2 = await joined(guest);
check('los dos entran en la sala por socket', j1?.ok && j2?.ok, `participantes ${j2?.data?.participants?.length ?? '?'}`);

const offset = await new Promise((resolve) => {
  const sent = Date.now();
  guest.emit('time:sync', { clientTime: sent }, (res) => resolve(res.serverTime - (sent + (Date.now() - sent) / 2)));
});
check('reloj de referencia del servidor', Number.isFinite(offset), `offset ${Math.round(offset)} ms`);

const negado = await new Promise((r) => guest.emit('playback:command', { action: 'play', position: 0 }, r));
check('invitado no controla la reproduccion', negado && negado.ok === false, negado?.error);

const llega = once(guest, 'room:playback');
const orden = await new Promise((r) => host.emit('playback:command', { action: 'play', position: 1.5 }, r));
const recibido = await llega;
const skew = Math.abs((recibido.anchorServerTime + recibido.position * 1000) - (orden.data.anchorServerTime + orden.data.position * 1000));
check('reproducir se propaga con la misma ancla', skew === 0, `desviacion ${skew} ms`);

const c = await req('/api/auth/register', { method: 'POST', body: { email: `tarde${stamp}@e2e.dev`, password: 'doblaje123', displayName: 'Tarde' } });
const tarde = connect(c.data.token);
await once(tarde, 'connect');
await joined(tarde);
const sync = await new Promise((r) => tarde.emit('playback:request-sync', r));
check('quien entra tarde recibe el punto actual', sync?.data?.playback?.playing === true, `posicion ${sync?.data?.playback?.position?.toFixed(2)} s`);

const pausa = once(guest, 'room:playback');
await new Promise((r) => host.emit('playback:command', { action: 'pause' }, r));
const pausado = await pausa;
check('pausa sincronizada', pausado?.playing === false);

// --- 5. Video y grabacion ---
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15',
  '-f', 'lavfi', '-i', 'sine=frequency=220', '-t', '6', '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', 'clip.mp4']);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '3', 'toma.wav']);

const fv = new FormData();
fv.append('video', new Blob([readFileSync('clip.mp4')], { type: 'video/mp4' }), 'clip.mp4');
const subida = await req(`/api/rooms/${roomId}/video`, { method: 'POST', token: tokenA, form: fv });
check('subir el video de la escena', subida.status === 200 || subida.status === 201, `HTTP ${subida.status}`);

const fa = new FormData();
fa.append('audio', new Blob([readFileSync('toma.wav')], { type: 'audio/wav' }), 'toma.wav');
fa.append('startTime', '1');
fa.append('endTime', '4');
const toma = await req(`/api/rooms/${roomId}/recordings`, { method: 'POST', token: tokenB, form: fa });
check('subir una toma de voz', toma.status === 200 || toma.status === 201, `HTTP ${toma.status}`);

const lista = await req(`/api/rooms/${roomId}/recordings`, { token: tokenA });
const recordings = lista.data?.recordings ?? [];
check('la toma queda guardada como pista independiente', recordings.length >= 1, `${recordings.length} pista(s)`);

// --- 6. Exportacion con FFmpeg ---
const exp = await req(`/api/rooms/${roomId}/exports`, { method: 'POST', token: tokenA, body: { recordingIds: recordings.map((r) => r.id), keepOriginal: true } });
check('encolar la exportacion', exp.status === 202 && !!exp.data?.job?.id, `HTTP ${exp.status} ${JSON.stringify(exp.data).slice(0, 120)}`);
let job = exp.data?.job, intentos = 0;
while (job && !['completed', 'failed', 'ready'].includes(job.status) && intentos++ < 90) {
  await new Promise((r) => setTimeout(r, 2000));
  const st = await req(`/api/exports/${job.id}`, { token: tokenA });
  job = st.data?.job ?? job;
}
check('la exportacion termina bien', job && ['completed', 'ready'].includes(job.status), `estado ${job?.status} ${job?.error ?? ''}`);

if (job && ['completed', 'ready'].includes(job.status)) {
  const dl = await req(`/api/exports/${job.id}/download`, { token: tokenA });
  const bytes = dl.data instanceof ArrayBuffer ? dl.data.byteLength : 0;
  writeFileSync('export.mp4', Buffer.from(dl.data));
  check('el archivo final se descarga', dl.status === 200 && bytes > 20000, `${(bytes / 1024).toFixed(0)} KB`);
  try {
    const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', 'export.mp4']).toString().trim();
    check('el MP4 tiene duracion real', Number(dur) > 5 && Number(dur) < 8, `${dur} s`);
  } catch (e) { check('el MP4 tiene duracion real', false, String(e).slice(0, 80)); }
}

host.close(); guest.close(); tarde.close();
const fallos = results.filter((r) => !r.ok);
console.log(`\n${results.length - fallos.length}/${results.length} comprobaciones correctas`);
if (fallos.length) { console.log('FALLOS:', fallos.map((f) => f.name).join(', ')); process.exit(1); }
process.exit(0);
