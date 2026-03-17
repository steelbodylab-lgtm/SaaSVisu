"""
Transcription + timestamps mot par mot via AssemblyAI Universal-3 Pro (cloud).
Meilleur moteur du marché : reconnaissance + calage précis en 1 appel.
Optionnel : séparation vocale Demucs avant envoi pour maximiser la précision.
Requis : ASSEMBLYAI_API_KEY dans .env
"""
from pathlib import Path
from typing import Any


def extract_word_timestamps(
    audio_path: str | Path,
    api_key: str,
    *,
    language_code: str = "fr",
    use_demucs: bool = True,
) -> list[dict[str, Any]]:
    """
    Envoie l'audio à AssemblyAI Universal-3 Pro et retourne les mots avec timestamps (ms).
    Si use_demucs=True et Demucs est disponible, sépare les voix avant envoi.
    Retourne : [{"text": "mot", "start_time_ms": 1234, "end_time_ms": 1567}, ...]
    """
    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Fichier audio introuvable: {audio_path}")

    try:
        import assemblyai as aai
    except ImportError:
        raise ImportError(
            "AssemblyAI SDK requis. Exécutez : pip install assemblyai"
        ) from None

    aai.settings.api_key = api_key.strip()

    def _transcribe(audio_file: Path) -> list[dict[str, Any]]:
        config = aai.TranscriptionConfig(
            language_code=language_code,
            speech_models=["universal-3-pro", "universal-2"],
        )
        transcriber = aai.Transcriber(config=config)
        transcript = transcriber.transcribe(str(audio_file))
        if transcript.status == aai.TranscriptStatus.error:
            err = getattr(transcript, "error", None) or "erreur inconnue"
            raise RuntimeError(f"AssemblyAI : {err}")
        words = []
        if hasattr(transcript, "words") and transcript.words:
            for w in transcript.words:
                text = (getattr(w, "text", "") or "").strip()
                if not text:
                    continue
                start_ms = int(getattr(w, "start", 0) or 0)
                end_ms = int(getattr(w, "end", start_ms + 100) or start_ms + 100)
                words.append({
                    "text": text,
                    "start_time_ms": start_ms,
                    "end_time_ms": end_ms,
                })
        return words

    target_audio = audio_path
    if use_demucs:
        try:
            from saasvisu.sync_engine.vocal_separator import separate_vocals, is_available as demucs_ok
            if demucs_ok():
                target_audio = separate_vocals(audio_path)
            else:
                print("[AssemblyAI] Demucs non installé, envoi de l'audio brut.", flush=True)
        except Exception as e:
            print(f"[AssemblyAI] Demucs échec ({e}), envoi de l'audio brut.", flush=True)

    print("[AssemblyAI] Envoi à Universal-3 Pro (transcription + calage mot à mot)…", flush=True)
    try:
        words = _transcribe(target_audio)
    except Exception as e:
        err_msg = str(e).lower()
        if "401" in str(e) or "unauthorized" in err_msg:
            raise RuntimeError("AssemblyAI : clé API invalide (401).") from e
        if "429" in str(e) or "rate" in err_msg or "quota" in err_msg:
            raise RuntimeError("AssemblyAI : quota dépassé (429).") from e
        raise RuntimeError(f"AssemblyAI error: {e}") from e

    if not words and target_audio != audio_path:
        print("[AssemblyAI] Aucun mot avec voix séparées, nouvel essai avec l'audio brut…", flush=True)
        try:
            words = _transcribe(audio_path)
        except Exception:
            pass

    print(f"[AssemblyAI] {len(words)} mots extraits.", flush=True)
    return words


def is_available() -> bool:
    """True si le SDK AssemblyAI est installé."""
    try:
        import assemblyai  # noqa: F401
        return True
    except ImportError:
        return False
