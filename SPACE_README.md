---
title: DUB ARENA
emoji: 🎙️
colorFrom: indigo
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Doblaje colaborativo de escenas con tus amigos
---

# DUB ARENA

Doblaje colaborativo en tiempo real: crea una sala, sube un clip, reparte personajes
y graba tu voz mientras todos ven la misma escena sincronizada. Al final, editor
multipista y exportacion del video doblado con FFmpeg.

- Un solo servicio: la web y la API comparten dominio (`SERVE_STATIC=1`).
- Grabacion por pista independiente con efectos de voz (Web Audio API).
- Sincronizacion por reloj de servidor, no por confianza en la red.
- Aviso: el disco de este servicio es efimero; las grabaciones se pierden al reconstruir.
- El analisis con IA (Whisper + diarizacion) no corre aqui: necesita ejecutarse aparte.
