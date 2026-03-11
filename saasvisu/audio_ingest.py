"""
Module d'import et validation des fichiers audio (MP3, WAV, etc.).
"""
from pathlib import Path
from typing import Optional

# Formats supportés en V1
SUPPORTED_EXTENSIONS = {".mp3", ".wav", ".m4a"}


def get_duration_seconds(path: Path) -> float:
    """Retourne la durée du fichier audio en secondes (via pydub)."""
    try:
        from pydub import AudioSegment
    except ImportError:
        raise RuntimeError("pydub requis: pip install pydub")
    audio = AudioSegment.from_file(str(path))
    return len(audio) / 1000.0


def validate_audio_file(path: str | Path) -> tuple[bool, Optional[str]]:
    """
    Vérifie que le fichier existe et a une extension supportée.
    Retourne (True, None) si OK, (False, message_erreur) sinon.
    """
    p = Path(path)
    if not p.exists():
        return False, "Fichier introuvable"
    if p.suffix.lower() not in SUPPORTED_EXTENSIONS:
        return False, f"Format non supporté. Utiliser: {', '.join(SUPPORTED_EXTENSIONS)}"
    return True, None


def get_metadata(path: str | Path) -> dict:
    """Retourne durée (s) et extension du fichier audio."""
    p = Path(path)
    ok, err = validate_audio_file(p)
    if not ok:
        raise ValueError(err)
    duration = get_duration_seconds(p)
    return {"path": str(p.resolve()), "duration_seconds": duration, "extension": p.suffix.lower()}
