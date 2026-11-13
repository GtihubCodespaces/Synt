import { LANGS, t } from "../core/i18n";
import { MODELS, type Settings, type VoiceMode } from "../core/store";

export interface OverlayInfo {
  supported: boolean;
  granted: boolean;
  running: boolean;
}

export interface SettingsActions {
  onPatch: (patch: Partial<Settings>) => void;
  onOverlay: (enabled: boolean) => void;
  onOverlayPermission: () => void;
  onKey: (key: string) => Promise<void>;
  onRemoveKey: () => Promise<void>;
  onTestKey: () => Promise<boolean>;
  onReset: () => void;
  onSyntaxUI: () => void;
  onBack: () => void;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  children: Array<Node | string> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = String(value);
    else if (key === "text") node.textContent = String(value);
    else if (key === "html") node.innerHTML = String(value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else {
      node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  for (const child of children) node.append(typeof child === "string" ? document.createTextNode(child) : child);
  return node;
}

function row(label: string, control: Node, hint?: string): HTMLElement {
  const left = h("div", { class: "label" }, [h("span", { text: label })]);
  if (hint) left.append(h("span", { class: "hint", text: hint }));
  return h("div", { class: "set-row" }, [left, control]);
}

function group(title: string, rows: Node[]): HTMLElement {
  return h("section", { class: "set-group" }, [h("h4", { text: title }), ...rows]);
}

function select(
  value: string,
  options: Array<{ value: string; label: string }>,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const node = h("select", { class: "set-select" });
  for (const option of options) {
    const opt = h("option", { value: option.value, text: option.label });
    if (option.value === value) opt.selected = true;
    node.append(opt);
  }
  node.addEventListener("change", () => onChange(node.value));
  return node;
}

function toggle(checked: boolean, onChange: (checked: boolean) => void): HTMLButtonElement {
  const node = h("button", {
    class: "switch",
    type: "button",
    role: "switch",
    "aria-checked": checked ? "true" : "false",
  });
  node.addEventListener("click", () => {
    const next = node.getAttribute("aria-checked") !== "true";
    node.setAttribute("aria-checked", next ? "true" : "false");
    onChange(next);
  });
  return node;
}

function debounce<T extends unknown[]>(fn: (...args: T) => void, ms: number): (...args: T) => void {
  let timer = 0;
  return (...args: T) => {
    clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), ms);
  };
}

