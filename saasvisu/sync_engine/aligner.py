"""
Alignement des lignes de paroles avec des segments temporels.
- Répartition uniforme (sans Whisper).
- Avec Whisper : alignement sur les segments de transcription (voix réelle).
"""
import json
from pathlib import Path
from typing import Any


def align_lyrics_to_segments(
    lines: list[dict[str, Any]], duration_seconds: float
) -> list[dict[str, Any]]:
    """
    Répartit les lignes uniformément sur la durée de l'audio.
    Chaque entrée aura start_time_ms et end_time_ms.
    """
    if not lines:
        return []
    step = duration_seconds / len(lines)
    result = []
    for i, line in enumerate(lines):
        start = i * step
        end = (i + 1) * step
        result.append({
            **line,
            "start_time_ms": int(start * 1000),
            "end_time_ms": int(end * 1000),
        })
    return result


def align_lyrics_with_whisper(
    user_lines: list[dict[str, Any]],
    whisper_segments: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Assigne à chaque ligne de paroles utilisateur un créneau horaire
    en regroupant les segments Whisper (par ordre).
    On garde le texte des paroles utilisateur (pas celui de Whisper).

    :param user_lines: liste de {"id", "text"} (paroles saisies)
    :param whisper_segments: liste de {"start_time_ms", "end_time_ms", "text"} (sortie Whisper)
    :return: liste de segments au format sync.json (start_time_ms, end_time_ms, text, id)
    """
    if not user_lines:
        return []
    if not whisper_segments:
        # Pas de segments Whisper : fallback sur un seul bloc par ligne (0 à 0)
        return [{**line, "start_time_ms": 0, "end_time_ms": 0} for line in user_lines]

    n_lines = len(user_lines)
    n_seg = len(whisper_segments)
    result = []
    for i, line in enumerate(user_lines):
        start_idx = (i * n_seg) // n_lines
        end_idx = ((i + 1) * n_seg) // n_lines
        if end_idx <= start_idx:
            end_idx = start_idx + 1
        end_idx = min(end_idx, n_seg)
        first = whisper_segments[start_idx]
        last = whisper_segments[end_idx - 1]
        result.append({
            **line,
            "start_time_ms": first["start_time_ms"],
            "end_time_ms": last["end_time_ms"],
        })
    return result


def align_heartmula_on_whisper(
    heartmula_text: str,
    whisper_segments: list[dict[str, Any]],
    min_match_ratio: float = 0.25,
) -> list[dict[str, Any]]:
    """
    Pipeline hybride : texte HeartMuLa + timestamps Whisper.

    Stratégie :
    1. Découpe les deux sources en mots, normalise (minuscules, sans accents/ponctuation).
    2. SequenceMatcher aligne les deux séquences (fuzzy matching).
    3. Si le taux de correspondance est >= min_match_ratio → on utilise l'alignement
       (chaque mot HeartMuLa reçoit le timestamp du mot Whisper correspondant).
    4. Si le taux est trop bas → fallback proportionnel sur la timeline Whisper.
    5. Les mots sans correspondance sont interpolés entre leurs voisins.
    """
    from difflib import SequenceMatcher
    import unicodedata
    import re

    _p = lambda msg: print(f"[aligner] {msg}", flush=True)

    def _norm(w: str) -> str:
        w = unicodedata.normalize("NFKD", w.lower())
        return re.sub(r"[^\w]", "", w)

    hm_words = [w for w in heartmula_text.split() if w.strip()]
    if not hm_words:
        return []

    wh_words = []
    for seg in whisper_segments:
        txt = (seg.get("text") or "").strip()
        if not txt:
            continue
        wh_words.append({
            "text": txt,
            "start": seg.get("start_time_ms", 0),
            "end": seg.get("end_time_ms", 0),
        })
    if not wh_words:
        return []

    _p(f"HeartMuLa : {len(hm_words)} mots | Whisper : {len(wh_words)} mots")

    hm_norm = [_norm(w) for w in hm_words]
    wh_norm = [_norm(w["text"]) for w in wh_words]

    # --- Alignement par SequenceMatcher ---
    sm = SequenceMatcher(None, hm_norm, wh_norm)
    hm_to_wh: dict[int, int] = {}
    for tag, i1, i2, j1, j2 in sm.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                hm_to_wh[i1 + k] = j1 + k
        elif tag == "replace":
            for k in range(min(i2 - i1, j2 - j1)):
                hm_to_wh[i1 + k] = j1 + k

    match_ratio = len(hm_to_wh) / max(len(hm_words), 1)
    _p(f"Taux de correspondance : {match_ratio:.0%} ({len(hm_to_wh)}/{len(hm_words)} mots)")

    # --- Fallback proportionnel si trop peu de correspondances ---
    if match_ratio < min_match_ratio:
        _p("Taux trop bas → fallback proportionnel sur la timeline Whisper.")
        timeline_start = wh_words[0]["start"]
        timeline_end = wh_words[-1]["end"]
        total_dur = max(timeline_end - timeline_start, 1)
        total_chars = max(sum(len(w) for w in hm_words), 1)
        result = []
        t = float(timeline_start)
        for i, word in enumerate(hm_words):
            w_start = int(t)
            char_ratio = len(word) / total_chars
            t += char_ratio * total_dur
            w_end = int(t) if i < len(hm_words) - 1 else timeline_end
            result.append({"text": word, "start_time_ms": w_start, "end_time_ms": w_end})
        return result

    # --- Construire le résultat avec correspondances ---
    result: list[dict[str, Any]] = []
    for i, word in enumerate(hm_words):
        if i in hm_to_wh:
            wh = wh_words[hm_to_wh[i]]
            result.append({"text": word, "start_time_ms": wh["start"], "end_time_ms": wh["end"]})
        else:
            result.append({"text": word, "start_time_ms": -1, "end_time_ms": -1})

    # --- Interpolation des mots non matchés ---
    i = 0
    while i < len(result):
        if result[i]["start_time_ms"] >= 0:
            i += 1
            continue
        gap_start = i
        while i < len(result) and result[i]["start_time_ms"] < 0:
            i += 1
        gap_end = i

        prev_end = 0
        if gap_start > 0:
            prev_end = result[gap_start - 1]["end_time_ms"]
        next_start = prev_end + 500
        if gap_end < len(result):
            next_start = result[gap_end]["start_time_ms"]

        gap_len = gap_end - gap_start
        step = (next_start - prev_end) / (gap_len + 1)
        for k in range(gap_len):
            idx = gap_start + k
            s = int(prev_end + step * (k + 1))
            e = int(prev_end + step * (k + 2))
            result[idx]["start_time_ms"] = s
            result[idx]["end_time_ms"] = min(e, next_start)

    # Frontières continues : pas de trou ni chevauchement (meilleur calage temps réel)
    if len(result) > 1:
        for i in range(len(result) - 1):
            curr_end = result[i]["end_time_ms"]
            next_start = result[i + 1]["start_time_ms"]
            if next_start < curr_end:
                result[i + 1]["start_time_ms"] = curr_end
            result[i]["end_time_ms"] = result[i + 1]["start_time_ms"]

    _p(f"Alignement terminé : {len(result)} mots avec timestamps.")
    return result


def load_sync_json(path: str | Path) -> list[dict[str, Any]]:
    """Charge un fichier sync.json (lignes avec start_time_ms, end_time_ms)."""
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        raise ValueError("sync.json doit contenir une liste de segments")
    return data


def save_sync_json(path: str | Path, segments: list[dict[str, Any]]) -> None:
    """Sauvegarde les segments synchronisés en JSON."""
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(segments, f, ensure_ascii=False, indent=2)
