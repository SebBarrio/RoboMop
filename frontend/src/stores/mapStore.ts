import { create } from 'zustand';

export type MapState = {
  mapId: string | null;
  width: number;
  height: number;
  resolution: number; // meters per cell
};

type MapStore = MapState & {
  setMapMeta: (meta: Partial<MapState>) => void;
};

export const useMapStore = create<MapStore>((set) => ({
  mapId: null,
  width: 0,
  height: 0,
  resolution: 0.05,
  setMapMeta: (meta) => set((s) => ({ ...s, ...meta })),
}));


