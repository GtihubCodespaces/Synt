# Synt

**A red cube with white eyes, living in a Dynamic Island at the top of your
screen. Windows, Linux and Android — no Apple.**

[![build](https://github.com/GtihubCodespaces/Synt/actions/workflows/build.yml/badge.svg)](https://github.com/GtihubCodespaces/Synt/actions/workflows/build.yml)

Synt is a fork of [coucou](https://github.com/Louis-CFM/coucou)'s Windows/Linux
island, rebuilt for **[SyntaxUI](https://ui.syntaxdev.store)** and stripped of
the Mac. It talks, listens, greets you by name, and turns dropped screenshots
into a remake brief for SyntaxUI. Its brain is DeepSeek V4.1 Flash through
[TokenHarbor](https://tokenharbor.ai) on the **free** route; its voice runs on
your own machine.

```
        ╭─────────────────╮
        │  ▟▙   Hey Synt  │        ← collapsed: 188 × 40
        ╰─────────────────╯
              ↓ opens
   ╭───────────────────────────╮
   │  ▟▙  Synt                 │
   │      Ask me anything…     │
   │  ┌─────────────────────┐  │
   │  │ Hi, Lina, how can I │  │
   │  │ help you?           │  │
   │  └─────────────────────┘  │
   │  [ Ask Synt anything…   ] │
   ╰───────────────────────────╯
```

## What it does

- **The island** — one element that morphs between four shapes: a 188 px pill,
  a hover peek, a 468 px panel and a phone-width panel. Spring transitions, a
  red aura that warms up with Synt's mood, glass blur, a drop overlay.
- **Synt** — canvas-drawn cube: three rounded faces, a rim light, a contact
  shadow, and two white eyes that blink, follow your pointer, narrow when he
  listens, squint when he talks and turn into smiles when he is pleased.
- **"Hey Synt"** → *"Hi, {name}, how can I help you?"* spoken aloud, then he
  records your question and answers it.
- **16 languages**, RTL included. The interface, the greeting and the replies
  follow the language you pick in Settings.
- **One voice in every language** — an optional local XTTS-v2 server clones one
  speaker clip. Same timbre in all 17 of its languages; system voices fall back
  when it is not installed.
- **Screenshots → SyntaxUI** — drop or paste up to ten; Synt writes a
  measurement-ready brief, stages the files in one folder (desktop), copies the
  brief and opens SyntaxUI so you can drag them in.
- **Local by default** — no telemetry, no account, no analytics. The only
  network call is the one you paid for: `tokenharbor.ai`.

## The brain: 0 €, one key

| | |
|---|---|
| Endpoint | `https://tokenharbor.ai/v1` (OpenAI-compatible) |
| Default model | `deepseek-v4.1-flash:free` — 1M context, text **and images** |
| Paid switch | `deepseek-v4.1-flash` in Settings |
| Key | Settings → TokenHarbor key, or `VITE_TOKENHARBOR_KEY` in `.env` for dev |

The free route is why the default is what it is. The key is stored on the device
only: `localStorage` in the browser shell, the app's own `secret.json`
(`0600` on Unix) in the desktop build. It is sent to `tokenharbor.ai` and
nowhere else, and the island never shows it back to you.

## Voice: one speaker, every language

`src/core/tts.ts` picks the best available engine:

1. **Local voice server** (`sidecar/`, XTTS-v2) — one speaker embedding from
   `sidecar/voices/synt.wav`, so Synt sounds identical in en, es, fr, de, it,
   pt, pl, tr, ru, nl, cs, ar, zh, ja, hu, ko, hi. Offline, CPU, free.
2. **System voices** — Web Speech / OS voices. Zero setup, but the timbre
   changes per language, which is exactly what (1) exists to avoid.
3. **Muted**.

With a local model, the wording is unlimited: the AI answers in any language,
and the interface ships 16. Only the *voice* has the 17-language limit.

### How "Hey Synt" is heard

| Platform | Engine |
|---|---|
| Android | the webview's own speech recogniser, on-device |
| Chromium builds with speech | same, continuous + interim results |
| Windows / Linux webviews | the local voice server: `sounddevice` + a tiny Whisper model over SSE |

`src/core/asr.ts` matches STT's usual manglings — "hé saint", "hey sint",
"et cent" — with a one-edit-distance check, and the mic button always works as
push-to-talk. If neither engine exists, Synt says so instead of pretending.

## Screenshots → SyntaxUI

SyntaxUI rebuilds a menu screenshot as Dear ImGui C++ and a compiled `.exe`, and
it takes **1–10 screenshots per remake, one per tab**. Synt's shelf keeps the
newest ten.

- **Drop** files on the island, or **paste** an image from the clipboard.
- **Brief** asks DeepSeek V4.1 Flash — which can *see* the screenshots — for a
  measurement-ready brief, then copies it.
- **SyntaxUI** stages the files in `…/synt/syntaxui/drop-<timestamp>/`, opens
  that folder, copies the local brief and opens
  [ui.syntaxdev.store/new](https://ui.syntaxdev.store/new).

SyntaxUI has **no public upload API**, so Synt does not invent one. If you have
an endpoint that accepts the same multipart form, set
`VITE_SYNTAXUI_UPLOAD_URL` and `uploadToSyntaxUI()` will use it.

## Languages

English · 简体中文 · 繁體中文 · हिन्दी · Español · العربية · Français · বাংলা ·
Português · Русский · Bahasa Indonesia · Deutsch · Türkçe · ไทย · 한국어 · 日本語

Arabic flips the document to RTL; the island's geometry, the cube and the pills
stay put, and code, commands and paths stay left-to-right.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000 — the browser shell
npm run build      # tsc --noEmit && vite build
```

`npm run dev` is enough to work on everything you can see: the island, the cube,
the chat, the languages, the shelf. In a plain browser tab the window is not
transparent and OS drag-and-drop arrives as ordinary `File`s; the desktop build
adds the real transparent window, native file paths and the staged folder. Set
`VITE_TOKENHARBOR_KEY` in `.env` to skip the Settings screen while developing.

### Windows

Rust (`rustup`), Node 20+, and the MSVC build tools with "Desktop development
with C++". WebView2 ships with Windows 10/11.

```powershell
npm install
npm run tauri dev      # live island window
npm run tauri build    # MSI + NSIS in src-tauri/target/release/bundle
```

### Linux

```bash
sudo apt install build-essential pkg-config libwebkit2gtk-4.1-dev \
  libgtk-3-dev librsvg2-dev libssl-dev patchelf
npm install
npm run tauri dev
npm run tauri build    # AppImage, .deb, .rpm
```

The window is a frameless, transparent, always-on-top window pinned to the top
centre. On Wayland, compositors that ignore client positioning (GNOME) may put
it elsewhere; KDE Plasma, COSMIC, Hyprland and Sway honour it.

### Android

```bash
rustup target add aarch64-linux-android armv7-linux-androideabi
npm run tauri android init     # needs the Android SDK + NDK and ANDROID_HOME
npm run tauri android dev
npm run tauri android build --apk
```

CI builds a **debug-signed arm64 APK** on every push (the `Android (arm64 APK)`
job): JDK 17, the Android SDK, NDK r27c, the `aarch64-linux-android` target,
`android init`, then `tauri android build --apk --debug --target aarch64`. The
APK is the `synt-android` artifact on the run page and installs with
`adb install`. A store-ready release APK only needs your own keystore in
`gen/android/keystore.properties`; CI does not hold signing keys.

**Known limit, stated plainly:** the island is drawn by the Synt activity, so on
Android it lives inside the app's window. A true system-wide overlay needs the
`SYSTEM_ALERT_WINDOW` permission and a foreground service, which v0.1 does not
ship. The layout, safe-area handling and touch targets are already mobile-sized.

### The optional voice server

```bash
python3 -m venv .venv && . .venv/bin/activate
pip install -r sidecar/requirements.txt
python3 sidecar/synt_voice.py
# put a 6–10 s speaker clip at sidecar/voices/synt.wav first
```

See [`sidecar/README.md`](sidecar/README.md) for endpoints and tuning.

## Layout

```
index.html               island DOM shell
src/
  main.ts                boot and wiring: wake → greeting → listen → chat
  core/ai.ts             TokenHarbor streaming, persona, multimodal turns
  core/asr.ts            "Hey Synt": Web Speech + local SSE engine
  core/tts.ts            one voice everywhere, system fallback
  core/i18n.ts           language list, detection, fallback lookup
  core/locales.ts        16 dictionaries
  core/store.ts          settings + key, browser/Tauri split
  core/tauri.ts          IPC bridge (no-ops in the browser shell)
  core/syntaxui.ts       brief builder, staging, optional upload
  ui/island.ts           shape state machine + native window sizing
  ui/cube.ts             Synt, in Canvas 2D
  ui/chat.ts             streaming transcript, markdown-lite
  ui/settings.ts         the settings panel
  ui/shelf.ts            dropped screenshots
  styles/                tokens, island, chat, settings
src-tauri/               Rust shell: window, local store, staging
scripts/gen-icons.mjs    draws the app icon (no binary assets in git)
sidecar/                 local XTTS + wake-word server
```

The window is sized to the island, not to the screen: `set_island_size` resizes
and re-centres it on every shape change, so clicks outside the pill reach the
apps underneath.

## What is not done

- The Rust shell in `src-tauri/` was written but **not compiled in the
  environment where this was built** (no Rust toolchain there). Run
  `npm run tauri dev` on your machine; the front end is verified, the shell is
  not.
- Global keyboard shortcuts (a Tauri plugin) are not wired; the island listens
  to keys while focused, `Esc` folds it and `Ctrl/⌘ K` starts a new chat.
- The Android overlay permission, as above.
- The voice server needs real hardware to tune; it is syntax-checked only.

## Credits

- **[coucou](https://github.com/Louis-CFM/coucou)** by Louis Cfm (MIT) — the
  island, the Windows/Linux shell and the 16-language idea are its work. Synt is
  a fork for SyntaxUI, with a new character, a new brain and no Mac.
- **[SyntaxUI](https://ui.syntaxdev.store)** — briefs are written for its remake
  flow (1–10 screenshots, 55% / 75% / 1:1, custom UIs, Dear ImGui C++).
- **[TokenHarbor](https://tokenharbor.ai)** — one OpenAI-compatible endpoint and
  the free DeepSeek V4.1 Flash route.
- **[XTTS-v2](https://github.com/coqui-ai/TTS)** — the multilingual voice.
- Dear ImGui, Whisper, and the rest belong to their authors.

MIT, see [LICENSE](LICENSE).
