# Estado por fases

## FASE 1 - Entorno
- Comprobado en el entorno del agente: Node 20.20.2, npm 10.8.2, Python 3.11.16, FFmpeg 5.1.9
  (libx264 + aac), Git 2.39.5, SQLite nativo (better-sqlite3).
- Monorepo con workspaces, `.env.example`, `.gitignore`, `storage/` separado por tipo.
- Backend arranca y comprueba FFmpeg al inicio.
- Scripts para Windows: `scripts/setup-windows.ps1`, `scripts/dev-windows.bat`.
- **Pendiente tuyo**: instalar las herramientas en el Asus y confirmar versiones.

## FASE 2 - Interfaz
- Design system oscuro propio (Tailwind + variables), tipografia Space Grotesk + Inter.
- Pantallas: acceso, inicio, salas, sala de doblaje, analisis, editor, perfil.
- Estados vacios, errores visibles, responsive con prioridad PC.
- **Limitacion**: no se ha podido ver en navegador real desde el entorno del agente.

## FASE 3 - Multijugador
- Salas con codigo, limite configurable (4 por defecto), expulsar, transferir administrador,
  asignar personajes, avisos de conexion/desconexion.
- Reproduccion sincronizada con reloj de servidor + correccion de deriva.
- Probado con 3 clientes reales (`scripts/test-sync.mjs`): anclas identicas, permisos correctos,
  cliente tardio incorporado en el punto actual.

## FASE 4 - Grabacion
- Permiso de microfono, seleccion de dispositivo, medidor de nivel, grabar/pausar/reanudar/detener.
- Efectos Web Audio aplicados antes de grabar (tono por AudioWorklet, robot, eco, reverb,
  distorsion, radio, volumen).
- Cada toma es una pista independiente con usuario, personaje, inicio, fin, duracion y formato.
- Repetir toma: nueva version numerada, la anterior se sustituye solo si se indica.

## FASE 5 - IA
- Faster-Whisper en CPU int8, un modelo a la vez, VAD activo.
- Diarizacion opcional con pyannote (requiere `HF_TOKEN`).
- Informe de escena: personajes, primera aparicion, numero de intervenciones, solapamientos.
- Revisor: renombrar, fusionar voces, separar intervenciones, corregir texto y tiempos,
  eliminar o anadir intervenciones, confirmar reparto.
- **Probado**: transcripcion real con marcas de tiempo. **No probado aqui**: pyannote (sin token).

## FASE 6 - Procesamiento de audio
- Separacion voz/instrumental via Demucs en el servicio de IA (cola de un solo trabajo pesado).
- Efectos tradicionales completos; hueco preparado para modelos de voz IA sin depender de ellos.

## FASE 7 - Editor y exportacion
- Linea temporal multipista con formas de onda reales (picos calculados del audio decodificado).
- Mover, recortar, silenciar, volumen por pista, eliminar, anadir tomas, deshacer/rehacer.
- Guardado de la linea de tiempo en servidor.
- Exportacion FFmpeg con progreso, verificacion con ffprobe y descarga autenticada.
- **Probado**: MP4 h264+aac generado y validado.

## FASE 8 - Pruebas
Hecho:
- Dos/tres usuarios conectados, permisos, desincronizacion, cliente tardio.
- Subida de video valida y rechazo a no-host.
- Subida de grabacion y streaming con token.
- Exportacion y verificacion del archivo final.
- Mensajes de error claros cuando la IA no esta disponible.

Pendiente (requiere tu equipo y varias personas):
- Cuatro usuarios simultaneos grabando.
- Perdida real de red a mitad de sesion.
- Grabaciones de mas de 10 minutos y clips de 300 MB.
- Escucha critica de la mezcla final.
