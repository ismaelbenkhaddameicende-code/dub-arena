# DUB ARENA

Aplicacion web de doblaje colaborativo. Varias personas entran en una sala, ven la misma
escena sincronizada, graban cada una su personaje en una pista independiente, aplican efectos
de voz y exportan un MP4 final mezclado en el servidor.

---

## 1. Estado real del proyecto

Esto no es una maqueta: todo lo marcado como **Probado** se ha ejecutado de verdad contra la API
en funcionamiento.

| Funcionalidad | Estado | Como se comprobo |
|---|---|---|
| Registro / login / sesion JWT | Probado | peticiones reales a `/api/auth/*` |
| Salas con codigo, limite 4, expulsar, asignar personaje | Probado | dos usuarios reales en la misma sala |
| Sincronizacion de reproduccion (reloj de servidor) | Probado | 3 clientes Socket.IO: desviacion 0 ms entre anclas |
| Cliente tardio se incorpora en el punto actual | Probado | posicion efectiva 1,54 s al entrar |
| Solo el administrador controla la reproduccion | Probado | el invitado recibe "Solo el administrador..." |
| Subida de video validada (tipo, tamano, ffprobe) | Probado | MP4 6 s y discurso 11 s |
| Grabacion por participante con tomas numeradas | Probado | subida WebM/Opus real |
| Archivos privados con token firmado y Range | Probado | 200 con token, 401 sin token |
| Exportacion MP4 con FFmpeg | Probado | salida h264+aac verificada con ffprobe |
| Transcripcion con Faster-Whisper (CPU, int8) | Probado | modelo tiny transcribio un clip real con marcas de tiempo |
| Revisor de escena (renombrar, fusionar, separar, editar) | Implementado | compila y consume el analisis real |
| Editor multipista con formas de onda | Implementado | compila; requiere navegador para uso manual |
| Efectos de voz Web Audio (tono, robot, eco, reverb, distorsion, radio) | Implementado | cadena real de Web Audio, grabada con los efectos aplicados |
| Diarizacion automatica (pyannote) | Codigo listo, motor no instalado aqui | necesita `HF_TOKEN` y aceptar condiciones en Hugging Face |
| Separacion de voz (Demucs) | Codigo listo, motor no instalado aqui | `pip install demucs`, es lento en CPU |
| Interfaz grafica | Compila y sirve sin errores | no se ha podido abrir un navegador en el entorno del agente |
| PWA instalable (manifest, service worker, iconos) | Generado en el build | 15 recursos precargados, `/api` excluida de cache |
| Servidor HTTPS para probar en el movil | Probado | responde 200 en `https://localhost:5174` |
| Modo produccion en un solo servicio (web + API) | Probado | SPA, manifest, service worker y registro de usuario en un mismo puerto |
| Despliegue en la nube con `render.yaml` | Configurado, sin desplegar | requiere cuenta de Render y un repositorio |

> Honestidad sobre la interfaz: el agente trabajaba en un contenedor Linux sin navegador, asi que
> la UI esta compilada, tipada y servida, pero el recorrido visual final lo tienes que ver tu en
> `http://localhost:5173`. No hay datos falsos ni botones decorativos: cada boton llama a una ruta real.

---

## 2. Requisitos en tu Asus X515 (Windows, 8 GB)

| Herramienta | Version | Para que |
|---|---|---|
| Node.js LTS | 20 o 22 | servidor y herramientas de React |
| Git | ultima | control de versiones |
| FFmpeg | 5 o superior | leer el video, exportar el MP4 |
| Python | 3.11 | servicio de IA (opcional) |
| VS Code | ultima | editar el codigo |

Instalacion con winget (PowerShell):

```powershell
winget install OpenJS.NodeJS.LTS
winget install Git.Git
winget install Gyan.FFmpeg
winget install Python.Python.3.11
winget install Microsoft.VisualStudioCode
```

Comprueba (cierra y abre la terminal despues de instalar):

```powershell
node -v
npm -v
git --version
ffmpeg -version
python --version
```

Si `ffmpeg` no responde, edita `.env` y pon la ruta completa:

```env
FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe
FFPROBE_PATH=C:\ffmpeg\bin\ffprobe.exe
```

Extensiones de VS Code recomendadas: ESLint, Prettier, Tailwind CSS IntelliSense, Python.
No instales nada mas.

---

