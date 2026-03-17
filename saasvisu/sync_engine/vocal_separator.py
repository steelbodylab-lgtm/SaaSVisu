"""
Séparation vocale via Demucs (Meta).
Isole les voix de la musique pour améliorer la transcription.
"""
from pathlib import Path
import subprocess
import tempfile
import shutil


def separate_vocals(audio_path: str | Path, output_dir: str | Path | None = None) -> Path:
    """
    Sépare les voix de la musique avec Demucs.
    Retourne le chemin vers le fichier vocals.wav isolé.
    """
    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Fichier audio introuvable: {audio_path}")

    if output_dir is None:
        output_dir = audio_path.parent / "_demucs"
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    vocals_path = output_dir / "vocals.wav"
    if vocals_path.exists():
        print("[Demucs] Voix déjà séparées, réutilisation du cache.", flush=True)
        return vocals_path

    print("[Demucs] Séparation des voix en cours (peut prendre 30-60 s)…", flush=True)

    with tempfile.TemporaryDirectory() as tmp_dir:
        cmd = [
            "python", "-m", "demucs",
            "--two-stems", "vocals",
            "-n", "htdemucs",
            "-o", tmp_dir,
            str(audio_path),
        ]
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=600,
            )
        except FileNotFoundError:
            raise RuntimeError(
                "Demucs introuvable. Exécutez : pip install demucs"
            ) from None
        except subprocess.TimeoutExpired:
            raise RuntimeError("Demucs : séparation trop longue (timeout 10 min).")

        if result.returncode != 0:
            raise RuntimeError(f"Demucs erreur (code {result.returncode}): {result.stderr[:500]}")

        stem_name = audio_path.stem
        candidates = list(Path(tmp_dir).rglob("vocals.*"))
        if not candidates:
            candidates = list(Path(tmp_dir).rglob(f"*/{stem_name}/vocals.*"))
        if not candidates:
            raise RuntimeError(f"Demucs n'a pas produit de fichier vocals. Contenu: {list(Path(tmp_dir).rglob('*'))}")

        shutil.copy2(str(candidates[0]), str(vocals_path))

    print(f"[Demucs] Voix isolées → {vocals_path}", flush=True)
    return vocals_path


def is_available() -> bool:
    """True si Demucs est installé."""
    try:
        import demucs  # noqa: F401
        return True
    except ImportError:
        return False
