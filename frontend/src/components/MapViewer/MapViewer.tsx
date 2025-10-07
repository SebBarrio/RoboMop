import { useEffect, useRef, useState } from 'react';
import LayerManager from './LayerManager';
import RobotPositionOverlay from './RobotPositionOverlay';
import LidarScanOverlay from './LidarScanOverlay';
import RouteOverlay from './RouteOverlay';
import ZonePainter from './ZonePainter';
import { useMapUpdates } from '../../hooks/useMapUpdates';
import { mapService } from '../../services/mapService';

type MapViewerProps = {
  width?: number;
  height?: number;
};

export function MapViewer({ width = 800, height = 600 }: MapViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [, setVersion] = useState(0);
  const [zonePainterEnabled, setZonePainterEnabled] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const draw = () => {
      const snap = mapService.getSnapshot();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!snap.data) return;
      const { width, height, data } = snap;
      const img = ctx.createImageData(width, height);
      for (let i = 0; i < data.length; i++) {
        const v = data[i];
        const o = i * 4;
        // grayscale mapping
        img.data[o] = v;
        img.data[o + 1] = v;
        img.data[o + 2] = v;
        img.data[o + 3] = 255;
      }
      // Fit into canvas
      const scaleX = canvas.width / width;
      const scaleY = canvas.height / height;
      const scale = Math.min(scaleX, scaleY);
      const offX = (canvas.width - width * scale) / 2;
      const offY = (canvas.height - height * scale) / 2;

      const offCanvas = document.createElement('canvas');
      offCanvas.width = width;
      offCanvas.height = height;
      const offCtx = offCanvas.getContext('2d');
      offCtx?.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offCanvas, 0, 0, width, height, offX, offY, width * scale, height * scale);
    };

    draw();
    const unsub = mapService.subscribe(() => {
      setVersion((v) => v + 1);
      draw();
    });
    return unsub;
  }, []);

  useMapUpdates('demo', (data: any) => {
    if (data.updateType === 'full' && data.metadata?.width && data.metadata?.height && data.data) {
      mapService.initFull(data.metadata.width, data.metadata.height, data.data);
    } else if (data.updateType === 'delta' && Array.isArray(data.cells)) {
      mapService.applyDeltaCells(data.cells);
    }
  });

  const handleZoneComplete = (points: Array<{ x: number; y: number }>) => {
    // TODO: send zone to backend via websocketService.emit('ui:create-zone', ...)
    console.log('Zone completed:', points);
    setZonePainterEnabled(false);
  };

  return (
    <LayerManager>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ width: '100%', height: '100%', display: 'block' }}
        data-testid="map-canvas"
      />
      <RobotPositionOverlay />
      <LidarScanOverlay />
      <RouteOverlay />
      <ZonePainter enabled={zonePainterEnabled} onZoneComplete={handleZoneComplete} />
    </LayerManager>
  );
}

export default MapViewer;


