import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Slider } from '../components/ui/Slider';
import { Toggle } from '../components/ui/Toggle';
import { StatusDot } from '../components/ui/StatusDot';
import { api } from '../lib/api';

/* ---- Types ---- */

interface AmbientStatus {
  running: boolean;
  currentColors: string[];
  fps: number;
}

interface ZoneOption {
  id: string;
  label: string;
}

/* ---- Icons ---- */

const cameraIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const playIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const stopIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>
);

const pauseIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
);

const alignIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
  </svg>
);

const speedIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
  </svg>
);

const paletteIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13.5" cy="6.5" r="2.5" />
    <circle cx="17.5" cy="10.5" r="2.5" />
    <circle cx="8.5" cy="7.5" r="2.5" />
    <circle cx="6.5" cy="12.5" r="2.5" />
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 011.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
  </svg>
);

/* ---- Zones available for ambient sync ---- */

const AMBIENT_ZONES: ZoneOption[] = [
  { id: 'theater_bias', label: 'Theater Bias Lighting' },
  { id: 'theater', label: 'Theater' },
  { id: 'rec_room', label: 'Rec Room' },
  { id: 'bar', label: 'Bar Area' },
];

/* ---- Component ---- */

export function AmbientSync() {
  const navigate = useNavigate();

  // Status polling
  const [status, setStatus] = useState<AmbientStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Controls
  const [speed, setSpeed] = useState(1.5);
  const [intensity, setIntensity] = useState(80);
  const [selectedZones, setSelectedZones] = useState<Set<string>>(new Set(['theater_bias']));
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  // Live color preview via SSE
  const [liveColors, setLiveColors] = useState<string[]>([]);
  const sseRef = useRef<EventSource | null>(null);

  // Fetch initial status
  useEffect(() => {
    api.get<AmbientStatus>('/ambient/status')
      .then((s) => {
        setStatus(s);
        if (s.currentColors.length > 0) setLiveColors(s.currentColors);
      })
      .catch(() => setStatus({ running: false, currentColors: [], fps: 0 }))
      .finally(() => setLoading(false));
  }, []);

  // SSE for live color updates when running
  useEffect(() => {
    if (!status?.running) {
      sseRef.current?.close();
      sseRef.current = null;
      return;
    }

    const es = new EventSource('/api/ambient/preview');
    sseRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.colors) setLiveColors(data.colors);
        if (data.fps != null) {
          setStatus((prev) => prev ? { ...prev, fps: data.fps } : prev);
        }
      } catch { /* ignore parse errors */ }
    };

    return () => {
      es.close();
      sseRef.current = null;
    };
  }, [status?.running]);

  // Poll status while running
  useEffect(() => {
    if (!status?.running) return;
    const interval = setInterval(() => {
      api.get<AmbientStatus>('/ambient/status')
        .then(setStatus)
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [status?.running]);

  const toggleZone = (zoneId: string) => {
    setSelectedZones((prev) => {
      const next = new Set(prev);
      if (next.has(zoneId)) next.delete(zoneId);
      else next.add(zoneId);
      return next;
    });
  };

  const handleStart = async () => {
    setStarting(true);
    try {
      await api.post('/ambient/start', {
        speed,
        intensity,
        zones: Array.from(selectedZones),
      });
      setStatus({ running: true, currentColors: [], fps: 0 });
    } catch { /* */ }
    setStarting(false);
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      await api.post('/ambient/stop');
      setStatus({ running: false, currentColors: [], fps: 0 });
      setLiveColors([]);
    } catch { /* */ }
    setStopping(false);
  };

  if (loading) {
    return (
      <div className="p-5 pb-2 animate-fade-in">
        <h1 className="text-[28px] font-bold text-text-primary mb-5">Ambient Sync</h1>
        <p className="text-text-muted text-center py-10">Loading...</p>
      </div>
    );
  }

  const isRunning = status?.running ?? false;

  return (
    <div className="p-5 pb-2 animate-fade-in">
      <h1 className="text-[28px] font-bold text-text-primary mb-5">Ambient Sync</h1>

      {/* Status indicator */}
      <Card className="mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-text-muted">{cameraIcon}</span>
            <div>
              <h2 className="text-[20px] font-bold text-text-primary">
                Projector Color Sync
              </h2>
              <p className="text-[14px] text-text-muted">
                Camera captures screen colors and syncs to bias lights
              </p>
            </div>
          </div>
          <StatusDot
            status={isRunning ? 'connected' : 'disconnected'}
            label={isRunning ? 'Active' : 'Idle'}
          />
        </div>
      </Card>

      {isRunning ? (
        /* ---- Active View ---- */
        <>
          {/* Live color swatches */}
          <Card className="mb-4">
            <h3 className="text-[18px] font-bold text-text-primary mb-3">
              Live Colors
            </h3>
            <div className="flex gap-2 mb-4">
              {(liveColors.length > 0 ? liveColors : ['#333', '#333', '#333']).map(
                (color, i) => (
                  <div
                    key={i}
                    className="flex-1 h-[48px] rounded-xl border border-surface-600 transition-colors duration-300"
                    style={{ backgroundColor: color }}
                  />
                ),
              )}
            </div>

            {/* FPS indicator */}
            <div className="flex items-center justify-between text-[14px]">
              <span className="text-text-muted">Frame rate</span>
              <span className="text-text-primary font-mono tabular-nums">
                {status?.fps ?? 0} fps
              </span>
            </div>
          </Card>

          {/* Active zones */}
          <Card className="mb-4">
            <h3 className="text-[18px] font-bold text-text-primary mb-3">
              Synced Zones
            </h3>
            <div className="flex flex-wrap gap-2">
              {AMBIENT_ZONES.filter((z) => selectedZones.has(z.id)).map((z) => (
                <span
                  key={z.id}
                  className="px-3 py-1.5 rounded-lg bg-accent-blue/20 text-accent-blue text-[14px] font-medium"
                >
                  {z.label}
                </span>
              ))}
            </div>
          </Card>

          {/* Controls */}
          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              fullWidth
              size="md"
              icon={pauseIcon}
              onClick={handleStop}
              disabled={stopping}
            >
              {stopping ? 'Stopping...' : 'Pause'}
            </Button>
            <Button
              variant="danger"
              fullWidth
              size="md"
              icon={stopIcon}
              onClick={handleStop}
              disabled={stopping}
            >
              {stopping ? 'Stopping...' : 'Stop Sync'}
            </Button>
          </div>
        </>
      ) : (
        /* ---- Setup View ---- */
        <>
          {/* Camera preview placeholder */}
          <Card className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[18px] font-bold text-text-primary">
                Camera Preview
              </h3>
              <Button
                variant="ghost"
                size="sm"
                icon={alignIcon}
                onClick={() => navigate('/ambient/setup')}
              >
                Calibrate
              </Button>
            </div>
            <div className="w-full aspect-video bg-surface-700 rounded-xl border border-surface-600 flex items-center justify-center">
              <div className="text-center">
                <span className="text-text-muted block mb-2">{cameraIcon}</span>
                <p className="text-text-muted text-[14px]">
                  Camera feed appears when sync starts
                </p>
              </div>
            </div>
          </Card>

          {/* Speed slider */}
          <Card className="mb-4">
            <Slider
              value={speed * 10}
              onChange={(v) => setSpeed(v / 10)}
              label="Transition Speed"
              icon={speedIcon}
              color="#8b5cf6"
              min={5}
              max={30}
              step={1}
            />
            <p className="text-text-muted text-[13px] mt-2">
              {speed.toFixed(1)}s &mdash; {speed <= 1 ? 'Fast, reactive' : speed <= 2 ? 'Smooth, balanced' : 'Slow, cinematic'}
            </p>
          </Card>

          {/* Intensity slider */}
          <Card className="mb-4">
            <Slider
              value={intensity}
              onChange={setIntensity}
              label="Color Intensity"
              icon={paletteIcon}
              color="#ec4899"
              min={50}
              max={100}
              step={5}
            />
            <p className="text-text-muted text-[13px] mt-2">
              {intensity}% saturation &mdash; {intensity < 70 ? 'Subtle, pastel tones' : intensity < 90 ? 'Vivid, balanced' : 'Full saturation'}
            </p>
          </Card>

          {/* Zone selection */}
          <Card className="mb-5">
            <h3 className="text-[18px] font-bold text-text-primary mb-1">
              Light Zones
            </h3>
            <p className="text-text-muted text-[13px] mb-4">
              Which lights follow the screen colors
            </p>
            <div className="space-y-3">
              {AMBIENT_ZONES.map((zone) => (
                <div key={zone.id} className="flex items-center justify-between">
                  <span className="text-[16px] text-text-secondary">
                    {zone.label}
                  </span>
                  <Toggle
                    checked={selectedZones.has(zone.id)}
                    onChange={() => toggleZone(zone.id)}
                    size="md"
                  />
                </div>
              ))}
            </div>
          </Card>

          {/* Start button */}
          <Button
            variant="primary"
            fullWidth
            size="lg"
            icon={playIcon}
            onClick={handleStart}
            disabled={starting || selectedZones.size === 0}
          >
            {starting ? 'Starting...' : 'Start Sync'}
          </Button>

          {selectedZones.size === 0 && (
            <p className="text-accent-amber text-[14px] text-center mt-3">
              Select at least one light zone
            </p>
          )}
        </>
      )}
    </div>
  );
}
