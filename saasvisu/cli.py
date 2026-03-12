"""
CLI Saas Visu : init-project, sync, render.
"""
import argparse
from pathlib import Path


def _projects_dir() -> Path:
    return Path(__file__).resolve().parent.parent / "projects"


def cmd_init_project(name: str) -> None:
    """Crée un nouveau projet."""
    import uuid
    import json
    pid = str(uuid.uuid4())[:8]
    projects_dir = _projects_dir()
    projects_dir.mkdir(parents=True, exist_ok=True)
    project_path = projects_dir / pid
    project_path.mkdir(parents=True, exist_ok=True)
    (project_path / "audio").mkdir(exist_ok=True)
    meta = {"id": pid, "name": name}
    (project_path / "projet.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Projet créé: {project_path} (id={pid})")


def cmd_sync(
    audio: str,
    lyrics: str,
    out: str,
    use_whisper: bool = False,
    whisper_model: str = "base",
) -> None:
    """Synchronise les paroles avec l'audio (uniforme ou Whisper)."""
    from saasvisu.audio_ingest import get_metadata
    from saasvisu.lyrics import load_lyrics_json, lines_from_text
    from saasvisu.sync_engine import align_lyrics_to_segments, align_lyrics_with_whisper
    from saasvisu.sync_engine.aligner import save_sync_json

    audio_path = Path(audio)
    lyrics_path = Path(lyrics)
    out_path = Path(out)

    if not audio_path.exists():
        raise SystemExit(f"Fichier audio introuvable: {audio_path}")
    meta = get_metadata(audio_path)

    if lyrics_path.suffix.lower() == ".json":
        lines = load_lyrics_json(lyrics_path)
    else:
        text = lyrics_path.read_text(encoding="utf-8")
        lines = lines_from_text(text)

    if use_whisper:
        from saasvisu.sync_engine.whisper_adapter import transcribe_to_segments
        print(f"Transcription Whisper (modèle {whisper_model})…")
        whisper_segments = transcribe_to_segments(audio_path, model_name=whisper_model)
        if not whisper_segments:
            raise SystemExit("Whisper n'a retourné aucun segment. Vérifiez l'audio.")
        segments = align_lyrics_with_whisper(lines, whisper_segments)
        print(f"Sync Whisper enregistrée: {out_path} ({len(segments)} segments)")
    else:
        segments = align_lyrics_to_segments(lines, meta["duration_seconds"])
        print(f"Sync uniforme enregistrée: {out_path} ({len(segments)} segments)")

    save_sync_json(out_path, segments)


def cmd_render(
    project: str,
    template: str,
    ratio: str,
    resolution: str,
    output: str | None,
    background: str | None,
) -> None:
    """Génère la vidéo à partir du projet."""
    from saasvisu.render_engine import render_lyric_video

    project_path = Path(project)
    if not project_path.exists():
        project_path = _projects_dir() / project
    if not project_path.exists():
        raise SystemExit(f"Projet introuvable: {project}")

    audio_dir = project_path / "audio"
    audio_file = next(audio_dir.glob("*"), None) if audio_dir.exists() else None
    if not audio_file:
        raise SystemExit("Aucun fichier audio dans le projet")
    sync_path = project_path / "sync.json"
    if not sync_path.exists():
        raise SystemExit("Fichier sync.json manquant. Lancez d'abord la synchro.")
    out_path = Path(output) if output else project_path / "output.mp4"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Fond optionnel : --background ou fichier background.* dans le projet
    background_path = None
    if background:
        background_path = Path(background)
        if not background_path.exists():
            raise SystemExit(f"Fichier fond introuvable: {background_path}")
    else:
        for ext in (".jpg", ".jpeg", ".png", ".mp4", ".webm", ".mov"):
            candidate = project_path / f"background{ext}"
            if candidate.exists():
                background_path = candidate
                break

    render_lyric_video(
        audio_file, sync_path, out_path,
        template_name=template, ratio=ratio, resolution=resolution,
        background_path=background_path,
    )
    print(f"Vidéo générée: {out_path}")


def main() -> None:
    parser = argparse.ArgumentParser(prog="saasvisu", description="Saas Visu — Lyric Video Generator")
    sub = parser.add_subparsers(dest="command", required=True)

    p_init = sub.add_parser("init-project", help="Créer un projet")
    p_init.add_argument("--name", "-n", required=True, help="Nom du projet")
    p_init.set_defaults(func=lambda a: cmd_init_project(a.name))

    p_sync = sub.add_parser("sync", help="Synchroniser paroles / audio")
    p_sync.add_argument("--audio", "-a", required=True, help="Fichier audio")
    p_sync.add_argument("--lyrics", "-l", required=True, help="Fichier paroles (.txt ou .json)")
    p_sync.add_argument("--out", "-o", required=True, help="Fichier sync.json de sortie")
    p_sync.add_argument("--whisper", "-w", action="store_true", help="Utiliser Whisper pour aligner sur la voix")
    p_sync.add_argument("--model", "-m", default="base", help="Modèle Whisper (tiny, base, small, medium, large)")
    p_sync.set_defaults(func=lambda a: cmd_sync(a.audio, a.lyrics, a.out, a.whisper, a.model))

    p_render = sub.add_parser("render", help="Générer la vidéo")
    p_render.add_argument("--project", "-p", required=True, help="Dossier projet ou id")
    p_render.add_argument("--template", "-t", default="minimal_16x9", help="Template")
    p_render.add_argument("--ratio", "-r", default="16:9", choices=["16:9", "9:16", "1:1"])
    p_render.add_argument("--resolution", default="720p", choices=["720p", "1080p"])
    p_render.add_argument("--output", "-o", default=None, help="Fichier MP4 de sortie")
    p_render.add_argument("--background", "-b", default=None, help="Photo ou vidéo de fond (optionnel)")
    p_render.set_defaults(func=lambda a: cmd_render(a.project, a.template, a.ratio, a.resolution, a.output, a.background))

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
