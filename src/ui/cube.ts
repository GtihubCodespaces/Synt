/**
 * Synt himself: a solid red cube with two white tick eyes, drawn in Canvas 2D.
 *
 * The eyes are the whole face — two short rounded ticks, angled like opening
 * quotation marks, exactly the way Grok Bot shapes carry state. Nothing else:
 * no pupils, no mouth. That leaves the eyes free to *become* the status:
 * straight and tall while listening, spinning satellites while thinking,
 * pulsing while speaking, smiling arcs when happy, flat dashes asleep.
 *
 * Motion does the rest of the acting: breathing, gaze drift, tilt, a springy
 * squash when you poke him. It stays crisp from 28 px (the collapsed island)
 * to 96 px (the welcome cube).
 */

export type Mood = "idle" | "listening" | "thinking" | "speaking" | "happy" | "sleeping";

type Pt = [number, number];

function roundPolygon(ctx: CanvasRenderingContext2D, pts: Pt[], radius: number): void {
  const n = pts.length;
  ctx.beginPath();
  for (let i = 0; i < n; i += 1) {
    const prev = pts[(i - 1 + n) % n];
    const here = pts[i];
    const next = pts[(i + 1) % n];

    const to = (from: Pt, towards: Pt): Pt => {
      const dx = towards[0] - from[0];
      const dy = towards[1] - from[1];
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.min(radius, len / 2) / len;
      return [from[0] + dx * k, from[1] + dy * k];
    };

    const a = to(here, prev);
    const b = to(here, next);
    if (i === 0) ctx.moveTo(a[0], a[1]);
    else ctx.lineTo(a[0], a[1]);
    ctx.quadraticCurveTo(here[0], here[1], b[0], b[1]);
  }
  ctx.closePath();
}

function gradient(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stops: Array<[number, string]>,
): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (const [at, color] of stops) g.addColorStop(at, color);
  return g;
}

/** One rounded tick: the only facial feature Synt has. */
function tick(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  length: number,
  thickness: number,
  angle: number,
  alpha = 1,
): void {
  const half = length / 2;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(0.9, thickness);
  ctx.strokeStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(0, -half);
  ctx.lineTo(0, half);
  ctx.stroke();
  ctx.restore();
}

