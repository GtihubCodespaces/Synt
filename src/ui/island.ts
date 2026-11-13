import { setIslandSize } from "../core/tauri";
import type { Mood } from "./cube";

export type IslandState = "collapsed" | "peek" | "open";
export type Panel = "chat" | "settings";

/** Mirrored in island.css. The native window hugs these exactly. */
const SIZES: Record<IslandState, [number, number]> = {
  collapsed: [188, 40],
  peek: [312, 46],
  open: [468, 588],
};

export class Island {
  private state: IslandState = "collapsed";
  private panel: Panel = "chat";
  private frame = 0;

  constructor(
    private readonly el: HTMLElement,
    private readonly onStateChange: (state: IslandState, panel: Panel) => void = () => {},
  ) {
    el.addEventListener("pointerenter", () => {
      if (this.state === "collapsed") this.setState("peek");
    });
    el.addEventListener("pointerleave", () => {
      if (this.state === "peek") this.setState("collapsed");
    });
    window.addEventListener("resize", () => this.syncSize());
    this.setPanel("chat");
    this.syncSize();
  }

  get current(): IslandState {
    return this.state;
  }

  get currentPanel(): Panel {
    return this.panel;
  }

  open(panel: Panel = this.panel): void {
    this.setPanel(panel);
    this.setState("open");
  }

  close(): void {
    this.setState("collapsed");
  }

  peek(): void {
    if (this.state === "collapsed") this.setState("peek");
  }

  toggle(panel: Panel = "chat"): void {
    if (this.state === "open") this.close();
    else this.open(panel);
  }

  setPanel(panel: Panel): void {
    this.panel = panel;
    this.el.dataset.panel = panel;
    const chat = this.el.querySelector<HTMLElement>("#panel-chat");
    const settings = this.el.querySelector<HTMLElement>("#panel-settings");
    if (chat) chat.hidden = panel !== "chat";
    if (settings) settings.hidden = panel !== "settings";
  }

  setMood(mood: Mood): void {
    this.el.dataset.mood = mood;
  }

  setSubtitle(text: string): void {
    const sub = this.el.querySelector<HTMLElement>("#bar-sub");
    if (sub) sub.textContent = text;
  }

  setDropActive(active: boolean): void {
    const zone = this.el.querySelector<HTMLElement>("#dropzone");
    if (zone) zone.classList.toggle("on", active);
  }

  private setState(state: IslandState): void {
    if (this.state === state) return;
    this.state = state;
    this.el.dataset.state = state;
    this.syncSize();
    this.onStateChange(state, this.panel);
  }

  /** Resize the native window to the island, keeping it top-centre. */
  private syncSize(): void {
    const mobile = window.matchMedia("(max-width: 540px)").matches;
    let [width, height] = SIZES[this.state];
    if (this.state === "open" && mobile) {
      width = Math.max(300, Math.min(468, window.innerWidth - 12));
      height = Math.min(Math.round(window.innerHeight * 0.86), 620);
    }
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      void setIslandSize(width, height);
    });
  }
}
