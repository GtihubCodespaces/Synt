/**
 * Synt himself: a red cube with two white eyes, drawn in Canvas 2D.
 *
 * No sprite sheets, no WebGL: three rounded faces in a cabinet projection, a
 * warm rim, a soft contact shadow, and eyes that blink, track the pointer and
 * change shape with his mood. It stays crisp from 28 px (the collapsed
 * island) to 160 px (settings).
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

export class SyntCube {
  private readonly ctx: CanvasRenderingContext2D;
  private mood: Mood = "idle";
  private linked: SyntCube[] = [];
  private moodAt = 0;
  private look = { x: 0, y: 0 };
  private target = { x: 0, y: 0 };
  private nextBlink = 0;
  private blinkStart = -1;
  private raf = 0;
  private last = 0;
  private time = 0;
  private width = 32;
  private height = 32;
  private dpr = 1;
  private shadowGradient: CanvasGradient | null = null;
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
    this.shadowGradient = null;
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
      this.nextBlink = now + 2600 + Math.random() * 3800;
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

    const w = this.width;
    const h = this.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const s = Math.min(w, h) * 0.6;
    const dx = s * 0.3;
    const dy = s * 0.27;
    const t = this.time;
    const moodAge = (now - this.moodAt) / 1000;

    const bob = Math.sin(t * 1.45) * s * 0.016 + (this.mood === "speaking" ? Math.sin(t * 9) * s * 0.012 : 0);
    const breathe = 1 + Math.sin(t * 1.45) * 0.008 + (this.mood === "listening" ? 0.02 : 0);
    const tilt = this.look.x * 0.05;

    // Cabinet projection: the depth vector goes up-and-right, so the visible
    // faces are front, top and right — the classic cube silhouette.
    const originX = w / 2 - (s + dx) / 2;
    const originY = h / 2 - (s + dy) / 2 + bob - (this.mood === "thinking" ? Math.sin(t * 2.4) * s * 0.02 : 0);

    ctx.save();
    // Warm aura, brighter while Synt is doing something.
    const cx = originX + (s + dx) / 2;
    const cy = originY + (s + dy) / 2;
    const auraAlpha = this.mood === "idle" ? 0.2 : this.mood === "sleeping" ? 0.08 : 0.32;
    const aura = ctx.createRadialGradient(cx, cy, s * 0.1, cx, cy, s * 0.98);
    aura.addColorStop(0, `rgba(255, 66, 56, ${auraAlpha})`);
    aura.addColorStop(0.55, `rgba(255, 40, 40, ${auraAlpha * 0.4})`);
    aura.addColorStop(1, "rgba(255, 40, 40, 0)");
    ctx.fillStyle = aura;
    ctx.fillRect(0, 0, w, h);

    // Contact shadow.
    ctx.save();
    ctx.translate(cx, originY + s + dy + s * 0.085);
    ctx.scale(1, 0.22);
    const shadow = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.52);
    shadow.addColorStop(0, "rgba(0,0,0,0.55)");
    shadow.addColorStop(0.7, "rgba(0,0,0,0.22)");
    shadow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = shadow;
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.52, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Listening rings.
    if (this.mood === "listening") {
      for (let i = 0; i < 2; i += 1) {
        const k = ((t * 0.85 + i * 0.5) % 1 + 1) % 1;
        ctx.beginPath();
        ctx.arc(cx, cy, s * (0.52 + k * 0.55), 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 80, 70, ${0.28 * (1 - k)})`;
        ctx.lineWidth = Math.max(1, s * 0.018);
        ctx.stroke();
      }
    }

    ctx.translate(cx, cy + bob * 0.4);
    ctx.scale(breathe, breathe);
    ctx.rotate(tilt);
    ctx.translate(-cx, -(cy + bob * 0.4));

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

    // Top face.
    roundPolygon(ctx, top, s * 0.085);
    ctx.fillStyle = gradient(ctx, ox, oy + dy, ox + s + dx, oy, [
      [0, "#ff8a7b"],
      [0.5, "#ff5b4b"],
      [1, "#ff3a2f"],
    ]);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.34)";
    ctx.lineWidth = Math.max(0.6, s * 0.012);
    ctx.stroke();

    // Right face.
    roundPolygon(ctx, right, s * 0.085);
    ctx.fillStyle = gradient(ctx, ox + s, oy + dy, ox + s + dx, oy + s, [
      [0, "#b31216"],
      [0.6, "#8f0b10"],
      [1, "#640407"],
    ]);
    ctx.fill();

    // Front face.
    roundPolygon(ctx, front, s * 0.13);
    const body = gradient(ctx, ox, oy + dy, ox + s * 0.55, oy + s + dy, [
      [0, "#fb3a31"],
      [0.5, "#ea2129"],
      [1, "#b8101a"],
    ]);
    ctx.fillStyle = body;
    ctx.fill();

    // Glossy top of the front face + shaded bottom.
    ctx.save();
    roundPolygon(ctx, front, s * 0.13);
    ctx.clip();
    const gloss = ctx.createLinearGradient(ox, oy + dy, ox, oy + s * 0.55 + dy);
    gloss.addColorStop(0, "rgba(255,255,255,0.20)");
    gloss.addColorStop(0.5, "rgba(255,255,255,0.04)");
    gloss.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gloss;
    ctx.fillRect(ox, oy, s, s + dy);
    const shade = ctx.createLinearGradient(ox, oy + s * 0.55 + dy, ox, oy + s + dy);
    shade.addColorStop(0, "rgba(0,0,0,0)");
    shade.addColorStop(1, "rgba(60,0,0,0.35)");
    ctx.fillStyle = shade;
    ctx.fillRect(ox, oy, s, s + dy);
    ctx.restore();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
    ctx.lineWidth = Math.max(0.6, s * 0.01);
    roundPolygon(ctx, front, s * 0.13);
    ctx.stroke();

    // Rim light down the right edge.
    ctx.beginPath();
    ctx.moveTo(ox + s - s * 0.02, oy + dy + s * 0.12);
    ctx.lineTo(ox + s - s * 0.02, oy + s + dy - s * 0.14);
    ctx.strokeStyle = "rgba(255, 170, 160, 0.35)";
    ctx.lineWidth = Math.max(0.7, s * 0.016);
    ctx.stroke();

    this.drawFace(ox, oy, s, dy, now, moodAge);

    ctx.restore();
  }

  private drawFace(ox: number, oy: number, s: number, dy: number, now: number, moodAge: number): void {
    const ctx = this.ctx;
    const eyeY = oy + dy + s * 0.45;
    const eyeX = [ox + s * 0.31, ox + s * 0.69];
    const baseRX = s * 0.15;
    const baseRY = s * 0.175;
    const open = this.openAmount(now);

    const listening = this.mood === "listening";
    const happy = this.mood === "happy";
    const thinking = this.mood === "thinking";
    const speaking = this.mood === "speaking";

    const rx = baseRX * (listening ? 1.08 : 1) * (happy ? 1.05 : 1);
    const ryBase = baseRY * (listening ? 1.06 : 1) * (speaking ? 0.94 : 1);
    const ry = ryBase * open;

    // Pupil offset: the pointer, plus a small idle drift.
    const driftX = Math.sin(this.time * 0.7) * s * 0.012;
    const driftY = Math.cos(this.time * 0.55) * s * 0.01;
    const orbitX = thinking ? Math.sin(this.time * 3.1) * s * 0.03 : 0;
    const orbitY = thinking ? Math.cos(this.time * 2.4) * s * 0.022 - s * 0.02 : 0;
    const lookX = this.look.x * s * 0.045 + driftX + orbitX;
    const lookY = this.look.y * s * 0.038 + driftY + orbitY;

    const glintR = s * 0.017;
    const pupilR = s * (listening ? 0.058 : 0.05);

    for (let i = 0; i < 2; i += 1) {
      const x = eyeX[i];

      if (happy) {
        // Closed, smiling eyes.
        ctx.beginPath();
        ctx.arc(x, eyeY + s * 0.02, rx * 0.92, Math.PI * 1.12, Math.PI * 1.88);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = s * 0.05;
        ctx.lineCap = "round";
        ctx.shadowColor = "rgba(255,255,255,0.75)";
        ctx.shadowBlur = s * 0.12;
        ctx.stroke();
        ctx.shadowBlur = 0;
        continue;
      }

      ctx.save();
      ctx.shadowColor = "rgba(255, 245, 240, 0.6)";
      ctx.shadowBlur = s * 0.1;

      if (ry < s * 0.028) {
        // Blink: a soft lash line instead of a flattened ellipse.
        ctx.beginPath();
        ctx.moveTo(x - rx * 0.92, eyeY);
        ctx.quadraticCurveTo(x, eyeY + s * 0.028, x + rx * 0.92, eyeY);
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = s * 0.042;
        ctx.lineCap = "round";
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.ellipse(x, eyeY, rx, Math.max(ry, s * 0.02), 0, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
      }
      ctx.restore();

      if (ry >= s * 0.06) {
        ctx.beginPath();
        ctx.ellipse(x + lookX, eyeY + lookY, pupilR, pupilR * 1.08, 0, 0, Math.PI * 2);
        ctx.fillStyle = "#2a0508";
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x + lookX - pupilR * 0.42, eyeY + lookY - pupilR * 0.5, glintR, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fill();
      }
    }

    // A tiny sparkle when he is pleased to see you.
    if (happy && moodAge > 0.1) {
      const fade = Math.max(0, 1 - moodAge / 2.4);
      if (fade > 0) {
        const sx = ox + s * 0.92;
        const sy = oy + dy * 0.5;
        const r = s * 0.06 * (0.6 + 0.4 * Math.sin(this.time * 6));
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(sx, sy);
        ctx.beginPath();
        for (let k = 0; k < 4; k += 1) {
          const a = (Math.PI / 2) * k;
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = Math.max(0.8, s * 0.018);
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.restore();
      }
    }
  }
}
