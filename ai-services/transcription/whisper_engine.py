"""Transcripcion con Faster-Whisper (CPU, int8).

Se carga UN unico modelo en memoria a la vez para no bloquear equipos de 8 GB.
Si se pide otro tamano, el anterior se libera antes de cargar el nuevo.
"""
from __future__ import annotations

import gc
import threading
from typing import Any

from common.config import settings

_lock = threading.Lock()
_model: Any = None
_model_name: str | None = None


def available() -> bool:
    try:
        import faster_whisper  # noqa: F401
        return True
    except Exception:
        return False


def _load(model_name: str | None = None):
    global _model, _model_name
    name = model_name or settings.whisper_model
    if _model is not None and _model_name == name:
        return _model
    from faster_whisper import WhisperModel

    if _model is not None:
        _model = None
        _model_name = None
        gc.collect()

    # compute_type=int8 en CPU: la opcion mas ligera en memoria (modelo tiny ~75 MB)
    _model = WhisperModel(name, device=settings.device, compute_type=settings.compute_type, cpu_threads=2)
    _model_name = name
    return _model


def transcribe(wav_path: str, language: str | None = None, model_name: str | None = None) -> dict:
    """Devuelve segmentos con marcas temporales reales. No inventa texto."""
    with _lock:
        model = _load(model_name)
        segments_iter, info = model.transcribe(
            wav_path,
            language=language,
            beam_size=settings.beam_size,
            vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 400},
            condition_on_previous_text=False,
        )
        segments = [
            {
                "start": float(seg.start),
                "end": float(seg.end),
                "text": (seg.text or "").strip(),
                "avg_logprob": float(getattr(seg, "avg_logprob", 0.0) or 0.0),
                "no_speech_prob": float(getattr(seg, "no_speech_prob", 0.0) or 0.0),
            }
            for seg in segments_iter
        ]

    # Descartar segmentos que el propio modelo considera ruido
    cleaned = [s for s in segments if s["text"] and s["no_speech_prob"] < 0.75]
    return {
        "language": getattr(info, "language", language),
        "language_probability": float(getattr(info, "language_probability", 0.0) or 0.0),
        "duration": float(getattr(info, "duration", 0.0) or 0.0),
        "segments": cleaned,
        "model": _model_name,
    }


def unload() -> None:
    global _model, _model_name
    with _lock:
        _model = None
        _model_name = None
        gc.collect()
