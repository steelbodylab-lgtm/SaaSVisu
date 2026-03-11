"""
Moteur de synchronisation paroles / audio (Whisper + alignement manuel).
"""
from .aligner import align_lyrics_to_segments

__all__ = ["align_lyrics_to_segments"]
