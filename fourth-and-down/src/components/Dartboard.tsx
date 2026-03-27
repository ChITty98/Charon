import { useState, useCallback, useRef, type CSSProperties } from 'react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DartHit {
  segment: number; // 0 = bull, 1-20
  multiplier: 1 | 2 | 3; // 1=single, 2=double, 3=triple (bull: 1=outer 25, 2=inner 50)
  score: number;
}

interface DartboardProps {
  onDartHit: (hit: DartHit) => void;
  disabled?: boolean;
  /** Current dart number 1-3 */
  dartNumber?: number;
  /** Max width in px (default 500) */
  maxWidth?: number;
  /** Hide the internal dart-dot indicator and last-hit display (when the parent handles it) */
  compact?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Standard dartboard segment order (clockwise from top)              */
/* ------------------------------------------------------------------ */

const SEGMENTS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const SEGMENT_ANGLE = 360 / 20; // 18 degrees per segment

/* ------------------------------------------------------------------ */
/*  Radii (out of a 200-unit coordinate system, center at 200,200)     */
/* ------------------------------------------------------------------ */

const R_OUTER = 190; // board edge
const R_DOUBLE_OUTER = 190;
const R_DOUBLE_INNER = 170;
const R_SINGLE_OUTER_OUTER = 170;
const R_SINGLE_OUTER_INNER = 115;
const R_TRIPLE_OUTER = 115;
const R_TRIPLE_INNER = 95;
const R_SINGLE_INNER_OUTER = 95;
const R_SINGLE_INNER_INNER = 28;
const R_OUTER_BULL = 28;
const R_INNER_BULL = 12;

const CX = 200;
const CY = 200;

/* ------------------------------------------------------------------ */
/*  Colors                                                             */
/* ------------------------------------------------------------------ */

const GREEN_SEG = '#1a5c2a';
const RED_SEG = '#8b1a1a';
const WIRE_COLOR = '#b8993e';
const BULL_RED = '#c0392b';
const BULL_GREEN = '#196f3d';

/* ------------------------------------------------------------------ */
/*  SVG path helpers                                                   */
/* ------------------------------------------------------------------ */

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180; // -90 so 0deg = top
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

/** Create an annular sector (wedge) SVG path */
function sectorPath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  startAngle: number,
  endAngle: number,
): string {
  const outerStart = polarToXY(cx, cy, rOuter, startAngle);
  const outerEnd = polarToXY(cx, cy, rOuter, endAngle);
  const innerStart = polarToXY(cx, cy, rInner, endAngle);
  const innerEnd = polarToXY(cx, cy, rInner, startAngle);

  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return [
    `M ${outerStart.x} ${outerStart.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L ${innerStart.x} ${innerStart.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${innerEnd.x} ${innerEnd.y}`,
    'Z',
  ].join(' ');
}

/* ------------------------------------------------------------------ */
/*  Score label                                                        */
/* ------------------------------------------------------------------ */

