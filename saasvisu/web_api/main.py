"""
API REST locale pour Saas Visu (FastAPI).
Endpoints : projets, upload audio, paroles, sync, render, download.
Interface locale servie en / (fichiers statiques).
"""
from pathlib import Path

# Racine du projet (pour charger .env)
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
try:
    from dotenv import load_dotenv
    load_dotenv(_PROJECT_ROOT / ".env")
    load_dotenv(Path.cwd() / ".env")  # aussi depuis le dossier de lancement
except ImportError:
    pass
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
import uuid
import shutil

app = FastAPI(title="Saas Visu API", version="0.1.0")

# Racine du projet et dossiers
PROJECT_ROOT = _PROJECT_ROOT
PROJECTS_DIR = PROJECT_ROOT / "projects"
STATIC_DIR = PROJECT_ROOT / "static"
PROJECTS_DIR.mkdir(parents=True, exist_ok=True)


class ProjectCreate(BaseModel):
    name: str


class LyricsBody(BaseModel):
    text: str


class AnalyzeBody(BaseModel):
    """Optionnel : texte (paroles ou mots-clés) pour améliorer la reconnaissance Azure."""
    phrase_hints: str | None = None


class SyncSegmentsBody(BaseModel):
    """Segments (mots avec timestamps) pour écraser sync.json (ex. après édition des boxes)."""
    segments: list[dict]


class AudioSegmentBody(BaseModel):
    """Début et durée de l'extrait à conserver (en secondes)."""
    start_seconds: float = 0.0
    duration_seconds: float = 20.0


@app.get("/")
def root():
    """Sert l'interface locale si elle existe, sinon JSON d'accueil."""
    index_html = STATIC_DIR / "index.html"
    if index_html.exists():
        return FileResponse(index_html, media_type="text/html")
    return {"service": "Saas Visu API", "docs": "/docs"}


@app.get("/config/options")
def get_options():
    """Retourne les polices et effets disponibles pour le rendu."""
    from saasvisu.render_engine.ffmpeg_renderer import FONTS, EFFECTS
    return {"fonts": FONTS, "effects": list(EFFECTS.keys())}


def _azure_speech_available() -> bool:
    import os
    return bool(os.environ.get("AZURE_SPEECH_KEY") and os.environ.get("AZURE_SPEECH_REGION"))


def _ensure_env_loaded():
    """Recharge .env depuis la racine du projet (au cas où le chargement initial ait raté)."""
    try:
        from dotenv import load_dotenv
        load_dotenv(PROJECT_ROOT / ".env", override=True)
    except Exception:
        pass


@app.get("/config/speech")
def get_speech_config(debug: bool = False):
    """Indique quels moteurs STT sont disponibles (Azure, HeartMuLa, Whisper).
    ?debug=1 renvoie une page HTML lisible au lieu du JSON."""
    import os
    _ensure_env_loaded()
    if debug:
        raw = os.environ.get("HEARTMULA_USE_LOCAL", "<non défini>")
        h_av = _heartmula_available()
        h_local = _heartmula_use_local()
        root = str(PROJECT_ROOT)
        env_exists = (PROJECT_ROOT / ".env").exists()
        html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Config debug</title></head>
