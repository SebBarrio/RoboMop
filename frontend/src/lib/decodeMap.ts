import type { MapMessage } from "./protocol";

export interface DecodedMap {
  width: number;
  height: number;
  resolution: number;
  origin: { x: number; y: number; theta: number };
  cells: Uint8Array; // row 0 = world y min; 0 unknown, >127 occupied, else free
  version: number;
}

let version = 0;

export async function decodeMap(msg: MapMessage): Promise<DecodedMap> {
  const bin = atob(msg.data);
  const compressed = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  let cells: Uint8Array;
  if (msg.encoding?.includes("gzip")) {
    const stream = new Blob([compressed.buffer as ArrayBuffer])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"));
    cells = new Uint8Array(await new Response(stream).arrayBuffer());
  } else {
    cells = compressed;
  }
  return {
    width: msg.width,
    height: msg.height,
    resolution: msg.resolution,
    origin: msg.origin,
    cells,
    version: ++version,
  };
}
