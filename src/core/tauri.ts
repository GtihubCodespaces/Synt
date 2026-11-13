/**
 * The thin bridge to the Rust shell. Every call is a no-op in the browser
 * shell, so the whole front end runs in a normal tab for development.
 */

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

type Args = Record<string, unknown>;

async function invoke<T>(cmd: string, args?: Args): Promise<T | null> {
  if (!isTauri()) return null;
  try {
    const { invoke: call } = await import("@tauri-apps/api/core");
    return await call<T>(cmd, args);
  } catch (err) {
    console.warn(`[synt] ${cmd} failed`, err);
    return null;
  }
}

/** Keep the native window exactly the size of the island, top-centre. */
export async function setIslandSize(width: number, height: number): Promise<void> {
  await invoke("set_island_size", { width, height });
}

export async function readStore(name: string): Promise<string | null> {
  return invoke<string>("read_store", { name });
}

export async function writeStore(name: string, data: string): Promise<boolean> {
  return (await invoke<boolean>("write_store", { name, data })) ?? false;
}

export async function readImageAsDataUrl(path: string): Promise<string | null> {
  return invoke<string>("read_image", { path });
}

/** Copy dropped screenshots into one folder so SyntaxUI can take all of them. */
export async function stageScreenshots(paths: string[]): Promise<string | null> {
  return invoke<string>("stage_screenshots", { paths });
}

export interface OverlayState {
  supported: boolean;
  granted: boolean;
  running: boolean;
}

const NO_OVERLAY: OverlayState = { supported: false, granted: false, running: false };

/** The floating island only exists on Android; desktop answers "unsupported". */
export function isAndroid(): boolean {
  return isTauri() && /Android/i.test(navigator.userAgent);
}

export async function overlayState(): Promise<OverlayState> {
  return (await invoke<OverlayState>("overlay_state")) ?? NO_OVERLAY;
}

export async function enableOverlay(): Promise<OverlayState> {
  return (await invoke<OverlayState>("overlay_enable")) ?? NO_OVERLAY;
}

export async function disableOverlay(): Promise<OverlayState> {
  return (await invoke<OverlayState>("overlay_disable")) ?? NO_OVERLAY;
}

export async function openOverlayPermission(): Promise<void> {
  await invoke("overlay_permission");
}

export async function setOverlayMood(mood: string, label: string): Promise<void> {
  await invoke("overlay_mood", { mood, label });
}

export async function openExternal(target: string): Promise<void> {
  if (isTauri()) {
    await invoke("open_external", { target });
    return;
  }
  window.open(target, "_blank", "noopener,noreferrer");
}

type DropPayload = { type: "over" | "drop" | "leave"; paths?: string[] };

/** Tauri intercepts OS drag-and-drop, so it has to be read from the webview. */
export async function onTauriFileDrop(handler: (paths: string[]) => void): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { getCurrentWebview } = await import("@tauri-apps/api/webview");
    await getCurrentWebview().onDragDropEvent((event) => {
      const payload = event.payload as DropPayload;
      if (payload.type === "drop" && payload.paths?.length) handler(payload.paths);
    });
    return true;
  } catch (err) {
    console.warn("[synt] drag-drop unavailable", err);
    return false;
  }
}
