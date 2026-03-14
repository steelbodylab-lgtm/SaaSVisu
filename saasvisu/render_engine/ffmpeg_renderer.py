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


_POS_TO_ALIGNMENT = {
    "bottom": 2,
    "center": 5,
    "top": 8,
    "drag": 5,
}

_MOVE_ANIMS = {"slideUp", "slideDown", "dropIn"}


def _compute_anchor_xy(
    alignment: int, width: int, height: int, margin_v: int, font_size: int,
    pos_x_pct: float | None = None, pos_y_pct: float | None = None,
) -> tuple[int, int]:
    if pos_x_pct is not None and pos_y_pct is not None:
        return (int(pos_x_pct * width / 100), int(pos_y_pct * height / 100))
    cx = width // 2
    if alignment in (7, 8, 9):
        cy = margin_v + font_size // 2
    elif alignment in (4, 5, 6):
        cy = height // 2
    else:
        cy = height - margin_v - font_size // 2
    return (cx, cy)


def _build_override_tags(
    anim_key: str | None, cx: int, cy: int, need_pos: bool,
) -> str:
    """Tags ASS d'animation et/ou de position explicite."""
    parts: list[str] = []
    is_move = anim_key in _MOVE_ANIMS if anim_key else False
    if need_pos and not is_move:
        parts.append(f"\\an5\\pos({cx},{cy})")
    off = 60
    big_off = 200
    if anim_key == "fadeIn":
        parts.append("\\fad(300,0)")
    elif anim_key == "slideUp":
        parts.append(f"\\an5\\move({cx},{cy + off},{cx},{cy},0,350)\\fad(200,0)")
    elif anim_key == "slideDown":
        parts.append(f"\\an5\\move({cx},{cy - off},{cx},{cy},0,350)\\fad(200,0)")
    elif anim_key == "scaleIn":
        parts.append("\\fscx20\\fscy20\\t(0,350,\\fscx100\\fscy100)\\fad(150,0)")
    elif anim_key == "bounceIn":
        parts.append("\\fscx0\\fscy0\\t(0,200,\\fscx120\\fscy120)\\t(200,350,\\fscx100\\fscy100)\\fad(100,0)")
    elif anim_key == "glitch":
        parts.append("\\fad(80,0)\\shad3\\t(0,150,\\shad0)")
    elif anim_key == "blurReveal":
        parts.append("\\blur15\\fscx130\\fscy130\\t(0,400,\\blur0\\fscx100\\fscy100)\\fad(200,0)")
    elif anim_key == "flipIn":
        parts.append("\\fscy0\\fad(100,0)\\t(0,350,\\fscy100)")
    elif anim_key == "neonPulse":
        parts.append("\\bord5\\blur3\\fad(200,0)\\t(0,350,\\bord2\\blur1)\\t(350,700,\\bord4\\blur2)")
    elif anim_key == "dropIn":
        parts.append(f"\\an5\\move({cx},{max(0, cy - big_off)},{cx},{cy},0,400)\\fad(100,0)")
    elif anim_key == "zoomBlur":
        parts.append("\\fscx250\\fscy250\\blur12\\t(0,400,\\fscx100\\fscy100\\blur0)\\fad(80,0)")
    elif anim_key == "typewriter":
        parts.append("\\fad(50,0)")
    elif anim_key == "waveIn":
        parts.append("\\frz(-5)\\fad(250,0)\\t(0,450,\\frz0)")
    elif anim_key == "splitReveal":
        parts.append("\\fscx0\\fad(100,0)\\t(0,350,\\fscx100)")
    elif anim_key == "spinIn":
        parts.append("\\frz(-180)\\fscx0\\fscy0\\fad(80,0)\\t(0,400,\\frz0\\fscx100\\fscy100)")
    if not parts:
        return ""
    return "{" + "".join(parts) + "}"


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
    alignment: int = 2,
) -> str:
    """Construit une ligne Style ASS."""
    p = primary_hex.lstrip("#")[:6]
    pc = f"&H00{p[4:6]}{p[2:4]}{p[0:2]}"
    oc = outline_hex.lstrip("#")[:6]
    ochex = f"&H00{oc[4:6]}{oc[2:4]}{oc[0:2]}"
    return f"Style: Default,{font_name},{font_size},{pc},{ochex},&H80000000,{bold},{italic},1,{outline},{shadow},{alignment},10,10,{margin_v},1"