export class SyntCube {
  private readonly ctx: CanvasRenderingContext2D;
  private mood: Mood = "idle";
  private linked: SyntCube[] = [];
  private moodAt = 0;
  private look = { x: 0, y: 0 };
  private target = { x: 0, y: 0 };
  private drift = { x: 0, y: 0 };
  private driftTarget = { x: 0, y: 0 };
  private nextDrift = 0;
  private nextBlink = 0;
  private blinkStart = -1;
  private pokeAt = -1;
  private raf = 0;
  private last = 0;
  private time = 0;
  private width = 32;
  private height = 32;
  private dpr = 1;
  private hover = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D is unavailable");
    this.ctx = ctx;
    this.resize();
    window.addEventListener("resize", () => this.resize());
    // The island grows from 28 px to 32 px when it opens: keep the backing
    // store in step so the cube stays sharp instead of being upscaled.
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(() => this.resize()).observe(this.canvas);
    }
    window.addEventListener("pointermove", this.onPointer, { passive: true });
    canvas.addEventListener("pointerenter", () => (this.hover = true));
    canvas.addEventListener("pointerleave", () => (this.hover = false));
    this.nextBlink = performance.now() + 2400;
    this.nextDrift = performance.now() + 1400;
  }

  private onPointer = (event: PointerEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const range = Math.max(180, window.innerHeight * 0.5);
    this.target.x = Math.max(-1, Math.min(1, (event.clientX - cx) / range));
    this.target.y = Math.max(-1, Math.min(1, (event.clientY - cy) / range));
  };

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    this.width = Math.max(18, rect.width || this.canvas.clientWidth || 32);
    this.height = Math.max(18, rect.height || this.canvas.clientHeight || 32);
    this.dpr = dpr;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
  }

  /** Two canvases, one character: the header cube and the big welcome cube. */
  link(other: SyntCube): void {
    if (this.linked.includes(other)) return;
    this.linked.push(other);
    other.setMood(this.mood);
  }

  setMood(mood: Mood): void {
    for (const twin of this.linked) twin.setMood(mood);
    if (this.mood === mood) return;
    this.mood = mood;
    this.moodAt = performance.now();
    if (mood === "happy") this.nextBlink = performance.now() + 4000;
  }

  /** A tap on the cube: he hops, squashes, and beams for a moment. */
  poke(): void {
    this.pokeAt = performance.now();
    this.setMood("happy");
    this.nextBlink = performance.now() + 3200;
    this.driftTarget = { x: 0, y: 0 };
  }

  start(): void {
    if (this.raf) return;
    this.last = performance.now();
    const frame = (now: number) => {
      this.draw(now);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.last = performance.now();
    });
  }

  stop(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private openAmount(now: number): number {
    if (this.mood === "sleeping") return 0;
    if (now > this.nextBlink) {
      this.blinkStart = now;
      this.nextBlink = now + 2400 + Math.random() * 3600;
    }
    if (this.blinkStart < 0) return 1;
    const k = (now - this.blinkStart) / 150;
    if (k >= 1) {
      this.blinkStart = -1;
      return 1;
    }
    return k < 0.5 ? 1 - k * 1.84 : 0.08 + (k - 0.5) * 1.84;
  }

  private draw(now: number): void {
    const ctx = this.ctx;
    const dt = Math.min(0.06, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;

    const ease = 1 - Math.pow(0.001, dt);
    this.look.x += (this.target.x - this.look.x) * ease;
    this.look.y += (this.target.y - this.look.y) * ease;

    // Idle curiosity: every few seconds he glances somewhere else.
    if (now > this.nextDrift) {
      this.nextDrift = now + 2200 + Math.random() * 3600;
      this.driftTarget = { x: (Math.random() - 0.5) * 1.1, y: (Math.random() - 0.5) * 0.7 };
    }
    this.drift.x += (this.driftTarget.x - this.drift.x) * (1 - Math.pow(0.02, dt));
    this.drift.y += (this.driftTarget.y - this.drift.y) * (1 - Math.pow(0.02, dt));

    const w = this.width;
    const h = this.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Small canvases need a bigger share of the box or the ticks turn to dust.
    const s = Math.min(w, h) * (Math.min(w, h) < 48 ? 0.7 : 0.62);
    const dx = s * 0.26;
    const dy = s * 0.23;
    const t = this.time;
    const moodAge = (now - this.moodAt) / 1000;

    // ── Acting ────────────────────────────────────────────────────────────
    const bob = Math.sin(t * 1.35) * s * 0.015;
    const breathe = 1 + Math.sin(t * 1.35) * 0.009;
    const listenLift = this.mood === "listening" ? 0.025 : 0;
    const thinkSway = this.mood === "thinking" ? Math.sin(t * 2.1) * s * 0.018 : 0;

    // Poke: a damped hop with squash on take-off and landing.
    const pokeT = this.pokeAt < 0 ? 9 : (now - this.pokeAt) / 1000;
    const hop = pokeT < 1.5 ? -Math.abs(Math.sin(pokeT * Math.PI * 1.5)) * s * 0.3 * Math.exp(-pokeT * 2.6) : 0;
    const squashWave = pokeT < 1.5 ? Math.sin(pokeT * Math.PI * 3) * Math.exp(-pokeT * 3.4) : 0;
    const scaleX = breathe + squashWave * 0.07 + listenLift * 0.4;
    const scaleY = breathe - squashWave * 0.08 + listenLift;

    const tilt = this.look.x * 0.045 + Math.sin(t * 0.9) * 0.006;

    // Cabinet projection: depth goes up-and-right, so the visible faces are
    // front, top and right — the classic cube silhouette.
    const originX = w / 2 - (s + dx) / 2;
    const originY = h / 2 - (s + dy) / 2 + bob + hop + thinkSway;

    const cx = originX + (s + dx) / 2;
    const cy = originY + (s + dy) / 2;

    // ── Aura and shadow ───────────────────────────────────────────────────
    ctx.save();
    const auraAlpha =
      this.mood === "idle" ? 0.18 : this.mood === "sleeping" ? 0.07 : this.mood === "listening" ? 0.34 : 0.28;
    const aura = ctx.createRadialGradient(cx, cy, s * 0.1, cx, cy, s * 0.98);
    aura.addColorStop(0, `rgba(255, 66, 56, ${auraAlpha})`);
    aura.addColorStop(0.55, `rgba(255, 40, 40, ${auraAlpha * 0.36})`);
    aura.addColorStop(1, "rgba(255, 40, 40, 0)");
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, w, h);

    // Contact shadow, spread and softened by the hop.
    const lift = Math.max(0, -hop) / Math.max(1, s);
    ctx.save();
    ctx.translate(cx, originY + s + dy + s * 0.08);
    ctx.scale(1 + lift * 0.6, 0.22);
    const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.5);
    shadow.addColorStop(0, `rgba(0,0,0,${0.5 - lift * 0.3})`);
    shadow.addColorStop(0.7, `rgba(0,0,0,${0.2 - lift * 0.12})`);
    shadow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Listening rings: the only weather he makes.
    if (this.mood === "listening") {
      for (let i = 0; i < 2; i += 1) {
        const k = (((t * 0.85 + i * 0.5) % 1) + 1) % 1;
        ctx.beginPath();
        ctx.arc(cx, cy, s * (0.52 + k * 0.55), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 80, 70, ${0.26 * (1 - k)})`;
        ctx.lineWidth = Math.max(1, s * 0.016);
        ctx.stroke();
      }
    }

    // ── Body ──────────────────────────────────────────────────────────────
    ctx.translate(cx, originY + s + dy);
    ctx.scale(scaleX, scaleY);
    ctx.rotate(tilt);
    ctx.translate(-cx, -(originY + s + dy));

    const ox = originX;
    const oy = originY;

    const top: Pt[] = [
      [ox, oy + dy],
      [ox + s, oy + dy],
      [ox + s + dx, oy],
      [ox + dx, oy],
    ];
    const right: Pt[] = [
      [ox + s, oy + dy],
      [ox + s + dx, oy],
      [ox + s + dx, oy + s],
      [ox + s, oy + s + dy],
    ];
    const front: Pt[] = [
      [ox, oy + dy],
      [ox + s, oy + dy],
      [ox + s, oy + s + dy],
      [ox, oy + s + dy],
    ];

    // One silhouette under the three faces: no seams or notches where the
    // rounded corners meet at the back edge.
    const silhouette: Pt[] = [
      [ox, oy + dy],
      [ox, oy + s + dy],
      [ox + s, oy + s + dy],
      [ox + s + dx, oy + s],
      [ox + s + dx, oy],
      [ox + dx, oy],
    ];
    roundPolygon(ctx, silhouette, s * 0.14);
    ctx.fillStyle = "#8c0a10";
    ctx.fill();

    // Top face — lit.
    roundPolygon(ctx, top, s * 0.1);
    ctx.fillStyle = gradient(ctx, ox, oy + dy, ox + s + dx, oy, [
      [0, "#ff554b"],
      [0.55, "#fa3f37"],
      [1, "#f2332c"],
    ]);
    ctx.fill();

    // Right face — shadowed.
    roundPolygon(ctx, right, s * 0.12);
    ctx.fillStyle = gradient(ctx, ox + s, oy + dy, ox + s + dx, oy + s, [
      [0, "#c01a20"],
      [0.55, "#a10e15"],
      [1, "#73060a"],
    ]);
    ctx.fill();

    // Front face — one saturated red, barely graded: a shape, not a render.
    roundPolygon(ctx, front, s * 0.16);
    ctx.fillStyle = gradient(ctx, ox, oy + dy, ox + s * 0.4, oy + s + dy, [
      [0, "#fa3730"],
      [0.52, "#ee232b"],
      [1, "#cf141f"],
    ]);
    ctx.fill();

    // A thin inner light along the top edge, and a cool sheen at the bottom.
    ctx.save();
    roundPolygon(ctx, front, s * 0.16);
    ctx.clip();
    const sheen = ctx.createLinearGradient(ox, oy + dy, ox, oy + s + dy);
    sheen.addColorStop(0, "rgba(255,255,255,0.16)");
    sheen.addColorStop(0.28, "rgba(255,255,255,0.02)");
    sheen.addColorStop(0.82, "rgba(0,0,0,0)");
    sheen.addColorStop(1, "rgba(60,0,0,0.3)");
    ctx.fillStyle = sheen;
    ctx.fillRect(ox, oy, s, s + dy);
    ctx.restore();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
    ctx.lineWidth = Math.max(0.6, s * 0.008);
    roundPolygon(ctx, front, s * 0.16);
    ctx.stroke();

    // Rim light down the right edge.
    ctx.beginPath();
    ctx.moveTo(ox + s - s * 0.02, oy + dy + s * 0.14);
    ctx.lineTo(ox + s - s * 0.02, oy + s + dy - s * 0.16);
    ctx.strokeStyle = "rgba(255, 176, 166, 0.3)";
    ctx.lineWidth = Math.max(0.7, s * 0.014);
    ctx.stroke();

    this.drawEyes(ox, oy, s, dy, now, moodAge);
    ctx.restore();

    // Sparkles: poke, and the tail of a happy mood.
    if (this.mood === "happy") {
      const burst = pokeT < 1.2 ? 1 : Math.max(0, 1 - moodAge / 2.2);
      if (burst > 0) this.drawSparkles(ox, oy, s, dx, dy, burst);
    }
  }

  private drawSparkles(ox: number, oy: number, s: number, dx: number, dy: number, fade: number): void {
    const ctx = this.ctx;
    const t = this.time;
    ctx.save();
    ctx.globalAlpha = fade;
    for (let i = 0; i < 3; i += 1) {
      const phase = t * 1.6 + i * 2.1;
      const r = s * (0.035 + 0.012 * Math.sin(phase * 2));
      const sx = ox + s * (0.9 + 0.05 * Math.cos(phase)) + (i === 1 ? s * 0.12 : 0) - (i === 2 ? s * 0.15 : 0);
      const sy = oy + dy + s * (0.08 + 0.3 * i * 0.5) + Math.sin(phase) * s * 0.03;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.beginPath();
      for (let k = 0; k < 4; k += 1) {
        const a = (Math.PI / 2) * k;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = Math.max(0.8, s * 0.014);
      ctx.lineCap = "round";
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  private drawEyes(ox: number, oy: number, s: number, dy: number, now: number, moodAge: number): void {
    const ctx = this.ctx;
    const faceY = oy + dy + s * 0.47;
    const spread = s * (this.mood === "listening" ? 0.215 : 0.2);
    const open = this.openAmount(now);
    const t = this.time;

    const watching = this.mood === "idle";
    const driftX = watching ? this.drift.x * s * 0.035 : 0;
    const driftY = watching ? this.drift.y * s * 0.028 : 0;
    const pointerX = this.look.x * s * 0.03;
    const pointerY = this.look.y * s * 0.024;
    const faceX = ox + s / 2 + driftX + pointerX;
    const faceYAll = faceY + driftY + pointerY;

    const angleBase = 0.3; // radians — parallel ticks, like a quotation mark
    const baseLen = s * 0.16;
    const baseThick = s * 0.088;

    const happy = this.mood === "happy";
    const sleeping = this.mood === "sleeping";
    const listening = this.mood === "listening";
    const thinking = this.mood === "thinking";
    const speaking = this.mood === "speaking";

    for (let i = 0; i < 2; i += 1) {
      const side = i === 0 ? -1 : 1;
      const x = faceX + side * spread;
      let y = faceYAll;
      let len = baseLen;
      let thick = baseThick;
      let angle = angleBase;
      let alpha = 1;

      if (happy) {
        // Smiling eyes: two upward arcs.
        const rx = s * 0.088;
        ctx.save();
        ctx.globalAlpha *= Math.min(1, 0.4 + moodAge * 3);
        ctx.beginPath();
        ctx.arc(x, y + s * 0.025, rx, Math.PI * 1.1, Math.PI * 1.9);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = Math.max(1.2, s * 0.058);
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();
        continue;
      }

      if (sleeping) {
        len = s * 0.15;
        thick = Math.max(1, s * 0.05);
        angle = 0;
        alpha = 0.5;
      } else if (listening) {
        // Straight, tall, breathing with the room.
        angle = 0.02 + Math.sin(t * 2.1 + i * 0.35) * 0.03;
        len = baseLen * (1.1 + Math.sin(t * 2.4 + i * 0.8) * 0.08);
        y += Math.sin(t * 2.4 + i * 0.8) * s * 0.008;
      } else if (speaking) {
        // Talking: each tick pulses out of phase, like a tiny meter.
        const pulse = 0.82 + Math.abs(Math.sin(t * 7.5 + i * 1.9)) * 0.4;
        len = baseLen * pulse;
        thick = baseThick * (0.92 + Math.abs(Math.sin(t * 7.5 + i * 1.9)) * 0.18);
        angle = angleBase * 0.8;
      } else if (thinking) {
        // Processing: the ticks lean in and out while a satellite orbits each.
        angle = angleBase + Math.sin(t * 1.7 + i * 1.4) * 0.22;
        len = baseLen * 0.92;
      }

      len *= Math.max(0.22, open);
      thick *= open < 0.4 ? 0.7 : 1;
      tick(ctx, x, y, len, thick, angle, alpha);

      if (thinking) {
        const orbit = t * 2.6 + i * Math.PI;
        const px = x + Math.cos(orbit) * s * 0.085;
        const py = y + Math.sin(orbit) * s * 0.055;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.9, s * 0.017), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.fill();
      }
    }
  }
}
