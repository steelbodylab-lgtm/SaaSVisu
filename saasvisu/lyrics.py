"""
Gestion des paroles : texte brut -> lignes avec IDs pour la synchro.
"""
from pathlib import Path
import json
import uuid
from typing import Any


def lines_from_text(text: str) -> list[dict[str, Any]]:
    """
    Découpe le texte en lignes et attribue un ID unique à chaque ligne.
    Retourne une liste de {"id": "...", "text": "..."}.
    """
    lines = [line.strip() for line in text.strip().splitlines() if line.strip()]
    return [{"id": str(uuid.uuid4()), "text": line} for line in lines]


def load_lyrics_json(path: str | Path) -> list[dict[str, Any]]:
    """Charge un fichier lyrics au format JSON (liste de {id, text})."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("Le fichier lyrics doit contenir une liste de lignes")
    return data


def save_lyrics_json(path: str | Path, lines: list[dict[str, Any]]) -> None:
    """Sauvegarde les lignes de paroles en JSON."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(lines, f, ensure_ascii=False, indent=2)
