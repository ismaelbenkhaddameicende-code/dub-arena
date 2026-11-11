/**
 * Pruebas de extremo a extremo de la API de DUB ARENA.
 * Arranca el servidor real en un puerto libre, con base de datos temporal,
 * y comprueba los flujos criticos: autenticacion, salas, permisos, subidas,
 * seguridad de archivos, sincronizacion por Socket.IO y exportacion con FFmpeg.
 *
 *   npm test
 */
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const sandboxDir = path.join(os.tmpdir(), `dub-arena-test-${Date.now()}`);
process.env.NODE_ENV = 'test';
process.env.STORAGE_DIR = sandboxDir;
process.env.JWT_SECRET = 'clave-de-prueba-0123456789abcdef';
process.env.AI_SERVICE_URL = 'http://127.0.0.1:1'; // fuerza "IA no disponible"
process.env.CORS_ORIGINS = 'https://dub-arena.pages.dev,http://localhost:5173';

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
let failures = 0;

async function check(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures += 1;
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.log(`  FALLO ${name}: ${detail}`);
  }
}

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

interface ApiResponse { status: number; body: any; headers: Headers }

async function main(): Promise<void> {
  const { createApp } = await import('../app');
  const { createSocketServer } = await import('../sockets');
  const { env } = await import('../config/env');

  const app = createApp();
  const server = http.createServer(app);
  createSocketServer(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}`;
  console.log(`\nServidor de pruebas en ${base}\nAlmacenamiento: ${sandboxDir}\n`);

  const api = async (
    method: string, route: string, options: { token?: string; body?: unknown; form?: FormData } = {},
  ): Promise<ApiResponse> => {
    const headers: Record<string, string> = {};
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    let body: BodyInit | undefined;
    if (options.form) body = options.form;
    else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    const res = await fetch(`${base}${route}`, { method, headers, body });
    let parsed: any = null;
    const type = res.headers.get('content-type') ?? '';
    if (type.includes('application/json')) parsed = await res.json();
    else parsed = { bytes: (await res.arrayBuffer()).byteLength };
    return { status: res.status, body: parsed, headers: res.headers };
  };

  /* --------------------------- Fixtures multimedia -------------------------- */
  const fixtureDir = path.join(sandboxDir, 'fixtures');
  fs.mkdirSync(fixtureDir, { recursive: true });
  const videoPath = path.join(fixtureDir, 'clip.mp4');
  const audioPath = path.join(fixtureDir, 'toma.webm');

  execFileSync(env.ffmpegPath, [
    '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15:duration=4',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-shortest', videoPath,
  ], { stdio: 'ignore' });

  execFileSync(env.ffmpegPath, [
    '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=3',
    '-c:a', 'libopus', '-b:a', '64k', audioPath,
  ], { stdio: 'ignore' });

  const fileAsForm = (field: string, filePath: string, mime: string, name: string, extra: Record<string, string> = {}): FormData => {
    const form = new FormData();
    for (const [key, value] of Object.entries(extra)) form.append(key, value);
    form.append(field, new Blob([fs.readFileSync(filePath)], { type: mime }), name);
    return form;
  };

  const stamp = Date.now();
  const host = { email: `host${stamp}@prueba.dev`, password: 'doblaje123', displayName: 'Host Prueba' };
  const guest = { email: `guest${stamp}@prueba.dev`, password: 'doblaje123', displayName: 'Invitado' };
  let hostToken = '';
  let guestToken = '';
  let roomId = '';
  let roomCode = '';
  let recordingId = '';
  let videoId = '';

  /* ------------------------------ 1. Servicio ------------------------------ */
  await check('GET /health responde 200', async () => {
    const res = await api('GET', '/health');
    assert(res.status === 200, `estado ${res.status}`);
    assert(res.body.ok === true, 'ok debe ser true');
  });

  /* --------------------------- 2. Autenticacion --------------------------- */
  await check('registro de usuario devuelve token', async () => {
    const res = await api('POST', '/api/auth/register', { body: host });
    assert(res.status === 201, `estado ${res.status}: ${JSON.stringify(res.body)}`);
    assert(typeof res.body.token === 'string' && res.body.token.length > 20, 'token invalido');
    hostToken = res.body.token;
  });

  await check('correo duplicado se rechaza (409)', async () => {
    const res = await api('POST', '/api/auth/register', { body: host });
    assert(res.status === 409, `estado ${res.status}`);
  });

  await check('contrasena corta se rechaza', async () => {
    const res = await api('POST', '/api/auth/register', {
      body: { email: `x${stamp}@prueba.dev`, password: '123', displayName: 'X' },
    });
    assert(res.status === 400, `estado ${res.status}: se acepto una contrasena de 3 caracteres`);
  });

  await check('correo con formato invalido se rechaza', async () => {
    const res = await api('POST', '/api/auth/register', {
      body: { email: 'no-es-un-correo', password: 'doblaje123', displayName: 'X' },
    });
    assert(res.status === 400, `estado ${res.status}`);
  });

  await check('login y /auth/me devuelven el perfil', async () => {
    const res = await api('POST', '/api/auth/login', { body: { email: host.email, password: host.password } });
    assert(res.status === 200, `estado ${res.status}`);
    const me = await api('GET', '/api/auth/me', { token: res.body.token });
    assert(me.body.user.displayName === host.displayName, 'nombre distinto');
  });

  await check('rutas protegidas sin token devuelven 401', async () => {
    const res = await api('GET', '/api/rooms');
    assert(res.status === 401, `estado ${res.status}`);
  });

  await check('registro del invitado', async () => {
    const res = await api('POST', '/api/auth/register', { body: guest });
    assert(res.status === 201, `estado ${res.status}`);
    guestToken = res.body.token;
  });

  /* -------------------------------- 3. Salas ------------------------------- */
  await check('crear sala con codigo de 6 caracteres', async () => {
    const res = await api('POST', '/api/rooms', { token: hostToken, body: { name: 'Sala de pruebas' } });
    assert(res.status === 201, `estado ${res.status}`);
    roomId = res.body.room.id;
    roomCode = res.body.room.code;
    assert(/^[A-Z0-9]{6}$/.test(roomCode), `codigo inesperado: ${roomCode}`);
    assert(res.body.room.maxParticipants === 4, 'aforo distinto de 4');
  });

  await check('el invitado se une con el codigo', async () => {
    const res = await api('POST', '/api/rooms/join', { token: guestToken, body: { code: roomCode } });
    assert(res.status === 200, `estado ${res.status}: ${JSON.stringify(res.body)}`);
    const detail = await api('GET', `/api/rooms/${roomId}`, { token: guestToken });
    assert(detail.body.room.participants.length === 2, 'deberia haber 2 participantes');
  });

  await check('aforo maximo de 4 respetado', async () => {
    const tokens: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const reg = await api('POST', '/api/auth/register', {
        body: { email: `extra${stamp}${i}@prueba.dev`, password: 'doblaje123', displayName: `Extra ${i}` },
      });
      tokens.push(reg.body.token);
    }
    const third = await api('POST', '/api/rooms/join', { token: tokens[0], body: { code: roomCode } });
    const fourth = await api('POST', '/api/rooms/join', { token: tokens[1], body: { code: roomCode } });
    assert(third.status === 200 && fourth.status === 200, 'la sala deberia admitir 4');
    const fifth = await api('POST', '/api/rooms/join', { token: tokens[2], body: { code: roomCode } });
    assert(fifth.status === 403 || fifth.status === 409, `la quinta persona entro: ${fifth.status}`);
    // limpieza: salir, para las pruebas siguientes
    for (const token of [tokens[0], tokens[1]]) {
      await api('POST', `/api/rooms/${roomId}/leave`, { token });
    }
  });

  /* ------------------------------ 4. Permisos ------------------------------ */
  await check('el invitado no puede subir el video (403)', async () => {
    const res = await api('POST', `/api/rooms/${roomId}/video`, {
      token: guestToken, form: fileAsForm('video', videoPath, 'video/mp4', 'clip.mp4'),
    });
    assert(res.status === 403, `estado ${res.status}`);
  });

  await check('el invitado no puede controlar la reproduccion (403)', async () => {
    const res = await api('POST', `/api/rooms/${roomId}/playback`, {
      token: guestToken, body: { playing: true, position: 0, action: 'play' },
    });
    assert(res.status === 403, `estado ${res.status}: el invitado pudo controlar la reproduccion`);
  });

  /* ------------------------------- 5. Video -------------------------------- */
  await check('el administrador sube el video y se valida con ffprobe', async () => {
    const res = await api('POST', `/api/rooms/${roomId}/video`, {
      token: hostToken, form: fileAsForm('video', videoPath, 'video/mp4', 'clip.mp4'),
    });
    assert(res.status === 201, `estado ${res.status}: ${JSON.stringify(res.body)}`);
    videoId = res.body.video.id;
    assert(res.body.video.durationSec > 3, `duracion detectada: ${res.body.video.durationSec}`);
  });

  await check('archivo no-video se rechaza', async () => {
    const fakePath = path.join(fixtureDir, 'no-es-video.mp4');
    fs.writeFileSync(fakePath, 'esto no es un video');
    const res = await api('POST', `/api/rooms/${roomId}/video`, {
      token: hostToken, form: fileAsForm('video', fakePath, 'video/mp4', 'no-es-video.mp4'),
    });
    assert(res.status >= 400, `se acepto un archivo invalido: ${res.status}`);
  });

  /* ------------------------- 6. Archivos privados -------------------------- */
  await check('el video exige token firmado (401 sin token)', async () => {
    const res = await api('GET', `/api/media/${videoId}/stream`);
    assert(res.status === 401, `estado ${res.status}`);
  });

  await check('token firmado permite descargar el video', async () => {
    const tokenRes = await api('GET', `/api/media/${videoId}/token`, { token: guestToken });
    assert(tokenRes.status === 200, `estado ${tokenRes.status}`);
    const stream = await api('GET', `/api/media/${videoId}/stream?token=${encodeURIComponent(tokenRes.body.token)}`);
    assert(stream.status === 200, `estado ${stream.status}`);
    assert(Number(stream.body.bytes) > 1000, 'el archivo llega vacio');
  });

  /* ----------------------------- 7. Grabacion ------------------------------ */
  await check('subida de toma de voz', async () => {
    const res = await api('POST', `/api/rooms/${roomId}/recordings`, {
      token: guestToken,
      form: fileAsForm('audio', audioPath, 'audio/webm', 'toma.webm', { startTime: '0.5', endTime: '3.5' }),
    });
    assert(res.status === 201, `estado ${res.status}: ${JSON.stringify(res.body)}`);
    recordingId = res.body.recording.id;
    assert(res.body.recording.duration > 2, `duracion: ${res.body.recording.duration}`);
  });

  await check('un usuario ajeno no puede borrar la toma', async () => {
    const outsider = await api('POST', '/api/auth/register', {
      body: { email: `out${stamp}@prueba.dev`, password: 'doblaje123', displayName: 'Ajeno' },
    });
    const res = await api('DELETE', `/api/recordings/${recordingId}`, { token: outsider.body.token });
    assert(res.status === 403 || res.status === 404, `estado ${res.status}: un ajeno pudo borrar la toma`);
    const mine = await api('GET', `/api/rooms/${roomId}/recordings`, { token: guestToken });
    assert(mine.body.recordings.some((r: { id: string }) => r.id === recordingId), 'la toma desaparecio');
  });

  /* ------------------------------- 8. IA ----------------------------------- */
  await check('analisis sin servicio de IA responde 503 honesto', async () => {
    const res = await api('POST', `/api/rooms/${roomId}/analysis`, { token: hostToken, body: { model: 'tiny' } });
    assert(res.status === 503, `estado ${res.status}: ${JSON.stringify(res.body)}`);
    assert(/IA|servicio/i.test(JSON.stringify(res.body)), 'el mensaje no explica el motivo');
  });

  /* --------------------------- 9. Socket.IO -------------------------------- */
  await check('Socket.IO: dos clientes, ancla identica y permisos', async () => {
    const { io } = await import('socket.io-client');
    const connect = (token: string) => io(base, { auth: { token }, transports: ['websocket'], reconnection: false });
    const hostSocket = connect(hostToken);
    const guestSocket = connect(guestToken);

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        hostSocket.on('connect', () => resolve());
        hostSocket.on('connect_error', (err) => reject(new Error(`host: ${err.message}`)));
      }),
      new Promise<void>((resolve, reject) => {
        guestSocket.on('connect', () => resolve());
        guestSocket.on('connect_error', (err) => reject(new Error(`guest: ${err.message}`)));
      }),
    ]);

    const join = (socket: any) => new Promise<any>((resolve) => socket.emit('room:join', { roomId }, resolve));
    const hostJoin = await join(hostSocket);
    const guestJoin = await join(guestSocket);
    assert(hostJoin.ok && guestJoin.ok, 'no se pudo unir a la sala');

    const denied = await new Promise<any>((resolve) => guestSocket.emit('playback:command', { action: 'play', position: 0 }, resolve));
    assert(denied.ok === false, 'el invitado pudo controlar la reproduccion');

    const received = new Promise<any>((resolve) => guestSocket.once('room:playback', resolve));
    const played = await new Promise<any>((resolve) => hostSocket.emit('playback:command', { action: 'play', position: 1.5 }, resolve));
    assert(played.ok, 'el anfitrion no pudo reproducir');
    const state = await received;
    assert(state.playing === true, 'el invitado no recibio reproduccion');
    assert(
      state.anchorServerTime === played.data.anchorServerTime && state.position === played.data.position,
      'el ancla recibida no coincide con la del anfitrion',
    );

    hostSocket.close();
    guestSocket.close();
  });

  /* ----------------------------- 10. Exportacion --------------------------- */
  await check('exportacion MP4 con FFmpeg y archivo verificado', async () => {
    const created = await api('POST', `/api/rooms/${roomId}/exports`, {
      token: hostToken,
      body: {
        keepOriginalAudio: true,
        originalGain: 0.8,
        clips: [{ recordingId, start: 0.5, inPoint: 0, outPoint: 3, gain: 1, muted: false }],
      },
    });
    assert(created.status === 202, `estado ${created.status}: ${JSON.stringify(created.body)}`);

    let job = created.body.job;
    const deadline = Date.now() + 90000;
    while (['queued', 'pending', 'processing'].includes(job.status)) {
      if (Date.now() > deadline) throw new Error('la exportacion no termino en 90 s');
      await new Promise((resolve) => setTimeout(resolve, 700));
      const status = await api('GET', `/api/exports/${job.id}`, { token: hostToken });
      job = status.body.job;
    }
    assert(job.status === 'done', `estado final: ${job.status} (${job.error ?? ''})`);
    assert(job.sizeBytes > 5000, `archivo demasiado pequeno: ${job.sizeBytes}`);
    assert(job.durationSec > 2, `duracion final: ${job.durationSec}`);
  });

  await check('descarga del MP4 exportado', async () => {
    const list = await api('GET', `/api/rooms/${roomId}/exports`, { token: hostToken });
    const job = list.body.jobs[list.body.jobs.length - 1];
    const res = await fetch(`${base}/api/exports/${job.id}/download`, { headers: { Authorization: `Bearer ${hostToken}` } });
    assert(res.status === 200, `estado ${res.status}`);
    const buffer = await res.arrayBuffer();
    assert(buffer.byteLength > 5000, 'MP4 vacio');
    assert(res.headers.get('content-type')?.includes('video/mp4'), 'tipo MIME incorrecto');
  });

  /* -------------------------------- 11. CORS ------------------------------- */
  await check('CORS permite el origen de Cloudflare Pages', async () => {
    const res = await fetch(`${base}/api/rooms`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://dub-arena.pages.dev',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization',
      },
    });
    const allowed = res.headers.get('access-control-allow-origin');
    assert(allowed === 'https://dub-arena.pages.dev', `cabecera CORS: ${allowed}`);
  });

  await check('CORS rechaza un origen desconocido', async () => {
    const res = await fetch(`${base}/api/rooms`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://sitio-malicioso.example', 'Access-Control-Request-Method': 'GET' },
    });
    const allowed = res.headers.get('access-control-allow-origin');
    assert(!allowed || allowed !== 'https://sitio-malicioso.example', `se permitio un origen ajeno: ${allowed}`);
  });

  /* -------------------------------- Resumen -------------------------------- */
  server.close();
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} comprobaciones correctas`);
  if (failures > 0) {
    console.log(`${failures} fallo(s). Detalle arriba.`);
    process.exit(1);
  }
  fs.rmSync(sandboxDir, { recursive: true, force: true });
  console.log('Todo correcto.\n');
  process.exit(0);
}

main().catch((error) => {
  console.error('\nLa ejecucion de pruebas se interrumpio:', error);
  process.exit(1);
});
