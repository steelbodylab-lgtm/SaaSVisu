"""
Adaptateur Whisper : transcription de l'audio avec timestamps (segments ou mots).
Utilisé pour aligner les paroles sur la voix et pour la détection automatique.
"""
from pathlib import Path
from typing import Any


def transcribe_to_segments(
    audio_path: str | Path,
    model_name: str = "base",
    language: str | None = "fr",
) -> list[dict[str, Any]]:
    """
    Transcrit l'audio avec Whisper et retourne une liste de segments
    avec start_time_ms, end_time_ms et text.

    :param audio_path: chemin vers le fichier audio (MP3, WAV, etc.)
    :param model_name: modèle Whisper ("tiny", "base", "small", "medium", "large")
    :param language: code langue (ex. "fr", "en") ou None pour détection auto
    :return: liste de {"start_time_ms", "end_time_ms", "text"}
    """
    import whisper

    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Fichier audio introuvable: {audio_path}")

    model = whisper.load_model(model_name)
    audio = whisper.load_audio(str(audio_path))
    opts = {"language": language} if language else {}
    result = model.transcribe(audio, **opts)

    segments = []
    for s in result.get("segments", []):
        start_s = float(s.get("start", 0))
        end_s = float(s.get("end", 0))
        text = (s.get("text") or "").strip()
        if not text:
            continue
        segments.append({
            "start_time_ms": int(round(start_s * 1000)),
            "end_time_ms": int(round(end_s * 1000)),
            "text": text,
        })
    return segments


def _words_from_segment_proportional(
    seg_start_ms: int, seg_end_ms: int, parts: list[str]
) -> list[dict[str, Any]]:
    """Répartit le temps du segment entre les mots proportionnellement à leur longueur."""
    if not parts:
        return []
    total_chars = max(sum(len(p) for p in parts), 1)
    duration_ms = seg_end_ms - seg_start_ms
    words = []
    t_ms = float(seg_start_ms)
    for i, part in enumerate(parts):
        w_start = int(t_ms)
        ratio = len(part) / total_chars
        t_ms += ratio * duration_ms
        w_end = seg_end_ms if i == len(parts) - 1 else int(t_ms)
        words.append({
            "start_time_ms": w_start,
            "end_time_ms": w_end,
            "text": part,
        })
    return words


def transcribe_to_words(
    audio_path: str | Path,
    model_name: str = "base",
    language: str | None = "fr",
) -> list[dict[str, Any]]:
    """
    Transcrit l'audio et retourne une liste de **mots** avec timestamps (mot par mot).
    Si le modèle supporte word_timestamps (medium, large, large-v3), on les utilise.
    Sinon on répartit le temps de chaque segment proportionnellement à la longueur des mots.
    Les pauses entre segments Whisper sont conservées (pas de mot affiché pendant le silence).
    """
    import whisper

    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Fichier audio introuvable: {audio_path}")

    model = whisper.load_model(model_name)
    audio = whisper.load_audio(str(audio_path))
    opts = {"language": language} if language else {}
    # Word-level timestamps uniquement pour medium/large (évite crash sur base/small)
    use_word_ts = model_name in ("medium", "large", "large-v2", "large-v3")
    if use_word_ts:
        try:
            opts["word_timestamps"] = True
        except Exception:
            use_word_ts = False
    result = model.transcribe(audio, **opts)

    words = []
    for s in result.get("segments", []):
        seg_start_ms = int(round(float(s.get("start", 0)) * 1000))
        seg_end_ms = int(round(float(s.get("end", 0)) * 1000))
        seg_text = (s.get("text") or "").strip()
        if not seg_text:
            continue

        # Utiliser les timestamps par mot si disponibles (medium/large)
        seg_words = s.get("words") if use_word_ts else None
        if seg_words and isinstance(seg_words, list):
            for w in seg_words:
                w_text = (w.get("word") or "").strip()
                if not w_text:
                    continue
                w_start = int(round(float(w.get("start", 0)) * 1000))
                w_end = int(round(float(w.get("end", 0)) * 1000))
                words.append({
                    "start_time_ms": w_start,
                    "end_time_ms": w_end,
                    "text": w_text,
                })
        else:
            parts = [p for p in seg_text.split() if p]
            words.extend(_words_from_segment_proportional(seg_start_ms, seg_end_ms, parts))

    return words
