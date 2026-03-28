"""
Importe des polices (.ttf/.otf) vers saasvisu/fonts/ et static/fonts/, et met à jour manifest.json.

Usage :
  Réécrit tout depuis un dossier dézippé :
    python scripts/import_bundled_fonts.py scripts/_font_import_tmp

  Fusion : ajoute seulement les nouvelles familles (pas de doublon, familles bannies ignorées) :
    python scripts/import_bundled_fonts.py scripts/_font_import_tmp --merge
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BUNDLED_DIR = PROJECT_ROOT / "saasvisu" / "fonts"
STATIC_DIR = PROJECT_ROOT / "static" / "fonts"

# Ne jamais réintégrer (demande utilisateur).
FAMILIES_EXCLUDED: frozenset[str] = frozenset(
    {
        "Retro",
        "RAINED PERSONAL USE",
        "Flame on!",
        "Flame on Black",
    }
)


def _family_key(name: str) -> str:
    return name.strip().casefold()


def _family_name(path: Path) -> str:
    font = TTFont(path)
    try:
        name = None
        for rec in font["name"].names:
            if rec.nameID == 16 and rec.isUnicode():
                name = rec.toUnicode()
                break
        if not name:
            for rec in font["name"].names:
                if rec.nameID == 1 and rec.isUnicode():
                    name = rec.toUnicode()
                    break
        if not name:
            for rec in font["name"].names:
                if rec.nameID == 4:
                    try:
                        name = rec.toUnicode()
                    except Exception:
                        pass
                    break
        return (name or path.stem).strip()
    finally:
        font.close()


def _slug(filename_base: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]+", "_", filename_base).strip("_").lower()
    return s or "font"


def _pick_font_files(root: Path) -> list[Path]:
    """
    Un fichier par (dossier, famille). Préfère .otf si la même famille existe en ttf+otf.
    """
    from collections import defaultdict

    candidates = [
        p
        for p in sorted(root.rglob("*"))
        if p.is_file() and p.suffix.lower() in (".ttf", ".otf")
    ]
    groups: dict[tuple[Path, str], list[Path]] = defaultdict(list)
    for p in candidates:
        groups[(p.parent, _family_name(p))].append(p)
    chosen: list[Path] = []
    for (_, _fam), files in sorted(groups.items(), key=lambda x: (str(x[0][0]), x[0][1].lower())):
        otfs = [f for f in files if f.suffix.lower() == ".otf"]
        ttfs = [f for f in files if f.suffix.lower() == ".ttf"]
        if otfs:
            chosen.append(sorted(otfs, key=lambda x: x.name.lower())[0])
        else:
            chosen.append(sorted(ttfs, key=lambda x: x.name.lower())[0])
    return chosen


def import_from_tree(source_root: Path) -> list[dict[str, str]]:
    """Remplace tout le bundle par le contenu de source_root."""
    BUNDLED_DIR.mkdir(parents=True, exist_ok=True)
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    for d in (BUNDLED_DIR, STATIC_DIR):
        for old in d.glob("*"):
            if old.name == ".gitkeep":
                continue
            if old.is_file():
                old.unlink()
            elif old.is_dir():
                shutil.rmtree(old)
    records: list[dict[str, str]] = []
    used_slugs: set[str] = set()
    banned = {_family_key(x) for x in FAMILIES_EXCLUDED}
    for src in _pick_font_files(source_root):
        family = _family_name(src)
        if _family_key(family) in banned:
            continue
        ext = src.suffix.lower()
        base_slug = _slug(family)
        slug = base_slug
        n = 2
        while slug in used_slugs:
            slug = f"{base_slug}_{n}"
            n += 1
        used_slugs.add(slug)
        dest_name = f"{slug}{ext}"
        shutil.copy2(src, BUNDLED_DIR / dest_name)
        shutil.copy2(src, STATIC_DIR / dest_name)
        records.append({"family": family, "file": dest_name})
    manifest_path = BUNDLED_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    return records


def merge_from_tree(source_root: Path) -> tuple[list[dict[str, str]], int]:
    """
    Garde le manifest et les fichiers existants ; ajoute uniquement les familles nouvelles
    (hors exclusions et hors familles déjà présentes).
    """
    BUNDLED_DIR.mkdir(parents=True, exist_ok=True)
    STATIC_DIR.mkdir(parents=True, exist_ok=True)
    manifest_path = BUNDLED_DIR / "manifest.json"
    existing: list[dict[str, str]] = []
    if manifest_path.exists():
        try:
            data = json.loads(manifest_path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                existing = [r for r in data if isinstance(r, dict) and r.get("family") and r.get("file")]
        except (json.JSONDecodeError, OSError):
            pass

    banned = {_family_key(x) for x in FAMILIES_EXCLUDED}
    existing_keys = {_family_key(r["family"]) for r in existing}
    used_slugs: set[str] = {Path(r["file"]).stem for r in existing}

    added = 0
    for src in _pick_font_files(source_root):
        family = _family_name(src)
        fk = _family_key(family)
        if fk in banned:
            print(f"Exclue (liste noire) : {family}")
            continue
        if fk in existing_keys:
            print(f"Ignorée (déjà dans le produit) : {family}")
            continue
        ext = src.suffix.lower()
        base_slug = _slug(family)
        slug = base_slug
        n = 2
        while slug in used_slugs:
            slug = f"{base_slug}_{n}"
            n += 1
        used_slugs.add(slug)
        dest_name = f"{slug}{ext}"
        shutil.copy2(src, BUNDLED_DIR / dest_name)
        shutil.copy2(src, STATIC_DIR / dest_name)
        existing.append({"family": family, "file": dest_name})
        existing_keys.add(fk)
        added += 1
        print(f"Ajoutée : {family} -> {dest_name}")

    manifest_path.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
    return existing, added


def main() -> None:
    argv = [a for a in sys.argv[1:] if a.strip()]
    merge = "--merge" in argv
    argv = [a for a in argv if a != "--merge"]
    src = Path(argv[0]).resolve() if argv else (PROJECT_ROOT / "scripts" / "_font_import_tmp")
    if not src.is_dir():
        print(f"Dossier introuvable : {src}", file=sys.stderr)
        sys.exit(1)
    if merge:
        recs, n = merge_from_tree(src)
        print(f"Manifest : {len(recs)} polices bundle (+{n} nouvelle(s)).")
    else:
        recs = import_from_tree(src)
        print(f"Import complet : {len(recs)} polices.")


if __name__ == "__main__":
    main()
