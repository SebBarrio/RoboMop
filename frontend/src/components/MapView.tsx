import { useEffect, useRef, useState } from "react";
import { Crosshair, Maximize, Minus, Plus, Radar } from "lucide-react";
import { getState, subscribe, useAppStore } from "../lib/store";
import type { DecodedMap } from "../lib/decodeMap";

// Canvas palette (kept in sync with DESIGN.md's map ramp)
const COLOR_FREE: [number, number, number, number] = [255, 255, 255, 255];
const COLOR_OCCUPIED: [number, number, number, number] = [54, 64, 82, 255];
const COLOR_UNKNOWN: [number, number, number, number] = [0, 0, 0, 0];
const PRIMARY = "#2563eb";
const SUCCESS = "#16a34a";
const WARNING = "#d97706";
const DANGER = "#dc2626";

interface ViewState {
  scale: number; // px per meter (CSS px)
  cx: number; // world center x
  cy: number; // world center y
  follow: boolean;
}

const PING_MS = 800; // first-pose sonar ping duration

const reducedMotion = () =>
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Build an offscreen bitmap of the occupancy grid (row 0 = world y-min → drawn flipped). */
function buildMapBitmap(map: DecodedMap): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = map.width;
  canvas.height = map.height;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(map.width, map.height);
  const buf = img.data;
  for (let gy = 0; gy < map.height; gy++) {
    // Flip vertically: image row 0 should be the highest world y.
    const srcRow = map.height - 1 - gy;
    for (let gx = 0; gx < map.width; gx++) {
      const v = map.cells[srcRow * map.width + gx];
      const c = v === 0 ? COLOR_UNKNOWN : v > 127 ? COLOR_OCCUPIED : COLOR_FREE;
      const i = (gy * map.width + gx) * 4;
      buf[i] = c[0];
      buf[i + 1] = c[1];
      buf[i + 2] = c[2];
      buf[i + 3] = c[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Bounding box of known cells, in world meters. Null if the map is all unknown. */
function knownBounds(map: DecodedMap): { x0: number; y0: number; x1: number; y1: number } | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let gy = 0; gy < map.height; gy++) {
    for (let gx = 0; gx < map.width; gx++) {
      if (map.cells[gy * map.width + gx] !== 0) {
        if (gx < minX) minX = gx;
        if (gx > maxX) maxX = gx;
        if (gy < minY) minY = gy;
        if (gy > maxY) maxY = gy;
      }
    }
  }
  if (minX === Infinity) return null;
  return {
    x0: map.origin.x + minX * map.resolution,
    y0: map.origin.y + minY * map.resolution,
    x1: map.origin.x + (maxX + 1) * map.resolution,
    y1: map.origin.y + (maxY + 1) * map.resolution,
  };
}

export function MapView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const view = useRef<ViewState>({ scale: 70, cx: 0, cy: 0, follow: true });
  const bitmap = useRef<{ canvas: HTMLCanvasElement; version: number } | null>(null);
  const dirty = useRef(true);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchDist = useRef(0);
  const pingStart = useRef<number | null>(null);
  const hadPose = useRef(getState().pose !== null);
  const [followUi, setFollowUi] = useState(true);
  const [showLidar, setShowLidar] = useState(true);
  const showLidarRef = useRef(true);
  showLidarRef.current = showLidar;

  const hasMap = useAppStore((s) => s.map) !== null;
  const hasPose = useAppStore((s) => s.pose) !== null;
  const connection = useAppStore((s) => s.connection);
  const connectionHint = useAppStore((s) => s.connectionHint);
  const robotOnline = useAppStore((s) => s.robotOnline);

  // Imperative draw loop: store changes mark dirty; rAF repaints at most once a frame.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    let running = true;

    const unsubscribe = subscribe(() => {
      dirty.current = true;
      // One sonar ping when the robot's pose first arrives: the map is alive.
      const pose = getState().pose !== null;
      if (pose && !hadPose.current && !reducedMotion()) {
        pingStart.current = performance.now();
      }
      hadPose.current = pose;
    });

    const resize = new ResizeObserver(() => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      dirty.current = true;
    });
    resize.observe(canvas);

    const frame = () => {
      if (!running) return;
      // Keep repainting while the ping plays.
      if (pingStart.current !== null) {
        if (performance.now() - pingStart.current > PING_MS) pingStart.current = null;
        dirty.current = true;
      }
      if (dirty.current) {
        dirty.current = false;
        draw(ctx, canvas, view.current, bitmap, showLidarRef.current, pingStart.current);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      unsubscribe();
      resize.disconnect();
    };
  }, []);

  function markDirty() {
    dirty.current = true;
  }

  function stopFollowing() {
    if (view.current.follow) {
      view.current.follow = false;
      setFollowUi(false);
    }
  }

  function zoomAt(factor: number, px?: number, py?: number) {
    const canvas = canvasRef.current!;
    const v = view.current;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const x = px ?? cw / 2;
    const y = py ?? ch / 2;
    // Keep the world point under the cursor fixed while zooming.
    const wx = v.cx + (x - cw / 2) / v.scale;
    const wy = v.cy - (y - ch / 2) / v.scale;
    v.scale = Math.min(400, Math.max(8, v.scale * factor));
    v.cx = wx - (x - cw / 2) / v.scale;
    v.cy = wy + (y - ch / 2) / v.scale;
    markDirty();
  }

  function fitMap() {
    const map = getState().map;
    const canvas = canvasRef.current!;
    if (!map) return;
    const bounds = knownBounds(map);
    if (!bounds) return;
    const v = view.current;
    const pad = 0.5; // meters
    const w = bounds.x1 - bounds.x0 + pad * 2;
    const h = bounds.y1 - bounds.y0 + pad * 2;
    v.scale = Math.min(400, Math.max(8, Math.min(canvas.clientWidth / w, canvas.clientHeight / h)));
    v.cx = (bounds.x0 + bounds.x1) / 2;
    v.cy = (bounds.y0 + bounds.y1) / 2;
    stopFollowing();
    markDirty();
  }

  function centerRobot() {
    const pose = getState().pose;
    if (pose) {
      view.current.cx = pose.x;
      view.current.cy = pose.y;
    }
    view.current.follow = true;
    setFollowUi(true);
    markDirty();
  }

  function onPointerDown(e: React.PointerEvent) {
    canvasRef.current!.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchDist.current = Math.hypot(a.x - b.x, a.y - b.y);
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);

    if (pointers.current.size === 1) {
      const v = view.current;
      v.cx -= (cur.x - prev.x) / v.scale;
      v.cy += (cur.y - prev.y) / v.scale;
      if (Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y) > 1) stopFollowing();
      markDirty();
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchDist.current > 0) {
        const rect = canvasRef.current!.getBoundingClientRect();
        zoomAt(dist / pinchDist.current, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
        stopFollowing();
      }
      pinchDist.current = dist;
    }
  }

  function onPointerEnd(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    pinchDist.current = 0;
  }

  function onWheel(e: React.WheelEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - rect.left, e.clientY - rect.top);
  }

  // The overlay only covers the canvas when there is nothing real to show;
  // once map data exists, badges and alerts carry connection state instead.
  let empty: { title: string; sub: string } | null = null;
  if (!hasMap && !hasPose) {
    if (connection === "idle") {
      empty = { title: "Not connected", sub: "Select a paired robot to load the live map." };
    } else if (connection === "connecting" || connection === "reconnecting") {
      empty = connectionHint
        ? { title: "Can't connect to the relay", sub: "Check the connection status in Settings." }
        : { title: "Connecting to the relay…", sub: "The live map loads once the link is up." };
    } else if (!robotOnline) {
      empty = { title: "Robot is offline", sub: "The map resumes as soon as the robot reconnects to the relay." };
    } else {
      empty = { title: "Waiting for telemetry", sub: "The map appears as soon as the robot starts streaming." };
    }
  }

  return (
    <div className="map-card">
      <canvas
        ref={canvasRef}
        className="map-canvas"
        role="img"
        aria-label="Live robot map: occupancy grid, lidar scan, trajectory and robot position"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onWheel={onWheel}
      />
      <div className="map-toolbar" role="toolbar" aria-label="Map controls">
        <button onClick={() => zoomAt(1.25)} aria-label="Zoom in">
          <Plus size={18} aria-hidden />
        </button>
        <button onClick={() => zoomAt(1 / 1.25)} aria-label="Zoom out">
          <Minus size={18} aria-hidden />
        </button>
        <button onClick={fitMap} aria-label="Fit map to view" disabled={!hasMap}>
          <Maximize size={18} aria-hidden />
        </button>
        <button
          onClick={centerRobot}
          aria-label="Follow robot"
          aria-pressed={followUi}
          disabled={!hasPose}
        >
          <Crosshair size={18} aria-hidden />
        </button>
        <button
          onClick={() => {
            setShowLidar((s) => !s);
            markDirty();
          }}
          aria-label="Toggle lidar overlay"
          aria-pressed={showLidar}
        >
          <Radar size={18} aria-hidden />
        </button>
      </div>
      <div className="map-legend" aria-hidden>
        <span>
          <i style={{ background: PRIMARY }} /> Robot
        </span>
        <span>
          <i style={{ background: "#364052" }} /> Wall
        </span>
        <span>
          <i style={{ background: PRIMARY, opacity: 0.4 }} /> Path
        </span>
        <span>
          <i style={{ background: WARNING }} /> Frontier
        </span>
      </div>
      {empty && (
        <div className="map-empty" role="status" key={empty.title}>
          <strong>{empty.title}</strong>
          <span>{empty.sub}</span>
        </div>
      )}
    </div>
  );
}

