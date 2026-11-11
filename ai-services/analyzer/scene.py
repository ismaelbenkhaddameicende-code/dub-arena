"""Fusion transcripcion + diarizacion -> informe de escena revisable."""
from __future__ import annotations

from collections import Counter


def assign_speakers(segments: list[dict], turns: list[dict] | None) -> tuple[list[dict], list[str]]:
    warnings: list[str] = []

    if not turns:
        warnings.append(
            "Diarizacion no disponible: todas las intervenciones se han agrupado en SPEAKER_00. "
            "Puedes separar y renombrar personajes en el revisor de escena."
        )
        return (
            [{**seg, "speaker": "SPEAKER_00"} for seg in segments],
            warnings,
        )

    labeled: list[dict] = []
    for seg in segments:
        middle = (seg["start"] + seg["end"]) / 2
        overlaps: Counter[str] = Counter()
        for turn in turns:
            overlap = min(seg["end"], turn["end"]) - max(seg["start"], turn["start"])
            if overlap > 0:
                overlaps[turn["speaker"]] += overlap
        if overlaps:
            speaker = overlaps.most_common(1)[0][0]
        else:
            # Sin solape: usa la voz activa en el punto medio, o la mas cercana
            active = [t for t in turns if t["start"] <= middle <= t["end"]]
            if active:
                speaker = active[0]["speaker"]
            else:
                nearest = min(turns, key=lambda t: min(abs(t["start"] - middle), abs(t["end"] - middle)))
                speaker = nearest["speaker"]
        labeled.append({**seg, "speaker": speaker})

    speakers = sorted({s["speaker"] for s in labeled})
    warnings.append(
        f"Deteccion de voces: {len(speakers)} identidades acusticas distintas ({', '.join(speakers)}). "
        "Los nombres de personaje son propuestas: confirmalos antes de doblar."
    )
    return labeled, warnings


def build_report(segments: list[dict], turns: list[dict] | None) -> dict:
    labeled, warnings = assign_speakers(segments, turns)

    # Orden de aparicion y estadisticas por voz
    order: list[str] = []
    stats: dict[str, dict] = {}
    for seg in sorted(labeled, key=lambda s: s["start"]):
        speaker = seg["speaker"]
        if speaker not in stats:
            order.append(speaker)
            stats[speaker] = {"first": seg["start"], "count": 0, "total": 0.0}
        stats[speaker]["count"] += 1
        stats[speaker]["total"] += max(0.0, seg["end"] - seg["start"])

    # Solapamientos reales entre voces distintas
    overlaps: list[dict] = []
    for i, a in enumerate(labeled):
        for b in labeled[i + 1:]:
            if b["start"] >= a["end"]:
                break
            if b["speaker"] != a["speaker"]:
                overlaps.append({
                    "speaker_a": a["speaker"], "speaker_b": b["speaker"],
                    "start": round(max(a["start"], b["start"]), 2),
                    "end": round(min(a["end"], b["end"]), 2),
                })

    characters = [
        {
            "speaker": speaker,
            "first_appearance": round(stats[speaker]["first"], 2),
            "intervention_count": stats[speaker]["count"],
            "speaking_time": round(stats[speaker]["total"], 2),
        }
        for speaker in order
    ]

    if overlaps:
        warnings.append(
            f"Se han detectado {len(overlaps)} solapamientos entre personajes distintos: "
            "necesitaras un participante por voz."
        )

    return {
        "characters": characters,
        "interventions": [
            {
                "speaker": seg["speaker"],
                "start": round(seg["start"], 2),
                "end": round(seg["end"], 2),
                "text": seg["text"],
            }
            for seg in sorted(labeled, key=lambda s: s["start"])
        ],
        "overlaps": overlaps,
        "warnings": warnings,
    }
