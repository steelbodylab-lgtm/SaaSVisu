"""
Génération de la vidéo finale via FFmpeg.
Fond : couleur (défaut), image (photo) ou vidéo. Paroles en ASS par-dessus.
"""
import subprocess
from pathlib import Path
from typing import Any

# Résolutions (width, height) pour 16:9, 9:16, 1:1
RESOLUTIONS = {
    "720p": {"16:9": (1280, 720), "9:16": (720, 1280), "1:1": (720, 720)},
    "1080p": {"16:9": (1920, 1080), "9:16": (1080, 1920), "1:1": (1080, 1080)},
}

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi", ".mkv"}


def _segments_to_ass(segments: list[dict[str, Any]], width: int, height: int) -> str:
    """Génère le contenu d'un fichier ASS pour les sous-titres."""
    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment",
        "Style: Default,Arial,48,&H00FFFFFF,&H00000000,&H80000000,0,0,1,2,1,2",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Text",
    ]
    for seg in segments:
        start_ms = seg.get("start_time_ms", 0)
        end_ms = seg.get("end_time_ms", 0)
        text = seg.get("text", "").replace("\n", "\\N")
        start_s = _ms_to_ass_time(start_ms)
        end_s = _ms_to_ass_time(end_ms)
        lines.append(f"Dialogue: 0,{start_s},{end_s},Default,{text}")
    return "\n".join(lines)


def _ms_to_ass_time(ms: int) -> str:
    """Convertit des millisecondes en format ASS (H:MM:SS.cc)."""
    s, c = divmod(ms, 1000)
    m, s = divmod(s, 60)
    h, m = divmod(m, 60)
    return f"{h}:{m:02d}:{s:02d}.{c:02d}"


def _get_audio_duration_seconds(audio_path: Path) -> float:
    """Retourne la durée de l'audio en secondes."""
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path),
        ],
        capture_output=True, text=True, check=True,
    )
    return float(result.stdout.strip())


def render_lyric_video(
    audio_path: str | Path,
    segments_path: str | Path,
    output_path: str | Path,
    template_name: str = "minimal_16x9",
    ratio: str = "16:9",
    resolution: str = "720p",
    background_path: str | Path | None = None,
) -> Path:
    """
    Génère la vidéo MP4 (visualizer).

    - Si background_path est fourni (image ou vidéo) : utilisé comme fond.
    - Sinon : fond = couleur du template.
    - Les paroles (segments) sont toujours en sous-titres ASS par-dessus.

    Nécessite FFmpeg dans le PATH.
    """
    audio_path = Path(audio_path)
    segments_path = Path(segments_path)
    output_path = Path(output_path)

    if not audio_path.exists():
        raise FileNotFoundError(f"Audio introuvable: {audio_path}")
    if not segments_path.exists():
        raise FileNotFoundError(f"Fichier segments introuvable: {segments_path}")

    import json
    with open(segments_path, encoding="utf-8") as f:
        segments = json.load(f)

    res = RESOLUTIONS.get(resolution, RESOLUTIONS["720p"])
    w, h = res.get(ratio, (1280, 720))
    duration = _get_audio_duration_seconds(audio_path)

    from ..templates import load_template
    t = load_template(template_name)
    bg = t.get("background", {})
    default_color = bg.get("value", "#1a1a2e").lstrip("#")
    r, g, b = int(default_color[0:2], 16), int(default_color[2:4], 16), int(default_color[4:6], 16)

    ass_content = _segments_to_ass(segments, w, h)
    ass_path = output_path.parent / (output_path.stem + "_subs.ass")
    ass_path.write_text(ass_content, encoding="utf-8")

    # Chemin ASS pour le filtre : sous Windows le "C:" est mal interprété par FFmpeg,
    # donc on lance FFmpeg depuis le dossier du projet et on passe uniquement le nom du fichier.
    work_dir = output_path.parent
    ass_filter_name = ass_path.name

    scale_filter = f"scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2"
    ass_filter = f"ass='{ass_filter_name}'"

    if background_path is not None:
        bg_path = Path(background_path)
        if not bg_path.exists():
            raise FileNotFoundError(f"Fichier fond introuvable: {bg_path}")
        ext = bg_path.suffix.lower()
        if ext in IMAGE_EXTENSIONS:
            # Image en boucle sur la durée de l'audio
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-i", str(bg_path.resolve()),
                "-i", str(audio_path.resolve()),
                "-vf", f"{scale_filter},{ass_filter}",
                "-t", str(duration),
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac", "-b:a", "192k",
                "-shortest", str(output_path.resolve()),
            ]
        elif ext in VIDEO_EXTENSIONS:
            # Vidéo : boucler si plus courte que l'audio, puis limiter à duration
            cmd = [
                "ffmpeg", "-y",
                "-stream_loop", "-1", "-i", str(bg_path.resolve()),
                "-i", str(audio_path.resolve()),
                "-vf", f"{scale_filter},{ass_filter}",
                "-t", str(duration),
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac", "-b:a", "192k",
                "-shortest", str(output_path.resolve()),
            ]
        else:
            raise ValueError(f"Format de fond non supporté: {ext}. Utiliser image ({IMAGE_EXTENSIONS}) ou vidéo ({VIDEO_EXTENSIONS})")
    else:
        # Fond couleur (comportement d'origine)
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c=0x{r:02x}{g:02x}{b:02x}:s={w}x{h}:d={duration}",
            "-i", str(audio_path.resolve()),
            "-vf", ass_filter,
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest", str(output_path.resolve()),
        ]

    result = subprocess.run(cmd, capture_output=True, text=True, cwd=str(work_dir))
    if result.returncode != 0:
        err = (result.stderr or result.stdout or "").strip() or "FFmpeg a échoué"
        raise RuntimeError(err)
    ass_path.unlink(missing_ok=True)
    return output_path
