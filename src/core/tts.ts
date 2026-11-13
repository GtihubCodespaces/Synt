import type { VoiceMode } from "./store";

/**
 * One voice, every language.
 *
 * `local` talks to the Synt voice server in `sidecar/` (XTTS-v2, offline):
 * one speaker embedding, so Synt sounds like Synt in all of its languages.
 * `system` falls back to the OS voices (Web Speech on Windows/Linux/Android
 * webviews where they exist) — the timbre changes per language, which is
 * exactly what `local` exists to avoid. `off` is silent.
 */

const MAX_SPOKEN_CHARS = 480;

/** Strip what should not be read aloud, and keep a natural stopping point. */
export function speakable(markdown: string): string {
  let text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`\n]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_>#~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length > MAX_SPOKEN_CHARS) {
    const cut = text.slice(0, MAX_SPOKEN_CHARS);
    const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "), cut.lastIndexOf("。"));
    text = stop > 80 ? cut.slice(0, stop + 1) : `${cut.trimEnd()}…`;
  }
  return text;
}

function pickSystemVoice(bcp47: string): SpeechSynthesisVoice | null {
  if (!("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const lang = bcp47.toLowerCase();
  const base = lang.split("-")[0];
  const exact = voices.filter((v) => v.lang.toLowerCase().replace("_", "-") === lang);
  const family = voices.filter((v) => v.lang.toLowerCase().replace("_", "-").split("-")[0] === base);
  const pool = exact.length ? exact : family;
  if (!pool.length) return null;
  const preferred = pool.find((v) => /natural|neural|premium|enhanced/i.test(v.name));
  return preferred ?? pool[0];
}

export class Voice {
  private mode: VoiceMode = "local";
  private server = "http://127.0.0.1:8765";
  private audio: HTMLAudioElement | null = null;
  private localDownUntil = 0;
  private speakToken = 0;
  private stateHandler: (speaking: boolean) => void = () => {};

  configure(mode: VoiceMode, server: string, onState: (speaking: boolean) => void): void {
    this.mode = mode;
    this.server = server.replace(/\/+$/, "");
    this.stateHandler = onState;
  }

  get speaking(): boolean {
    return Boolean(this.audio && !this.audio.paused) || (typeof speechSynthesis !== "undefined" && speechSynthesis.speaking);
  }

  /** Warm the system voice list: some webviews load it asynchronously. */
  prime(): void {
    if (typeof speechSynthesis !== "undefined") {
      speechSynthesis.getVoices();
      speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
    }
  }

  stop(): void {
    this.speakToken += 1;
    if (this.audio) {
      this.audio.pause();
      this.audio.src = "";
      this.audio = null;
    }
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    this.stateHandler(false);
  }

  /** Resolves when the sentence has been spoken (or immediately if muted). */
  async speak(text: string, bcp47: string): Promise<void> {
    const clean = speakable(text);
    if (!clean || this.mode === "off") return;

    this.stop();
    const token = ++this.speakToken;

    if (this.mode === "local" && Date.now() > this.localDownUntil) {
      try {
        await this.speakLocal(clean, bcp47, token);
        return;
      } catch {
        // Server not running: do not pay the connection timeout on every line.
        this.localDownUntil = Date.now() + 60_000;
        console.info("[synt] local voice server unavailable, using the system voice");
      }
    }
    await this.speakSystem(clean, bcp47, token);
  }

  private async speakLocal(text: string, bcp47: string, token: number): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    let res: Response;
    try {
      res = await fetch(`${this.server}/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, language: bcp47, voice: "synt" }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`tts ${res.status}`);
    const blob = await res.blob();
    if (token !== this.speakToken) return;

    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    this.audio = audio;
    await new Promise<void>((resolve) => {
      const done = () => {
        URL.revokeObjectURL(url);
        if (this.audio === audio) this.audio = null;
        this.stateHandler(false);
        resolve();
      };
      audio.onended = done;
      audio.onerror = done;
      this.stateHandler(true);
      void audio.play().catch(done);
    });
  }

  private async speakSystem(text: string, bcp47: string, token: number): Promise<void> {
    if (typeof speechSynthesis === "undefined") return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = bcp47;
    utterance.rate = 1.02;
    utterance.pitch = 0.96;
    const voice = pickSystemVoice(bcp47);
    if (voice) utterance.voice = voice;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        this.stateHandler(false);
        resolve();
      };
      utterance.onstart = () => token === this.speakToken && this.stateHandler(true);
      utterance.onend = finish;
      utterance.onerror = finish;
      if (token !== this.speakToken) return finish();
      speechSynthesis.speak(utterance);
    });
  }
}
