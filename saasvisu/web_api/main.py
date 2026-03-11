"""
API REST locale pour Saas Visu (FastAPI).
Endpoints : projets, upload audio, paroles, sync, render, download.
Interface locale servie en / (fichiers statiques).
"""
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
import uuid
import shutil

app = FastAPI(title="Saas Visu API", version="0.1.0")

# Racine du projet et dossiers
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
PROJECTS_DIR = PROJECT_ROOT / "projects"
STATIC_DIR = PROJECT_ROOT / "static"
PROJECTS_DIR.mkdir(parents=True, exist_ok=True)


class ProjectCreate(BaseModel):
    name: str


class LyricsBody(BaseModel):
    text: str


@app.get("/")
def root():
    """Sert l'interface locale si elle existe, sinon JSON d'accueil."""
    index_html = STATIC_DIR / "index.html"
    if index_html.exists():
        return FileResponse(index_html, media_type="text/html")
    return {"service": "Saas Visu API", "docs": "/docs"}


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
    """Upload un fichier audio dans le projet."""
    project_path = PROJECTS_DIR / project_id
    if not project_path.exists() or not (project_path / "projet.json").exists():
        raise HTTPException(status_code=404, detail="Projet introuvable")
    ext = Path(file.filename or "").suffix or ".mp3"
    dest = project_path / "audio" / f"track{ext}"
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"ok": True, "path": str(dest)}


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
def run_sync(project_id: str):
    """Lance la synchro (alignement uniforme pour l'instant)."""
    from saasvisu.audio_ingest import get_metadata
    from saasvisu.lyrics import load_lyrics_json
    from saasvisu.sync_engine import align_lyrics_to_segments
    from saasvisu.sync_engine.aligner import save_sync_json
    project_path = PROJECTS_DIR / project_id
    if not project_path.exists():
        raise HTTPException(status_code=404, detail="Projet introuvable")
    audio_dir = project_path / "audio"
    audio_file = next(audio_dir.glob("*"), None)
    if not audio_file:
        raise HTTPException(status_code=400, detail="Aucun fichier audio dans le projet")
    lyrics_path = project_path / "lyrics.json"
    if not lyrics_path.exists():
        raise HTTPException(status_code=400, detail="Paroles non enregistrées")
    meta = get_metadata(audio_file)
    lines = load_lyrics_json(lyrics_path)
    segments = align_lyrics_to_segments(lines, meta["duration_seconds"])
    sync_path = project_path / "sync.json"
    save_sync_json(sync_path, segments)
    return {"ok": True, "segments_count": len(segments)}


@app.post("/projects/{project_id}/render")
def run_render(project_id: str, template: str = "minimal_16x9", ratio: str = "16:9", resolution: str = "720p"):
    """Lance le rendu vidéo (FFmpeg)."""
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
    # Fond optionnel : photo ou vidéo uploadée dans le projet
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


@app.get("/projects/{project_id}/video")
def stream_video(project_id: str):
    """Stream la vidéo pour lecture dans le navigateur (<video src='...'>)."""
    project_path = PROJECTS_DIR / project_id
    out_path = project_path / "output.mp4"
    if not out_path.exists():
        raise HTTPException(status_code=404, detail="Vidéo non générée")
    return FileResponse(
        out_path,
        media_type="video/mp4",
        headers={"Accept-Ranges": "bytes"},
    )


if STATIC_DIR.exists():
    from fastapi.staticfiles import StaticFiles
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
