"""Listener local continuo con Faster Whisper y activacion por nombre."""

from __future__ import annotations

import argparse
import json
import os
import queue
import re
import sys
import time
from collections import deque
from pathlib import Path

import numpy as np
import sounddevice as sd
from faster_whisper import WhisperModel


SAMPLE_RATE = 16_000
BLOCK_SECONDS = 0.1
BLOCK_SIZE = int(SAMPLE_RATE * BLOCK_SECONDS)


def send_event(event: dict) -> None:
    print(json.dumps(event, ensure_ascii=False), flush=True)


def wake_pattern(wake_word: str) -> re.Pattern:
    aliases = {
        wake_word.lower(),
        "yanapay",
        "yanapai",
        "janapay",
        "janapai",
        "llanapay",
        "llanapai",
        "yana pay",
        "yana pai",
        "jana pay",
        "jana pai",
        "llana pay",
        "llana pai",
    }
    alternatives = "|".join(re.escape(alias) for alias in sorted(aliases, key=len, reverse=True))
    return re.compile(rf"(?i)\b(?:{alternatives})\b[\s,;:—-]*")


def extract_questions(transcript: str, wake_word: str = "yanapay") -> list[str]:
    pattern = wake_pattern(wake_word)
    matches = list(pattern.finditer(transcript))
    questions: list[str] = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(transcript)
        question = transcript[match.end():end].strip(" .,!¡¿?")
        if len(question) >= 3:
            questions.append(question)
    return questions


def load_model(model_name: str) -> WhisperModel:
    return WhisperModel(model_name, device="cpu", compute_type="int8")


def transcribe(model: WhisperModel, audio, language: str = "es") -> str:
    hotwords = os.getenv(
        "VOICE_HOTWORDS",
        "Yanapay héroe héroes Dota Crystal Maiden contrapick Roshan Radiant Dire",
    )
    segments, _info = model.transcribe(
        audio,
        language=language,
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=False,
        initial_prompt=(
            "Conversación en español sobre Dota 2 con el asistente Yanapay. "
            "Preguntas sobre héroes, objetos, habilidades y contrapicks."
        ),
        hotwords=hotwords,
    )
    return " ".join(segment.text.strip() for segment in segments).strip()


def test_audio_file(path: Path, model_name: str, wake_word: str) -> int:
    model = load_model(model_name)
    transcript = transcribe(model, str(path))
    questions = extract_questions(transcript, wake_word)
    send_event({"type": "transcript", "text": transcript, "questions": questions})
    return 0 if questions else 2


def run_listener(model_name: str, wake_word: str) -> None:
    audio_queue: queue.Queue[np.ndarray] = queue.Queue()
    model = load_model(model_name)
    silence_seconds = float(os.getenv("VOICE_SILENCE_SECONDS", "0.8"))
    max_seconds = float(os.getenv("VOICE_MAX_UTTERANCE_SECONDS", "15"))
    configured_threshold = os.getenv("VOICE_ENERGY_THRESHOLD", "auto")
    fixed_threshold = None if configured_threshold == "auto" else float(configured_threshold)
    noise_samples: deque[float] = deque(maxlen=50)
    pre_roll: deque[np.ndarray] = deque(maxlen=5)
    recording: list[np.ndarray] = []
    speaking = False
    silent_blocks = 0

    def callback(indata, _frames, _time_info, status):
        if status:
            send_event({"type": "audio-warning", "message": str(status)})
        audio_queue.put(indata[:, 0].copy())

    send_event({"type": "loading", "model": model_name})
    with sd.InputStream(
        samplerate=SAMPLE_RATE,
        channels=1,
        dtype="float32",
        blocksize=BLOCK_SIZE,
        callback=callback,
    ):
        send_event({
            "type": "ready",
            "engine": "faster-whisper",
            "wakeWord": wake_word,
            "inputDevice": str(sd.query_devices(kind="input")["name"]),
        })

        while True:
            block = audio_queue.get()
            rms = float(np.sqrt(np.mean(np.square(block))))
            if not speaking:
                noise_samples.append(rms)
            ambient = float(np.median(noise_samples)) if noise_samples else 0.0
            threshold = fixed_threshold if fixed_threshold is not None else max(0.0015, ambient * 2.5)
            has_voice = rms >= threshold

            if not speaking:
                pre_roll.append(block)
                if not has_voice:
                    continue
                speaking = True
                silent_blocks = 0
                recording = list(pre_roll)
                send_event({"type": "speech-start", "rms": round(rms, 5), "threshold": round(threshold, 5)})
            else:
                recording.append(block)
                silent_blocks = 0 if has_voice else silent_blocks + 1

            duration = len(recording) * BLOCK_SECONDS
            ended = silent_blocks * BLOCK_SECONDS >= silence_seconds
            if not ended and duration < max_seconds:
                continue

            audio = np.concatenate(recording).astype(np.float32)
            speaking = False
            recording = []
            pre_roll.clear()
            if duration < 0.5:
                continue

            started = time.perf_counter()
            transcript = transcribe(model, audio)
            questions = extract_questions(transcript, wake_word)
            send_event({
                "type": "heard",
                "text": transcript,
                "latencyMs": round((time.perf_counter() - started) * 1000),
            })
            for question in questions:
                send_event({"type": "wake", "text": transcript})
                send_event({"type": "question", "text": question})


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=os.getenv("WHISPER_MODEL", "small"))
    parser.add_argument("--wake-word", default=os.getenv("WAKE_WORD", "yanapay"))
    parser.add_argument("--audio-file", type=Path)
    args = parser.parse_args()
    if args.audio_file:
        return test_audio_file(args.audio_file, args.model, args.wake_word)
    run_listener(args.model, args.wake_word)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise SystemExit(0)
    except Exception as error:
        send_event({"type": "error", "message": str(error)})
        raise SystemExit(1)
