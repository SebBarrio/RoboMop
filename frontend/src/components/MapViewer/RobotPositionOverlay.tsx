import { useMemo } from 'react';
import { useRobotStore } from '../../stores/robotStore';

export function RobotPositionOverlay() {
  const position = useRobotStore((s) => s.position);

  const style = useMemo(() => ({
    position: 'absolute' as const,
    left: '50%',
    top: '50%',
    transform: `translate(-50%, -50%) rotate(${position.theta}rad)`,
    width: 18,
    height: 18,
    borderRadius: 999,
    background:
      'conic-gradient(from 45deg at 50% 50%, rgba(34,211,238,0.8), rgba(167,139,250,0.8))',
    boxShadow: '0 0 20px rgba(34,211,238,0.6)'
  }), [position.theta]);

  return <div data-testid="robot-position" style={style} />;
}

export default RobotPositionOverlay;


