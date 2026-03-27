import { type ReactNode, useRef, useCallback } from 'react';

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  label?: string;
  icon?: ReactNode;
  color?: string;
  showValue?: boolean;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}

export function Slider({
  value,
  onChange,
  label,
  icon,
  color = '#3b82f6',
  showValue = true,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
}: SliderProps) {
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = Number(e.target.value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onChange(newValue);
      }, 100);
    },
    [onChange],
  );

  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div className={`w-full ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      {(label || showValue) && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-text-secondary text-[18px]">
            {icon && <span className="shrink-0">{icon}</span>}
            {label && <span>{label}</span>}
          </div>
          {showValue && (
            <span className="text-text-primary text-[20px] font-semibold tabular-nums">
              {value}
            </span>
          )}
        </div>
      )}
      <div className="relative w-full h-[36px] flex items-center">
        <div className="absolute inset-x-0 h-[12px] rounded-full bg-surface-600 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-75"
            style={{ width: `${percent}%`, backgroundColor: color }}
          />
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          defaultValue={value}
          onChange={handleChange}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          style={{ WebkitAppearance: 'none' }}
        />
        <div
          className="absolute w-[36px] h-[36px] rounded-full bg-white shadow-lg pointer-events-none transition-all duration-75"
          style={{
            left: `calc(${percent}% - 18px)`,
            boxShadow: `0 0 10px ${color}66`,
          }}
        />
      </div>
    </div>
  );
}