## 3. Arrancar el proyecto

```powershell
cd C:\ruta\donde\este\DUB-ARENA
npm install
copy .env.example .env
npm run build:shared
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:4000/health

`npm run dev` levanta API y web a la vez. Si prefieres dos terminales:

```powershell
npm run dev:api     # terminal 1
npm run dev:web     # terminal 2
```

### En el movil

```powershell
npm run dev:mobile
```

Abre en el telefono la direccion **Network** que muestra (por ejemplo `https://192.168.1.50:5174`),
acepta el certificado autofirmado y anade la app a la pantalla de inicio. Detalle completo,
incluido el APK de Android, en `docs/MOVIL.md`.

> El microfono **solo** funciona por HTTPS o en localhost. Abrir `http://IP:5173` en el movil
> permite ver y sincronizar, pero no grabar: es una restriccion del navegador.

### Servicio de IA (opcional pero necesario para el analisis automatico)

```powershell
cd C:\ruta\donde\este\DUB-ARENA
python -m venv ai-venv
ai-venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r ai-services\requirements.txt
python ai-services\main.py
```

Comprueba: http://127.0.0.1:8001/health

El servicio descarga el modelo la primera vez (tiny ~75 MB, base ~145 MB) y lo guarda en cache.
Se ejecuta **un solo modelo a la vez** y con `int8` en CPU para no bloquear el portatil.

---

## 4. Como se usa

1. **Crear cuenta** en `/entrar` y entrar.
2. **Crear sala** desde Inicio (seras el administrador).
3. **Subir clip** (MP4/WebM/MOV/MKV, maximo 300 MB).
4. Compartir el **codigo de 6 caracteres** con tus companeros.
5. **Analizar escena** (opcional, requiere el servicio de IA): transcribe dialogos, separa voces y
   propone personajes. Todo es revisable y corregible.
6. **Asignar personajes** a cada participante.
7. **Grabar**: cada uno activa su microfono, elige efectos y pulsa "Grabar mi personaje".
   Cada toma se sube al servidor como pista independiente.
8. **Editor**: mover/recortar tomas, ajustar volumenes, escuchar la mezcla.
9. **Exportar video**: FFmpeg mezcla en el servidor y devuelve el MP4 verificado.

---

## 5. Arquitectura

```
DUB-ARENA/
├─ frontend/          React 18 + TypeScript + Vite + Tailwind
│  └─ src/
│     ├─ pages/       Auth, Home, Rooms, Room, Analysis, Studio, Profile
│     ├─ components/  ui, AppShell, room/, recorder/, editor/
│     ├─ hooks/       useRoomSocket, usePlaybackSync, useRecorder, useMediaUrl
│     ├─ lib/         api, clock, audioEffects, waveform
│     └─ store/       auth (zustand)
├─ backend/           Node + Express + TypeScript + Socket.IO
│  └─ src/
│     ├─ routes/ controllers/ services/ sockets/ middleware/ db/ utils/
│     └─ index.ts     arranque (comprueba FFmpeg al iniciar)
├─ ai-services/       Python + FastAPI
│  ├─ transcription/  faster-whisper (CPU int8)
│  ├─ diarization/    pyannote (opcional, HF_TOKEN)
│  ├─ separation/     demucs (opcional)
│  ├─ analyzer/       fusion transcripcion + diarizacion
│  └─ main.py         /health /analyze /separate
├─ shared/            tipos y constantes compartidos (build dual CJS+ESM)
├─ mobile/            envoltorio Capacitor para generar el APK de Android
├─ storage/           videos, grabaciones, exportaciones y SQLite (no se sube a Git)
├─ scripts/           setup-windows.ps1, dev-windows.bat, test-sync.mjs
└─ docs/              arquitectura, fases, IA
```

### Decisiones tecnicas

- **SQLite local en vez de Supabase** en esta primera version. Motivo: funciona sin crear cuenta ni
  meter tarjeta, sin coste y sin internet, que es lo que pediste para el desarrollo. Toda la
  persistencia esta aislada en `backend/src/db` y en los `services/`, asi que pasar a Supabase es
  sustituir esas dos capas sin tocar rutas ni interfaz. Dime y lo migro.
- **El video no se transmite por WebRTC**: todos los navegadores descargan el mismo archivo del
  servidor con URLs firmadas y Range. La sincronizacion es de reloj, no de flujo. Es mucho mas
  barato en CPU y RAM que retransmitir.
