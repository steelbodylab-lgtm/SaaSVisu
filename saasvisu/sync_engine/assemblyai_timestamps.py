"""
Transcription + timestamps mot par mot via AssemblyAI Universal-3 Pro (cloud).
Appel direct à l'API REST (pas de SDK) pour éviter tout bug côté client.
Optionnel : séparation vocale Demucs avant envoi.
Requis : ASSEMBLYAI_API_KEY dans .env
"""
from pathlib import Path
from typing import Any
import time

BASE_URL = "https://api.assemblyai.com"


def _to_standard_wav(source: Path) -> Path:
    """Convertit en WAV 16 kHz mono 16-bit (format optimal pour STT). Retourne un chemin temporaire."""
    from pydub import AudioSegment
    import tempfile
    import os
    seg = AudioSegment.from_file(str(source))
    seg = seg.set_frame_rate(16000).set_channels(1).set_sample_width(2)
    fd, path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    seg.export(path, format="wav", parameters=["-acodec", "pcm_s16le"])
    return Path(path)


def _transcribe_rest(audio_file: Path, api_key: str, language_code: str) -> dict[str, Any]:
    """
    Upload + transcript via REST. Retourne la réponse JSON complète.
    On envoie toujours un WAV 16 kHz mono 16-bit pour garantir que l'API décode correctement.
    """
    import requests
    key = api_key.strip()
    headers = {"authorization": key}

    wav_path = _to_standard_wav(audio_file)
    try:
        body = wav_path.read_bytes()
    finally:
        wav_path.unlink(missing_ok=True)

    upload_headers = {**headers, "Content-Type": "application/octet-stream"}
    up = requests.post(
        f"{BASE_URL}/v2/upload",
        headers=upload_headers,
        data=body,
        timeout=120,
    )
    if up.status_code != 200:
        err = up.text
        try:
            err = up.json().get("error", err)
        except Exception:
            pass
        raise RuntimeError(f"AssemblyAI upload failed ({up.status_code}): {err}")
    upload_url = up.json()["upload_url"]

    # 2) Création du transcript (prompt adapté paroles / lyric video)
    lc = (language_code or "fr").strip().lower()
    if lc == "en":
        lc = "en_us"
    prompt = (
        "Transcribe this audio for a lyric video with word-level timestamps. "
        "The content is sung lyrics: one or more singers (duet or group). "
        "You MUST transcribe EVERY word from EVERY speaker from the very beginning—do not ignore any voice. "
        "Include both singer A and singer B (and any other voices) in chronological order. "
        "Transcribe verbatim with correct spelling. No omissions, no merging of speakers. "
        "Do not skip the start of the recording. Output every word for karaoke-style sync."
    )
    body = {
        "audio_url": upload_url,
        "language_code": lc,
        "speech_models": ["universal-3-pro", "universal-2"],
        "speech_threshold": 0,
        "speaker_labels": True,
        "speakers_expected": 2,
        "prompt": prompt,
        "temperature": 0,
    }
    tr = requests.post(
        f"{BASE_URL}/v2/transcript",
        headers={**headers, "Content-Type": "application/json"},
        json=body,
        timeout=30,
    )
    if tr.status_code != 200:
        err = tr.text
        try:
            err = tr.json().get("error", err)
        except Exception:
            pass
        raise RuntimeError(f"AssemblyAI transcript submit ({tr.status_code}): {err}")
    transcript_id = tr.json()["id"]

    # 3) Poll jusqu'à completed ou error
    for _ in range(120):  # max ~4 min
        get_resp = requests.get(
            f"{BASE_URL}/v2/transcript/{transcript_id}",
            headers=headers,
            timeout=30,
        )
        if get_resp.status_code != 200:
            raise RuntimeError(f"AssemblyAI get transcript ({get_resp.status_code}): {get_resp.text}")
        data = get_resp.json()
        status = data.get("status")
        if status == "completed":
            return data
        if status == "error":
            raise RuntimeError(f"AssemblyAI: {data.get('error', 'unknown error')}")
        time.sleep(2)

    raise RuntimeError("AssemblyAI: timeout en attendant la fin de la transcription")


