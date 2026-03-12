"""
Alignement des lignes de paroles avec des segments temporels.
- Répartition uniforme (sans Whisper).
- Avec Whisper : alignement sur les segments de transcription (voix réelle).
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


def align_lyrics_with_whisper(
    user_lines: list[dict[str, Any]],
    whisper_segments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Assigne à chaque ligne de paroles utilisateur un créneau horaire
    en regroupant les segments Whisper (par ordre).
    On garde le texte des paroles utilisateur (pas celui de Whisper).

    :param user_lines: liste de {"id", "text"} (paroles saisies)
    :param whisper_segments: liste de {"start_time_ms", "end_time_ms", "text"} (sortie Whisper)
    :return: liste de segments au format sync.json (start_time_ms, end_time_ms, text, id)
    """
    if not user_lines:
        return []
    if not whisper_segments:
        # Pas de segments Whisper : fallback sur un seul bloc par ligne (0 à 0)
        return [{**line, "start_time_ms": 0, "end_time_ms": 0} for line in user_lines]

    n_lines = len(user_lines)
    n_seg = len(whisper_segments)
    result = []
    for i, line in enumerate(user_lines):
        start_idx = (i * n_seg) // n_lines
        end_idx = ((i + 1) * n_seg) // n_lines
        if end_idx <= start_idx:
            end_idx = start_idx + 1
        end_idx = min(end_idx, n_seg)
        first = whisper_segments[start_idx]
        last = whisper_segments[end_idx - 1]
        result.append({
            **line,
            "start_time_ms": first["start_time_ms"],
            "end_time_ms": last["end_time_ms"],
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
