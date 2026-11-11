"""Utilidades de audio compartidas (ffmpeg + lectura de pistas)."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

from .config import settings


class AudioError(RuntimeError):
    pass


def ffmpeg_available() -> bool:
    return shutil.which(settings.ffmpeg) is not None


def extract_wav(source: str | Path, target: str | Path, *, sample_rate: int = 16000, mono: bool = True) -> Path:
    """Extrae audio PCM 16 bits. Whisper y pyannote esperan 16 kHz mono."""
    source = Path(source)
    target = Path(target)
    if not source.exists():
        raise AudioError(f"No existe el archivo: {source}")
    target.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        settings.ffmpeg, "-y", "-hide_banner", "-loglevel", "error", "-nostdin",
        "-i", str(source), "-vn", "-ac", "1" if mono else "2",
        "-ar", str(sample_rate), "-acodec", "pcm_s16le", str(target),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0 or not target.exists():
        raise AudioError(f"ffmpeg no pudo extraer el audio: {result.stderr.strip()[:400]}")
    return target


def probe_duration(path: str | Path) -> float:
    cmd = [
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=nw=1:nk=1", str(path),
    ]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        return float(out.stdout.strip() or 0)
    except (ValueError, subprocess.SubprocessError):
        return 0.0
