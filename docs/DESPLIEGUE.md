# Publicar DUB ARENA y obtener una URL publica

## Repositorio y despliegue actual

- Codigo publicado: https://github.com/ismaelbenkhaddameicende-code/dub-arena
- Despliegue en un clic: https://render.com/deploy?repo=https://github.com/ismaelbenkhaddameicende-code/dub-arena

## Estado de partida (comprobado, no supuesto)

- 25 de 25 pruebas de extremo a extremo en verde (`npm test`): autenticacion, salas, aforo,
  permisos, subida de video validada con ffprobe, archivos privados con token, grabacion,
  analisis sin IA (503 honesto), Socket.IO con dos clientes y exportacion MP4 verificada.
- El backend sirve la web compilada: **un unico servicio, un unico dominio** (`SERVE_STATIC=1`).
- CORS probado con el origen `https://dub-arena.pages.dev`: se permite; un origen ajeno se rechaza.
- `frontend/public/_redirects` y `_headers` incluidos para que Cloudflare Pages resuelva rutas
  como `/sala/abc123` sin 404 y no cachee el HTML ni el service worker.
- `Dockerfile` listo para desplegar en cualquier hosting de contenedores (no probado aqui:
  el entorno del agente no tiene Docker).

## Arquitectura A: Cloudflare Pages + Render (la que pediste)

```
Chrome --HTTPS--> dub-arena.pages.dev      (React, estatico, gratis)
                        |
                        | VITE_API_URL (se incrusta al compilar)
                        v
                  dub-arena.onrender.com   (Node + Express + Socket.IO + SQLite)
```

### Pasos

1. **Repositorio**: el proyecto tiene que estar en GitHub. Sin repo, Render no puede compilar
   (no acepta subir carpetas sueltas).
2. **Render**: New + -> Blueprint -> repositorio -> detecta `render.yaml` -> Apply.
   Plan gratuito, sin tarjeta. Anota la URL final (`https://dub-arena-xxxx.onrender.com`).
3. **Cloudflare Pages**: Workers & Pages -> Create -> Pages -> Connect to Git -> repositorio.
   - Framework preset: **Vite**
   - Build command: `npm ci && npm run build`
   - Build output directory: `frontend/dist`
   - Variable de entorno: `VITE_API_URL = https://dub-arena-xxxx.onrender.com`
   - Node version: `20` (`NODE_VERSION`)
4. **Cerrar el circulo**: en Render, cambia `CORS_ORIGINS` por la URL real de Pages y redespliega.

### Por que ese orden

`VITE_API_URL` se incrusta en el JavaScript al compilar, no se lee en tiempo de ejecucion.
Primero se despliega el backend (URL conocida) y despues el frontend con esa URL.

## Arquitectura B: un solo contenedor en Render (la elegida)

`render.yaml` ya declara `runtime: docker` con el `Dockerfile` de la raiz: la imagen instala
FFmpeg, compila la web y arranca Express sirviendo API + Socket.IO + interfaz en el mismo
dominio (sin CORS ni URLs cruzadas).

**Hugging Face quedo descartado**: los Spaces de Docker ya no son gratuitos, exigen PRO
(la API responde 402). Los Spaces estaticos siguen siendo gratis, pero no ejecutan Node.

## Limites honestos del plan gratuito de Render (leidos en su documentacion)

| Limite | Consecuencia real |
|---|---|
| 512 MB de RAM | Whisper no cabe: el analisis con IA sigue necesitando tu PC |
| Disco efimero | Videos y tomas se borran al reiniciar, redesplegar o dormir el servicio |
| Se duerme a los 15 min sin trafico | El siguiente acceso tarda ~1 minuto |
| 750 horas de instancia al mes | Suficiente para un servicio; dos servicios activos 24/7 no caben |
| Sin disco persistente ni shell | No se puede guardar nada de forma permanente |

Para uso serio con amigos, el siguiente paso seria Supabase (base de datos y archivos
persistentes, plan gratuito) manteniendo el backend donde este.

## Lo que no puedo hacer yo

Crear cuentas en tu nombre y aceptar condiciones legales por ti. Con una credencial de tu
cuenta, el despliegue lo hago yo y te entrego la URL comprobada.
