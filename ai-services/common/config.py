"""Configuracion del servicio de IA (DUB ARENA)."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
WORK_DIR = Path(os.environ.get("DUB_ARENA_AI_WORK", BASE_DIR / ".work"))
WORK_DIR.mkdir(parents=True, exist_ok=True)


@dataclass(frozen=True)
class Settings:
    host: str = os.environ.get("AI_HOST", "127.0.0.1")
    port: int = int(os.environ.get("AI_PORT", "8001"))
    whisper_model: str = os.environ.get("WHISPER_MODEL", "base")
    # int8 en CPU reduce memoria y es suficiente para dialogos
    compute_type: str = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
    device: str = os.environ.get("WHISPER_DEVICE", "cpu")
    beam_size: int = int(os.environ.get("WHISPER_BEAM", "1"))
    hf_token: str | None = os.environ.get("HF_TOKEN") or None
    diarization_model: str = os.environ.get("DIARIZATION_MODEL", "pyannote/speaker-diarization-3.1")
    ffmpeg: str = os.environ.get("FFMPEG_PATH", "ffmpeg")


settings = Settings()
