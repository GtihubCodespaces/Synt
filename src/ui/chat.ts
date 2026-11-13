export interface Bubble {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  images?: string[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Light markdown only: fenced code, inline code, bold, links. No HTML in. */
export function renderMarkdown(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/```[a-zA-Z0-9+#-]*\n?([\s\S]*?)```/g, (_all, code: string) => `<pre><code>${code.replace(/\n$/, "")}</code></pre>`);
  out = out.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/https?:\/\/[^\s<]+/g, (url) => {
    const trailing = /[.,;:)\]]$/.exec(url)?.[0] ?? "";
    const clean = trailing ? url.slice(0, -1) : url;
    return `<a href="${clean}" target="_blank" rel="noopener noreferrer">${clean}</a>${trailing}`;
  });
  return out;
}

interface Node {
  wrap: HTMLElement;
  body: HTMLElement;
  text: string;
  frame: number;
}

export class ChatView {
  private nodes = new Map<string, Node>();
  private welcome: HTMLElement | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly hero: HTMLElement | null = null,
  ) {}

  get isEmpty(): boolean {
    return this.nodes.size === 0 && this.welcome !== null;
  }

  clear(): void {
    this.nodes.clear();
    this.root.replaceChildren();
    this.welcome = null;
    this.setHero(true);
  }

  private setHero(visible: boolean): void {
    if (this.hero) this.hero.hidden = !visible;
  }

  private make(bubble: Bubble, streaming: boolean): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = `msg ${bubble.role === "assistant" ? "synt" : bubble.role}`;
    wrap.dataset.id = bubble.id;
    if (streaming) wrap.dataset.streaming = "true";

    const body = document.createElement("div");
    body.className = "msg-body";

    if (bubble.images?.length) {
      const strip = document.createElement("div");
      strip.className = "shot-strip";
      for (const src of bubble.images) {
        const img = document.createElement("img");
        img.className = "shot";
        img.src = src;
        img.alt = "";
        img.loading = "lazy";
        strip.append(img);
      }
      body.append(strip);
    }

    const text = document.createElement("div");
    text.className = "msg-text";
    if (bubble.text) text.innerHTML = renderMarkdown(bubble.text);
    else if (streaming) text.innerHTML = '<span class="thinking"><i></i><i></i><i></i></span>';
    body.append(text);

    wrap.append(body);
    this.nodes.set(bubble.id, { wrap, body: text, text: bubble.text, frame: 0 });
    return wrap;
  }

  add(bubble: Bubble, streaming = false): void {
    this.clearWelcome();
    this.setHero(false);
    this.root.append(this.make(bubble, streaming));
    this.scroll(true);
  }

  /** Streaming text: buffer the deltas and repaint once per frame. */
  appendText(id: string, chunk: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    node.text += chunk;
    if (node.frame) return;
    node.frame = requestAnimationFrame(() => {
      node.frame = 0;
      node.body.innerHTML = renderMarkdown(node.text);
      this.scroll();
    });
  }

  setText(id: string, text: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    node.text = text;
    node.body.innerHTML = renderMarkdown(text);
    this.scroll();
  }

  finish(id: string): void {
    const node = this.nodes.get(id);
    if (node) node.wrap.removeAttribute("data-streaming");
  }

  remove(id: string): void {
    const node = this.nodes.get(id);
    if (!node) return;
    node.wrap.remove();
    this.nodes.delete(id);
  }

  /** Replace a request with its error, in the soft system style. */
  fail(id: string, message: string, action?: { label: string; run: () => void }): void {
    this.remove(id);
    this.addSystem(message, action);
  }

  addSystem(message: string, action?: { label: string; run: () => void }): void {
    this.clearWelcome();
    this.setHero(false);
    const wrap = document.createElement("div");
    wrap.className = "msg system";
    const text = document.createElement("span");
    text.textContent = message;
    wrap.append(text);
    if (action) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chip";
      button.textContent = action.label;
      button.addEventListener("click", action.run);
      wrap.append(" ", button);
    }
    this.root.append(wrap);
    this.scroll(true);
  }

  showWelcome(
    opts: {
      wake: string;
      line: string;
      chips: string[];
      note?: { text: string; action?: { label: string; run: () => void } };
    },
    onChip: (text: string) => void,
  ): void {
    if (this.welcome) return;
    const wrap = document.createElement("div");
    wrap.className = "welcome";

    const pill = document.createElement("div");
    pill.className = "wake-pill";
    const dot = document.createElement("span");
    dot.className = "pulse";
    pill.append(dot, document.createTextNode(opts.wake));

    const line = document.createElement("div");
    line.className = "welcome-line";
    line.textContent = opts.line;

    const chips = document.createElement("div");
    chips.className = "chips";
    for (const text of opts.chips) {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.textContent = text;
      chip.addEventListener("click", () => onChip(text));
      chips.append(chip);
    }

    wrap.append(pill, line, chips);

    if (opts.note) {
      const note = document.createElement("div");
      note.className = "welcome-note";
      const text = document.createElement("span");
      text.textContent = opts.note.text;
      note.append(text);
      if (opts.note.action) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chip";
        button.textContent = opts.note.action.label;
        button.addEventListener("click", () => opts.note?.action?.run());
        note.append(button);
      }
      wrap.append(note);
    }

    this.root.append(wrap);
    this.welcome = wrap;
    this.setHero(true);
  }

  private clearWelcome(): void {
    if (!this.welcome) return;
    this.welcome.remove();
    this.welcome = null;
  }

  scroll(force = false): void {
    const nearBottom = this.root.scrollHeight - this.root.scrollTop - this.root.clientHeight < 140;
    if (force || nearBottom) this.root.scrollTop = this.root.scrollHeight;
  }
}
