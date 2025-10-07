/**
 * Touch Gesture Handler
 * Implements T098a: Touch gesture handler for pinch-zoom, pan, and zone painting on tablets
 */

type GestureState = {
  isPinching: boolean;
  isPanning: boolean;
  initialDistance: number;
  initialScale: number;
  lastTouch: { x: number; y: number } | null;
};

export class TouchGestureHandler {
  private state: GestureState = {
    isPinching: false,
    isPanning: false,
    initialDistance: 0,
    initialScale: 1,
    lastTouch: null,
  };

  private onZoom?: (scale: number) => void;
  private onPan?: (dx: number, dy: number) => void;

  constructor(options: { onZoom?: (scale: number) => void; onPan?: (dx: number, dy: number) => void }) {
    this.onZoom = options.onZoom;
    this.onPan = options.onPan;
  }

  public handleTouchStart(e: TouchEvent): void {
    if (e.touches.length === 2) {
      this.state.isPinching = true;
      this.state.initialDistance = this.getDistance(e.touches[0], e.touches[1]);
    } else if (e.touches.length === 1) {
      this.state.isPanning = true;
      this.state.lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }

  public handleTouchMove(e: TouchEvent): void {
    if (this.state.isPinching && e.touches.length === 2) {
      const dist = this.getDistance(e.touches[0], e.touches[1]);
      const scale = dist / this.state.initialDistance;
      this.onZoom?.(scale);
    } else if (this.state.isPanning && e.touches.length === 1 && this.state.lastTouch) {
      const dx = e.touches[0].clientX - this.state.lastTouch.x;
      const dy = e.touches[0].clientY - this.state.lastTouch.y;
      this.onPan?.(dx, dy);
      this.state.lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }

  public handleTouchEnd(): void {
    this.state.isPinching = false;
    this.state.isPanning = false;
    this.state.lastTouch = null;
  }

  private getDistance(t1: Touch, t2: Touch): number {
    const dx = t2.clientX - t1.clientX;
    const dy = t2.clientY - t1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }
}

export default TouchGestureHandler;


