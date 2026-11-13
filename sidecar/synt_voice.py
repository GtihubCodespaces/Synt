#!/usr/bin/env python3
"""
Synt voice server — one local process for one voice in every language.

    python3 sidecar/synt_voice.py          # http://127.0.0.1:8765

Endpoints
    GET  /health   {"ok": true, "tts": "xtts", "asr": true}
    POST /tts      {"text": "...", "language": "fr-FR"}  ->  audio/wav
    GET  /events   text/event-stream, emits {"type":"wake","text":"..."} when
                   it hears "Hey Synt" (needs sounddevice + faster-whisper)

Everything runs on this machine. The app only ever calls 127.0.0.1.

Engines, best first:
  1. XTTS-v2 (coqui-tts) with `voices/synt.wav` — one speaker embedding for all
     languages, which is the whole point: Synt sounds like Synt everywhere.
  2. Piper, if SYNT_PIPER_MODEL points at an .onnx voice (fast, per-language).
  3. espeak-ng, if installed (robotic, but never silent).

The wake loop is optional: without a microphone or faster-whisper, /events
simply heartbeats and the island uses its own recogniser where one exists.
"""

from __future__ import annotations

import array
import io
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = os.environ.get("SYNT_HOST", "127.0.0.1")
PORT = int(os.environ.get("SYNT_PORT", "8765"))
ROOT = os.path.dirname(os.path.abspath(__file__))
VOICE_SAMPLE = os.environ.get("SYNT_VOICE", os.path.join(ROOT, "voices", "synt.wav"))

# XTTS-v2 language codes, keyed by the BCP-47 tags the island sends.
XTTS_LANGS = {
    "en": "en", "es": "es", "fr": "fr", "de": "de", "it": "it", "pt": "pt",
    "pl": "pl", "tr": "tr", "ru": "ru", "nl": "nl", "cs": "cs", "ar": "ar",
    "zh": "zh-cn", "ja": "ja", "hu": "hu", "ko": "ko", "hi": "hi",
}


def log(message: str) -> None:
    print(f"[synt-voice] {message}", flush=True)


def base_lang(tag: str) -> str:
    return (tag or "en").split("-")[0].lower()


def wav_bytes(samples: list[float], rate: int) -> bytes:
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        pcm = array.array("h", [int(max(-1.0, min(1.0, s)) * 32767) for s in samples])
        handle.writeframes(pcm.tobytes())
    return buffer.getvalue()


