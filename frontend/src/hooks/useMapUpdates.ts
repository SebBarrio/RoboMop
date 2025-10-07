import { useEffect, useRef } from 'react';
import { websocketService } from '../services/websocketService';

export function useMapUpdates(robotId: string, onDelta: (delta: any) => void) {
  const handlerRef = useRef<(d: any) => void>();
  handlerRef.current = onDelta;

  useEffect(() => {
    const handler = (data: any) => handlerRef.current?.(data);
    websocketService.on('frontend:map-update', handler);
    return () => {
      // Socket.io off handled by service on disconnect or externally
    };
  }, [robotId]);
}


