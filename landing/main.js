/* ==========================================================================
   RoboMop landing — interactions
   1. RoboMapSim: a live occupancy-grid SLAM simulation (lidar raycast + coverage)
   2. Scroll reveals, nav state, phone telemetry readout
   ========================================================================== */

const QA = new URLSearchParams(location.search).has("qa");
const prefersReduced =
  QA || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// Kill transitions instantly in QA/reduced so a one-shot render is fully settled.
if (prefersReduced) document.documentElement.classList.add("no-anim");
// QA focus: translate a section to the top so a from-top headless shot frames it.
if (QA) {
  const f = new URLSearchParams(location.search).get("f");
  if (f) {
    window.addEventListener("load", () => {
      const el = document.getElementById(f);
      if (el) {
        const y = el.getBoundingClientRect().top + window.scrollY - 16;
        document.body.style.transform = `translateY(${-y}px)`;
      }
    });
  }
}

/* ---------- Map colour ramp (DESIGN.md) ---------- */
const C = {
  // Unknown is a cool "fog" that the robot clears; the gap to free (white) is
  // what makes the mapped room read against the viewport.
  unknown: [210, 216, 226],
  free: [255, 255, 255],
  wall: [54, 63, 82],
  cleaned: [216, 241, 228],
  primary: "rgb(37, 99, 235)",
};

/* --------------------------------------------------------------------------
   World: a single open room bounded by outer walls. Generated once, shared by
   both sims.
   -------------------------------------------------------------------------- */
function buildWorld(cols, rows) {
  const truth = new Uint8Array(cols * rows); // 1 = wall
  const at = (x, y) => y * cols + x;
  const fill = (x0, y0, x1, y1) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++)
        if (x >= 0 && x < cols && y >= 0 && y < rows) truth[at(x, y)] = 1;
  };

  // Outer walls (single cell thick)
  fill(1, 1, cols - 2, 1);
  fill(1, rows - 2, cols - 2, rows - 2);
  fill(1, 1, 1, rows - 2);
  fill(cols - 2, 1, cols - 2, rows - 2);

  return { truth, cols, rows };
}

/* Serpentine coverage path across the full room, clear of every wall. */
function buildPath(world, laneGap) {
  const { cols, rows } = world;
  const pts = [];
  const xL = 3.5;
  const xR = cols - 3.5;
  const yTop = 4.5;
  const yBot = rows - 4.5;
  let dir = 1;
  for (let y = yTop; y <= yBot; y += laneGap) {
    if (dir > 0) {
      pts.push({ x: xL, y });
      pts.push({ x: xR, y });
    } else {
      pts.push({ x: xR, y });
      pts.push({ x: xL, y });
    }
    dir *= -1;
  }
  return pts;
}

class RoboMapSim {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.cols = opts.cols ?? 84;
    this.rows = opts.rows ?? 54;
    this.rayCount = opts.rayCount ?? 230;
    this.maxRange = opts.maxRange ?? 34;
    this.speed = opts.speed ?? 16; // cells / second
    this.cleanR = opts.cleanR ?? 1.7;
    this.showRays = opts.showRays ?? true;
    this.onTick = opts.onTick ?? null;
    // Pre-advance N steps on first start so the viewport opens already alive
    // (a partially mapped room) instead of a blank grid.
    this.warm = opts.warm ?? 0;
    // Crop this many cells from every edge when rendering, so the room's outer
    // walls fall outside the view and the map bleeds off-frame (no dark border).
    this.inset = opts.viewInset ?? 0;

    this.world = buildWorld(this.cols, this.rows);
    this.path = buildPath(this.world, opts.laneGap ?? 5);

    // Offscreen cell buffer
    this.buf = document.createElement("canvas");
    this.buf.width = this.cols;
    this.buf.height = this.rows;
    this.bctx = this.buf.getContext("2d");
    this.img = this.bctx.createImageData(this.cols, this.rows);

    this.cleanableTotal = this._countCleanable();
    this.reset();

    this.running = false;
    this.static = prefersReduced; // no loop; repaint current state on resize
    this.populated = false;
    this.last = 0;
    this._resize();
    this._loop = this._loop.bind(this);

