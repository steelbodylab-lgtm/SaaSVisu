"""
Extracteur de timestamps mot par mot via faster-whisper (CTranslate2).
4x plus rapide que openai-whisper, mêmes modèles, timestamps natifs.
Utilisé en interne uniquement pour caler les paroles HeartMuLa sur l'audio.
"""
from pathlib import Path
from typing import Any


_model_cache: dict[str, Any] = {}


def _get_model(model_name: str = "large-v3"):
    if model_name in _model_cache:
        return _model_cache[model_name]
    from faster_whisper import WhisperModel
    model = WhisperModel(
        model_name,
        device="cuda" if _cuda_available() else "cpu",
        compute_type="float16" if _cuda_available() else "int8",
    )
    _model_cache[model_name] = model
    return model


def _cuda_available() -> bool:
    try:
        import torch
        return torch.cuda.is_available()
    except ImportError:
        return False


def extract_word_timestamps(
    audio_path: str | Path,
    model_name: str = "large-v3",
    language: str = "fr",
) -> list[dict[str, Any]]:
    """
    Transcrit l'audio avec faster-whisper et retourne les mots avec timestamps précis.
    Retourne : [{"text": "mot", "start_time_ms": 1234, "end_time_ms": 1567}, ...]
    """
    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Fichier audio introuvable: {audio_path}")

    print(f"[faster-whisper] Chargement modèle {model_name}…", flush=True)
    model = _get_model(model_name)

    print(f"[faster-whisper] Extraction timestamps ({model_name}, {language})…", flush=True)
    segments, info = model.transcribe(
        str(audio_path),
        language=language,
        word_timestamps=True,
        beam_size=5,
        vad_filter=True,
    )

    words = []
    for segment in segments:
        if not segment.words:
            text = (segment.text or "").strip()
            if not text:
                continue
            parts = text.split()
            seg_start = int(round(segment.start * 1000))
            seg_end = int(round(segment.end * 1000))
            total_chars = max(sum(len(p) for p in parts), 1)
            t = float(seg_start)
            dur = seg_end - seg_start
            for j, p in enumerate(parts):
                w_start = int(t)
                t += (len(p) / total_chars) * dur
                w_end = int(t) if j < len(parts) - 1 else seg_end
                words.append({"text": p, "start_time_ms": w_start, "end_time_ms": w_end})
            continue

        for w in segment.words:
            text = (w.word or "").strip()
            if not text:
                continue
            words.append({
                "text": text,
                "start_time_ms": int(round(w.start * 1000)),
                "end_time_ms": int(round(w.end * 1000)),
            })

    print(f"[faster-whisper] {len(words)} mots extraits avec timestamps.", flush=True)
    return words


def is_available() -> bool:
    """True si faster-whisper est installé."""
    try:
        import faster_whisper  # noqa: F401
        return True
    except ImportError:
        return False
