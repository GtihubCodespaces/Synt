import { t } from "../core/i18n";
import type { Shot } from "../core/syntaxui";

export interface ShelfActions {
  onRemove: (id: string) => void;
  onBrief: () => void;
  onOpen: () => void;
  onClear: () => void;
}

export class Shelf {
  private readonly title: HTMLElement | null;
  private readonly strip: HTMLElement;

  constructor(root: HTMLElement, private readonly actions: ShelfActions) {
    this.title = root.querySelector<HTMLElement>("#shelf-title");
    this.strip = root.querySelector<HTMLElement>("#shelf-strip") ?? root;

    root.querySelector<HTMLButtonElement>("#shelf-brief")?.addEventListener("click", () => actions.onBrief());
    root.querySelector<HTMLButtonElement>("#shelf-open")?.addEventListener("click", () => actions.onOpen());
    root.querySelector<HTMLButtonElement>("#shelf-clear")?.addEventListener("click", () => actions.onClear());

    if (this.title) this.title.textContent = t("shelfTitle");
  }

  render(shots: Shot[]): void {
    const root = this.strip.closest<HTMLElement>(".shelf");
    if (root) root.hidden = shots.length === 0;
    if (this.title) this.title.textContent = `${t("shelfTitle")}${shots.length ? ` · ${shots.length}` : ""}`;

    this.strip.replaceChildren(
      ...shots.map((shot) => {
        const thumb = document.createElement("div");
        thumb.className = "shot-thumb";

        const img = document.createElement("img");
        img.src = shot.dataUrl;
        img.alt = shot.name;
        img.title = shot.name;
        thumb.append(img);

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "x";
        remove.textContent = "✕";
        remove.setAttribute("aria-label", "Remove");
        remove.addEventListener("click", (event) => {
          event.stopPropagation();
          this.actions.onRemove(shot.id);
        });
        thumb.append(remove);

        return thumb;
      }),
    );
  }
}