    const ro = new ResizeObserver(() => this._resize());
    ro.observe(canvas);
  }

  _countCleanable() {
    const { truth, cols, rows } = this.world;
    let n = 0;
    for (let y = 2; y < rows - 2; y++)
      for (let x = 2; x < cols - 2; x++) if (!truth[y * cols + x]) n++;
    return n;
  }

  reset() {
    this.disc = new Uint8Array(this.cols * this.rows); // 0 unknown,1 free,2 wall
    this.clean = new Uint8Array(this.cols * this.rows);
    this.cleanedCount = 0;
    this.trail = [];
    this.seg = 0;
    const p0 = this.path[0];
    this.pos = { x: p0.x, y: p0.y };
    this.heading = 0;
    this.hits = [];
    this.fade = prefersReduced ? 1 : 0; // intro fade-in of the room
  }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || 600;
    const h = this.canvas.clientHeight || 400;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cssW = w;
    this.cssH = h;
    // Cell size is computed against the cropped view, so the inset region fills
    // the whole canvas.
    this.cw = w / (this.cols - 2 * this.inset);
    this.ch = h / (this.rows - 2 * this.inset);
    this.unit = Math.min(this.cw, this.ch);
    // Setting canvas.width above clears it; in static mode there is no loop to
    // repaint, so redraw the settled frame here.
    if (this.static && this.populated) this.render();
  }

  start() {
    if (this.running) return;
    if (this.warm && !this._warmed) {
      this._warmed = true;
      for (let i = 0; i < this.warm; i++) this.step(0.05);
      this.populated = true;
    }
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this._loop);
  }
  stop() {
    this.running = false;
  }

  /* Bresenham-ish ray march against the truth map. */
  _cast(angle) {
    const { truth, cols, rows } = this.world;
    const ox = this.pos.x;
    const oy = this.pos.y;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const step = 0.5;
    let dist = 0;
    let px = ox;
    let py = oy;
    while (dist < this.maxRange) {
      dist += step;
      px = ox + dx * dist;
      py = oy + dy * dist;
      const cx = px | 0;
      const cy = py | 0;
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) break;
      const i = cy * cols + cx;
      if (truth[i]) {
        if (this.disc[i] !== 2) this.disc[i] = 2;
        return { x: px, y: py, hit: true };
      }
      // free cell along the ray
      const di = cy * cols + cx;
      if (this.disc[di] === 0) this.disc[di] = 1;
    }
    return { x: px, y: py, hit: false };
  }

  _scan() {
    this.hits.length = 0;
    const n = this.rayCount;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + this.heading * 0.0;
      this.hits.push(this._cast(a));
    }
  }

  _markClean() {
    const r = this.cleanR;
    const cols = this.cols;
    const x0 = Math.max(0, Math.floor(this.pos.x - r));
    const x1 = Math.min(cols - 1, Math.ceil(this.pos.x + r));
    const y0 = Math.max(0, Math.floor(this.pos.y - r));
    const y1 = Math.min(this.rows - 1, Math.ceil(this.pos.y + r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - this.pos.x;
        const dy = y + 0.5 - this.pos.y;
        if (dx * dx + dy * dy > r * r) continue;
        const i = y * cols + x;
        if (!this.world.truth[i] && !this.clean[i]) {
          this.clean[i] = 1;
          this.cleanedCount++;
        }
      }
    }
  }

  _advance(dt) {
    let budget = this.speed * dt;
    while (budget > 0 && this.seg < this.path.length - 1) {
      const target = this.path[this.seg + 1];
      const dx = target.x - this.pos.x;
      const dy = target.y - this.pos.y;
      const d = Math.hypot(dx, dy);
      if (d <= budget) {
        this.pos.x = target.x;
        this.pos.y = target.y;
        budget -= d;
        this.seg++;
      } else {
        const ux = dx / d;
        const uy = dy / d;
        this.pos.x += ux * budget;
        this.pos.y += uy * budget;
        this.heading = Math.atan2(uy, ux);
        budget = 0;
      }
      if (d > 0.0001) this.heading = Math.atan2(dy, dx);
    }
    this.trail.push({ x: this.pos.x, y: this.pos.y });
    if (this.trail.length > 1400) this.trail.shift();

    if (this.seg >= this.path.length - 1) {
      // Completed a sweep: pause briefly, then re-survey for a clean loop.
      this._done = (this._done || 0) + dt;
      if (this._done > 1.4) {
        this._done = 0;
        this.reset();
      }
    }
  }

  step(dt) {
    if (this.fade < 1) this.fade = Math.min(1, this.fade + dt * 1.6);
    this._advance(dt);
    this._scan();
    this._markClean();
    if (this.onTick) this.onTick(this);
  }

  _paintGrid() {
    const { truth } = this.world;
    const data = this.img.data;
    const fade = this.fade;
    for (let i = 0; i < this.cols * this.rows; i++) {
      let c;
      if (this.disc[i] === 2 || (truth[i] && this.disc[i])) c = C.wall;
      else if (this.disc[i] === 1) c = this.clean[i] ? C.cleaned : C.free;
      else c = C.unknown;
      // blend from unknown using the intro fade
      const u = C.unknown;
      const j = i * 4;
      data[j] = u[0] + (c[0] - u[0]) * fade;
      data[j + 1] = u[1] + (c[1] - u[1]) * fade;
      data[j + 2] = u[2] + (c[2] - u[2]) * fade;
      data[j + 3] = 255;
    }
    this.bctx.putImageData(this.img, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    // Draw only the inset region of the buffer, scaled to fill the canvas, so
    // the outer wall ring is cropped away.
    const n = this.inset;
    this.ctx.drawImage(
      this.buf,
      n,
      n,
      this.cols - 2 * n,
      this.rows - 2 * n,
      0,
      0,
      this.cssW,
      this.cssH
    );
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    this._paintGrid();

    const cw = this.cw;
    const ch = this.ch;
    const n = this.inset;
    const px = (x) => (x - n) * cw;
    const py = (y) => (y - n) * ch;
    const rx = px(this.pos.x);
    const ry = py(this.pos.y);

    // Faint lidar rays — the live sweep
    if (this.showRays) {
      ctx.strokeStyle = "rgba(37,99,235,0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < this.hits.length; k += 2) {
        const h = this.hits[k];
        ctx.moveTo(rx, ry);
        ctx.lineTo(px(h.x), py(h.y));
      }
      ctx.stroke();
    }

    // Trajectory — the robot's cleaned path, the strongest "alive" signal
    if (this.trail.length > 1) {
      ctx.strokeStyle = "rgba(37,99,235,0.5)";
      ctx.lineWidth = Math.max(1.6, this.unit * 0.22);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(px(this.trail[0].x), py(this.trail[0].y));
      for (let k = 1; k < this.trail.length; k++)
        ctx.lineTo(px(this.trail[k].x), py(this.trail[k].y));
      ctx.stroke();
    }

    // Lidar endpoints
    const dot = Math.max(1.2, this.unit * 0.24);
    ctx.fillStyle = "rgba(37,99,235,0.8)";
    for (let k = 0; k < this.hits.length; k++) {
      const h = this.hits[k];
      if (!h.hit) continue;
      ctx.beginPath();
      ctx.arc(px(h.x), py(h.y), dot, 0, Math.PI * 2);
      ctx.fill();
    }

    // Robot pose (triangle)
    const s = Math.max(5, this.unit * 1.5);
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(this.heading);
    ctx.beginPath();
    ctx.moveTo(s, 0);
    ctx.lineTo(-s * 0.7, s * 0.66);
    ctx.lineTo(-s * 0.7, -s * 0.66);
    ctx.closePath();
    ctx.fillStyle = C.primary;
    ctx.fill();
    ctx.lineWidth = Math.max(1.2, s * 0.16);
    ctx.strokeStyle = "#fff";
    ctx.stroke();
    ctx.restore();

    // Pose glow ring
    ctx.beginPath();
    ctx.arc(rx, ry, s * 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(37,99,235,0.25)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }

  _loop(now) {
    if (!this.running) return;
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.06) dt = 0.06;
    this.step(dt);
    this.render();
    requestAnimationFrame(this._loop);
  }

  // For reduced motion / static capture: advance to a representative
  // well-mapped frame, then draw once.
  renderStatic() {
    // Scale the settle length to the grid so larger (full-bleed) maps fill in
    // proportionally instead of leaving most of the frame as fog.
    const steps = Math.round(this.cols * this.rows * 0.135);
    for (let i = 0; i < steps; i++) this.step(0.05);
    this.populated = true;
    this.render();
  }

  coverage() {
    return Math.min(100, Math.round((this.cleanedCount / this.cleanableTotal) * 100));
  }
  poseMeters() {
    return { x: this.pos.x * 0.05, y: this.pos.y * 0.05 };
  }
  headingDeg() {
    let d = (this.heading * 180) / Math.PI;
    d = (90 - d) % 360;
    if (d < 0) d += 360;
    return Math.round(d);
  }
}

