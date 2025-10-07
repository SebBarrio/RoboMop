import { useMemo, useState, useEffect } from 'react';
import './App.css';
import MapViewer from './components/MapViewer/MapViewer';
import ModeSelector from './components/Controls/ModeSelector';
import EmergencyStopButton from './components/Controls/EmergencyStopButton';
import JoggingControls from './components/Controls/JoggingControls';
import StatusPanel from './components/StatusPanel/StatusPanel';
import { websocketService } from './services/websocketService';
import { useRobotStore } from './stores/robotStore';
import { useRobotState } from './hooks/useRobotState';

function App() {
  const [mode, setMode] = useState('IDLE');
  const [speed, setSpeed] = useState(50);
  const [ackVisible, setAckVisible] = useState(false);
  useEffect(() => {
    const remove = websocketService.addAckListener(() => {
      setAckVisible(true);
      setTimeout(() => setAckVisible(false), 800);
    });
    return remove;
  }, []);

  // Auto-subscribe to a demo robot id and wire state
  useEffect(() => {
    websocketService.connect();
  }, []);
  useRobotState('demo');
  const velocity = useRobotStore((s) => s.velocity);

  const title = useMemo(() => `RoboMop • ${mode}`, [mode]);

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="brand-badge">🧽</div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{title}</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Autonomous cleaning robot</div>
          </div>
        </div>
        <div className="toolbar">
          <ModeSelector robotId="demo" mode={mode as any} onChange={setMode as any} />
          <EmergencyStopButton robotId="demo" />
        </div>
      </header>

      <section className="content-map">
        <MapViewer />
        {ackVisible && (
          <div
            data-testid="command-ack"
            style={{ position: 'absolute', right: 12, top: 12, padding: '6px 10px', borderRadius: 8, background: 'rgba(34,211,238,0.15)', border: '1px solid rgba(34,211,238,0.35)' }}
          >
            Command sent
          </div>
        )}
      </section>

      <aside className="content-controls">
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 600 }}>Manual Controls</div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>Speed</div>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="slider"
            data-testid="speed-slider"
            style={{ width: '100%', marginTop: 8 }}
          />
          <div style={{ marginTop: 12 }}>
            <JoggingControls robotId="demo" speedPercent={speed} />
          </div>
        </div>
        <div className="card" style={{ display: 'grid', gap: 8 }}>
          <button
            className="button primary"
            data-testid="subscribe"
            onClick={() => websocketService.subscribe({ robotId: 'demo', types: ['state', 'map', 'sensor'] })}
          >
            Subscribe
          </button>
          <button
            className="button"
            data-testid="unsubscribe"
            onClick={() => websocketService.unsubscribe({ robotId: 'demo', types: ['state', 'map', 'sensor'] })}
          >
            Unsubscribe
          </button>
        </div>
      </aside>

      <footer className="content-status">
        <StatusPanel mode={mode} velocityText={`${velocity.linear.toFixed(1)} m/s`} battery={null} water={null} />
        <div className="card gauges">
          <div className="gauge">
            <div className="gauge-label">Battery</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>--%</div>
          </div>
          <div className="gauge">
            <div className="gauge-label">Water</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>--%</div>
          </div>
          <div className="gauge">
            <div className="gauge-label">Errors</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>0</div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;


