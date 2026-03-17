"""
Transcription + alignement mot par mot via AudioShake (cloud).
Qualité pro, utilisée par labels / Disney. Idéal pour paroles chantées.
Requis : AUDIOSHAKE_API_KEY dans .env
"""
from pathlib import Path
from typing import Any
import time

BASE_URL = "https://api.audioshake.ai"


def _upload_asset(audio_path: Path, api_key: str) -> str:
    """Upload le fichier et retourne l'asset_id."""
    import requests
    key = api_key.strip()
    headers = {"x-api-key": key}
    with open(audio_path, "rb") as f:
        files = {"file": (audio_path.name, f, "audio/mpeg" if audio_path.suffix.lower() == ".mp3" else "audio/wav")}
        r = requests.post(
            f"{BASE_URL}/assets",
            headers=headers,
            files=files,
            timeout=120,
        )
    if r.status_code != 200:
        err = r.text
        try:
            err = r.json().get("message", r.json().get("error", err))
        except Exception:
            pass
        raise RuntimeError(f"AudioShake upload failed ({r.status_code}): {err}")
    return r.json()["id"]


def _create_task(asset_id: str, api_key: str, language: str = "fr") -> str:
    """Crée une tâche alignment (transcription + timestamps mots). Retourne task_id."""
    import requests
    key = api_key.strip()
    headers = {"x-api-key": key, "Content-Type": "application/json"}
    # alignment seul = transcription auto + alignement mot à mot (karaoke)
    body = {
        "assetId": asset_id,
        "targets": [
            {"model": "alignment", "formats": ["json"], "language": language or "fr"}
        ],
    }
    r = requests.post(f"{BASE_URL}/tasks", headers=headers, json=body, timeout=30)
    if r.status_code != 200:
        err = r.text
        try:
            err = r.json().get("message", r.json().get("error", err))
        except Exception:
            pass
        raise RuntimeError(f"AudioShake create task failed ({r.status_code}): {err}")
    return r.json()["id"]


def _poll_task(task_id: str, api_key: str, poll_interval: float = 3.0, timeout: float = 300.0) -> dict:
    """Poll jusqu'à completion. Retourne le JSON de la tâche."""
    import requests
    key = api_key.strip()
    headers = {"x-api-key": key}
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        r = requests.get(f"{BASE_URL}/tasks/{task_id}", headers=headers, timeout=30)
        if r.status_code != 200:
            raise RuntimeError(f"AudioShake get task failed ({r.status_code}): {r.text}")
        data = r.json()
        for t in data.get("targets", []):
            if t.get("status") == "error":
                raise RuntimeError(t.get("error", "Target failed"))
            if t.get("status") == "completed":
                return data
        time.sleep(poll_interval)
    raise RuntimeError("AudioShake task timeout (5 min)")


def _download_json(url: str, api_key: str) -> dict:
    """Télécharge le JSON depuis une URL (signed)."""
    import requests
    r = requests.get(url, headers={"x-api-key": api_key.strip()}, timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"AudioShake download failed ({r.status_code})")
    return r.json()


def _word_to_segment(w: dict) -> dict[str, Any] | None:
    """Convertit un objet word en { text, start_time_ms, end_time_ms }."""
    text = (w.get("text") or w.get("word") or "").strip()
    if not text:
        return None
    start = w.get("start") or w.get("startTime") or w.get("start_time") or 0
    end = w.get("end") or w.get("endTime") or w.get("end_time") or start
    if isinstance(start, (int, float)) and isinstance(end, (int, float)):
        if start < 100 and end < 100:  # probablement en secondes
            start_ms = int(round(float(start) * 1000))
            end_ms = int(round(float(end) * 1000))
        else:
            start_ms = int(start)
            end_ms = int(end)
        return {"text": text, "start_time_ms": start_ms, "end_time_ms": end_ms}
    return None


def _alignment_to_segments(alignment_data: dict) -> list[dict[str, Any]]:
    """
    Convertit le JSON alignment AudioShake en liste de segments (mot par mot).
    Supporte: words[], segments[].words[], segments[] avec text, etc.
    """
    segments = []
    # 1) Liste de mots à la racine
    words = alignment_data.get("words") or alignment_data.get("word_level") or []
    if words:
        for w in words:
            seg = _word_to_segment(w)
            if seg:
                segments.append(seg)
        if segments:
            return segments
    # 2) Segments contenant chacun une liste de words (format démo AudioShake)
    for seg in alignment_data.get("segments", []) or alignment_data.get("lines", []):
        sub_words = seg.get("words") or seg.get("word_level") or []
        if sub_words:
            for w in sub_words:
                s = _word_to_segment(w)
                if s:
                    segments.append(s)
        else:
            text = (seg.get("text") or seg.get("content") or "").strip()
            if not text:
                continue
            start = seg.get("start") or seg.get("startTime") or 0
            end = seg.get("end") or seg.get("endTime") or start
            if isinstance(start, (int, float)) and start < 100:
                start_ms = int(round(float(start) * 1000))
                end_ms = int(round(float(end) * 1000)) if isinstance(end, (int, float)) else start_ms
            else:
                start_ms = int(start)
                end_ms = int(end) if isinstance(end, (int, float)) else start_ms
            segments.append({"text": text, "start_time_ms": start_ms, "end_time_ms": end_ms})
    return segments


def extract_word_timestamps(
    audio_path: str | Path,
    api_key: str,
    language_code: str = "fr",
) -> list[dict[str, Any]]:
    """
    Upload → tâche alignment → poll → parse JSON.
    Retourne [{"text": "mot", "start_time_ms": ..., "end_time_ms": ...}, ...].
    """
    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Fichier audio introuvable: {audio_path}")

    print("[AudioShake] Upload de l'audio…", flush=True)
    asset_id = _upload_asset(audio_path, api_key)
    print("[AudioShake] Création tâche alignment…", flush=True)
    task_id = _create_task(asset_id, api_key, language=language_code or "fr")
    print("[AudioShake] Traitement en cours (poll)…", flush=True)
    task = _poll_task(task_id, api_key)

    # Récupérer le lien JSON (alignment ou transcription)
    out_link = None
    for t in task.get("targets", []):
        for out in t.get("output", []):
            if out.get("format") == "json":
                out_link = out.get("link")
                break
        if out_link:
            break
    if not out_link:
        raise RuntimeError("AudioShake n'a pas retourné de sortie JSON")

    raw = _download_json(out_link, api_key)
    segments = _alignment_to_segments(raw)
    if not segments and isinstance(raw, list):
        for item in raw:
            segments.extend(_alignment_to_segments(item) if isinstance(item, dict) else [])
    if not segments and "transcript" in raw:
        text = (raw.get("transcript") or "").strip()
        if text:
            segments = [{"text": text, "start_time_ms": 0, "end_time_ms": 0}]
    # Sauvegarde debug pour adapter le parser si le format change
    try:
        debug_path = Path(__file__).resolve().parent.parent.parent / "debug_audioshake_last.json"
        import json
        with open(debug_path, "w", encoding="utf-8") as f:
            json.dump(raw, f, ensure_ascii=False, indent=2)
        print(f"[AudioShake] Debug: {debug_path}", flush=True)
    except Exception:
        pass
    print(f"[AudioShake] {len(segments)} mots/segments extraits.", flush=True)
    return segments


def is_available() -> bool:
    """True si AUDIOSHAKE_API_KEY est défini."""
    import os
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass
    return bool((os.environ.get("AUDIOSHAKE_API_KEY") or "").strip())