/* --------------------------------------------------------------------------
   Mount sims, with visibility + tab-aware pausing.
   -------------------------------------------------------------------------- */
function mount(canvas, opts) {
  if (!canvas) return null;
  const sim = new RoboMapSim(canvas, opts);
  if (prefersReduced) {
    // Draw a single representative frame, no loop.
    if (QA) sim.renderStatic(); // synchronous so a headless screenshot is settled
    else requestAnimationFrame(() => sim.renderStatic());
    return sim;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !document.hidden) sim.start();
        else sim.stop();
      }
    },
    { threshold: 0.05 }
  );
  io.observe(canvas);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) sim.stop();
    else if (canvas.getBoundingClientRect().top < window.innerHeight) sim.start();
  });
  return sim;
}

/* ---------- Hero: the live operator viewport ---------- */
const heroRelay = document.getElementById("hero-relay");
const heroPose = document.getElementById("hero-pose");
const heroHead = document.getElementById("hero-head");
const heroCov = document.getElementById("hero-cov");
let heroReadout = 0;
const heroOnTick = (s) => {
  const now = performance.now();
  if (now - heroReadout < 240) return;
  heroReadout = now;
  if (heroPose) {
    const p = s.poseMeters();
    heroPose.textContent = `${p.x.toFixed(1)}, ${p.y.toFixed(1)} m`;
  }
  if (heroHead) heroHead.textContent = `${String(s.headingDeg()).padStart(3, "0")}°`;
  if (heroCov) heroCov.textContent = `${s.coverage()}%`;
  // Plausible relay latency: a slow wander, clearly part of the live demo.
  if (heroRelay)
    heroRelay.textContent = 19 + Math.round(7 * (0.5 + 0.5 * Math.sin(now / 850)));
};
// The hero map is full-bleed: pick a world that matches the fold's orientation
// so cells stay roughly square instead of stretching.
const heroPortrait = window.matchMedia("(max-width: 880px)").matches;
const heroSim = mount(
  document.getElementById("hero-map"),
  heroPortrait
    ? { cols: 58, rows: 104, rayCount: 220, speed: 17, laneGap: 4, cleanR: 2.7, maxRange: 66, warm: 180, viewInset: 2, onTick: heroOnTick }
    : { cols: 108, rows: 60, rayCount: 264, speed: 18, laneGap: 4, cleanR: 2.6, maxRange: 52, warm: 180, viewInset: 2, onTick: heroOnTick }
);
// Settled readout when motion is reduced (mirrors the phone block below).
if (prefersReduced && heroSim) {
  requestAnimationFrame(() => {
    if (heroPose) {
      const p = heroSim.poseMeters();
      heroPose.textContent = `${p.x.toFixed(1)}, ${p.y.toFixed(1)} m`;
    }
    if (heroHead)
      heroHead.textContent = `${String(heroSim.headingDeg()).padStart(3, "0")}°`;
    if (heroCov) heroCov.textContent = `${heroSim.coverage()}%`;
  });
}

