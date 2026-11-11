# Servicio de IA

## Arranque

```powershell
python -m venv ai-venv
ai-venv\Scripts\activate
pip install -r ai-services\requirements.txt
python ai-services\main.py
```

Endpoints:

| Metodo | Ruta | Uso |
|---|---|---|
| GET | `/health` | que motores estan realmente instalados |
| POST | `/analyze` | `{path, language?, model?, diarize}` |
| POST | `/separate` | `{path, output_dir, model?}` (Demucs) |

## Memoria en 8 GB

- Solo se carga **un** modelo Whisper a la vez; al pedir otro se libera el anterior.
- `compute_type=int8` y `cpu_threads=2`.
- Un semaforo impide dos trabajos pesados simultaneos (`/analyze` y `/separate` devuelven 429 si
  ya hay uno en curso).
- Modelos recomendados: `tiny` (rapido) o `base` (equilibrio). `small` solo si cierras todo lo demas.

## Diarizacion

1. Crea un token en https://huggingface.co/settings/tokens
2. Acepta las condiciones de `pyannote/speaker-diarization-3.1` (y `pyannote/segmentation-3.0`).
3. `pip install pyannote.audio`
4. En `.env`: `HF_TOKEN=hf_...`
5. Reinicia `ai-services/main.py` y comprueba `/health` -> `diarization: true`.

Sin token, el analisis sigue funcionando y avisa de que todas las voces quedan en `SPEAKER_00`.

## Que nunca hace

- No inventa dialogos: si el VAD no detecta voz, no devuelve segmentos.
- No inventa nombres de personaje: `SPEAKER_00` es una voz, no Goku. Los nombres los pones tu.
- No promete eliminar la voz original: Demucs deja artefactos y afecta a sonidos parecidos a la voz.

## Coste

Todo lo anterior es local y gratuito. No hay ninguna dependencia de pago en el flujo basico.
