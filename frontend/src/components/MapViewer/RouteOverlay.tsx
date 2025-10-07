export function RouteOverlay() {
  return (
    <div
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      data-testid="route-overlay"
    />
  );
}

export default RouteOverlay;


