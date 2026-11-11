"""Separacion voz/instrumental con Demucs (opcional y pesado en CPU).

Se ejecuta como subproceso aislado: si Demucs consume demasiada memoria el
proceso principal del servicio sigue vivo. Nunca se lanza en paralelo con otro
trabajo pesado (lo controla el semaforo de main.py).
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


def available() -> bool:
    try:
        import demucs  # noqa: F401
        return True
    except Exception:
        return shutil.which("demucs") is not None


def separate(source: str | Path, output_dir: str | Path, *, model: str = "htdemucs", timeout: int = 3600) -> dict:
    source = Path(source)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        sys.executable, "-m", "demucs.separate",
        "-n", model,
        "--two-stems", "vocals",
        "-o", str(output_dir),
        str(source),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(f"Demucs fallo: {result.stderr.strip()[-500:]}")

    stem_dir = output_dir / model / source.stem
    instrumental = stem_dir / "no_vocals.wav"
    vocals = stem_dir / "vocals.wav"
    if not instrumental.exists():
        raise RuntimeError("Demucs no genero la pista instrumental")

    return {
        "instrumental_path": str(instrumental),
        "vocals_path": str(vocals) if vocals.exists() else None,
        "model": model,
    }
