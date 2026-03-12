"""
Adaptateur Azure Speech : transcription avec timestamps mot par mot.
Utilise le plan gratuit Azure (5 h/mois). Nécessite WAV 16 kHz mono.
"""
from pathlib import Path
import tempfile
import json
import threading
from typing import Any


def _audio_to_wav_16k_mono(audio_path: Path) -> Path:
    """Convertit l'audio en WAV 16 kHz 16-bit mono pour Azure."""
    from pydub import AudioSegment
    seg = AudioSegment.from_file(str(audio_path))
    seg = seg.set_frame_rate(16000).set_channels(1).set_sample_width(2)
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp.close()
    out = Path(tmp.name)
    seg.export(str(out), format="wav")
    return out


def transcribe_to_words(
    audio_path: str | Path,
    subscription_key: str,
    region: str,
    language: str = "fr-FR",
) -> list[dict[str, Any]]:
    """
    Transcrit l'audio avec Azure Speech et retourne une liste de mots avec timestamps.
    :return: liste de {"start_time_ms", "end_time_ms", "text"}
    """
    import azure.cognitiveservices.speech as speechsdk

    audio_path = Path(audio_path)
    if not audio_path.exists():
        raise FileNotFoundError(f"Fichier audio introuvable: {audio_path}")

    wav_path = None
    try:
        wav_path = _audio_to_wav_16k_mono(audio_path)
        speech_config = speechsdk.SpeechConfig(subscription=subscription_key, region=region)
        speech_config.request_word_level_timestamps()
        speech_config.output_format = speechsdk.OutputFormat.Detailed
        speech_config.speech_recognition_language = language
        audio_config = speechsdk.audio.AudioConfig(filename=str(wav_path))
        recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)

        words: list[dict[str, Any]] = []
        finished = threading.Event()

        def _recognized(evt):
            if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                try:
                    prop = evt.result.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult)
                    if prop:
                        data = json.loads(prop)
                        for n in data.get("NBest", [])[:1]:
                            for w in n.get("Words", []):
                                word = (w.get("Word") or "").strip()
                                if not word:
                                    continue
                                offset_ticks = int(w.get("Offset", 0))
                                duration_ticks = int(w.get("Duration", 0))
                                start_ms = offset_ticks // 10000
                                end_ms = (offset_ticks + duration_ticks) // 10000
                                words.append({"start_time_ms": start_ms, "end_time_ms": end_ms, "text": word})
                except (json.JSONDecodeError, KeyError, TypeError):
                    pass

        def _stop_cb(_evt):
            finished.set()

        recognizer.recognized.connect(_recognized)
        recognizer.session_stopped.connect(_stop_cb)
        recognizer.canceled.connect(_stop_cb)
        recognizer.start_continuous_recognition_async().get()
        finished.wait(timeout=600)
        recognizer.stop_continuous_recognition_async().get()
        return words
    finally:
        if wav_path and wav_path.exists():
            wav_path.unlink(missing_ok=True)