function formatHit(segment: number, multiplier: number, score: number): string {
  if (segment === 0) {
    return multiplier === 2 ? `BULL = ${score}` : `25 = ${score}`;
  }
  const prefix = multiplier === 3 ? 'T' : multiplier === 2 ? 'D' : '';
  return `${prefix}${segment} = ${score}`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function Dartboard({ onDartHit, disabled = false, dartNumber = 1, maxWidth = 500, compact = false }: DartboardProps) {
  const [flash, setFlash] = useState<string | null>(null); // path key that's flashing
  const [lastHit, setLastHit] = useState<string | null>(null);
  const flashTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleHit = useCallback(
    (segment: number, multiplier: 1 | 2 | 3) => {
      if (disabled) return;
      let score: number;
      if (segment === 0) {
        score = multiplier === 2 ? 50 : 25;
      } else {
        score = segment * multiplier;
      }

      const key = `${segment}-${multiplier}`;
      setFlash(key);
      setLastHit(formatHit(segment, multiplier, score));

      if (flashTimeout.current) clearTimeout(flashTimeout.current);
      flashTimeout.current = setTimeout(() => setFlash(null), 300);

      onDartHit({ segment, multiplier, score });
    },
    [disabled, onDartHit],
  );

  /* ---- Build all sector paths ---- */
  const segments: React.ReactElement[] = [];

  SEGMENTS.forEach((num, i) => {
    const startAngle = i * SEGMENT_ANGLE - SEGMENT_ANGLE / 2;
    const endAngle = startAngle + SEGMENT_ANGLE;
    const isEven = i % 2 === 0;

    // Ring definitions: [rInner, rOuter, multiplier, colorIfEven, colorIfOdd]
    const rings: [number, number, 1 | 2 | 3, string, string][] = [
      [R_DOUBLE_INNER, R_DOUBLE_OUTER, 2, RED_SEG, GREEN_SEG],
      [R_SINGLE_OUTER_INNER, R_SINGLE_OUTER_OUTER, 1, isEven ? '#0d0d0d' : '#f5f0e1', isEven ? '#f5f0e1' : '#0d0d0d'],
      [R_TRIPLE_INNER, R_TRIPLE_OUTER, 3, RED_SEG, GREEN_SEG],
      [R_SINGLE_INNER_INNER, R_SINGLE_INNER_OUTER, 1, isEven ? '#0d0d0d' : '#f5f0e1', isEven ? '#f5f0e1' : '#0d0d0d'],
    ];

    rings.forEach(([rInner, rOuter, multiplier, evenColor, oddColor]) => {
      const key = `${num}-${multiplier}${rInner === R_SINGLE_INNER_INNER ? '-inner' : ''}`;
      const flashKey = `${num}-${multiplier}`;
      const isFlashing = flash === flashKey;
      const color = isEven ? evenColor : oddColor;

      segments.push(
        <path
          key={key}
          d={sectorPath(CX, CY, rInner, rOuter, startAngle, endAngle)}
          fill={isFlashing ? '#fbbf24' : color}
          stroke={WIRE_COLOR}
          strokeWidth={0.8}
          className="transition-colors duration-100 cursor-pointer"
          style={{ opacity: disabled ? 0.5 : 1 }}
          onClick={() => handleHit(num, multiplier)}
        />,
      );
    });
  });

  /* ---- Number labels around the outside ---- */
  const labels = SEGMENTS.map((num, i) => {
    const angle = i * SEGMENT_ANGLE;
    const pos = polarToXY(CX, CY, R_OUTER + 18, angle);
    return (
      <text
        key={`label-${num}`}
        x={pos.x}
        y={pos.y}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#f0f0f5"
        fontSize="16"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
        className="select-none pointer-events-none"
      >
        {num}
      </text>
    );
  });

  /* ---- Wire rings (decorative) ---- */
  const wireRings = [R_DOUBLE_INNER, R_DOUBLE_OUTER, R_TRIPLE_INNER, R_TRIPLE_OUTER, R_OUTER_BULL, R_INNER_BULL].map(
    (r) => (
      <circle
        key={`wire-${r}`}
        cx={CX}
        cy={CY}
        r={r}
        fill="none"
        stroke={WIRE_COLOR}
        strokeWidth={0.8}
        className="pointer-events-none"
      />
    ),
  );

  /* ---- Dart indicator dots ---- */
  const dartDots = [1, 2, 3].map((d) => (
    <div
      key={d}
      className={[
        'w-[14px] h-[14px] rounded-full transition-all duration-200',
        d === dartNumber ? 'bg-accent-amber scale-125 shadow-[0_0_8px_#f59e0b]' : d < dartNumber ? 'bg-accent-green' : 'bg-surface-600',
      ].join(' ')}
    />
  ));

  const containerStyle: CSSProperties = {
    maxWidth: `${maxWidth}px`,
    width: '100%',
    margin: '0 auto',
  };

  return (
    <div style={containerStyle}>
      {/* Dart number indicator */}
      {!compact && (
        <div className="flex items-center justify-center gap-3 mb-3">
          <span className="text-text-secondary text-[16px] font-medium mr-2">Dart</span>
          {dartDots}
        </div>
      )}

      {/* The board */}
      <div className="relative w-full" style={{ paddingBottom: '100%' }}>
        <svg
          viewBox="0 0 440 440"
          className="absolute inset-0 w-full h-full"
          style={{ filter: 'drop-shadow(0 0 30px rgba(0,0,0,0.6))' }}
        >
          {/* Background circle */}
          <circle cx={CX + 20} cy={CY + 20} r={R_OUTER + 22} fill="#1a1a1a" className="pointer-events-none" />
          <circle cx={CX + 20} cy={CY + 20} r={R_OUTER + 18} fill="#222" className="pointer-events-none" />

          {/* Shift board content into center (offset 20 for label space) */}
          <g transform="translate(20,20)">
            {/* Board backing */}
            <circle cx={CX} cy={CY} r={R_OUTER + 2} fill="#1a1a1a" />

            {/* Segments */}
            {segments}

            {/* Bulls */}
            <circle
              cx={CX}
              cy={CY}
              r={R_OUTER_BULL}
              fill={flash === '0-1' ? '#fbbf24' : BULL_RED}
              stroke={WIRE_COLOR}
              strokeWidth={0.8}
              className="cursor-pointer transition-colors duration-100"
              style={{ opacity: disabled ? 0.5 : 1 }}
              onClick={() => handleHit(0, 1)}
            />
            <circle
              cx={CX}
              cy={CY}
              r={R_INNER_BULL}
              fill={flash === '0-2' ? '#fbbf24' : BULL_GREEN}
              stroke={WIRE_COLOR}
              strokeWidth={0.8}
              className="cursor-pointer transition-colors duration-100"
              style={{ opacity: disabled ? 0.5 : 1 }}
              onClick={() => handleHit(0, 2)}
            />

            {/* Wire overlay rings */}
            {wireRings}

            {/* Number labels */}
            {labels}
          </g>
        </svg>
      </div>

      {/* Last hit display */}
      {!compact && (
        <div className="flex items-center justify-center mt-3 h-[48px]">
          {lastHit && (
            <div
              className="text-[28px] font-bold text-accent-amber animate-[fade-in_150ms_ease-out]"
              key={lastHit + Date.now()}
            >
              {lastHit}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