- **Efectos aplicados antes de grabar** (Web Audio -> MediaRecorder), asi la exportacion suena
  exactamente igual que lo escuchado. No hay efectos "decorativos" que luego se pierden.
- **Mercado de la IA**: Whisper y Demucs en el servidor, nunca en el navegador de 8 GB.
- **Movil primero, sin duplicar codigo**: la misma base React se sirve como PWA instalable y se
  empaqueta con Capacitor cuando haga falta un APK. No hay una segunda aplicacion que mantener.

---

## 6. Sincronizacion: como funciona

1. El cliente mide su desfase con el servidor (`time:sync`, mediana de 9 muestras).
2. El servidor guarda `{playing, position, anchorServerTime}` y lo emite a la sala.
3. Cada navegador calcula `position + (serverNow() - anchorServerTime)/1000`.
4. Si el desvio supera 0,6 s hace `seek`; entre 0,15 y 0,6 s corrige con `playbackRate` 0,96/1,04
   sin corte visible.
5. Al reconectar, el socket vuelve a unirse y recibe el estado vigente: se incorpora donde toca.

Prueba automatica incluida:

```powershell
node scripts\test-sync.mjs
```

---

## 7. IA: que es gratis, que pesa y que necesita cuenta

| Motor | Coste | Requisitos | Notas |
|---|---|---|---|
| Faster-Whisper tiny/base en CPU | Gratis, local | nada | ~1 s audio/10 s en CPU int8; primera vez descarga el modelo |
| Whisper small | Gratis, local | 8 GB justos | calidad mayor, mas lento |
| pyannote (diarizacion) | Gratis, local | cuenta Hugging Face + aceptar condiciones del modelo | `HF_TOKEN` en `.env` |
| Demucs (separar voz) | Gratis, local | ~4 GB RAM libres | muy lento en CPU, ejecutar solo |
| Servicios en la nube | De pago o con limites | tarjeta en la mayoria | no son necesarios para el flujo basico |

Sin token de Hugging Face la diarizacion se desactiva con un aviso y todas las intervenciones
quedan en `SPEAKER_00` para que las separes a mano. **Nunca se inventan identidades de personaje.**

---

## 8. Seguridad implementada

- Contrasenas con `scrypt` + salt (nunca en claro, nunca en el cliente).
- JWT con caducidad de 7 dias; socket autenticado en el handshake.
- Subidas validadas por MIME, tamano maximo y `ffprobe` real antes de aceptar el archivo.
- Vectores de rutas comprobados: nada sale de `storage/`.
- Videos y grabaciones **nunca** publicos: `/api/media/:id/stream?token=...` con HMAC y caducidad.
- Permisos por sala: solo el host sube video, controla la reproduccion y expulsa.
- Validacion de entrada con Zod en todas las rutas, `helmet`, rate limiting.
- Errores 5xx sin filtrar trazas al cliente.

---

## 9. Problemas frecuentes

| Sintoma | Causa y solucion |
|---|---|
| "Servicio de IA no disponible" | El proceso `ai-services/main.py` no esta arrancado |
| "sin motor de transcripcion instalado" | Falta `pip install faster-whisper` en el venv |
| La exportacion falla con "FFmpeg no disponible" | FFmpeg no esta en el PATH: usa `FFMPEG_PATH` en `.env` |
| El microfono no graba | Permiso denegado en el candado de la barra de direcciones |
| El video no arranca solo | El navegador exige un gesto: pulsa "Pulsa para unirte a la reproduccion" |
| Whisper va lentisimo | Usa `tiny` o `base`; cierra otras apps; nunca lances Demucs a la vez |

---

## 10. Publicar y obtener un enlace

Ver `docs/DESPLIEGUE.md`. Resumen: con `SERVE_STATIC=1` el backend sirve tambien la web
compilada, asi que todo vive en **un unico enlace**. El archivo `render.yaml` despliega ese
servicio en Render en el plan gratuito (sin tarjeta).

## 11. Fases

Ver `docs/ESTADO-FASES.md` para el detalle de que esta hecho, que falta y que se probo en cada fase.

## 12. Aviso legal

Sube solo videos, musicas y voces sobre las que tengas derechos de uso. DUB ARENA no incorpora
ningun mecanismo para saltarse protecciones de plataformas externas.
