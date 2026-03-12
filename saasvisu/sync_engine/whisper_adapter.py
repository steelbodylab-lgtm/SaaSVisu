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


def transcribe_to_words(
    audio_path: str | Path,
    model_name: str = "base",
    language: str | None = "fr",
) -> list[dict[str, Any]]:
    """
    Transcrit l'audio et retourne une liste de **mots** avec timestamps
    (mot par mot pour affichage dynamique).
    On utilise d'abord la transcription normale (sans word_timestamps, plus fiable),
    puis on découpe chaque segment en mots et on répartit le temps.

    :return: liste de {"start_time_ms", "end_time_ms", "text"} (text = un mot), triée par temps
    """
    import whisper

    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Fichier audio introuvable: {audio_path}")

    model = whisper.load_model(model_name)
    audio = whisper.load_audio(str(audio_path))
    opts = {"language": language} if language else {}
    # Ne pas utiliser word_timestamps : pas supporté partout et peut planter sur base/small
    result = model.transcribe(audio, **opts)

    words = []
    for s in result.get("segments", []):
        seg_start_ms = int(round(float(s.get("start", 0)) * 1000))
        seg_end_ms = int(round(float(s.get("end", 0)) * 1000))
        seg_text = (s.get("text") or "").strip()
        if not seg_text:
            continue
        parts = [p for p in seg_text.split() if p]
        if not parts:
            continue
        step = (seg_end_ms - seg_start_ms) / len(parts)
        for i, part in enumerate(parts):
            w_start = seg_start_ms + int(i * step)
            w_end = seg_start_ms + int((i + 1) * step) if i < len(parts) - 1 else seg_end_ms
            words.append({
                "start_time_ms": w_start,
                "end_time_ms": w_end,
                "text": part,
            })
    return words
