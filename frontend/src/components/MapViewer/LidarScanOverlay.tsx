export function LidarScanOverlay() {
  return (
    <div
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      data-testid="lidar-overlay"
    />
  );
}

export default LidarScanOverlay;


