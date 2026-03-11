"""
Alignement des lignes de paroles avec des segments temporels.
Pour l'instant : répartition uniforme ou chargement depuis un sync.json existant.
L'intégration Whisper viendra dans Phase 2.
"""
import json
from pathlib import Path
from typing import Any


def align_lyrics_to_segments(
    lines: list[dict[str, Any]], duration_seconds: float
) -> list[dict[str, Any]]:
    """
    Répartit les lignes uniformément sur la durée de l'audio.
    Chaque entrée aura start_time_ms et end_time_ms.
    """
    if not lines:
        return []
    step = duration_seconds / len(lines)
    result = []
    for i, line in enumerate(lines):
        start = i * step
        end = (i + 1) * step
        result.append({
            **line,
            "start_time_ms": int(start * 1000),
            "end_time_ms": int(end * 1000),
        })
    return result


def load_sync_json(path: str | Path) -> list[dict[str, Any]]:
    """Charge un fichier sync.json (lignes avec start_time_ms, end_time_ms)."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("sync.json doit contenir une liste de segments")
    return data


def save_sync_json(path: str | Path, segments: list[dict[str, Any]]) -> None:
    """Sauvegarde les segments synchronisés en JSON."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(segments, f, ensure_ascii=False, indent=2)