function draw(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  v: ViewState,
  bitmapRef: React.MutableRefObject<{ canvas: HTMLCanvasElement; version: number } | null>,
  showLidar: boolean,
  pingStart: number | null,
) {
  const s = getState();
  const dpr = window.devicePixelRatio || 1;
  const cw = canvas.width / dpr;
  const ch = canvas.height / dpr;

  if (v.follow && s.pose) {
    v.cx = s.pose.x;
    v.cy = s.pose.y;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#eef1f5";
  ctx.fillRect(0, 0, cw, ch);

  const toX = (wx: number) => (wx - v.cx) * v.scale + cw / 2;
  const toY = (wy: number) => ch / 2 - (wy - v.cy) * v.scale;

  // Occupancy grid
  if (s.map) {
    if (!bitmapRef.current || bitmapRef.current.version !== s.map.version) {
      bitmapRef.current = { canvas: buildMapBitmap(s.map), version: s.map.version };
    }
    const m = s.map;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      bitmapRef.current.canvas,
      toX(m.origin.x),
      toY(m.origin.y + m.height * m.resolution),
      m.width * m.resolution * v.scale,
      m.height * m.resolution * v.scale,
    );
  }

  // Trajectory
  if (s.trajectory.length > 1) {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(37, 99, 235, 0.35)";
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    s.trajectory.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(toX(x), toY(y)) : ctx.lineTo(toX(x), toY(y))));
    ctx.stroke();
  }

  // Planned cleaning path
  if (s.plannedVertices.length > 1) {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(37, 99, 235, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    s.plannedVertices.forEach(([x, y], i) =>
      i === 0 ? ctx.moveTo(toX(x), toY(y)) : ctx.lineTo(toX(x), toY(y)),
    );
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Exploration path
  if (s.explorePath.length > 1) {
    ctx.beginPath();
    ctx.strokeStyle = SUCCESS;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    s.explorePath.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(toX(x), toY(y)) : ctx.lineTo(toX(x), toY(y))));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Frontiers
  if (s.frontiers.length > 0) {
    ctx.fillStyle = WARNING;
    for (const [x, y] of s.frontiers) {
      ctx.beginPath();
      ctx.arc(toX(x), toY(y), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (s.pose) {
    const { x, y, theta } = s.pose;

    // Lidar scan (robot frame → world)
    if (showLidar && s.lidarScan.length > 0) {
      ctx.fillStyle = "rgba(37, 99, 235, 0.55)";
      for (const [angle, dist] of s.lidarScan) {
        if (dist <= 0.01) continue;
        const wx = x + dist * Math.cos(theta + angle);
        const wy = y + dist * Math.sin(theta + angle);
        ctx.fillRect(toX(wx) - 1.25, toY(wy) - 1.25, 2.5, 2.5);
      }
    }

    // EKF uncertainty (2σ ellipse)
    if (s.ekfPose) {
      const rx = Math.sqrt(Math.max(s.ekfPose.varX, 1e-6)) * 2 * v.scale;
      const ry = Math.sqrt(Math.max(s.ekfPose.varY, 1e-6)) * 2 * v.scale;
      ctx.beginPath();
      ctx.strokeStyle = "rgba(37, 99, 235, 0.3)";
      ctx.lineWidth = 1;
      ctx.ellipse(toX(x), toY(y), rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Footprint
    if (s.robotFootprint) {
      ctx.beginPath();
      ctx.fillStyle = "rgba(37, 99, 235, 0.12)";
      ctx.arc(toX(x), toY(y), s.robotFootprint.circumscribedRadius * v.scale, 0, Math.PI * 2);
      ctx.fill();
    }

    // Collision threat wedge
    if (s.collisionThreat && s.collisionThreat.severity > 0.4) {
      const a = theta + s.collisionThreat.angle;
      ctx.beginPath();
      ctx.fillStyle =
        s.collisionThreat.severity > 0.8 ? "rgba(220, 38, 38, 0.3)" : "rgba(217, 119, 6, 0.25)";
      ctx.moveTo(toX(x), toY(y));
      ctx.arc(toX(x), toY(y), s.collisionThreat.distance * v.scale, -(a + 0.35), -(a - 0.35));
      ctx.closePath();
      ctx.fill();
    }

    // First-pose sonar ping: one expanding ring, then gone.
    if (pingStart !== null) {
      const t = Math.min(1, (performance.now() - pingStart) / PING_MS);
      const ease = 1 - Math.pow(1 - t, 4); // ease-out-quart
      ctx.beginPath();
      ctx.strokeStyle = `rgba(37, 99, 235, ${0.45 * (1 - ease)})`;
      ctx.lineWidth = 2;
      ctx.arc(toX(x), toY(y), 12 + ease * 48, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Robot marker
    const r = Math.max(7, Math.min(13, v.scale * 0.16));
    ctx.beginPath();
    ctx.fillStyle = PRIMARY;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.arc(toX(x), toY(y), r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Heading line
    ctx.beginPath();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.moveTo(toX(x), toY(y));
    ctx.lineTo(toX(x + (r / v.scale) * 0.9 * Math.cos(theta)), toY(y + (r / v.scale) * 0.9 * Math.sin(theta)));
    ctx.stroke();
  }

  // Collision-threat danger ring on severe threats (drawn last, on top)
  if (s.collisionThreat && s.collisionThreat.severity > 0.8 && s.pose) {
    ctx.beginPath();
    ctx.strokeStyle = DANGER;
    ctx.lineWidth = 2;
    ctx.arc(toX(s.pose.x), toY(s.pose.y), 18, 0, Math.PI * 2);
    ctx.stroke();
  }
}
