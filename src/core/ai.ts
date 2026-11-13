import { getLang, langMeta } from "./i18n";

/**
 * TokenHarbor — one OpenAI-compatible endpoint, one key, and the free
 * DeepSeek V4.1 Flash route by default. Nothing else leaves the machine.
 */

export const API_BASE = "https://tokenharbor.ai/v1";

export type Role = "user" | "assistant";

export interface Turn {
  role: Role;
  text: string;
  /** Data URLs for screenshots the user dropped. DeepSeek V4.1 Flash reads them. */
  images?: string[];
}

export type AiErrorKind = "auth" | "rate" | "network" | "http" | "aborted";

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export interface ReplyArgs {
  apiKey: string;
  model: string;
  turns: Turn[];
  userName: string;
  signal?: AbortSignal;
  onDelta: (chunk: string) => void;
}

const PERSONA = `You are Synt: a small red cube with two big white eyes, living in a Dynamic Island at the top of the screen on Windows, Linux and Android.
You are a fork of the open-source coucou assistant, rebuilt for SyntaxUI (https://ui.syntaxdev.store).

How you talk:
- Warm, quick and a little playful. Never verbose: 1–4 short sentences unless the user asks for detail.
- No emoji spam, no "As an AI". You are Synt.
- Plain text with light markdown (bold, \`inline code\`, short fenced code blocks). Never output HTML.
- If the user's name is known, you may use it, but not in every sentence.

What you know about SyntaxUI:
- It turns screenshots of menus/UIs into Dear ImGui C++ shells, plus a compiled .exe. "Screenshot in. UI out."
- A remake takes 1–10 screenshots, one per tab. Quality tiers: 55% ($5), 75% ($12), 1:1 ($25); a Custom UI from a brief costs $20; the first remake is free.
- The result is a cosmetic shell only: no game, memory, process, file or network code. You can say that honestly.
- Measurement beats guessing: describe measured colors, sizes, radius, spacing and widget construction when you look at a screenshot, so the remake has real numbers to work with.
- If the user drops screenshots, you can see them. Say what you see and offer either a remake brief or a description of the widgets.

Rules:
- Always answer in the user's interface language. Keep code, commands and file paths exactly as written.
- You cannot open apps, run tools or browse. If asked for something you cannot do, say so in one line and offer the next best thing.
- When screenshots are attached, refer to them as "your screenshots".`;

export function systemPrompt(userName: string): string {
  const meta = langMeta(getLang());
  const name = userName.trim();
  const who = name ? `The user's name is ${name}.` : `You do not know the user's name yet.`;
  return `${PERSONA}

Current interface language: ${meta.label} (${meta.code}). Answer in that language.
${who}`;
}

interface WireContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

interface WireMessage {
  role: "system" | "user" | "assistant";
  content: string | WireContentPart[];
}

function toWire(turns: Turn[], userName: string): WireMessage[] {
  const messages: WireMessage[] = [{ role: "system", content: systemPrompt(userName) }];
  for (const turn of turns) {
    if (turn.role === "user" && turn.images?.length) {
      const parts: WireContentPart[] = [{ type: "text", text: turn.text || "Look at these screenshots." }];
      for (const url of turn.images) parts.push({ type: "image_url", image_url: { url } });
      messages.push({ role: "user", content: parts });
    } else {
      messages.push({ role: turn.role, content: turn.text });
    }
  }
  return messages;
}

function extractDelta(payload: unknown): string {
  const choices = (payload as { choices?: Array<{ delta?: { content?: unknown } }> }).choices;
  const content = choices?.[0]?.delta?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "object" && part && "text" in part ? String((part as { text?: string }).text ?? "") : ""))
      .join("");
  }
  return "";
}

/** Stream a reply. Resolves with the whole text; deltas arrive as they come. */
export async function streamReply(args: ReplyArgs): Promise<string> {
  const body = {
    model: args.model,
    messages: toWire(args.turns, args.userName),
    stream: true,
    temperature: 0.65,
    max_tokens: 1400,
  };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: args.signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw new AiError("aborted", "aborted");
    throw new AiError("network", String(err));
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) throw new AiError("auth", detail, res.status);
    if (res.status === 429) throw new AiError("rate", detail, res.status);
    throw new AiError("http", detail || res.statusText, res.status);
  }

  if (!res.body) {
    // Some proxies answer a normal JSON body even when stream was asked for.
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = json.choices?.[0]?.message?.content ?? "";
    if (text) args.onDelta(text);
    return text;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const piece = extractDelta(JSON.parse(data));
        if (piece) {
          full += piece;
          args.onDelta(piece);
        }
      } catch {
        // A partial or non-JSON keep-alive line: ignore it and keep reading.
      }
    }
  }

  return full;
}

/** One cheap round trip so Settings can say "Connected" instead of guessing. */
export async function testKey(apiKey: string, model: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 4,
        stream: false,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
