import { useRef, useCallback } from 'react';

interface ColorPickerProps {
  hue: number;
  saturation: number;
  onChange: (value: { hue: number; saturation: number }) => void;
}

export function ColorPicker({ hue, saturation, onChange }: ColorPickerProps) {
  const hueRef = useRef<HTMLInputElement>(null);
  const satRef = useRef<HTMLInputElement>(null);

  const huePercent = (hue / 360) * 100;
  const satPercent = saturation;

  const previewColor = `hsl(${hue}, ${saturation}%, 50%)`;

  const handleHueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ hue: Number(e.target.value), saturation });
    },
    [onChange, saturation],
  );

  const handleSatChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange({ hue, saturation: Number(e.target.value) });
    },
    [onChange, hue],
  );

  return (
    <div className="w-full space-y-5">
      {/* Color preview swatch */}
      <div className="flex items-center gap-4">
        <div
          className="w-16 h-16 rounded-2xl border-2 border-surface-500 shadow-lg"
          style={{ backgroundColor: previewColor }}
        />
        <div className="text-text-secondary text-[16px]">
          <div>
            Hue: <span className="text-text-primary font-semibold">{hue}°</span>
          </div>
          <div>
            Saturation:{' '}
            <span className="text-text-primary font-semibold">{saturation}%</span>
          </div>
        </div>
      </div>

      {/* Hue slider */}
      <div>
        <div className="text-text-secondary text-[16px] mb-2">Hue</div>
        <div className="relative w-full h-[36px] flex items-center">
          <div
            className="absolute inset-x-0 h-[12px] rounded-full"
            style={{
              background:
                'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)',
            }}
          />
          <input
            ref={hueRef}
            type="range"
            min={0}
            max={360}
            step={1}
            value={hue}
            onChange={handleHueChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div
            className="absolute w-[36px] h-[36px] rounded-full border-4 border-white shadow-lg pointer-events-none"
            style={{
              left: `calc(${huePercent}% - 18px)`,
              backgroundColor: `hsl(${hue}, 100%, 50%)`,
            }}
          />
        </div>
      </div>

      {/* Saturation slider */}
      <div>
        <div className="text-text-secondary text-[16px] mb-2">Saturation</div>
        <div className="relative w-full h-[36px] flex items-center">
          <div
            className="absolute inset-x-0 h-[12px] rounded-full"
            style={{
              background: `linear-gradient(to right, hsl(${hue}, 0%, 50%), hsl(${hue}, 100%, 50%))`,
            }}
          />
          <input
            ref={satRef}
            type="range"
            min={0}
            max={100}
            step={1}
            value={saturation}
            onChange={handleSatChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
          <div
            className="absolute w-[36px] h-[36px] rounded-full border-4 border-white shadow-lg pointer-events-none"
            style={{
              left: `calc(${satPercent}% - 18px)`,
              backgroundColor: previewColor,
            }}
          />
        </div>
      </div>
    </div>
  );
}
