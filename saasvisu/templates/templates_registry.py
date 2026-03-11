"""
Registre des templates : chargement des JSON de style.
"""
import json
from pathlib import Path
from typing import Any

# Dossier des templates intégrés (à côté de ce fichier)
BUILTIN_DIR = Path(__file__).parent / "builtin"


def list_templates() -> list[str]:
    """Liste les noms des templates disponibles (sans .json)."""
    if not BUILTIN_DIR.exists():
        return []
    return [f.stem for f in BUILTIN_DIR.glob("*.json")]


def get_template_path(name: str) -> Path:
    """Retourne le chemin du fichier template (builtin ou absolu)."""
    p = BUILTIN_DIR / f"{name}.json"
    if p.exists():
        return p
    # Permettre un chemin absolu
    p_abs = Path(name)
    if p_abs.exists():
        return p_abs
    raise FileNotFoundError(f"Template inconnu: {name}")


def load_template(name: str) -> dict[str, Any]:
    """Charge le contenu JSON d'un template."""
    path = get_template_path(name)
    with open(path, encoding="utf-8") as f:
        return json.load(f)