class Synth:
    """One model instance, loaded on first use, never on import."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._tts = None
        self._rate = 24000
        self._engine = self._pick_engine()

    def _pick_engine(self) -> str:
        try:
            import TTS  # noqa: F401  (coqui-tts)

            if os.path.exists(VOICE_SAMPLE):
                return "xtts"
            log(f"XTTS is installed but {VOICE_SAMPLE} is missing; falling back")
        except Exception:
            pass
        if os.environ.get("SYNT_PIPER_MODEL") and shutil.which("piper"):
            return "piper"
        if shutil.which("espeak-ng"):
            return "espeak"
        return "none"

    @property
    def engine(self) -> str:
        return self._engine

    def _load_xtts(self):
        with self._lock:
            if self._tts is None:
                from TTS.api import TTS  # type: ignore

                log("loading XTTS-v2 (first run downloads the model)")
                model = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
                try:
                    model.to("cpu")
                except Exception:
                    pass
                self._tts = model
                self._rate = getattr(getattr(model, "synthesizer", None), "output_sample_rate", 24000)
            return self._tts

    def speak(self, text: str, language: str) -> tuple[bytes, str]:
        lang = base_lang(language)

        if self._engine == "xtts":
            model = self._load_xtts()
            samples = model.tts(
                text=text,
                speaker_wav=VOICE_SAMPLE,
                language=XTTS_LANGS.get(lang, "en"),
            )
            return wav_bytes(list(samples), self._rate), "audio/wav"

        if self._engine == "piper":
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                target = tmp.name
            try:
                subprocess.run(
                    ["piper", "--model", os.environ["SYNT_PIPER_MODEL"], "--output_file", target],
                    input=text.encode("utf-8"),
                    check=True,
                    capture_output=True,
                )
                with open(target, "rb") as handle:
                    return handle.read(), "audio/wav"
            finally:
                try:
                    os.unlink(target)
                except OSError:
                    pass

        if self._engine == "espeak":
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                target = tmp.name
            try:
                subprocess.run(
                    ["espeak-ng", "-v", lang, "-s", "165", "-w", target, text],
                    check=True,
                    capture_output=True,
                )
                with open(target, "rb") as handle:
                    return handle.read(), "audio/wav"
            finally:
                try:
                    os.unlink(target)
                except OSError:
                    pass

        raise RuntimeError("no TTS engine available: install coqui-tts, piper or espeak-ng")


SYNTH = Synth()
SUBSCRIBERS: list[queue.Queue] = []
SUB_LOCK = threading.Lock()

WAKE_HEADS = {"hey", "hei", "hay", "hej", "hi", "eh", "et"}
WAKE_TAILS = {"synt", "sint", "cynt", "cint", "saint", "sainte", "sante", "cent", "sent"}


def looks_like_wake(text: str) -> bool:
    words = re.sub(r"[^\w\s]", " ", text.lower()).split()
    for index, word in enumerate(words):
        if word not in WAKE_HEADS:
            continue
        for follow in words[index + 1: index + 4]:
            if follow in WAKE_TAILS:
                return True
    return False


def broadcast(payload: dict) -> None:
    with SUB_LOCK:
        for client in list(SUBSCRIBERS):
            try:
                client.put_nowait(payload)
            except queue.Full:
                pass


def wake_loop() -> None:
    try:
        import numpy as np
        import sounddevice as sd
        from faster_whisper import WhisperModel
    except Exception as error:  # noqa: BLE001
        log(f"wake word off ({error.__class__.__name__}: install sounddevice + faster-whisper)")
        return

    try:
        model = WhisperModel(os.environ.get("SYNT_ASR_MODEL", "tiny.en"), device="cpu", compute_type="int8")
    except Exception as error:  # noqa: BLE001
        log(f"wake word off (model: {error})")
        return

    rate = 16000
    log("wake word on: say 'Hey Synt'")
    while True:
        try:
            block = sd.rec(int(rate * 2.2), samplerate=rate, channels=1, dtype="float32")
            sd.wait()
            audio = block.reshape(-1)
            if float(np.abs(audio).mean()) < 0.004:
                continue
            segments, _ = model.transcribe(audio, language="en", vad_filter=True)
            heard = " ".join(segment.text for segment in segments).strip()
            if heard and looks_like_wake(heard):
                log(f"wake: {heard!r}")
                broadcast({"type": "wake", "text": heard})
        except Exception as error:  # noqa: BLE001
            log(f"wake loop: {error}")
            time.sleep(2)


class Handler(BaseHTTPRequestHandler):
    server_version = "SyntVoice/0.1"

    def log_message(self, fmt: str, *args) -> None:  # keep the console quiet
        pass

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def _json(self, payload: dict, status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        if self.path.startswith("/health"):
            self._json({"ok": True, "tts": SYNTH.engine, "asr": bool(SUBSCRIBERS) or True})
            return
        if self.path.startswith("/events"):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self._cors()
            self.end_headers()

            client: queue.Queue = queue.Queue(maxsize=16)
            with SUB_LOCK:
                SUBSCRIBERS.append(client)
            try:
                while True:
                    try:
                        event = client.get(timeout=20)
                        self.wfile.write(f"data: {json.dumps(event)}\n\n".encode("utf-8"))
                    except queue.Empty:
                        self.wfile.write(b": ping\n\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass
            finally:
                with SUB_LOCK:
                    if client in SUBSCRIBERS:
                        SUBSCRIBERS.remove(client)
            return
        self._json({"ok": False, "error": "not found"}, 404)

    def do_POST(self) -> None:  # noqa: N802
        if not self.path.startswith("/tts"):
            self._json({"ok": False, "error": "not found"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            text = str(payload.get("text", "")).strip()
            if not text:
                self._json({"ok": False, "error": "empty text"}, 400)
                return
            audio, mime = SYNTH.speak(text[:1200], str(payload.get("language", "en-US")))
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(audio)))
            self._cors()
            self.end_headers()
            self.wfile.write(audio)
        except Exception as error:  # noqa: BLE001
            log(f"tts: {error}")
            self._json({"ok": False, "error": str(error)}, 500)


def main() -> None:
    log(f"tts engine: {SYNTH.engine}")
    log(f"listening on http://{HOST}:{PORT}")
    threading.Thread(target=wake_loop, daemon=True).start()
    try:
        ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
    except KeyboardInterrupt:
        log("bye")
        sys.exit(0)


if __name__ == "__main__":
    main()
