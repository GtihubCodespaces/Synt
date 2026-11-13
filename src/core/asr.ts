/**
 * Ears: "Hey Synt".
 *
 * Two engines, tried in order:
 *  1. The webview's own SpeechRecognition (Android, and Chromium builds that
 *     ship one). Continuous, local to the OS on Android, and free.
 *  2. The Synt voice server (`sidecar/`), which watches the mic with a tiny
 *     offline model and pushes `wake` events over SSE. This is the path for
 *     Windows/Linux webviews, which have no recogniser of their own.
 *
 * The wake phrase stays "Hey Synt" in every language; the question that
 * follows is transcribed in the interface language.
 */

export type EarsStatus = "off" | "wake" | "question" | "unsupported";

interface EarsOptions {
  onWake: () => void;
  onStatus: (status: EarsStatus) => void;
  onError: (key: "micError" | "noWake") => void;
}

const WAKE_TAILS = ["synt", "sint", "cynt", "cint", "saint", "sainte", "sante", "synte", "cent", "sent"];
const WAKE_HEADS = ["hey", "hei", "hay", "hej", "hi", "eh", "et", "hé", "he", "ey"];

function normalize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= b.length; j += 1) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

/** True for "hey synt", "hé saint", "et sint", and STT's usual manglings. */
export function isWakePhrase(transcript: string): boolean {
  const words = normalize(transcript);
  for (let i = 0; i < words.length; i += 1) {
    if (!WAKE_HEADS.some((head) => editDistance(words[i], head) === 0)) continue;
    for (let j = i + 1; j < Math.min(i + 4, words.length); j += 1) {
      if (WAKE_TAILS.some((tail) => editDistance(words[j], tail) <= 1)) return true;
    }
  }
  return false;
}

export class Ears {
  private recognition: SpeechRecognition | null = null;
  private wakeOn = false;
  private lang = "en-US";
  private server = "";
  private source: EventSource | null = null;
  private restartTimer: number | null = null;
  private listening: SpeechRecognition | null = null;
  private sidecarReady = false;

  constructor(private readonly opts: EarsOptions) {}

  private get SpeechCtor(): SpeechRecognitionCtor | null {
    return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
  }

  get available(): boolean {
    return Boolean(this.SpeechCtor) || this.sidecarReady;
  }

  /** Is the local voice server actually running? Cached for the session. */
  async probe(): Promise<boolean> {
    if (this.SpeechCtor) return true;
    if (!this.server) return false;
    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 1200);
      const res = await fetch(`${this.server}/health`, { signal: controller.signal });
      clearTimeout(timer);
      const payload = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      this.sidecarReady = Boolean(res.ok && payload?.ok);
    } catch {
      this.sidecarReady = false;
    }
    return this.sidecarReady;
  }

  configure(opts: { lang: string; server: string }): void {
    this.lang = opts.lang;
    this.server = opts.server.replace(/\/+$/, "");
  }

  /** Start watching for the wake phrase. Safe to call twice. */
  async enableWake(): Promise<void> {
    if (this.wakeOn) return;
    this.wakeOn = true;

    if (this.SpeechCtor) {
      this.startWakeRecognition();
      return;
    }
    if (await this.probe()) {
      this.startSidecarWake();
      return;
    }
    this.wakeOn = false;
    this.opts.onStatus("unsupported");
    this.opts.onError("noWake");
  }

  disableWake(): void {
    this.wakeOn = false;
    this.stopWakeRecognition();
    if (this.source) {
      this.source.close();
      this.source = null;
    }
    if (this.wakeOn === false) this.opts.onStatus("off");
  }

  private startSidecarWake(): void {
    this.opts.onStatus("wake");
    try {
      this.source = new EventSource(`${this.server}/events?lang=${encodeURIComponent(this.lang)}`);
      this.source.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as { type?: string; text?: string };
          if (data.type === "wake" || (data.text && isWakePhrase(data.text))) this.opts.onWake();
        } catch {
          /* heartbeat or comment */
        }
      };
      this.source.onerror = () => {
        // EventSource reconnects on its own; if the server is gone, stop trying
        // to avoid a reconnect loop on a machine that never installed it.
        if (this.source?.readyState === EventSource.CLOSED) {
          this.source = null;
          this.wakeOn = false;
          this.opts.onStatus("unsupported");
        }
      };
    } catch {
      this.opts.onStatus("unsupported");
      this.opts.onError("noWake");
    }
  }

  private startWakeRecognition(): void {
    const Ctor = this.SpeechCtor;
    if (!Ctor || !this.wakeOn) return;
    this.stopWakeRecognition();

    const rec = new Ctor();
    rec.lang = this.lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => this.opts.onStatus("wake");
    rec.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const text = event.results[i][0]?.transcript ?? "";
        if (isWakePhrase(text)) {
          // Stop the loop so the greeting is not heard by the recogniser.
          this.stopWakeRecognition();
          this.opts.onWake();
          return;
        }
      }
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        this.wakeOn = false;
        this.opts.onStatus("unsupported");
        this.opts.onError("micError");
      }
    };
    rec.onend = () => {
      if (!this.wakeOn) {
        this.opts.onStatus("off");
        return;
      }
      // Chromium ends continuous recognition on its own after a while.
      this.restartTimer = window.setTimeout(() => this.startWakeRecognition(), 500);
    };

    this.recognition = rec;
    try {
      rec.start();
    } catch {
      /* start() throws if already running; the onend handler retries */
    }
  }

  private stopWakeRecognition(): void {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const rec = this.recognition;
    this.recognition = null;
    if (rec) {
      rec.onend = null;
      rec.onresult = null;
      rec.onerror = null;
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
    }
  }

  /** One question, transcribed once. Returns null on silence or no engine. */
  async listenOnce(): Promise<string | null> {
    const Ctor = this.SpeechCtor;
    if (!Ctor) return null;

    const wasWatching = this.wakeOn;
    this.stopWakeRecognition();
    this.opts.onStatus("question");

    return new Promise<string | null>((resolve) => {
      const rec = new Ctor();
      rec.lang = this.lang;
      rec.continuous = false;
      rec.interimResults = true;
      rec.maxAlternatives = 1;
      this.listening = rec;

      let best = "";
      let finished = false;
      const finish = (text: string | null) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        this.listening = null;
        try {
          rec.abort();
        } catch {
          /* already stopped */
        }
        this.opts.onStatus("off");
        if (wasWatching && this.wakeOn) this.startWakeRecognition();
        resolve(text);
      };

      const timeout = window.setTimeout(() => finish(best.trim() || null), 15_000);

      rec.onresult = (event) => {
        let transcript = "";
        for (let i = 0; i < event.results.length; i += 1) transcript += event.results[i][0]?.transcript ?? "";
        best = transcript;
        if (event.results[event.results.length - 1]?.isFinal) finish(transcript.trim() || null);
      };
      rec.onerror = () => finish(best.trim() || null);
      rec.onend = () => finish(best.trim() || null);

      try {
        rec.start();
      } catch {
        finish(null);
      }
    });
  }

  stopListening(): void {
    if (this.listening) {
      try {
        this.listening.abort();
      } catch {
        /* already stopped */
      }
      this.listening = null;
    }
  }
}
