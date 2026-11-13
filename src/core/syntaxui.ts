import { openExternal } from "./tauri";

/**
 * SyntaxUI — "Screenshot in. UI out."
 *
 * There is no public upload API, so Synt does the honest thing: it collects
 * the screenshots (1–10, one per tab), stages them in one folder on desktop,
 * writes a measurement-ready brief, and opens SyntaxUI ready for the drop.
 * `SYNTAXUI_UPLOAD_URL` is honoured for a self-hosted or future endpoint.
 */

export const SYNTAXUI_HOME = "https://ui.syntaxdev.store";
export const SYNTAXUI_NEW = "https://ui.syntaxdev.store/new";

export interface Shot {
  id: string;
  name: string;
  dataUrl: string;
  /** Absolute path on desktop, absent in the browser shell. */
  path?: string;
  width?: number;
  height?: number;
}

export function buildBrief(shots: Shot[], request: string): string {
  const header = [
    "SyntaxUI remake brief",
    "",
    `Screenshots: ${shots.length} (one per tab, in this order)`,
    ...shots.map((shot, index) => {
      const size = shot.width && shot.height ? ` — ${shot.width}×${shot.height}` : "";
      return `  ${index + 1}. ${shot.name}${size}`;
    }),
    "",
    request.trim() ? `What I want: ${request.trim()}` : "What I want: a 1:1 remake of the screenshots.",
    "",
    "Measure, don't guess:",
    "- Palette: pull the exact hex values of the panel, headers, accents, text and disabled states.",
    "- Geometry: window size, panel padding, row height, header height, corner radii, 1px borders.",
    "- Widgets: describe each control (toggle track/knob, slider groove/fill, combo box, tabs) by its construction.",
    "- Type: size, weight and letter-spacing per label class. Icons map to Font Awesome 6.",
    "- Accent colour is the one used for the active tab and the slider fill.",
    "",
    "Output: C++ for Dear ImGui 1.91.9b, one theme table for every colour and metric, one function per page.",
  ];
  return header.join("\n");
}

/** A plain, offline fallback brief when no key is set yet. */
export function localBrief(shots: Shot[]): string {
  return buildBrief(shots, "");
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function openSyntaxUI(): Promise<void> {
  await openExternal(SYNTAXUI_NEW);
}

/**
 * Optional headless upload: point SYNTAXUI_UPLOAD_URL at a service that
 * accepts the same multipart form SyntaxUI's page posts.
 */
export async function uploadToSyntaxUI(shots: Shot[], brief: string): Promise<boolean> {
  const endpoint = import.meta.env.VITE_SYNTAXUI_UPLOAD_URL;
  if (!endpoint || !shots.length) return false;

  const form = new FormData();
  form.append("brief", brief);
  shots.forEach((shot, index) => {
    const [meta, base64] = shot.dataUrl.split(",");
    const mime = /:(.*?);/.exec(meta)?.[1] ?? "image/png";
    const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
    form.append("screenshots", new Blob([bytes], { type: mime }), shot.name || `tab-${index + 1}.png`);
  });

  try {
    const res = await fetch(endpoint, { method: "POST", body: form });
    return res.ok;
  } catch {
    return false;
  }
}
