/** Inline stroke icons. Kept as strings so the bundle stays tiny and offline. */

const svg = (body: string, size = 24) =>
  `<svg viewBox="0 0 ${size} ${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  mic: svg(
    `<path d="M12 14.5a3 3 0 0 0 3-3v-5a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z"/><path d="M18.5 11.5a6.5 6.5 0 0 1-13 0"/><path d="M12 18v3"/>`,
  ),
  gear: svg(
    `<path d="M4 7h9"/><path d="M17 7h3"/><circle cx="15" cy="7" r="2.2"/><path d="M4 17h4"/><path d="M12 17h8"/><circle cx="10" cy="17" r="2.2"/>`,
  ),
  close: svg(`<path d="M6 6l12 12"/><path d="M18 6 6 18"/>`),
  plus: svg(`<path d="M12 5v14"/><path d="M5 12h14"/>`),
  image: svg(
    `<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m4.5 17 4.6-4.2a2 2 0 0 1 2.7 0l2.1 1.9"/><path d="m13.6 14.4 1.9-1.6a2 2 0 0 1 2.6 0l1.4 1.2"/>`,
  ),
  send: svg(`<path d="M12 19V5"/><path d="m5.5 11.5 6.5-6.5 6.5 6.5"/>`),
  external: svg(
    `<path d="M14 4h6v6"/><path d="m20 4-8.5 8.5"/><path d="M19 14.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4.5"/>`,
  ),
  trash: svg(
    `<path d="M4.5 7h15"/><path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7"/><path d="M6.5 7l.8 11.2A1.8 1.8 0 0 0 9.1 20h5.8a1.8 1.8 0 0 0 1.8-1.8L17.5 7"/><path d="M10.5 11v5"/><path d="M13.5 11v5"/>`,
  ),
  check: svg(`<path d="m5 12.5 4.5 4.5L19 7.5"/>`),
  copy: svg(
    `<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>`,
  ),
  spark: svg(
    `<path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z"/><path d="M18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2Z"/>`,
  ),
  download: svg(
    `<path d="M12 4v10"/><path d="m8 10.5 4 4 4-4"/><path d="M5 19h14"/>`,
  ),
  refresh: svg(
    `<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4.5V9h-4.5"/>`,
  ),
} as const;

export type IconName = keyof typeof icons;

export function icon(name: IconName): string {
  return icons[name];
}

export function applyIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-icon]").forEach((el) => {
    const name = el.dataset.icon as IconName | undefined;
    if (name && name in icons) el.innerHTML = icons[name];
  });
}