export function renderSettings(
  root: HTMLElement,
  settings: Settings,
  hasKey: boolean,
  actions: SettingsActions,
  overlay?: OverlayInfo,
): void {
  root.replaceChildren();

  const nameInput = h("input", {
    class: "set-input",
    type: "text",
    value: settings.name,
    placeholder: "—",
    maxlength: "40",
    spellcheck: "false",
  }) as HTMLInputElement;
  nameInput.addEventListener("input", debounce(() => actions.onPatch({ name: nameInput.value }), 350));

  const langSelect = select(
    settings.lang,
    LANGS.map((lang) => ({ value: lang.code, label: lang.label })),
    (value) => actions.onPatch({ lang: value }),
  );

  const voiceSelect = select(
    settings.voice,
    [
      { value: "local", label: t("voiceLocal") },
      { value: "system", label: t("voiceSystem") },
      { value: "off", label: t("voiceOff") },
    ],
    (value) => actions.onPatch({ voice: value as VoiceMode }),
  );

  const wakeToggle = toggle(settings.wake, (checked) => actions.onPatch({ wake: checked }));

  const modelSelect = select(
    settings.model,
    [
      { value: MODELS.free, label: t("modelFree") },
      { value: MODELS.paid, label: t("modelPaid") },
    ],
    (value) => actions.onPatch({ model: value }),
  );

  const serverInput = h("input", {
    class: "set-input",
    type: "text",
    value: settings.ttsServer,
    spellcheck: "false",
    placeholder: "http://127.0.0.1:8765",
  }) as HTMLInputElement;
  serverInput.addEventListener("input", debounce(() => actions.onPatch({ ttsServer: serverInput.value.trim() }), 500));

  // API key: never rendered back. Save replaces it, Remove deletes it.
  const keyInput = h("input", {
    class: "set-input",
    type: "password",
    placeholder: hasKey ? "••••••••" : "thk_…",
    spellcheck: "false",
    autocomplete: "off",
  }) as HTMLInputElement;

  const feedback = h("span", { class: "status-line" });
  const setFeedback = (ok: boolean, message: string): void => {
    feedback.replaceChildren(h("span", { class: ok ? "dot-ok" : "dot-warn" }), h("span", { text: message }));
  };

  const saveKey = h("button", { class: "btn primary", type: "button", text: t("save") });
  saveKey.addEventListener("click", async () => {
    const value = keyInput.value.trim();
    if (!value) return;
    saveKey.disabled = true;
    await actions.onKey(value);
    keyInput.value = "";
    keyInput.placeholder = "••••••••";
    saveKey.disabled = false;
    setFeedback(true, t("saved"));
  });

  const testKey = h("button", { class: "btn", type: "button", text: "Test" });
  testKey.addEventListener("click", async () => {
    testKey.disabled = true;
    setFeedback(true, "…");
    const ok = await actions.onTestKey();
    setFeedback(ok, ok ? "Connected" : "No answer");
    testKey.disabled = false;
  });

  const removeKey = h("button", { class: "btn danger", type: "button", text: t("remove") });
  removeKey.addEventListener("click", async () => {
    await actions.onRemoveKey();
    keyInput.placeholder = "thk_…";
    setFeedback(false, t("remove"));
  });

  const keyRow = h("div", { class: "set-group" }, [
    h("h4", { text: t("apiKey") }),
    keyInput,
    h("div", { class: "set-actions" }, [saveKey, testKey, hasKey ? removeKey : ""].filter(Boolean) as Node[]),
    feedback,
    h("p", { class: "set-note", text: t("apiKeyHint") }),
  ]);

  const reset = h("button", { class: "btn", type: "button", text: t("resetChat") });
  reset.addEventListener("click", () => actions.onReset());

  const syntaxButton = h("button", { class: "btn", type: "button", text: "SyntaxUI ↗" });
  syntaxButton.addEventListener("click", () => actions.onSyntaxUI());

  const back = h("button", { class: "ghost-btn", type: "button", text: "‹ Chat" });
  back.addEventListener("click", () => actions.onBack());

  // Android only: the system-level floating island. Hidden elsewhere, because
  // there is nothing honest to show on a desktop.
  const overlayRows: Node[] = [];
  if (overlay?.supported) {
    overlayRows.push(
      row(
        t("overlayToggle"),
        toggle(settings.overlay, (enabled) => actions.onOverlay(enabled)),
        t("overlayHint"),
      ),
    );
    if (overlay.granted) {
      overlayRows.push(h("p", { class: "set-note", text: t("overlayGranted") }));
    } else {
      const allow = h("button", { class: "btn primary", type: "button", text: t("overlayPermission") });
      allow.addEventListener("click", () => actions.onOverlayPermission());
      overlayRows.push(h("div", { class: "set-actions" }, [allow]));
    }
  }

  root.append(
    h("div", { class: "set-head" }, [back, h("span", { class: "set-head-title", text: "Synt" })]),
    group(t("settings"), [
      row(t("yourName"), nameInput, t("yourNameHint")),
      row(t("language"), langSelect),
      row(t("voice"), voiceSelect),
      row(t("wakeToggle"), wakeToggle, t("wakeHint")),
    ]),
    group(t("model"), [row(t("model"), modelSelect)]),
    keyRow,
    ...(overlayRows.length ? [group(t("overlay"), overlayRows)] : []),
    group(t("ttsServer"), [row(t("ttsServer"), serverInput, t("ttsServerHint"))]),
    group(t("about"), [
      h("div", { class: "set-actions" }, [reset, syntaxButton]),
      h("p", { class: "set-note", text: t("about") }),
    ]),
    h("footer", { class: "set-footer" }, [
      h("span", { html: "<b>Synt</b> 0.1.0 · MIT" }),
      h("span", { text: "coucou fork · Windows · Linux · Android" }),
    ]),
  );
}
