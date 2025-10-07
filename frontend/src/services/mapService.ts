export type MapDelta = {
  mapId: string;
  updatedAt: string;
  changes: Array<{ x: number; y: number; value: number }>;
};

export class MapService {
  private grid: Uint8Array | null = null;
  private width = 0;
  private height = 0;
  private subscribers: Set<() => void> = new Set();

  public initFull(width: number, height: number, base64Data: string) {
    this.width = width;
    this.height = height;
    const buffer = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    this.grid = new Uint8Array(buffer);
    this.notify();
  }

  public applyDeltaCells(cells: Array<{ row: number; col: number; value: number }>) {
    if (!this.grid || !this.width) return;
    for (const { row, col, value } of cells) {
      const idx = row * this.width + col;
      if (idx >= 0 && idx < this.grid.length) {
        this.grid[idx] = value;
      }
    }
    this.notify();
  }

  public getSnapshot(): { width: number; height: number; data: Uint8Array | null } {
    return { width: this.width, height: this.height, data: this.grid };
  }

  public subscribe(handler: () => void): () => void {
    this.subscribers.add(handler);
    return () => this.subscribers.delete(handler);
  }

  private notify() {
    for (const s of this.subscribers) s();
  }
}

export const mapService = new MapService();


