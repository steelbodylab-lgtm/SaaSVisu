"""
Adaptateur HeartMuLa (transcription paroles).
- API : WaveSpeed.ai (WAVESPEED_API_KEY) — pour la prod.
- Local : HeartTranscriptor-oss sur Hugging Face (HEARTMULA_USE_LOCAL=1) — gratuit pour dev.
"""
from pathlib import Path
from typing import Any
import time
import urllib.request
import urllib.error
import json
import mimetypes


HEARTMULA_SUBMIT_URL = "https://api.wavespeed.ai/api/v3/wavespeed-ai/heartmula/transcribe-lyrics"
HEARTMULA_RESULT_URL = "https://api.wavespeed.ai/api/v3/predictions"
HEARTTRANSCRIPTOR_MODEL = "HeartMuLa/HeartTranscriptor-oss"


def _local_available() -> bool:
    """True si transformers + torch sont installés (pour HeartTranscriptor local)."""
    try:
        import torch  # noqa: F401
        import transformers  # noqa: F401
        return True
    except ImportError:
        return False


def _log(msg: str) -> None:
    import sys
    print(f"[HeartMuLa] {msg}", flush=True)
    sys.stdout.flush()


# Cache du pipeline pour ne charger le modèle qu'une fois (2e détection et suivantes = beaucoup plus rapide).
_pipeline_cache: Any = None


def _get_pipeline():
    """Retourne le pipeline ASR (chargé une fois, réutilisé). GPU si disponible."""
    global _pipeline_cache
    if _pipeline_cache is not None:
        return _pipeline_cache
    _log("Chargement du modèle (1ère fois seulement, 1–2 min)…")
    from transformers import pipeline
    import torch
    import os
    # Utiliser tous les cœurs CPU pour accélérer l'inférence (sans GPU).
    if not torch.cuda.is_available():
        n = os.cpu_count()
        if n and n > 1:
            torch.set_num_threads(n)
            _log(f"CPU: {n} threads pour la transcription.")
    device = 0 if torch.cuda.is_available() else -1
    if device == 0:
        _log("GPU détecté, utilisation du CUDA pour accélérer.")
    pipe = pipeline(
        "automatic-speech-recognition",
        model=HEARTTRANSCRIPTOR_MODEL,
        device=device,
    )
    _pipeline_cache = pipe
    _log("Modèle en mémoire (détections suivantes seront plus rapides).")
    return pipe


def transcribe_lyrics_local(audio_path: str | Path) -> str:
    """
    Transcription paroles avec le modèle HeartTranscriptor-oss en local (gratuit).
    Le modèle est mis en cache : 1ère fois = chargement, suivantes = rapide.
    """
    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Fichier audio introuvable: {audio_path}")

    _log("Conversion audio en 16 kHz mono...")
    from pydub import AudioSegment
    import tempfile
    seg = AudioSegment.from_file(str(audio_path))
    seg = seg.set_frame_rate(16000).set_channels(1)
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        seg.export(f.name, format="wav")
        wav_path = f.name
    try:
        pipe = _get_pipeline()
        _log("Transcription en cours…")
        out = pipe(wav_path, return_timestamps=True)
    finally:
        Path(wav_path).unlink(missing_ok=True)

    if isinstance(out, dict):
        text = (out.get("text") or "").strip()
        if not text and out.get("chunks"):
            text = " ".join(c.get("text", "") if isinstance(c, dict) else str(c) for c in out["chunks"]).strip()
    elif isinstance(out, list) and out:
        text = (out[0].get("text") if isinstance(out[0], dict) else str(out[0])).strip()
    else:
        text = ""
    _log("Terminé.")
    return text or ""


def transcribe_lyrics(
    audio_path: str | Path,
    api_key: str,
    *,
    poll_interval: float = 1.0,
    poll_timeout: float = 120.0,
) -> str:
    """
    Envoie l'audio à HeartMuLa (WaveSpeed) en multipart/form-data uniquement,
    comme le playground WaveSpeed (drag & drop). Retourne le texte des paroles.
    """
    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Fichier audio introuvable: {audio_path}")

    mime = mimetypes.guess_type(str(audio_path))[0] or "audio/mpeg"
    safe_name = "audio" + (audio_path.suffix.lower() if audio_path.suffix else ".mp3")

    import base64
    import requests

    def do_request(data=None, files=None):
        kwargs = {
            "headers": {"Authorization": f"Bearer {api_key}"},
            "timeout": 300,
        }
        if files:
            kwargs["files"] = files
        else:
            kwargs["headers"]["Content-Type"] = "application/json"
            kwargs["data"] = json.dumps(data) if data else "{}"
        return requests.post(HEARTMULA_SUBMIT_URL, **kwargs)

    try:
        with open(audio_path, "rb") as f:
            r = do_request(files={"audio": (safe_name, f, mime)})
        if r.status_code == 400 and "parse request body" in (r.text or "").lower():
            with open(audio_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("ascii")
            r = do_request(data={"audio": f"data:{mime};base64,{b64}"})
        r.raise_for_status()
        data = r.json()
    except requests.exceptions.HTTPError as e:
        msg = e.response.text
        try:
            err_data = e.response.json()
            msg = err_data.get("message", err_data.get("error", msg))
        except Exception:
            pass
        raise RuntimeError(f"HeartMuLa API error: {e.response.status_code} — {msg}")
    except requests.exceptions.RequestException as e:
        raise RuntimeError(f"HeartMuLa API error: {e}")

    d = data.get("data") or {}
    status = d.get("status", "")

    def extract_lyrics_from_outputs(outputs) -> str:
        if outputs is None:
            return ""
        if isinstance(outputs, str):
            return outputs.strip()
        if isinstance(outputs, dict):
            return (outputs.get("lyrics") or "").strip()
        if isinstance(outputs, list) and outputs:
            first = outputs[0]
            if isinstance(first, str):
                if first.startswith("http"):
                    with urllib.request.urlopen(
                        urllib.request.Request(first, headers={"Authorization": f"Bearer {api_key}"}),
                        timeout=30,
                    ) as r:
                        out_data = json.loads(r.read().decode())
                        return (out_data.get("lyrics") or "").strip()
                return first.strip()
            if isinstance(first, dict):
                return (first.get("lyrics") or "").strip()
        return ""

    # Réponse synchrone : résultat déjà dans la première réponse (upload fichier)
    outputs = d.get("outputs") or d.get("data")
    if status == "completed" or outputs:
        lyrics = extract_lyrics_from_outputs(outputs)
        if lyrics:
            return lyrics

    task_id = d.get("id")
    if not task_id:
        info = f"code={data.get('code')}, data.keys={list(d.keys())}"
        raise RuntimeError(
            f"HeartMuLa: pas d'id de tâche dans la réponse ({info}). "
            "Vérifiez le format audio (MP3/WAV) et que l'API accepte l'upload."
        )

    # Poll pour le résultat (mode asynchrone)
    result_url = f"{HEARTMULA_RESULT_URL}/{task_id}/result"
    deadline = time.monotonic() + poll_timeout
    while time.monotonic() < deadline:
        time.sleep(poll_interval)
        req_result = urllib.request.Request(
            result_url,
            method="GET",
            headers={"Authorization": f"Bearer {api_key}"},
        )
        with urllib.request.urlopen(req_result, timeout=30) as resp:
            result = json.loads(resp.read().decode())
        d = result.get("data", {})
        status = d.get("status", "")
        if status == "completed":
            outputs = d.get("outputs") or d.get("data") or {}
            lyrics = extract_lyrics_from_outputs(outputs)
            return lyrics or ""
        if status == "failed":
            raise RuntimeError(d.get("error", "HeartMuLa a échoué"))

    raise TimeoutError("HeartMuLa: délai d'attente dépassé")


def lyrics_text_to_word_segments(lyrics: str, duration_seconds: float) -> list[dict[str, Any]]:
    """
    Découpe le texte en phrases (lignes, ponctuation), répartit le temps avec des pauses
    entre les phrases, et au sein de chaque phrase répartit proportionnellement à la
    longueur des mots. HeartMuLa ne renvoie pas de timestamps, donc on estime les pauses.
    """
    import re
    if not (lyrics or "").strip() or duration_seconds <= 0:
        return []
    # Découper en phrases : newlines ou .,!?;
    raw_phrases = re.split(r"[\n.!?;]+", lyrics)
    phrases = []
    for p in raw_phrases:
        words_in_p = [w.strip() for w in p.split() if w.strip()]
        if words_in_p:
            phrases.append(words_in_p)
    if not phrases:
        words = [w.strip() for w in lyrics.split() if w.strip()]
        if not words:
            return []
        phrases = [words]

    total_words = sum(len(p) for p in phrases)
    total_duration_ms = duration_seconds * 1000
    # Pause entre phrases : ~0,4 s par coupure (silence naturel)
    pause_between_phrases_ms = 400
    n_pauses = max(0, len(phrases) - 1)
    speech_duration_ms = total_duration_ms - n_pauses * pause_between_phrases_ms
    if speech_duration_ms <= 0:
        speech_duration_ms = total_duration_ms * 0.85

    segments = []
    t_ms = 0.0
    for ip, phrase in enumerate(phrases):
        phrase_word_count = len(phrase)
        phrase_duration_ms = (phrase_word_count / total_words) * speech_duration_ms if total_words else 0
        total_chars = max(sum(len(w) for w in phrase), 1)
        t_phrase = t_ms
        for iw, word in enumerate(phrase):
            w_start = int(t_phrase)
            ratio = len(word) / total_chars
            t_phrase += ratio * phrase_duration_ms
            w_end = int(t_phrase) if iw < len(phrase) - 1 else int(t_ms + phrase_duration_ms)
            segments.append({
                "text": word,
                "start_time_ms": w_start,
                "end_time_ms": w_end,
            })
        t_ms += phrase_duration_ms + (pause_between_phrases_ms if ip < len(phrases) - 1 else 0)

    if segments:
        segments[-1]["end_time_ms"] = min(int(total_duration_ms), segments[-1]["end_time_ms"])
    return segments