def _normalize_segments(segments: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Trie les segments par start_time_ms et assure une durée valide.
    On garde les timestamps Azure tels quels : le mot s'affiche quand il est dit dans la chanson.
    """
    if not segments:
        return []
    sorted_seg = sorted(segments, key=lambda x: (x.get("start_time_ms", 0), x.get("end_time_ms", 0)))
    out = []
    for seg in sorted_seg:
        start = seg.get("start_time_ms", 0)
        end = seg.get("end_time_ms", 0)
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        if end <= start:
            end = start + 200  # durée min 200 ms
        out.append({"start_time_ms": start, "end_time_ms": end, "text": text})
    return out


# Pause (ms) entre deux mots au-delà de laquelle on considère une nouvelle phrase
PHRASE_PAUSE_MS = 550


def _group_words_into_phrases(
    segments: list[dict[str, Any]], pause_ms: int = PHRASE_PAUSE_MS
) -> list[list[dict[str, Any]]]:
    """
    Regroupe les mots en phrases : un silence (écart entre deux mots) > pause_ms = nouvelle phrase.
    Retourne une liste de phrases, chaque phrase = liste de segments (mots).
    """
    normalized = _normalize_segments(segments)
    if not normalized:
        return []
    phrases: list[list[dict[str, Any]]] = []
    current: list[dict[str, Any]] = [normalized[0]]
    for i in range(1, len(normalized)):
        prev_end = normalized[i - 1].get("end_time_ms", 0)
        curr_start = normalized[i].get("start_time_ms", 0)
        if curr_start - prev_end >= pause_ms:
            phrases.append(current)
            current = [normalized[i]]
        else:
            current.append(normalized[i])
    if current:
        phrases.append(current)
    return phrases


def _make_ass_header(
    width: int, height: int, styles: list[str],
) -> list[str]:
    return [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {width}",
        f"PlayResY: {height}",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        *styles,
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]


def _common_style_params(
    effect: dict[str, int] | None, height: int, position: str,
) -> tuple[dict[str, int], int, int]:
    eff = effect or EFFECTS["classique"]
    alignment = _POS_TO_ALIGNMENT.get(position, 2)
    if position in ("center", "drag"):
        margin_v = 0
    else:
        margin_v = max(40, min(height // 8, 120))
    return eff, alignment, margin_v


def _segments_to_ass_phrase_accumulation(
    segments: list[dict[str, Any]],
    width: int,
    height: int,
    font_name: str = "Arial",
    font_size: int = 48,
    primary_color: str = "#FFFFFF",
    outline_color: str = "#000000",
    effect: dict[str, int] | None = None,
    position: str = "bottom",
    pos_x_pct: float | None = None,
    pos_y_pct: float | None = None,
    lyric_animation: str | None = None,
) -> str:
    """Mode accumulation : les mots s'ajoutent un par un dans la phrase."""
    phrases = _group_words_into_phrases(segments)
    eff, alignment, margin_v = _common_style_params(effect, height, position)
    style_line = _effect_to_ass_style(
        font_name, font_size,
        primary_hex=primary_color.lstrip("#"),
        outline_hex=outline_color.lstrip("#"),
        outline=eff.get("outline", 2), shadow=eff.get("shadow", 1),
        bold=eff.get("bold", 0), italic=eff.get("italic", 0),
        margin_v=margin_v, alignment=alignment,
    )
    need_pos = position == "drag" or (lyric_animation in _MOVE_ANIMS)
    cx, cy = _compute_anchor_xy(alignment, width, height, margin_v, font_size, pos_x_pct, pos_y_pct)
    override = _build_override_tags(lyric_animation, cx, cy, need_pos)
    lines = _make_ass_header(width, height, [style_line])
    for phrase in phrases:
        if not phrase:
            continue
        for i, word in enumerate(phrase):
            start_ms = word.get("start_time_ms", 0)
            if i + 1 < len(phrase):
                end_ms = phrase[i + 1].get("start_time_ms", start_ms + 500)
            else:
                end_ms = word.get("end_time_ms", start_ms + 300)
            text = " ".join((w.get("text") or "").strip() for w in phrase[: i + 1]).strip()
            if not text:
                continue
            lines.append(f"Dialogue: 0,{_ms_to_ass_time(start_ms)},{_ms_to_ass_time(end_ms)},Default,,0,0,0,,{override}{text}")
    return "\n".join(lines)


def _segments_to_ass_ligne(
    segments: list[dict[str, Any]],
    width: int,
    height: int,
    font_name: str = "Arial",
    font_size: int = 48,
    primary_color: str = "#FFFFFF",
    outline_color: str = "#000000",
    effect: dict[str, int] | None = None,
    position: str = "bottom",
    pos_x_pct: float | None = None,
    pos_y_pct: float | None = None,
    lyric_animation: str | None = None,
) -> str:
    """Mode ligne complète : toute la phrase, mot actif surligné en couleur accent."""
    phrases = _group_words_into_phrases(segments)
    eff, alignment, margin_v = _common_style_params(effect, height, position)
    p_hex = primary_color.lstrip("#")[:6]
    highlight_hex = "00FFFF"
    style_line = _effect_to_ass_style(
        font_name, font_size,
        primary_hex=p_hex, outline_hex=outline_color.lstrip("#"),
        outline=eff.get("outline", 2), shadow=eff.get("shadow", 1),
        bold=eff.get("bold", 0), italic=eff.get("italic", 0),
        margin_v=margin_v, alignment=alignment,
    )
    need_pos = position == "drag" or (lyric_animation in _MOVE_ANIMS)
    cx, cy = _compute_anchor_xy(alignment, width, height, margin_v, font_size, pos_x_pct, pos_y_pct)
    override = _build_override_tags(lyric_animation, cx, cy, need_pos)
    hc_bgr = f"&H00{highlight_hex[4:6]}{highlight_hex[2:4]}{highlight_hex[0:2]}"
    dim_alpha = "\\alpha&H90&"
    lines = _make_ass_header(width, height, [style_line])
    for phrase in phrases:
        if not phrase:
            continue
        for i, word in enumerate(phrase):
            start_ms = word.get("start_time_ms", 0)
            if i + 1 < len(phrase):
                end_ms = phrase[i + 1].get("start_time_ms", start_ms + 500)
            else:
                end_ms = word.get("end_time_ms", start_ms + 300)
            parts = []
            for j, w in enumerate(phrase):
                wtxt = (w.get("text") or "").strip()
                if j == i:
                    parts.append("{\\1c" + hc_bgr + "\\b1}" + wtxt + "{\\r}")
                else:
                    parts.append("{" + dim_alpha + "}" + wtxt + "{\\r}")
            text = " ".join(parts)
            lines.append(f"Dialogue: 0,{_ms_to_ass_time(start_ms)},{_ms_to_ass_time(end_ms)},Default,,0,0,0,,{override}{text}")
    return "\n".join(lines)


def _segments_to_ass_scroll(
    segments: list[dict[str, Any]],
    width: int,
    height: int,
    font_name: str = "Arial",
    font_size: int = 48,
    primary_color: str = "#FFFFFF",
    outline_color: str = "#000000",
    effect: dict[str, int] | None = None,
    position: str = "bottom",
    pos_x_pct: float | None = None,
    pos_y_pct: float | None = None,
    lyric_animation: str | None = None,
) -> str:
    """Mode scroll : ligne active (mot surligné) + ligne suivante en semi-transparent."""
    phrases = _group_words_into_phrases(segments)
    eff, alignment, margin_v = _common_style_params(effect, height, position)
    p_hex = primary_color.lstrip("#")[:6]
    highlight_hex = "00FFFF"
    next_margin_v = margin_v + font_size + 20
    style_active = _effect_to_ass_style(
        font_name, font_size,
        primary_hex=p_hex, outline_hex=outline_color.lstrip("#"),
        outline=eff.get("outline", 2), shadow=eff.get("shadow", 1),
        bold=eff.get("bold", 0), italic=eff.get("italic", 0),
        margin_v=margin_v, alignment=alignment,
    ).replace("Style: Default,", "Style: Active,")
    smaller = max(16, int(font_size * 0.8))
    style_next = _effect_to_ass_style(
        font_name, smaller,
        primary_hex=p_hex, outline_hex=outline_color.lstrip("#"),
        outline=max(0, eff.get("outline", 2) - 1), shadow=eff.get("shadow", 1),
        bold=0, italic=0,
        margin_v=next_margin_v, alignment=alignment,
    ).replace("Style: Default,", "Style: Next,")
    need_pos = position == "drag" or (lyric_animation in _MOVE_ANIMS)
    cx, cy = _compute_anchor_xy(alignment, width, height, margin_v, font_size, pos_x_pct, pos_y_pct)
    override = _build_override_tags(lyric_animation, cx, cy, need_pos)
    hc_bgr = f"&H00{highlight_hex[4:6]}{highlight_hex[2:4]}{highlight_hex[0:2]}"
    dim_alpha = "\\alpha&H90&"
    lines = _make_ass_header(width, height, [style_active, style_next])
    for pi, phrase in enumerate(phrases):
        if not phrase:
            continue
        for i, word in enumerate(phrase):
            start_ms = word.get("start_time_ms", 0)
            if i + 1 < len(phrase):
                end_ms = phrase[i + 1].get("start_time_ms", start_ms + 500)
            else:
                end_ms = word.get("end_time_ms", start_ms + 300)
            parts = []
            for j, w in enumerate(phrase):
                wtxt = (w.get("text") or "").strip()
                if j == i:
                    parts.append("{\\1c" + hc_bgr + "\\b1}" + wtxt + "{\\r}")
                else:
                    parts.append("{" + dim_alpha + "}" + wtxt + "{\\r}")
            text = " ".join(parts)
            lines.append(f"Dialogue: 0,{_ms_to_ass_time(start_ms)},{_ms_to_ass_time(end_ms)},Active,,0,0,0,,{override}{text}")
        phrase_start = phrase[0].get("start_time_ms", 0)
        phrase_end = phrase[-1].get("end_time_ms", 0)
        if pi + 1 < len(phrases):
            next_phrase = phrases[pi + 1]
            next_text = " ".join((w.get("text") or "").strip() for w in next_phrase)
            lines.append(f"Dialogue: 0,{_ms_to_ass_time(phrase_start)},{_ms_to_ass_time(phrase_end)},Next,,0,0,0,,{{\\alpha&H60&}}{next_text}")
    return "\n".join(lines)


def _segments_to_ass(
    segments: list[dict[str, Any]],
    width: int,
    height: int,
    font_name: str = "Arial",
    font_size: int = 48,
    primary_color: str = "#FFFFFF",
    outline_color: str = "#000000",
    effect: dict[str, int] | None = None,
    position: str = "bottom",
    pos_x_pct: float | None = None,
    pos_y_pct: float | None = None,
    lyric_animation: str | None = None,
) -> str:
    """Génère le contenu ASS : un mot à la fois, avec position et animation configurables."""
    normalized = _normalize_segments(segments)
    eff = effect or EFFECTS["classique"]
    outline = eff.get("outline", 2)
    shadow = eff.get("shadow", 1)
    bold = eff.get("bold", 0)
    italic = eff.get("italic", 0)
    alignment = _POS_TO_ALIGNMENT.get(position, 2)
    if position == "center":
        margin_v = 0
    elif position == "drag":
        margin_v = 0
    else:
        margin_v = max(40, min(height // 8, 120))
    style_line = _effect_to_ass_style(
        font_name, font_size,
        primary_hex=primary_color.lstrip("#"),
        outline_hex=outline_color.lstrip("#"),
        outline=outline, shadow=shadow, bold=bold, italic=italic,
        margin_v=margin_v, alignment=alignment,
    )
    need_pos = position == "drag" or (lyric_animation in _MOVE_ANIMS)
    cx, cy = _compute_anchor_xy(
        alignment, width, height, margin_v, font_size,
        pos_x_pct=pos_x_pct, pos_y_pct=pos_y_pct,
    )
    override = _build_override_tags(lyric_animation, cx, cy, need_pos)
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
        lines.append(f"Dialogue: 0,{start_s},{end_s},Default,,0,0,0,,{override}{text}")
    return "\n".join(lines)


def _ms_to_ass_time(ms: int) -> str:
    """Convertit des millisecondes en format ASS (H:MM:SS.cc = centièmes de seconde, pas ms)."""
    total_sec = ms // 1000
    centisec = (ms % 1000) // 10  # 0-99 pour ASS
    m, s = divmod(total_sec, 60)
    h, m = divmod(m, 60)
    return f"{h}:{m:02d}:{s:02d}.{centisec:02d}"


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
    position: str = "bottom",
    pos_x_pct: float | None = None,
    pos_y_pct: float | None = None,
    lyric_animation: str | None = None,
    display_mode: str = "mot",
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
    font = (font_name or text_cfg.get("font_family") or "Arial").strip() or "Arial"
    size = font_size or text_cfg.get("font_size", 48)
    primary_color = (text_color or text_cfg.get("color") or "#FFFFFF").strip()
    if not primary_color.startswith("#"):
        primary_color = "#" + primary_color
    outline_hex = (outline_color or "#000000").strip()
    if not outline_hex.startswith("#"):
        outline_hex = "#" + outline_hex
    effect_key = (text_effect or "classique").strip() or "classique"
    effect_dict = EFFECTS.get(effect_key, EFFECTS["classique"])

    _ass_common = dict(
        segments=segments, width=w, height=h,
        font_name=font, font_size=size,
        primary_color=primary_color, outline_color=outline_hex,
        effect=effect_dict,
        position=position or "bottom",
        pos_x_pct=pos_x_pct, pos_y_pct=pos_y_pct,
        lyric_animation=lyric_animation,
    )
    if display_mode == "accumulation":
        ass_content = _segments_to_ass_phrase_accumulation(**_ass_common)
    elif display_mode == "ligne":
        ass_content = _segments_to_ass_ligne(**_ass_common)
    elif display_mode == "scroll":
        ass_content = _segments_to_ass_scroll(**_ass_common)
    else:
        ass_content = _segments_to_ass(**_ass_common)
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
