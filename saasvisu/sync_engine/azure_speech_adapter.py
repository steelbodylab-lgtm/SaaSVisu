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


def _build_phrase_list(text: str | None, max_phrases: int = 500) -> list[str]:
    """Extrait phrases, groupes de mots puis mots pour la phrase list Azure (meilleure précision)."""
    if not (text or "").strip():
        return []
    seen: set[str] = set()
    out: list[str] = []
    raw = (text or "").strip()
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    for line in lines:
        if len(out) >= max_phrases:
            break
        if line and line.lower() not in seen:
            seen.add(line.lower())
            out.append(line)
    words_all = raw.replace("\n", " ").split()
    for i in range(0, len(words_all), 3):
        chunk = " ".join(words_all[i : i + 3]).strip()
        if chunk and len(out) < max_phrases and chunk.lower() not in seen:
            seen.add(chunk.lower())
            out.append(chunk)
    for w in words_all:
        w = w.strip()
        if not w or len(out) >= max_phrases:
            continue
        if w.lower() not in seen:
            seen.add(w.lower())
            out.append(w)
    return out[:max_phrases]


def transcribe_to_words(
    audio_path: str | Path,
    subscription_key: str,
    region: str,
    language: str = "fr-FR",
    phrase_hints: str | list[str] | None = None,
) -> list[dict[str, Any]]:
    """
    Transcrit l'audio avec Azure Speech et retourne une liste de mots avec timestamps.
    phrase_hints : texte ou liste de phrases pour améliorer la reconnaissance (noms, mots rares).
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

        # Liste de phrases pour améliorer la précision (noms, paroles connues, etc.)
        if phrase_hints is not None:
            phrases = _build_phrase_list(phrase_hints if isinstance(phrase_hints, str) else "\n".join(phrase_hints))
            if phrases:
                grammar = speechsdk.PhraseListGrammar.from_recognizer(recognizer)
                for p in phrases:
                    grammar.addPhrase(p)

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
        # Ne pas supprimer le .wav ici : sous Windows le SDK Azure peut encore détenir le fichier (WinError 32).
        pass