const stPose = document.getElementById("st-pose");
const stHead = document.getElementById("st-head");
const stCov = document.getElementById("st-cov");
let lastReadout = 0;
const phoneSim = mount(document.getElementById("map-phone"), {
  cols: 64,
  rows: 96,
  rayCount: 160,
  speed: 15,
  laneGap: 5,
  maxRange: 44,
  cleanR: 2.9,
  onTick: (s) => {
    const now = performance.now();
    if (now - lastReadout < 280) return;
    lastReadout = now;
    if (stPose) {
      const p = s.poseMeters();
      stPose.textContent = `${p.x.toFixed(1)}, ${p.y.toFixed(1)}`;
    }
    if (stHead) stHead.textContent = `${String(s.headingDeg()).padStart(3, "0")}°`;
    if (stCov) stCov.textContent = `${s.coverage()}%`;
  },
});
// Static readout when motion is reduced
if (prefersReduced && phoneSim) {
  requestAnimationFrame(() => {
    if (stPose) {
      const p = phoneSim.poseMeters();
      stPose.textContent = `${p.x.toFixed(1)}, ${p.y.toFixed(1)}`;
    }
    if (stHead) stHead.textContent = `${String(phoneSim.headingDeg()).padStart(3, "0")}°`;
    if (stCov) stCov.textContent = `${phoneSim.coverage()}%`;
  });
}

/* ---------- Scroll reveals ---------- */
const reveals = document.querySelectorAll(".reveal");
if (prefersReduced || !("IntersectionObserver" in window)) {
  reveals.forEach((el) => el.setAttribute("data-shown", "true"));
} else {
  const revIO = new IntersectionObserver(
    (entries, obs) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.setAttribute("data-shown", "true");
          obs.unobserve(e.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
  );
  reveals.forEach((el) => revIO.observe(el));
}

/* ---------- Nav scrolled state ---------- */
const nav = document.getElementById("nav");
const onScroll = () => {
  if (nav) nav.setAttribute("data-scrolled", window.scrollY > 12 ? "true" : "false");
};
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });
