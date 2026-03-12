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
    Envoie l'audio à HeartMuLa et retourne le texte des paroles.
    L'API attend une URL publique ; si on envoie en multipart, certains backends l'acceptent.
    Ici on envoie le fichier en base64 dans le body JSON (si l'API le supporte)
    ou on utilise une URL — selon la doc officielle c'est une URL, donc on tente
    d'abord avec un body JSON {"audio": "data:audio/mpeg;base64,..."} ou on lit la doc pour "upload".
    Doc WaveSpeed : "audio | string | Yes | URL to the audio file"
    Donc il faut une URL publique. On va tenter multipart/form-data avec le fichier
    car le playground permet "drag and drop / upload".
    """
    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Fichier audio introuvable: {audio_path}")

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    # L'API WaveSpeed attend soit une URL publique (audio), soit un upload.
    # On tente d'abord en JSON avec une URL si fournie via env, sinon multipart.
    import os
    import mimetypes
    audio_url = os.environ.get("WAVESPEED_AUDIO_URL", "").strip()
    if audio_url:
        req = urllib.request.Request(
            HEARTMULA_SUBMIT_URL,
            data=json.dumps({"audio": audio_url}).encode("utf-8"),
            method="POST",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )
    else:
        mime = mimetypes.guess_type(str(audio_path))[0] or "audio/mpeg"
        boundary = "----WebKitFormBoundary" + str(int(time.time() * 1000))
        body_start = (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="audio"; filename="{audio_path.name}"\r\n'
            f"Content-Type: {mime}\r\n\r\n"
        )
        body_end = f"\r\n--{boundary}--\r\n"
        body = body_start.encode("utf-8") + audio_bytes + body_end.encode("utf-8")
        req = urllib.request.Request(
            HEARTMULA_SUBMIT_URL,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
        )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body_err = e.read().decode() if e.fp else ""
        try:
            err_data = json.loads(body_err)
            msg = err_data.get("message", err_data.get("error", body_err))
        except Exception:
            msg = body_err or str(e)
        raise RuntimeError(f"HeartMuLa API error: {e.code} — {msg}")

    task_id = (data.get("data") or {}).get("id")
    if not task_id:
        raise RuntimeError("HeartMuLa n'a pas renvoyé d'id de tâche")

    # Poll pour le résultat
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
            if isinstance(outputs, dict):
                lyrics = (outputs.get("lyrics") or "").strip()
            elif isinstance(outputs, list) and outputs:
                first = outputs[0]
                if isinstance(first, str):
                    if first.startswith("http"):
                        with urllib.request.urlopen(first, timeout=30) as r:
                            out_data = json.loads(r.read().decode())
                            lyrics = (out_data.get("lyrics") or "").strip()
                    else:
                        lyrics = first.strip()
                else:
                    lyrics = (first.get("lyrics") or "").strip()
            else:
                lyrics = ""
            return lyrics or ""
        if status == "failed":
            raise RuntimeError(d.get("error", "HeartMuLa a échoué"))

    raise TimeoutError("HeartMuLa: délai d'attente dépassé")


def lyrics_text_to_word_segments(lyrics: str, duration_seconds: float) -> list[dict[str, Any]]:
    """
    Découpe le texte des paroles en mots et répartit les timestamps
    uniformément sur la durée de l'audio (HeartMuLa ne renvoie pas de timestamps).
    """
    if not (lyrics or "").strip() or duration_seconds <= 0:
        return []
    words = [w.strip() for w in lyrics.split() if w.strip()]
    if not words:
        return []
    step_ms = (duration_seconds * 1000) / len(words)
    segments = []
    for i, word in enumerate(words):
        start_ms = int(i * step_ms)
        end_ms = int((i + 1) * step_ms) if i < len(words) - 1 else int(duration_seconds * 1000)
        segments.append({
            "text": word,
            "start_time_ms": start_ms,
            "end_time_ms": end_ms,
        })
    return segments
