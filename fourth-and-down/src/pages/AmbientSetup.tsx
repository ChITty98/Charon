import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { api } from '../lib/api';

/* ---- Types ---- */

interface Corner {
  x: number; // 0-1 normalized
  y: number;
}

type Corners = [Corner, Corner, Corner, Corner]; // TL, TR, BR, BL

/* ---- Icons ---- */

const backIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
);

const saveIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
    <polyline points="17 21 17 13 7 13 7 21" />
    <polyline points="7 3 7 8 15 8" />
  </svg>
);

const resetIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 102.13-9.36L1 10" />
  </svg>
);

/* ---- Default corners (full frame) ---- */

const DEFAULT_CORNERS: Corners = [
  { x: 0.1, y: 0.1 },
  { x: 0.9, y: 0.1 },
  { x: 0.9, y: 0.9 },
  { x: 0.1, y: 0.9 },
];

const CORNER_LABELS = ['TL', 'TR', 'BR', 'BL'];

/* ---- Component ---- */

export function AmbientSetup() {
  const navigate = useNavigate();

  const [corners, setCorners] = useState<Corners>([...DEFAULT_CORNERS] as Corners);
  const [dragging, setDragging] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load existing calibration
  useEffect(() => {
    api.get<{ corners?: Corners }>('/ambient/status')
      .then(() => {
        // Server may return saved corners in status or a separate endpoint
      })
      .catch(() => {});
  }, []);

  const getRelativePosition = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
      };
    },
    [],
  );

  const handlePointerDown = (index: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(index);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (dragging === null) return;
      const pos = getRelativePosition(e.clientX, e.clientY);
      setCorners((prev) => {
        const next = [...prev] as Corners;
        next[dragging] = pos;
        return next;
      });
    },
    [dragging, getRelativePosition],
  );

  const handlePointerUp = () => {
    setDragging(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      await api.post('/ambient/calibrate', { corners });
      setSaved(true);
      setTimeout(() => navigate('/ambient'), 1000);
    } catch { /* */ }
    setSaving(false);
  };

  const handleReset = () => {
    setCorners([...DEFAULT_CORNERS] as Corners);
    setSaved(false);
  };

  return (
    <div className="p-5 pb-2 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => navigate('/ambient')}
          className="text-text-muted hover:text-text-primary transition-colors"
        >
          {backIcon}
        </button>
        <h1 className="text-[28px] font-bold text-text-primary">
          Camera Alignment
        </h1>
      </div>

      {/* Instructions */}
      <Card className="mb-4">
        <p className="text-text-secondary text-[16px]">
          Point the Surface camera at the projection screen and drag the corners
          to match the screen edges. This tells the system which part of the
          camera frame to sample colors from.
        </p>
      </Card>

      {/* Camera frame with draggable corners */}
      <Card padding="none" className="mb-4 overflow-hidden">
        <div
          ref={containerRef}
          className="relative w-full aspect-video bg-surface-700 select-none touch-none"
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          {/* Simulated camera feed placeholder */}
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-text-muted/40 text-[14px]">
              Camera feed will appear here
            </p>
          </div>

          {/* Selection overlay */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {/* Dimmed area outside selection */}
            <defs>
              <mask id="screen-mask">
                <rect width="100%" height="100%" fill="white" />
                <polygon
                  points={corners
                    .map((c) => `${c.x * 100}% ${c.y * 100}%`)
                    .join(', ')}
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.5)"
              mask="url(#screen-mask)"
            />

            {/* Selection outline */}
            <polygon
              points={corners
                .map((c) => `${c.x * 100}% ${c.y * 100}%`)
                .join(', ')}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              strokeDasharray="6 3"
            />

            {/* Corner-to-corner lines for visual guide */}
            {corners.map((c, i) => {
              const next = corners[(i + 1) % 4];
              return (
                <line
                  key={i}
                  x1={`${c.x * 100}%`}
                  y1={`${c.y * 100}%`}
                  x2={`${next.x * 100}%`}
                  y2={`${next.y * 100}%`}
                  stroke="#3b82f6"
                  strokeWidth="2"
                />
              );
            })}
          </svg>

          {/* Draggable corner handles */}
          {corners.map((corner, i) => (
            <div
              key={i}
              onPointerDown={(e) => handlePointerDown(i, e)}
              className={[
                'absolute w-[36px] h-[36px] -translate-x-1/2 -translate-y-1/2',
                'rounded-full border-[3px] border-accent-blue bg-surface-800/80',
                'flex items-center justify-center cursor-grab',
                'hover:bg-accent-blue/30 transition-colors',
                dragging === i ? 'scale-110 cursor-grabbing bg-accent-blue/40' : '',
              ].join(' ')}
              style={{
                left: `${corner.x * 100}%`,
                top: `${corner.y * 100}%`,
                touchAction: 'none',
              }}
            >
              <span className="text-[10px] font-bold text-accent-blue select-none pointer-events-none">
                {CORNER_LABELS[i]}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Corner coordinates (read-only info) */}
      <Card className="mb-5">
        <h3 className="text-[16px] font-bold text-text-primary mb-3">
          Screen Region
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {corners.map((c, i) => (
            <div key={i} className="text-center">
              <span className="text-text-muted text-[12px] block">
                {CORNER_LABELS[i]}
              </span>
              <span className="text-text-secondary text-[14px] font-mono tabular-nums">
                {Math.round(c.x * 100)}, {Math.round(c.y * 100)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Button variant="secondary" fullWidth icon={resetIcon} onClick={handleReset}>
          Reset
        </Button>
        <Button
          variant="primary"
          fullWidth
          icon={saveIcon}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Alignment'}
        </Button>
      </div>

      {saved && (
        <p className="text-accent-green text-[14px] text-center">
          Alignment saved. Redirecting...
        </p>
      )}
    </div>
  );
}
