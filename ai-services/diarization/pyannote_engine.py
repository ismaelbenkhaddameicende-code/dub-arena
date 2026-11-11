"""Diarizacion con pyannote.audio (opcional).

Sin token de Hugging Face o sin el paquete instalado devuelve None y el
analizador lo informa como advertencia: NUNCA inventa voces distintas.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from common.config import settings

_pipeline: Any = None


def available() -> bool:
    if not settings.hf_token:
        return False
    try:
        import pyannote.audio  # noqa: F401
        return True
    except Exception:
        return False


def _load():
    global _pipeline
    if _pipeline is not None:
        return _pipeline
    from pyannote.audio import Pipeline

    os.environ.setdefault("HF_TOKEN", settings.hf_token or "")
    pipeline = Pipeline.from_pretrained(settings.diarization_model, use_auth_token=settings.hf_token)
    if pipeline is None:
        raise RuntimeError(
            "pyannote no pudo cargar el modelo. Acepta las condiciones en "
            "https://huggingface.co/pyannote/speaker-diarization-3.1 y revisa el token."
        )
    _pipeline = pipeline
    return pipeline


def diarize(wav_path: str | Path) -> list[dict] | None:
    if not available():
        return None
    pipeline = _load()
    annotation = pipeline(str(wav_path))
    turns = []
    for turn, _, speaker in annotation.itertracks(yield_label=True):
        turns.append({"start": float(turn.start), "end": float(turn.end), "speaker": str(speaker)})
    return sorted(turns, key=lambda t: t["start"])


def unload() -> None:
    global _pipeline
    _pipeline = None