<body style="font-family: sans-serif; max-width: 600px; margin: 2rem; line-height: 1.6;">
<h1>Config debug (HeartMuLa)</h1>
<ul>
<li><b>HEARTMULA_USE_LOCAL</b> = {raw}</li>
<li><b>heartmula_available</b> = {h_av}</li>
<li><b>heartmula_use_local</b> = {h_local}</li>
<li><b>project_root</b> = {root}</li>
<li><b>env_file_exists</b> = {env_exists}</li>
</ul>
<p>Si heartmula_available est False, vérifiez que le fichier .env à la racine contient <code>HEARTMULA_USE_LOCAL=1</code> et redémarrez le serveur.</p>
<p><a href="/">Retour à l'app</a></p>
</body></html>"""
        return Response(content=html, media_type="text/html")
    out = {
        "azure_available": _azure_speech_available(),
        "heartmula_available": _heartmula_available(),
        "heartmula_local": _heartmula_available() and _heartmula_use_local(),
    }
    return out


@app.post("/projects")
def create_project(body: ProjectCreate):
    """Crée un nouveau projet (dossier + projet.json)."""
    pid = str(uuid.uuid4())[:8]
    project_path = PROJECTS_DIR / pid
    project_path.mkdir(parents=True, exist_ok=True)
    (project_path / "audio").mkdir(exist_ok=True)
    meta = {"id": pid, "name": body.name}
    import json
    (project_path / "projet.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    return {"id": pid, "name": body.name, "path": str(project_path)}


@app.get("/projects")
def list_projects():
    """Liste les projets existants."""
    projects = []
    for d in PROJECTS_DIR.iterdir():
        if d.is_dir() and (d / "projet.json").exists():
            import json
            meta = json.loads((d / "projet.json").read_text(encoding="utf-8"))
            projects.append(meta)
    return {"projects": projects}


@app.post("/projects/{project_id}/audio")
async def upload_audio(project_id: str, file: UploadFile = File(...)):
    """Upload un fichier audio dans le projet (fichier complet). Ensuite tu peux choisir un extrait de 20 s."""
    project_path = PROJECTS_DIR / project_id
    if not project_path.exists() or not (project_path / "projet.json").exists():
        raise HTTPException(status_code=404, detail="Projet introuvable")
    ext = (Path(file.filename or "").suffix or ".mp3").lower()
    if ext not in {".mp3", ".wav", ".m4a", ".ogg", ".flac"}:
        ext = ".mp3"
    dest = project_path / "audio" / f"track{ext}"
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    duration_seconds = None
    try:
        from saasvisu.audio_ingest import get_duration_seconds
        duration_seconds = get_duration_seconds(dest)
    except Exception:
        pass
    return {"ok": True, "path": str(dest), "duration_seconds": duration_seconds}


@app.get("/projects/{project_id}/audio/duration")
def get_audio_duration(project_id: str):
    """Retourne la durée de l'audio du projet (pour choisir l'extrait)."""
    from saasvisu.audio_ingest import get_duration_seconds
    project_path = PROJECTS_DIR / project_id
    if not project_path.exists():
        raise HTTPException(status_code=404, detail="Projet introuvable")
    audio_dir = project_path / "audio"
    audio_file = next(audio_dir.glob("*"), None)
    if not audio_file or not audio_file.is_file():
        raise HTTPException(status_code=404, detail="Aucun fichier audio")
    try:
        duration_seconds = get_duration_seconds(audio_file)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"duration_seconds": duration_seconds}


@app.post("/projects/{project_id}/audio/segment")
def apply_audio_segment(project_id: str, body: AudioSegmentBody):
    """Conserve uniquement l'extrait [start_seconds, start_seconds + duration_seconds]. La détection des paroles se fera sur cet extrait."""
    from pydub import AudioSegment
    project_path = PROJECTS_DIR / project_id
    if not project_path.exists():
        raise HTTPException(status_code=404, detail="Projet introuvable")
    audio_dir = project_path / "audio"
    audio_file = next(audio_dir.glob("*"), None)
    if not audio_file or not audio_file.is_file():
        raise HTTPException(status_code=404, detail="Aucun fichier audio")
    start_ms = int(body.start_seconds * 1000)
    duration_ms = int(body.duration_seconds * 1000)
    if start_ms < 0 or duration_ms <= 0:
        raise HTTPException(status_code=400, detail="start_seconds >= 0 et duration_seconds > 0")
    try:
        seg = AudioSegment.from_file(str(audio_file))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Fichier audio invalide : {e}")
    total_ms = len(seg)
    end_ms = min(start_ms + duration_ms, total_ms)
    if start_ms >= total_ms:
        raise HTTPException(status_code=400, detail="start_seconds dépasse la durée de l'audio")
    excerpt = seg[start_ms:end_ms]
    fmt = (audio_file.suffix or ".mp3").lstrip(".").lower()
    if fmt == "m4a":
        fmt = "ipod"
    excerpt.export(str(audio_file), format=fmt)
    return {"ok": True, "start_seconds": body.start_seconds, "duration_seconds": (end_ms - start_ms) / 1000.0}


