"""
Extracteur de timestamps mot par mot via l'API Deepgram (cloud).
Rapide, précis, utilisé en interne pour caler les paroles HeartMuLa sur l'audio.
Requis : DEEPGRAM_API_KEY dans .env
"""
from pathlib import Path
from typing import Any


def extract_word_timestamps(
    audio_path: str | Path,
    api_key: str,
    *,
    model: str = "nova-2",
    language: str = "fr",
) -> list[dict[str, Any]]:
    """
    Envoie l'audio à Deepgram et retourne les mots avec timestamps précis.
    Retourne : [{"text": "mot", "start_time_ms": 1234, "end_time_ms": 1567}, ...]
    """
    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Fichier audio introuvable: {audio_path}")

    try:
        from deepgram import DeepgramClient
    except ImportError:
        raise ImportError(
            "Deepgram SDK requis. Exécutez : pip install deepgram-sdk"
        ) from None

    # Deepgram gère mieux le PCM 16-bit 16 kHz que le MP3 brut → conversion systématique
    from pydub import AudioSegment
    seg = AudioSegment.from_file(str(audio_path))
    seg = seg.set_frame_rate(16000).set_channels(1).set_sample_width(2)
    import io
    buf = io.BytesIO()
    seg.export(buf, format="s16le")
    audio_bytes = buf.getvalue()

    print("[Deepgram] Envoi de l'audio (PCM 16 kHz) pour extraction des timestamps…", flush=True)

    client = DeepgramClient(api_key=api_key.strip())

    try:
        response = client.listen.v1.media.transcribe_file(
            request=audio_bytes,
            model=model,
            language=language,
            smart_format=True,
            encoding="linear16",
        )
    except Exception as e:
        err_msg = str(e)
        if "401" in err_msg or "Unauthorized" in err_msg:
            raise RuntimeError("Deepgram : clé API invalide ou expirée (401).") from e
        if "429" in err_msg:
            raise RuntimeError("Deepgram : quota dépassé (429).") from e
        raise RuntimeError(f"Deepgram API error: {err_msg}") from e

    # SDK v6 : response.results.channels[0].alternatives[0].words
    words_data: list[Any] = []
    if hasattr(response, "results") and response.results and response.results.channels:
        ch = response.results.channels[0]
        if ch.alternatives:
            alt = ch.alternatives[0]
            w_list = getattr(alt, "words", None)
            if w_list is not None:
                words_data = list(w_list) if not isinstance(w_list, list) else w_list

    words = []
    for w in words_data:
        if hasattr(w, "word"):
            text = (getattr(w, "word", "") or "").strip()
            start_s = float(getattr(w, "start", 0) or 0)
            end_s = float(getattr(w, "end", start_s + 0.1) or start_s + 0.1)
        else:
            text = (w.get("word") if isinstance(w, dict) else "") or ""
            text = text.strip()
            start_s = float((w.get("start") if isinstance(w, dict) else 0) or 0)
            end_s = float((w.get("end") if isinstance(w, dict) else start_s + 0.1) or start_s + 0.1)
        if not text:
            continue
        words.append({
            "text": text,
            "start_time_ms": int(round(start_s * 1000)),
            "end_time_ms": int(round(end_s * 1000)),
        })

    print(f"[Deepgram] {len(words)} mots extraits avec timestamps.", flush=True)
    return words


def is_available() -> bool:
    """True si le SDK Deepgram est installé."""
    try:
        import deepgram  # noqa: F401
        return True
    except ImportError:
        return False
