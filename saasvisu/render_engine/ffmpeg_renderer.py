"""
Génération de la vidéo finale via FFmpeg.
Fond : couleur (défaut), image (photo) ou vidéo — adapté au format (rempli, recadré).
Paroles en ASS mot par mot avec polices et effets.
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

# Large panel de polices (style CapCut / pro)
FONTS = [
    "Arial", "Arial Black", "Georgia", "Impact", "Times New Roman", "Verdana",
    "Comic Sans MS", "Courier New", "Trebuchet MS", "Palatino Linotype",
    "Lucida Sans Unicode", "Tahoma", "Franklin Gothic Medium", "Segoe UI", "Consolas",
    "Segoe UI Semibold", "Segoe UI Light", "Calibri", "Cambria", "Candara",
    "Constantia", "Corbel", "Ebrima", "Gadugi", "Malgun Gothic",
    "Microsoft Sans Serif", "Mongolian Baiti", "PMingLiU", "SimSun", "Sylfaen",
    "Century Gothic", "Lucida Console", "Lucida Sans", "Book Antiqua",
    "Bookman Old Style", "Garamond", "MS Gothic", "MS PGothic", "MS UI Gothic",
    "Niagara Engraved", "Niagara Solid", "OCR A Extended", "Tempus Sans ITC",
    "Viner Hand ITC", "Bauhaus 93", "Bernard MT Condensed", "Bodoni MT",
    "Britannic Bold", "Broadway", "Brush Script MT", "Castellar", "Century Schoolbook",
    "Colonna MT", "Cooper Black", "Footlight MT Light", "Haettenschweiler",
    "HoloLens MDL2 Assets", "Informal Roman", "Javanese Text", "Juice ITC",
    "Magneto", "Matura MT Script Capitals", "Mistral", "Modern No. 20",
    "Monotype Corsiva", "OCR B MT", "Old English Text MT", "Onyx", "Parchment",
    "Playbill", "Poor Richard", "Ravie", "Stencil", "Vivaldi", "Vladimir Script",
]

# Effets texte : outline, shadow (pixels), bold, italic. Large panel style CapCut
EFFECTS = {
    "minimal": {"outline": 0, "shadow": 0, "bold": 0, "italic": 0},
    "classique": {"outline": 2, "shadow": 1, "bold": 0, "italic": 0},
    "outline_fin": {"outline": 1, "shadow": 0, "bold": 0, "italic": 0},
    "outline": {"outline": 2, "shadow": 0, "bold": 0, "italic": 0},
    "outline_epais": {"outline": 4, "shadow": 0, "bold": 0, "italic": 0},
    "outline_tres_epais": {"outline": 6, "shadow": 0, "bold": 0, "italic": 0},
    "ombre": {"outline": 0, "shadow": 2, "bold": 0, "italic": 0},
    "ombre_forte": {"outline": 0, "shadow": 4, "bold": 0, "italic": 0},
    "ombre_tres_forte": {"outline": 0, "shadow": 6, "bold": 0, "italic": 0},
    "outline_ombre": {"outline": 2, "shadow": 1, "bold": 0, "italic": 0},
    "outline_ombre_fort": {"outline": 3, "shadow": 2, "bold": 0, "italic": 0},
    "gras": {"outline": 2, "shadow": 1, "bold": 1, "italic": 0},
    "gras_epais": {"outline": 3, "shadow": 2, "bold": 1, "italic": 0},
    "italique": {"outline": 2, "shadow": 1, "bold": 0, "italic": 1},
    "gras_italique": {"outline": 2, "shadow": 1, "bold": 1, "italic": 1},
    "neon": {"outline": 1, "shadow": 3, "bold": 0, "italic": 0},
    "pop": {"outline": 4, "shadow": 2, "bold": 1, "italic": 0},
    "elegant": {"outline": 1, "shadow": 2, "bold": 0, "italic": 1},
    "retro": {"outline": 3, "shadow": 0, "bold": 1, "italic": 0},
    "discret": {"outline": 0, "shadow": 1, "bold": 0, "italic": 0},
}


def _effect_to_ass_style(
    font_name: str,
    font_size: int,
    primary_hex: str = "FFFFFF",
    outline_hex: str = "000000",
    outline: int = 2,
    shadow: int = 1,
    bold: int = 0,
    italic: int = 0,
    margin_v: int = 80,
) -> str:
    """Construit une ligne Style ASS : centré en bas, une seule ligne à la fois."""
    p = primary_hex.lstrip("#")[:6]
    pc = f"&H00{p[4:6]}{p[2:4]}{p[0:2]}"
    oc = outline_hex.lstrip("#")[:6]
    ochex = f"&H00{oc[4:6]}{oc[2:4]}{oc[0:2]}"
    return f"Style: Default,{font_name},{font_size},{pc},{ochex},&H80000000,{bold},{italic},1,{outline},{shadow},2,10,10,{margin_v},1"


def _normalize_segments(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Trie les segments par start_time_ms et supprime les chevauchements :
    à chaque instant un seul mot est affiché, dans l'ordre chronologique.
    """
    if not segments:
        return []
    sorted_seg = sorted(segments, key=lambda x: (x.get("start_time_ms", 0), x.get("end_time_ms", 0)))
    out = []
    for i, seg in enumerate(sorted_seg):
        start = seg.get("start_time_ms", 0)
        end = seg.get("end_time_ms", 0)
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        # Pas de chevauchement : ce mot se termine quand le suivant commence
        if out and start < out[-1]["end_time_ms"]:
            start = out[-1]["end_time_ms"]
        if end <= start:
            end = start + 200  # durée min 200 ms
        if out and start < out[-1]["end_time_ms"]:
            out[-1]["end_time_ms"] = start
        out.append({"start_time_ms": start, "end_time_ms": end, "text": text})
    return out