# Extensions autorisées pour le fond (photo ou vidéo)
BACKGROUND_IMAGE_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
BACKGROUND_VIDEO_EXT = {".mp4", ".webm", ".mov", ".avi", ".mkv"}
BACKGROUND_EXT = BACKGROUND_IMAGE_EXT | BACKGROUND_VIDEO_EXT


@app.post("/projects/{project_id}/background")
async def upload_background(project_id: str, file: UploadFile = File(...)):
    """Upload une photo ou une vidéo comme fond du visualizer."""
    project_path = PROJECTS_DIR / project_id
    if not project_path.exists() or not (project_path / "projet.json").exists():
        raise HTTPException(status_code=404, detail="Projet introuvable")
    ext = (Path(file.filename or "").suffix or "").lower()
    if ext not in BACKGROUND_EXT:
        raise HTTPException(
            status_code=400,
            detail=f"Format non supporté. Image: {BACKGROUND_IMAGE_EXT} ou vidéo: {BACKGROUND_VIDEO_EXT}",
        )
    dest = project_path / f"background{ext}"
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"ok": True, "path": str(dest)}


@app.post("/projects/{project_id}/lyrics")
def save_lyrics(project_id: str, body: LyricsBody):
    """Enregistre les paroles (texte brut -> lyrics.json)."""
    from saasvisu.lyrics import lines_from_text, save_lyrics_json
    project_path = PROJECTS_DIR / project_id
    if not project_path.exists():
        raise HTTPException(status_code=404, detail="Projet introuvable")
    lines = lines_from_text(body.text)
    lyrics_path = project_path / "lyrics.json"
    save_lyrics_json(lyrics_path, lines)
    return {"ok": True, "lines_count": len(lines)}


@app.post("/projects/{project_id}/sync")
def run_sync(project_id: str, use_whisper: bool = False, whisper_model: str = "base", body: SyncSegmentsBody | None = None):
    """
    Lance la synchro. Si body.segments est fourni, enregistre ces segments dans sync.json (après édition des boxes).
    Sinon : use_whisper=true = alignement sur la voix (Whisper), sinon répartition uniforme.
    """
    from saasvisu.audio_ingest import get_metadata
    from saasvisu.lyrics import load_lyrics_json
    from saasvisu.sync_engine import align_lyrics_to_segments, align_lyrics_with_whisper
    from saasvisu.sync_engine.aligner import save_sync_json
    project_path = PROJECTS_DIR / project_id
    if not project_path.exists():
        raise HTTPException(status_code=404, detail="Projet introuvable")
    sync_path = project_path / "sync.json"
    if body and body.segments:
        segments = body.segments
        save_sync_json(sync_path, segments)
        return {"ok": True, "segments_count": len(segments)}
    audio_dir = project_path / "audio"
    audio_file = next(audio_dir.glob("*"), None)
    if not audio_file:
        raise HTTPException(status_code=400, detail="Aucun fichier audio dans le projet")
    lyrics_path = project_path / "lyrics.json"
    if not lyrics_path.exists():
        raise HTTPException(status_code=400, detail="Paroles non enregistrées")
    lines = load_lyrics_json(lyrics_path)
    if use_whisper:
        from saasvisu.sync_engine.whisper_adapter import transcribe_to_segments
        try:
            whisper_segments = transcribe_to_segments(audio_file, model_name=whisper_model)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Whisper a échoué : {e}")
        if not whisper_segments:
            raise HTTPException(status_code=400, detail="Whisper n'a retourné aucun segment.")
        segments = align_lyrics_with_whisper(lines, whisper_segments)
    else:
        meta = get_metadata(audio_file)
        segments = align_lyrics_to_segments(lines, meta["duration_seconds"])
    save_sync_json(sync_path, segments)
    return {"ok": True, "segments_count": len(segments), "whisper": use_whisper}


