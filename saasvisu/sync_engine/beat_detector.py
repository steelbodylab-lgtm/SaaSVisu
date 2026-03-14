"""
Détection des beats / temps forts dans un fichier audio via librosa.
Retourne une liste de timestamps en millisecondes.
"""
from pathlib import Path
import json


def detect_beats(audio_path: str | Path, method: str = "onset") -> list[int]:
    """
    Détecte les beats dans l'audio.
    method='onset' → onset_detect (kicks, snares, transitoires).
    method='beat'  → beat_track (tempo régulier).
    Retourne les timestamps en ms.
    """
    import librosa
    y, sr = librosa.load(str(audio_path), sr=22050, mono=True)

    if method == "beat":
        _tempo, beat_frames = librosa.beat.beat_track(y=y, sr=sr)
        times = librosa.frames_to_time(beat_frames, sr=sr)
    else:
        onset_frames = librosa.onset.onset_detect(y=y, sr=sr, backtrack=True)
        times = librosa.frames_to_time(onset_frames, sr=sr)

    return [int(round(t * 1000)) for t in times]


def detect_and_save(audio_path: str | Path, output_path: str | Path, method: str = "onset") -> list[int]:
    """Détecte les beats et sauvegarde dans un JSON."""
    beats = detect_beats(audio_path, method=method)
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(beats, f)
    return beats