def extract_word_timestamps(
    audio_path: str | Path,
    api_key: str,
    *,
    language_code: str = "fr",
    use_demucs: bool = True,
) -> list[dict[str, Any]]:
    """
    Envoie l'audio à AssemblyAI Universal-3 Pro (REST) et retourne les mots avec timestamps (ms).
    """
    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Fichier audio introuvable: {audio_path}")

    target = audio_path
    if use_demucs:
        try:
            from saasvisu.sync_engine.vocal_separator import separate_vocals, is_available as demucs_ok
            if demucs_ok():
                print("[AssemblyAI] Séparation vocale (Demucs)…", flush=True)
                target = separate_vocals(audio_path)
        except Exception as e:
            print(f"[AssemblyAI] Demucs: {e}, audio brut.", flush=True)
    print("[AssemblyAI] Upload + transcription (REST)…", flush=True)

    try:
        data = _transcribe_rest(target, api_key, language_code)
    except Exception as e:
        err = str(e).lower()
        if "401" in str(e) or "unauthorized" in err:
            raise RuntimeError("AssemblyAI : clé API invalide (401).") from e
        if "429" in err or "quota" in err:
            raise RuntimeError("AssemblyAI : quota dépassé (429).") from e
        raise

    words = []
    for w in data.get("words") or []:
        t = (w.get("text") or "").strip()
        if not t:
            continue
        words.append({
            "text": t,
            "start_time_ms": int(w.get("start") or 0),
            "end_time_ms": int(w.get("end") or 0),
        })
    # Avec speaker_labels, les mots peuvent être dans utterances (par locuteur)
    if not words and data.get("utterances"):
        for u in data.get("utterances") or []:
            u_start = int(u.get("start") or 0)
            u_end = int(u.get("end") or u_start + 1000)
            u_text = (u.get("text") or "").strip()
            if not u_text:
                continue
            u_words = [x for x in u_text.split() if x]
            if not u_words:
                continue
            step = max(50, (u_end - u_start) // len(u_words))
            for i, t in enumerate(u_words):
                words.append({
                    "text": t,
                    "start_time_ms": u_start + i * step,
                    "end_time_ms": u_start + (i + 1) * step,
                })
        words.sort(key=lambda x: x["start_time_ms"])

    full_text = (data.get("text") or "").strip()
    if not words and full_text:
        duration_ms = int((data.get("audio_duration") or 0) * 1000) or 60000
        word_list = [x for x in full_text.split() if x]
        if word_list:
            step = max(100, duration_ms // len(word_list))
            for i, t in enumerate(word_list):
                words.append({
                    "text": t,
                    "start_time_ms": i * step,
                    "end_time_ms": (i + 1) * step,
                })
        print(f"[AssemblyAI] Texte sans timestamps → {len(words)} mots répartis.", flush=True)

    if not words:
        debug_path = Path(__file__).resolve().parent.parent.parent / "debug_assemblyai_last.json"
        try:
            import json
            with open(debug_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print(f"[AssemblyAI] Réponse sauvegardée: {debug_path}", flush=True)
        except Exception:
            pass
        print(f"[AssemblyAI] Aucun mot. text={bool(full_text)} len={len(full_text)}", flush=True)

    if not words and target != audio_path:
        print("[AssemblyAI] Essai avec l'audio brut…", flush=True)
        try:
            data = _transcribe_rest(audio_path, api_key, language_code)
            for w in data.get("words") or []:
                t = (w.get("text") or "").strip()
                if t:
                    words.append({
                        "text": t,
                        "start_time_ms": int(w.get("start") or 0),
                        "end_time_ms": int(w.get("end") or 0),
                    })
            if not words and (data.get("text") or "").strip():
                full_text = (data.get("text") or "").strip()
                duration_ms = int((data.get("audio_duration") or 0) * 1000) or 60000
                for i, t in enumerate(full_text.split()):
                    if t:
                        step = max(100, duration_ms // max(1, len(full_text.split())))
                        words.append({"text": t, "start_time_ms": i * step, "end_time_ms": (i + 1) * step})
        except Exception as e:
            print(f"[AssemblyAI] Audio brut: {e}", flush=True)

    if not words and (language_code or "fr").strip().lower() not in ("en", "en_us"):
        print("[AssemblyAI] Essai en anglais…", flush=True)
        try:
            data = _transcribe_rest(audio_path, api_key, "en_us")
            for w in data.get("words") or []:
                t = (w.get("text") or "").strip()
                if t:
                    words.append({
                        "text": t,
                        "start_time_ms": int(w.get("start") or 0),
                        "end_time_ms": int(w.get("end") or 0),
                    })
        except Exception as e:
            print(f"[AssemblyAI] Anglais: {e}", flush=True)

    print(f"[AssemblyAI] {len(words)} mots.", flush=True)
    return words


def is_available() -> bool:
    """True si requests est installé (pour l'API REST)."""
    try:
        import requests  # noqa: F401
        return True
    except ImportError:
        return False