def _heartmula_available() -> bool:
    """True si WaveSpeed API key OU HEARTMULA_USE_LOCAL=1 (option affichée même sans torch/transformers)."""
    import os
    if os.environ.get("WAVESPEED_API_KEY", "").strip():
        return True
    if os.environ.get("HEARTMULA_USE_LOCAL", "").strip().lower() in ("1", "true", "yes"):
        return True
    return False


def _heartmula_use_local() -> bool:
    import os
    return os.environ.get("HEARTMULA_USE_LOCAL", "").strip().lower() in ("1", "true", "yes")




@app.post("/projects/{project_id}/analyze")
def run_analyze(project_id: str, whisper_model: str = "base", engine: str = "", body: AnalyzeBody | None = None):
    """
    Détection automatique des paroles.
    engine=heartmula → WaveSpeed HeartMuLa (WAVESPEED_API_KEY requis).
    engine=azure → Azure Speech (si configuré).
    Sinon Whisper.
    body.phrase_hints : pour Azure.
    """
    from saasvisu.sync_engine.aligner import save_sync_json
    from saasvisu.audio_ingest import get_duration_seconds
    import os
    project_path = PROJECTS_DIR / project_id
    if not project_path.exists():
        raise HTTPException(status_code=404, detail="Projet introuvable")
    audio_dir = project_path / "audio"
    audio_file = next(audio_dir.glob("*"), None)
    if not audio_file:
        raise HTTPException(status_code=400, detail="Aucun fichier audio dans le projet")
    use_heartmula = (engine == "heartmula") and _heartmula_available()
    use_heartmula_local = use_heartmula and _heartmula_use_local()
    use_azure = (engine not in ("whisper", "heartmula")) and _azure_speech_available()
    phrase_hints = (body and body.phrase_hints) or None
    segments = []
    try:
        if use_heartmula:
            from saasvisu.sync_engine.heartmula_adapter import (
                transcribe_lyrics,
                transcribe_lyrics_local,
                lyrics_text_to_word_segments,
                _local_available,
            )
            if use_heartmula_local:
                if not _local_available():
                    raise HTTPException(
                        status_code=503,
                        detail="HeartMuLa (local) nécessite torch et transformers. Exécutez : pip install -r requirements-heartmula-local.txt",
                    )
                import threading
                result = []
                exc_holder = []

                def run_local():
                    try:
                        result.append(transcribe_lyrics_local(audio_file))
                    except Exception as e:
                        exc_holder.append(e)

                th = threading.Thread(target=run_local)
                th.daemon = True
                th.start()
                th.join(timeout=900)  # 15 min max (premier run = téléchargement modèle ~1 Go)
                if th.is_alive():
                    raise HTTPException(
                        status_code=504,
                        detail="Détection HeartMuLa (local) trop longue (timeout 15 min). Premier lancement ? Le modèle se télécharge (~1 Go) — réessaie dans quelques minutes. Sinon, utilise un extrait audio plus court ou Whisper.",
                    )
                if exc_holder:
                    raise exc_holder[0]
                lyrics_text = result[0]
            else:
                api_key = os.environ["WAVESPEED_API_KEY"].strip()
                lyrics_text = transcribe_lyrics(audio_file, api_key)
            duration_sec = get_duration_seconds(audio_file)
            segments = lyrics_text_to_word_segments(lyrics_text, duration_sec)
        elif use_azure:
            from saasvisu.sync_engine.azure_speech_adapter import transcribe_to_words as azure_transcribe
            key = os.environ["AZURE_SPEECH_KEY"]
            region = os.environ["AZURE_SPEECH_REGION"]
            segments = azure_transcribe(
                audio_file, subscription_key=key, region=region, language="fr-FR", phrase_hints=phrase_hints
            )
        else:
            from saasvisu.sync_engine.whisper_adapter import transcribe_to_words
            segments = transcribe_to_words(audio_file, model_name=whisper_model, language="fr")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analyse a échoué : {e}")
    if not segments:
        raise HTTPException(status_code=400, detail="Aucune parole détectée dans l'audio.")
    sync_path = project_path / "sync.json"
    save_sync_json(sync_path, segments)
    # Enregistrer aussi le texte brut des paroles (pour affichage / édition)
    full_text = " ".join(s.get("text", "") for s in segments).replace("  ", " ").strip()
    (project_path / "lyrics.txt").write_text(full_text, encoding="utf-8")
    import json
    lines_for_json = [{"id": str(i), "text": s.get("text", "")} for i, s in enumerate(segments)]
    (project_path / "lyrics.json").write_text(json.dumps(lines_for_json, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "ok": True,
        "words_count": len(segments),
        "message": "Paroles détectées automatiquement (mot par mot).",
        "engine": "heartmula" if use_heartmula else ("azure" if use_azure else "whisper"),
        "text": full_text,
        "segments": [{"text": s.get("text", ""), "start_time_ms": s.get("start_time_ms", 0), "end_time_ms": s.get("end_time_ms", 0)} for s in segments],
    }


@app.post("/projects/{project_id}/render")
def run_render(
    project_id: str,
    template: str = "minimal_16x9",
    ratio: str = "16:9",
    resolution: str = "720p",
    font: str = "",
    font_size: int = 0,
    effect: str = "",
    text_color: str = "",
    position: str = "bottom",
    pos_x_pct: float | None = None,
    pos_y_pct: float | None = None,
    lyric_animation: str = "",
):
    """Lance le rendu vidéo (FFmpeg). Supporte position, animation et coordonnées drag."""
    from saasvisu.render_engine import render_lyric_video
    project_path = PROJECTS_DIR / project_id
    if not project_path.exists():
        raise HTTPException(status_code=404, detail="Projet introuvable")
    audio_dir = project_path / "audio"
    audio_file = next(audio_dir.glob("*"), None)
    if not audio_file:
        raise HTTPException(status_code=400, detail="Aucun fichier audio")
    sync_path = project_path / "sync.json"
    if not sync_path.exists():
        raise HTTPException(status_code=400, detail="Synchronisation non effectuée")
    out_path = project_path / "output.mp4"
    background_path = None
    for ext in BACKGROUND_EXT:
        candidate = project_path / f"background{ext}"
        if candidate.exists():
            background_path = candidate
            break
    try:
        render_lyric_video(
            audio_file, sync_path, out_path,
            template_name=template, ratio=ratio, resolution=resolution,
            background_path=background_path,
            font_name=(font and font.strip()) or "Arial",
            font_size=font_size or None,
            text_effect=(effect and effect.strip()) or "classique",
            text_color=text_color or None,
            position=(position and position.strip()) or "bottom",
            pos_x_pct=pos_x_pct,
            pos_y_pct=pos_y_pct,
            lyric_animation=(lyric_animation and lyric_animation.strip()) or None,
        )
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Rendu échoué : {str(e)}")
    return {"ok": True, "output": str(out_path)}


@app.get("/projects/{project_id}/download")
def download_video(project_id: str):
    """Télécharge la vidéo générée."""
    project_path = PROJECTS_DIR / project_id
    out_path = project_path / "output.mp4"
    if not out_path.exists():
        raise HTTPException(status_code=404, detail="Vidéo non générée")
    return FileResponse(out_path, filename="saasvisu_output.mp4")


def _parse_range(range_header: str | None, file_size: int) -> tuple[int, int] | None:
    """Parse Range header. Returns (start, end) inclusive or None for full file."""
    if not range_header or not range_header.strip().startswith("bytes="):
        return None
    try:
        parts = range_header.strip()[6:].split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
        end = min(end, file_size - 1)
        if start > end or start < 0:
            return None
        return (start, end)
    except (ValueError, IndexError):
        return None


@app.get("/projects/{project_id}/video")
def stream_video(project_id: str, request: Request):
    """Stream la vidéo avec support Range pour lecture complète et seek."""
    project_path = PROJECTS_DIR / project_id
    out_path = project_path / "output.mp4"
    if not out_path.exists():
        raise HTTPException(status_code=404, detail="Vidéo non générée")
    file_size = out_path.stat().st_size
    range_spec = _parse_range(request.headers.get("range"), file_size)
    if range_spec is None:
        return FileResponse(
            out_path,
            media_type="video/mp4",
            headers={"Accept-Ranges": "bytes", "Content-Length": str(file_size)},
        )
    start, end = range_spec
    length = end - start + 1
    with open(out_path, "rb") as f:
        f.seek(start)
        body = f.read(length)
    return Response(
        content=body,
        status_code=206,
        media_type="video/mp4",
        headers={
            "Accept-Ranges": "bytes",
            "Content-Length": str(length),
            "Content-Range": f"bytes {start}-{end}/{file_size}",
        },
    )


_AUDIO_MIME = {".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4"}


@app.get("/projects/{project_id}/audio")
def stream_audio(project_id: str):
    """Stream l'audio du projet pour prévisualisation (sans re-rendu)."""
    project_path = PROJECTS_DIR / project_id
    audio_dir = project_path / "audio"
    audio_file = next(audio_dir.glob("*"), None)
    if not audio_file or not audio_file.is_file():
        raise HTTPException(status_code=404, detail="Aucun fichier audio")
    mime = _AUDIO_MIME.get(audio_file.suffix.lower(), "audio/mpeg")
    return FileResponse(audio_file, media_type=mime)


@app.get("/projects/{project_id}/project-info")
def get_project_info(project_id: str):
    """Infos projet pour l'aperçu (fond image ou vidéo)."""
    project_path = PROJECTS_DIR / project_id
    if not project_path.exists():
        raise HTTPException(status_code=404, detail="Projet introuvable")
    has_audio = bool(next((project_path / "audio").glob("*"), None))
    background_type = None
    for ext in BACKGROUND_EXT:
        if (project_path / f"background{ext}").exists():
            background_type = "video" if ext in BACKGROUND_VIDEO_EXT else "image"
            break
    return {"has_audio": has_audio, "background_type": background_type}


@app.get("/projects/{project_id}/background")
def stream_background(project_id: str):
    """Stream le fond (image ou vidéo) pour l'aperçu en direct."""
    project_path = PROJECTS_DIR / project_id
    if not project_path.exists():
        raise HTTPException(status_code=404, detail="Projet introuvable")
    _BG_MIME = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".bmp": "image/bmp", ".webp": "image/webp",
                 ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime", ".avi": "video/x-msvideo", ".mkv": "video/x-matroska"}
    for ext in BACKGROUND_EXT:
        candidate = project_path / f"background{ext}"
        if candidate.exists():
            return FileResponse(candidate, media_type=_BG_MIME.get(ext, "application/octet-stream"))
    raise HTTPException(status_code=404, detail="Aucun fond")


if STATIC_DIR.exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


if __name__ == "__main__":
    import uvicorn
    # reload=True : redémarre tout seul quand tu modifies un fichier .py (pas besoin de couper/relancer)
    uvicorn.run("saasvisu.web_api.main:app", host="0.0.0.0", port=8000, reload=True)
