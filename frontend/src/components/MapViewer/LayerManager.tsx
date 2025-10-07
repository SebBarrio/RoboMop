import { useEffect, useRef, type ReactNode } from 'react';

export type LayerManagerProps = {
  width?: number;
  height?: number;
  children?: ReactNode;
};

export function LayerManager({ children }: LayerManagerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Placeholder: could manage canvas layers here
    return () => {
      // Cleanup if needed
    };
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      {children}
    </div>
  );
}

export default LayerManager;


