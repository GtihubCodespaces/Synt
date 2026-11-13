import "./styles/tokens.css";
import "./styles/island.css";
import "./styles/chat.css";
import "./styles/hero.css";
import "./styles/settings.css";

import { icon } from "./icons";
import { AiError, streamReply, testKey, type Turn } from "./core/ai";
import { Ears } from "./core/asr";
import { getBcp47, setLang, t } from "./core/i18n";
import { clearKey, loadKey, loadSettings, saveKey, saveSettings, type Settings } from "./core/store";
import { isTauri, onTauriFileDrop, openExternal, readImageAsDataUrl, stageScreenshots } from "./core/tauri";
import { Voice } from "./core/tts";
import { buildBrief, copyText, openSyntaxUI, type Shot } from "./core/syntaxui";
import { ChatView, type Bubble } from "./ui/chat";
import { SyntCube, type Mood } from "./ui/cube";
import { Island } from "./ui/island";
import { renderSettings } from "./ui/settings";
import { Shelf } from "./ui/shelf";

function $<T extends HTMLElement>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element ${selector}`);
  return el;
}

/* ── Elements ────────────────────────────────────────────────────────────── */

const islandEl = $("#island");
const messagesEl = $("#messages");
const composer = $<HTMLFormElement>("#composer");
const input = $<HTMLTextAreaElement>("#input");
const sendBtn = $<HTMLButtonElement>("#send");
const cubeCanvas = $<HTMLCanvasElement>("#cube");
const settingsPanel = $<HTMLElement>("#panel-settings");
const shelfEl = $<HTMLElement>("#shelf");
const dropzoneText = $("#dropzone-text");
const picker = $<HTMLInputElement>("#file-picker");

const btnMic = $<HTMLButtonElement>("#btn-mic");
const btnAttach = $<HTMLButtonElement>("#btn-attach");
const btnAttach2 = $<HTMLButtonElement>("#btn-attach-2");
const btnSettings = $<HTMLButtonElement>("#btn-settings");
const btnClose = $<HTMLButtonElement>("#btn-close");
const cubeBtn = $<HTMLButtonElement>("#cube-btn");

btnMic.innerHTML = icon("mic");
btnAttach.innerHTML = icon("image");
btnAttach2.innerHTML = icon("plus");
btnSettings.innerHTML = icon("gear");
btnClose.innerHTML = icon("close");
sendBtn.innerHTML = icon("send");
$("#dropzone-icon").innerHTML = icon("image");

/* ── State ───────────────────────────────────────────────────────────────── */

let settings: Settings;
let apiKey = "";
let busy = false;
let lastSpoken = "";

const bubbles: Bubble[] = [];
const context: Turn[] = [];
const shots: Shot[] = [];
let counter = 0;
const newId = (): string => `m${(counter += 1)}`;

const cube = new SyntCube(cubeCanvas);
const heroCube = new SyntCube($<HTMLCanvasElement>("#cube-hero"));
cube.link(heroCube);
const island = new Island(islandEl);
const chat = new ChatView(messagesEl, $("#chat-hero"));
const voice = new Voice();

/** One mood, four places: both cubes, the island aura and the pill's label. */
function setMood(mood: Mood): void {
  cube.setMood(mood);
  island.setMood(mood);
  const label = mood === "listening" ? t("listening") : mood === "thinking" ? t("thinking") : mood === "speaking" ? t("speaking") : t("wake");
  island.setSubtitle(label);
}

const ears = new Ears({
  onWake: () => void greetAndListen(),
  onStatus: (status) => {
    btnMic.classList.toggle("recording", status === "question");
    if (status === "question") setMood("listening");
  },
  onError: (key) => {
    island.open("chat");
    chat.addSystem(t(key));
  },
});

const shelf = new Shelf(shelfEl, {
  onRemove: (id) => {
    const index = shots.findIndex((shot) => shot.id === id);
    if (index >= 0) shots.splice(index, 1);
    shelf.render(shots);
  },
  onBrief: () => void makeBrief(),
  onOpen: () => void sendToSyntaxUI(),
  onClear: () => {
    shots.length = 0;
    shelf.render(shots);
  },
});

/* ── Text that follows the language ──────────────────────────────────────── */

function applyStaticText(): void {
  input.placeholder = t("placeholder");
  island.setSubtitle(t("wake"));
  dropzoneText.textContent = t("shelfDrop");
  btnMic.title = t("wake");
  btnMic.setAttribute("aria-label", t("wake"));
  btnAttach.title = t("attach");
  btnAttach.setAttribute("aria-label", t("attach"));
  btnAttach2.title = t("attach");
  btnSettings.title = t("settings");
  btnSettings.setAttribute("aria-label", t("settings"));
  btnClose.title = t("close");
  btnClose.setAttribute("aria-label", t("close"));
  shelf.render(shots);
}

function showWelcome(): void {
  chat.showWelcome(
    {
      wake: t("wake"),
      line: t("welcome"),
      chips: [t("chip1"), t("chip2"), t("chip3")],
      note: apiKey ? undefined : { text: t("noKey"), action: { label: t("openSettings"), run: openSettings } },
    },
    (text) => void handleChip(text),
  );
}

function refreshChat(): void {
  chat.clear();
  for (const bubble of bubbles) chat.add(bubble);
  if (!bubbles.length) showWelcome();
  chat.scroll(true);
}

function addBubble(bubble: Bubble, streaming = false): void {
  bubbles.push(bubble);
  chat.add(bubble, streaming);
}

/* ── Chat ────────────────────────────────────────────────────────────────── */

function errorKey(error: unknown): "authError" | "rateError" | "netError" {
  if (error instanceof AiError) {
    if (error.kind === "auth") return "authError";
    if (error.kind === "rate") return "rateError";
  }
  return "netError";
}

function needKey(): void {
  island.open("chat");
  chat.addSystem(t("noKey"), { label: t("openSettings"), run: openSettings });
}

async function send(text: string, images: string[] = []): Promise<string | null> {
  const clean = text.trim();
  if (busy || (!clean && !images.length)) return null;
  if (!apiKey) {
    needKey();
    return null;
  }

  island.open("chat");
  setMood("thinking");

  addBubble({ id: newId(), role: "user", text: clean, images });
  const id = newId();
  const bubble: Bubble = { id, role: "assistant", text: "" };
  addBubble(bubble, true);
  context.push({ role: "user", text: clean, images });

  busy = true;
  sendBtn.disabled = true;

  try {
    const full = await streamReply({
      apiKey,
      model: settings.model,
      turns: context,
      userName: settings.name,
      onDelta: (chunk) => chat.appendText(id, chunk),
    });
    bubble.text = full;
    chat.setText(id, full);
    chat.finish(id);
    context.push({ role: "assistant", text: full });
    setMood("idle");
    if (full && full !== lastSpoken) {
      lastSpoken = full;
      void voice.speak(full, getBcp47());
    }
    return full;
  } catch (error) {
    chat.remove(id);
    chat.addSystem(t(errorKey(error)), { label: t("openSettings"), run: openSettings });
    setMood("idle");
    return null;
  } finally {
    busy = false;
    sendBtn.disabled = false;
    if (!isTauri()) input.focus();
  }
}

async function handleChip(text: string): Promise<void> {
  if (text === t("chip3")) {
    await makeBrief();
    return;
  }
  if (text === t("chip2") && shots.length) {
    await send(text, shots.map((shot) => shot.dataUrl));
    return;
  }
  await send(text);
}

function resetChat(): void {
  bubbles.length = 0;
  context.length = 0;
  shots.length = 0;
  shelf.render(shots);
  chat.clear();
  showWelcome();
  setMood("idle");
}

/* ── Voice ───────────────────────────────────────────────────────────────── */

async function greetAndListen(): Promise<void> {
  if (busy) return;
  island.open("chat");
  setMood("happy");

  const name = settings.name.trim();
  const line = name ? t("greeting", { name }) : t("greetingAnon");
  const last = bubbles[bubbles.length - 1];
  if (!last || last.text !== line) addBubble({ id: newId(), role: "assistant", text: line });

  await voice.speak(line, getBcp47());
  setMood("idle");

  if (!apiKey) {
    needKey();
    return;
  }
  await listenForQuestion();
}

async function listenForQuestion(): Promise<void> {
  if (busy) return;
  island.open("chat");
  if (!ears.available && !(await ears.probe())) {
    chat.addSystem(t("noWake"));
    return;
  }
  setMood("listening");
  const question = await ears.listenOnce();
  setMood("idle");
  if (question) await send(question);
}

/* ── Settings ────────────────────────────────────────────────────────────── */

function openSettings(): void {
  island.open("settings");
  renderSettingsView();
}

function renderSettingsView(): void {
  renderSettings(settingsPanel, settings, Boolean(apiKey), {
    onPatch: async (patch) => {
      settings = { ...settings, ...patch };
      await saveSettings(settings);

      if (patch.lang) {
        setLang(settings.lang);
        applyStaticText();
        renderSettingsView();
        refreshChat();
      }
      if (patch.voice !== undefined || patch.ttsServer !== undefined) {
        voice.configure(settings.voice, settings.ttsServer, onVoiceState);
        ears.configure({ lang: getBcp47(), server: settings.ttsServer });
      }
      if (patch.wake !== undefined) {
        ears.configure({ lang: getBcp47(), server: settings.ttsServer });
        if (patch.wake) void ears.enableWake();
        else ears.disableWake();
      }
    },
    onKey: async (key) => {
      apiKey = key;
      await saveKey(key);
    },
    onRemoveKey: async () => {
      apiKey = "";
      await clearKey();
    },
    onTestKey: async () => testKey(apiKey, settings.model),
    onReset: () => {
      resetChat();
      island.setPanel("chat");
    },
    onSyntaxUI: () => void openExternal("https://ui.syntaxdev.store"),
    onBack: () => island.setPanel("chat"),
  });
}

/* ── Screenshots → SyntaxUI ──────────────────────────────────────────────── */

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("unsupported image"));
    img.src = src;
  });
}

/** Keep the payload sane: 1440 px on the long edge is plenty for a remake brief. */
async function fileToShot(file: File): Promise<Shot | null> {
  if (!file.type.startsWith("image/")) return null;
  try {
    const dataUrl = await readFileAsDataUrl(file);
    const img = await loadImage(dataUrl);
    const max = 1440;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && dataUrl.length < 1_400_000) {
      return { id: newId(), name: file.name || "screenshot.png", dataUrl, width: img.naturalWidth, height: img.naturalHeight };
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL("image/png");
    const data = png.length > 1_600_000 ? canvas.toDataURL("image/jpeg", 0.92) : png;
    return { id: newId(), name: file.name || "screenshot.png", dataUrl: data, width: canvas.width, height: canvas.height };
  } catch {
    return null;
  }
}

function acceptShots(added: Shot[]): void {
  if (!added.length) return;
  shots.push(...added);
  // SyntaxUI takes 1–10 screenshots per remake: keep the newest ten.
  if (shots.length > 10) shots.splice(0, shots.length - 10);
  shelf.render(shots);
  island.open("chat");
  chat.addSystem(t("dropped", { n: added.length }));
  setMood("happy");
  window.setTimeout(() => {
    if (!busy && !voice.speaking) setMood("idle");
  }, 2200);
}

async function ingestFiles(files: File[]): Promise<void> {
  const images = files.filter((file) => file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name));
  if (!images.length) return;
  const added: Shot[] = [];
  for (const file of images) {
    const shot = await fileToShot(file);
    if (shot) added.push(shot);
  }
  acceptShots(added);
}

async function ingestPaths(paths: string[]): Promise<void> {
  const added: Shot[] = [];
  for (const path of paths) {
    if (!/\.(png|jpe?g|webp|gif|bmp)$/i.test(path)) continue;
    const dataUrl = await readImageAsDataUrl(path);
    if (!dataUrl) continue;
    const name = path.split(/[\\/]/).pop() ?? "screenshot.png";
    let width: number | undefined;
    let height: number | undefined;
    try {
      const img = await loadImage(dataUrl);
      width = img.naturalWidth;
      height = img.naturalHeight;
    } catch {
      /* still usable, just unsized */
    }
    added.push({ id: newId(), name, dataUrl, path, width, height });
  }
  acceptShots(added);
}

async function makeBrief(): Promise<void> {
  if (!shots.length) {
    chat.addSystem(t("shelfDrop"));
    return;
  }
  if (!apiKey) {
    const brief = buildBrief(shots, "");
    const ok = await copyText(brief);
    chat.addSystem(ok ? `${t("briefIntro")} ${t("copied")}` : t("netError"));
    return;
  }
  const reply = await send(t("briefAsk"), shots.map((shot) => shot.dataUrl));
  if (reply) {
    await copyText(reply);
    chat.addSystem(t("copied"));
  }
}

async function sendToSyntaxUI(): Promise<void> {
  if (!shots.length) {
    await openSyntaxUI();
    return;
  }
  await copyText(buildBrief(shots, ""));
  const paths = shots.map((shot) => shot.path).filter((path): path is string => Boolean(path));
  if (paths.length) {
    const folder = await stageScreenshots(paths);
    if (folder) {
      chat.addSystem(t("staged", { folder }));
      await openExternal(folder);
    }
  }
  await openSyntaxUI();
}

/* ── Events ──────────────────────────────────────────────────────────────── */

function onVoiceState(speaking: boolean): void {
  islandEl.dataset.voice = speaking ? "on" : "off";
  if (speaking) setMood("speaking");
  else if (!busy) setMood("idle");
}

function autoGrow(): void {
  input.style.height = "auto";
  input.style.height = `${Math.min(108, input.scrollHeight)}px`;
}

composer.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = input.value;
  input.value = "";
  autoGrow();
  void send(text);
});

input.addEventListener("input", autoGrow);

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    composer.requestSubmit();
  }
});

islandEl.querySelector(".bar")?.addEventListener("click", (event) => {
  if ((event.target as HTMLElement).closest("button")) return;
  if (island.current !== "open") island.open("chat");
});

cubeBtn.addEventListener("click", () => {
  island.open("chat");
  setMood("happy");
  window.setTimeout(() => {
    if (!busy) setMood("idle");
  }, 1800);
});

btnMic.addEventListener("click", () => void greetAndListen());
btnSettings.addEventListener("click", () => openSettings());
btnClose.addEventListener("click", () => island.close());
for (const button of [btnAttach, btnAttach2]) button.addEventListener("click", () => picker.click());

picker.addEventListener("change", () => {
  void ingestFiles(Array.from(picker.files ?? []));
  picker.value = "";
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    island.close();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    resetChat();
    island.open("chat");
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key === ",") {
    event.preventDefault();
    openSettings();
  }
});

if (!isTauri()) {
  document.addEventListener("pointerdown", (event) => {
    if (island.current === "open" && !islandEl.contains(event.target as Node)) island.close();
  });
}

let dragDepth = 0;
const hasFiles = (event: DragEvent): boolean => Array.from(event.dataTransfer?.types ?? []).includes("Files");

window.addEventListener("dragenter", (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dragDepth += 1;
  island.setDropActive(true);
  island.peek();
});

window.addEventListener("dragover", (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  island.setDropActive(true);
});

window.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) island.setDropActive(false);
});

window.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  island.setDropActive(false);
  const files = Array.from(event.dataTransfer?.files ?? []);
  if (files.length) void ingestFiles(files);
});

window.addEventListener("paste", (event) => {
  const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"));
  if (!files.length) return;
  event.preventDefault();
  void ingestFiles(files);
});

voice.prime();

/* ── Boot ────────────────────────────────────────────────────────────────── */

async function boot(): Promise<void> {
  const onAndroid = isTauri() && /Android/i.test(navigator.userAgent);
  document.documentElement.classList.add(onAndroid ? "shell-mobile" : isTauri() ? "shell-app" : "shell-browser");

  settings = await loadSettings();
  apiKey = await loadKey();
  setLang(settings.lang);

  voice.configure(settings.voice, settings.ttsServer, onVoiceState);
  ears.configure({ lang: getBcp47(), server: settings.ttsServer });

  applyStaticText();
  showWelcome();
  cube.start();
  heroCube.start();

  const hint = $("#browser-hint");
  if (!isTauri() && hint) {
    hint.hidden = false;
    hint.textContent = "Synt · browser shell — the real window is a transparent island";
  }

  if (isTauri()) {
    void onTauriFileDrop((paths) => void ingestPaths(paths));
  } else {
    window.setTimeout(() => island.peek(), 700);
    window.setTimeout(() => {
      if (island.current === "peek") island.close();
    }, 3200);
  }

  if (settings.wake) void ears.enableWake();
}

void boot().catch((error) => {
  console.error("[synt] boot failed", error);
});
