"""
Polices livrées avec le projet (saasvisu/fonts/) pour FFmpeg/libass et la preview web.
Le fichier manifest.json est généré par scripts/import_bundled_fonts.py.
"""
from __future__ import annotations

import json
from pathlib import Path

_RENDER_ENGINE = Path(__file__).resolve().parent
_PROJECT_ROOT = _RENDER_ENGINE.parent.parent
BUNDLED_FONTS_DIR = _PROJECT_ROOT / "saasvisu" / "fonts"
MANIFEST_PATH = BUNDLED_FONTS_DIR / "manifest.json"


def load_bundled_font_records() -> list[dict[str, str]]:
    if not MANIFEST_PATH.exists():
        return []
    try:
        data = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []
    if not isinstance(data, list):
        return []
    return [r for r in data if isinstance(r, dict) and r.get("family") and r.get("file")]


def bundled_family_names() -> list[str]:
    return [r["family"] for r in load_bundled_font_records()]


def bundled_fontsdir_for_ffmpeg() -> str | None:
    """Chemin absolu du dossier des .ttf/.otf pour l’option fontsdir du filtre ass (FFmpeg)."""
    if not BUNDLED_FONTS_DIR.is_dir():
        return None
    if not load_bundled_font_records():
        return None
    return str(BUNDLED_FONTS_DIR.resolve())


def escape_fontsdir_for_ffmpeg_filter(path_str: str) -> str:
    """Échappe lecteur Windows, espaces et quotes pour filtergraph FFmpeg."""
    p = path_str.replace("\\", "/")
    if len(p) > 1 and p[1] == ":":
        p = p[0] + "\\:" + p[2:]
    p = p.replace(" ", r"\ ")
    return p.replace("'", r"\'")


def ass_filter_segment(ass_filename: str) -> str:
    """Un segment `ass='fichier':fontsdir='...'` ou `ass='fichier'` si pas de polices bundle."""
    fd = bundled_fontsdir_for_ffmpeg()
    if fd:
        esc = escape_fontsdir_for_ffmpeg_filter(fd)
        return f"ass='{ass_filename}':fontsdir='{esc}'"
    return f"ass='{ass_filename}'"


def font_files_for_static() -> dict[str, str]:
    """famille -> URL sous /static/fonts/ pour @font-face côté navigateur."""
    out: dict[str, str] = {}
    for r in load_bundled_font_records():
        out[r["family"]] = f"/static/fonts/{r['file']}"
    return out


def merge_font_lists(system_fonts: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for f in system_fonts + bundled_family_names():
        if f not in seen:
            seen.add(f)
            out.append(f)
    return out
