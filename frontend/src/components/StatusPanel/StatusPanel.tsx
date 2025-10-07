type Props = {
  mode: string;
  velocityText: string;
  battery?: number | null;
  water?: number | null;
};

export function StatusPanel({ mode, velocityText, battery, water }: Props) {
  return (
    <div className="card" data-testid="status-panel">
      <div style={{ fontWeight: 600, marginBottom: 8 }}>Robot Status</div>
      <div>Mode: {mode}</div>
      <div data-testid="velocity-display">Velocity: {velocityText}</div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        <div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>Battery</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{battery ?? '--'}%</div>
        </div>
        <div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>Water</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{water ?? '--'}%</div>
        </div>
      </div>
    </div>
  );
}

export default StatusPanel;


