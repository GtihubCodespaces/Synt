# Synt voice server

An optional, local-only HTTP server that gives Synt **one voice in every
language** and, on machines without a speech recogniser, the **"Hey Synt"**
wake word. Nothing leaves your computer; the island only calls `127.0.0.1`.

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r sidecar/requirements.txt
python3 sidecar/synt_voice.py
```

Then in the island: **Settings → Voice → One voice, every language** (already
the default) and leave the server at `http://127.0.0.1:8765`.

## The voice

Put a 6–10 second, clean, single-speaker clip at `sidecar/voices/synt.wav`.
XTTS-v2 clones that speaker and speaks **all 17 of its languages with the same
timbre** — that is how Synt keeps one voice while switching language. Without
the file the server says so and falls back to Piper or `espeak-ng`, which have a
different voice per language.

Languages with an identical voice: en, es, fr, de, it, pt, pl, tr, ru, nl, cs,
ar, zh, ja, hu, ko, hi. The island's interface and the AI itself are not limited
to those — text and replies work in any language; only the *voice* is.

## The wake word

`/events` is a Server-Sent Events stream. When `sounddevice` and
`faster-whisper` are installed, a background loop listens in 2.2 s windows,
skips silence, transcribes with `tiny.en`, and emits

```
data: {"type":"wake","text":"hey synt"}
```

The island greets you, then records your question. Set `SYNT_ASR_MODEL` to use a
bigger Whisper model if `tiny.en` misses you; the CPU cost goes up with it.

## Endpoints

| Method | Path | Body / result |
| --- | --- | --- |
| `GET` | `/health` | `{"ok":true,"tts":"xtts","asr":true}` |
| `POST` | `/tts` | `{"text":"…","language":"fr-FR"}` → `audio/wav` |
| `GET` | `/events` | SSE; `{"type":"wake"}` events |

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `SYNT_HOST` | `127.0.0.1` | bind address (keep it loopback) |
| `SYNT_PORT` | `8765` | port |
| `SYNT_VOICE` | `sidecar/voices/synt.wav` | speaker reference clip |
| `SYNT_ASR_MODEL` | `tiny.en` | faster-whisper model for the wake word |
| `SYNT_PIPER_MODEL` | — | Piper `.onnx` voice for the fallback engine |

## Honest status

This server is written and syntax-checked, but it has not been run with a
microphone or a GPU in the environment where Synt was built. The TTS path is
standard coqui-tts and the wake loop is standard sounddevice + faster-whisper;
expect to tune `SYNT_ASR_MODEL` and the silence threshold to your mic.
