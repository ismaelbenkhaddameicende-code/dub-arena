"""DUB ARENA - servicio de IA local (FastAPI).

Responsabilidades:
  * /health    -> que motores estan realmente instalados
  * /analyze   -> transcripcion + diarizacion + informe de escena
  * /separate  -> separacion voz/instrumental (Demucs)

Principio: si un motor no esta instalado, se dice claramente. Nunca se inventan
dialogos ni identidades de personaje.

Arranque:
    python -m venv ai-venv
    ai-venv\\Scripts\\activate
    pip install -r ai-services/requirements.txt
    python ai-services/main.py
"""
from __future__ import annotations

import sys
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import FastAPI, HTTPException  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from analyzer.scene import build_report  # noqa: E402
from common.audio import AudioError, extract_wav, ffmpeg_available, probe_duration  # noqa: E402
from common.config import WORK_DIR, settings  # noqa: E402
from diarization import pyannote_engine  # noqa: E402
from separation import demucs_engine  # noqa: E402
from transcription import whisper_engine  # noqa: E402

app = FastAPI(title="DUB ARENA AI", version="0.1.0")

# Un solo trabajo pesado a la vez: en 8 GB de RAM esto evita bloquear el equipo.
import threading  # noqa: E402
HEAVY = threading.Semaphore(1)

STATE = {"busy": False, "job": None, "started_at": 0.0}


class AnalyzeRequest(BaseModel):
    path: str = Field(..., description="Ruta absoluta del video en el servidor")
    language: str | None = None
    model: str = "base"
    diarize: bool = True


class SeparateRequest(BaseModel):
    path: str
    output_dir: str
    model: str = "htdemucs"


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "detail": "Servicio de IA de DUB ARENA",
        "ffmpeg": ffmpeg_available(),
        "transcription": whisper_engine.available(),
        "diarization": pyannote_engine.available(),
        "separation": demucs_engine.available(),
        "busy": STATE["busy"],
        "config": {
            "whisper_model": settings.whisper_model,
            "compute_type": settings.compute_type,
            "device": settings.device,
            "hf_token": bool(settings.hf_token),
        },
        "notes": [
            "diarization necesita pyannote.audio + HF_TOKEN",
            "separation necesita demucs instalado",
        ],
    }


@app.post("/analyze")
def analyze(req: AnalyzeRequest) -> dict:
    if not whisper_engine.available():
        raise HTTPException(503, "faster-whisper no esta instalado. pip install faster-whisper")
    if not ffmpeg_available():
        raise HTTPException(503, "ffmpeg no esta disponible en el PATH")

    source = Path(req.path)
    if not source.exists():
        raise HTTPException(404, f"No existe el archivo: {source}")
    model_name = req.model if req.model in {"tiny", "base", "small"} else settings.whisper_model

    if not HEAVY.acquire(blocking=False):
        raise HTTPException(429, "Ya hay un trabajo de IA en curso. Espera a que termine.")
    STATE.update(busy=True, job=f"analyze:{source.name}", started_at=time.time())
    try:
        wav = extract_wav(source, WORK_DIR / f"{source.stem}-16k.wav", sample_rate=16000)
        started = time.time()
        transcription = whisper_engine.transcribe(str(wav), language=req.language, model_name=model_name)
        elapsed_transcription = time.time() - started

        turns = None
        diarization_engine = "none"
        if req.diarize:
            started = time.time()
            try:
                turns = pyannote_engine.diarize(wav)
                if turns:
                    diarization_engine = settings.diarization_model.split("/")[-1]
            except Exception as error:  # diarizacion opcional: se informa y se continua
                turns = None
                diarization_engine = f"error: {error}"

        report = build_report(transcription["segments"], turns)
        if diarization_engine == "none":
            report["warnings"].append(
                "Para separar voces automaticamente instala pyannote.audio y define HF_TOKEN en .env. "
                "Mientras tanto, agrupa los personajes a mano en el revisor."
            )
        report["warnings"].append(
            f"Transcripcion con faster-whisper ({transcription['model']}, {settings.compute_type}) en "
            f"{elapsed_transcription:.1f}s. Idioma detectado: {transcription['language']}."
        )

        return {
            "language": transcription["language"],
            "language_probability": transcription["language_probability"],
            "duration_sec": transcription["duration"] or probe_duration(source),
            "segments": report["interventions"],
            "characters": report["characters"],
            "overlaps": report["overlaps"],
            "warnings": report["warnings"],
            "engine": {
                "transcription": f"faster-whisper/{transcription['model']}",
                "diarization": diarization_engine,
            },
        }
    except AudioError as error:
        raise HTTPException(422, str(error)) from error
    except HTTPException:
        raise
    except Exception as error:
        traceback.print_exc()
        raise HTTPException(500, f"Fallo el analisis: {error}") from error
    finally:
        STATE.update(busy=False, job=None)
        HEAVY.release()


@app.post("/separate")
def separate(req: SeparateRequest) -> dict:
    if not demucs_engine.available():
        raise HTTPException(503, "demucs no esta instalado. pip install demucs")
    source = Path(req.path)
    if not source.exists():
        raise HTTPException(404, f"No existe el archivo: {source}")
    if not HEAVY.acquire(blocking=False):
        raise HTTPException(429, "Ya hay un trabajo de IA en curso. Espera a que termine.")
    STATE.update(busy=True, job=f"separate:{source.name}", started_at=time.time())
    try:
        return demucs_engine.separate(source, req.output_dir, model=req.model)
    except Exception as error:
        traceback.print_exc()
        raise HTTPException(500, f"Fallo la separacion: {error}") from error
    finally:
        STATE.update(busy=False, job=None)
        HEAVY.release()


if __name__ == "__main__":
    import uvicorn

    print(f"DUB ARENA AI en http://{settings.host}:{settings.port}")
    print(f"  whisper: {whisper_engine.available()} | diarizacion: {pyannote_engine.available()} | demucs: {demucs_engine.available()}")
    uvicorn.run(app, host=settings.host, port=settings.port, log_level="info")
