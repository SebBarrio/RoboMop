import { useState, useRef, useEffect } from 'react';

type Point = { x: number; y: number };

type ZonePainterProps = {
  enabled: boolean;
  onZoneComplete: (points: Point[]) => void;
};

export function ZonePainter({ enabled, onZoneComplete }: ZonePainterProps) {
  const [points, setPoints] = useState<Point[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!enabled) setPoints([]);
  }, [enabled]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!enabled) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setPoints((prev) => [...prev, { x, y }]);
  };

  const handleComplete = () => {
    if (points.length >= 3) {
      onZoneComplete([...points, points[0]]); // close polygon
      setPoints([]);
    }
  };

  const pathData = points.length > 0
    ? `M ${points.map((p) => `${p.x},${p.y}`).join(' L ')}`
    : '';

  return (
    <svg
      ref={svgRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: enabled ? 'auto' : 'none',
        cursor: enabled ? 'crosshair' : 'default',
      }}
      onPointerDown={handlePointerDown}
      data-testid="zone-painter"
    >
      {points.length > 0 && (
        <>
          <path d={pathData} stroke="rgba(239,68,68,0.8)" strokeWidth={2} fill="none" />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={4} fill="rgba(239,68,68,0.9)" />
          ))}
        </>
      )}
      {enabled && points.length >= 3 && (
        <text
          x="50%"
          y="20"
          textAnchor="middle"
          fill="var(--text)"
          style={{ fontSize: 14, cursor: 'pointer' }}
          onClick={handleComplete}
        >
          Click to complete zone
        </text>
      )}
    </svg>
  );
}

export default ZonePainter;