def _segments_to_ass(
    segments: list[dict[str, Any]],
    width: int,
    height: int,
    font_name: str = "Arial",
    font_size: int = 48,
    primary_color: str = "#FFFFFF",
    outline_color: str = "#000000",
    effect: dict[str, int] | None = None,
) -> str:
    """Génère le contenu ASS : un mot à la fois, centré, ordre chronologique, sans chevauchement."""
    normalized = _normalize_segments(segments)
    eff = effect or EFFECTS["classique"]
    outline = eff.get("outline", 2)
    shadow = eff.get("shadow", 1)
    bold = eff.get("bold", 0)
    italic = eff.get("italic", 0)
    margin_v = max(40, min(height // 8, 120))
    style_line = _effect_to_ass_style(
        font_name, font_size,
        primary_hex=primary_color.lstrip("#"),
        outline_hex=outline_color.lstrip("#"),
        outline=outline, shadow=shadow, bold=bold, italic=italic, margin_v=margin_v,
    )
    lines = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        style_line,
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    for seg in normalized:
        start_ms = seg.get("start_time_ms", 0)
        end_ms = seg.get("end_time_ms", 0)
        text = (seg.get("text") or "").replace("\n", " ").strip()
        if not text:
            continue
        start_s = _ms_to_ass_time(start_ms)
        end_s = _ms_to_ass_time(end_ms)
        # Dialogue: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
        lines.append(f"Dialogue: 0,{start_s},{end_s},Default,,0,0,0,,{text}")
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
    font_name: str | None = None,
    font_size: int | None = None,
    text_effect: str | None = None,
    text_color: str | None = None,
    outline_color: str | None = None,
) -> Path:
    """
    Génère la vidéo MP4 (visualizer).
    Fond image/vidéo : rempli au format choisi (cover, recadré).
    Paroles : un segment = un mot (affichage dynamique), avec police et effet au choix.
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
    text_cfg = t.get("text", {})
    font = font_name or text_cfg.get("font_family", "Arial")
    size = font_size or text_cfg.get("font_size", 48)
    primary_color = (text_color or text_cfg.get("color") or "#FFFFFF").strip()
    if not primary_color.startswith("#"):
        primary_color = "#" + primary_color
    outline_hex = (outline_color or "#000000").strip()
    if not outline_hex.startswith("#"):
        outline_hex = "#" + outline_hex
    effect_key = (text_effect or "classique").strip() or "classique"
    effect_dict = EFFECTS.get(effect_key, EFFECTS["classique"])

    ass_content = _segments_to_ass(
        segments, w, h,
        font_name=font, font_size=size,
        primary_color=primary_color, outline_color=outline_hex,
        effect=effect_dict,
    )
    ass_path = output_path.parent / (output_path.stem + "_subs.ass")
    ass_path.write_text(ass_content, encoding="utf-8")

    # Chemin ASS pour le filtre : sous Windows le "C:" est mal interprété par FFmpeg,
    # donc on lance FFmpeg depuis le dossier du projet et on passe uniquement le nom du fichier.
    work_dir = output_path.parent
    ass_filter_name = ass_path.name

    # Fond image/vidéo : remplir tout le cadre (cover), recadrage centré si besoin
    scale_crop_filter = f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}:(iw-ow)/2:(ih-oh)/2"
    ass_filter = f"ass='{ass_filter_name}'"

    if background_path is not None:
        bg_path = Path(background_path)
        if not bg_path.exists():
            raise FileNotFoundError(f"Fichier fond introuvable: {bg_path}")
        ext = bg_path.suffix.lower()
        if ext in IMAGE_EXTENSIONS:
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-i", str(bg_path.resolve()),
                "-i", str(audio_path.resolve()),
                "-vf", f"{scale_crop_filter},{ass_filter}",
                "-t", str(duration),
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac", "-b:a", "192k",
                "-shortest", str(output_path.resolve()),
            ]
        elif ext in VIDEO_EXTENSIONS:
            cmd = [
                "ffmpeg", "-y",
                "-stream_loop", "-1", "-i", str(bg_path.resolve()),
                "-i", str(audio_path.resolve()),
                "-vf", f"{scale_crop_filter},{ass_filter}",
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
