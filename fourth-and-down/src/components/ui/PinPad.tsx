import { useState, useCallback } from 'react';

interface PinPadProps {
  onSubmit: (pin: string) => void;
  onCancel?: () => void;
  title?: string;
}

export function PinPad({ onSubmit, onCancel, title = 'Enter PIN' }: PinPadProps) {
  const [digits, setDigits] = useState<string>('');
  const [shake, setShake] = useState(false);

  const addDigit = useCallback(
    (d: string) => {
      if (digits.length >= 4) return;
      const next = digits + d;
      setDigits(next);
      if (next.length === 4) {
        setTimeout(() => onSubmit(next), 150);
      }
    },
    [digits, onSubmit],
  );

  const clear = useCallback(() => setDigits(''), []);

  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => {
      setShake(false);
      setDigits('');
    }, 500);
  }, []);

  // Expose triggerShake via a data attribute the parent can call
  // In practice, parent would call this after onSubmit returns failure
  // For now we attach it to window for simplicity
  if (typeof window !== 'undefined') {
    (window as any).__pinPadShake = triggerShake;
  }

  const numKeys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

  return (
    <div className="flex flex-col items-center gap-6 select-none">
      <h2 className="text-[24px] font-bold text-text-primary">{title}</h2>

      {/* Dots */}
      <div
        className={`flex gap-4 ${shake ? 'animate-[shake_300ms_ease-in-out]' : ''}`}
        style={
          shake
            ? { animation: 'shake 300ms ease-in-out' }
            : undefined
        }
      >
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={[
              'w-[20px] h-[20px] rounded-full border-2 transition-all duration-150',
              i < digits.length
                ? 'bg-accent-blue border-accent-blue scale-110'
                : 'bg-transparent border-surface-500',
            ].join(' ')}
          />
        ))}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3">
        {numKeys.map((n) => (
          <button
            key={n}
            onClick={() => addDigit(n)}
            className="w-[76px] h-[76px] rounded-2xl bg-surface-700 text-text-primary text-3xl font-semibold hover:bg-surface-600 active:scale-[0.92] transition-all duration-100"
          >
            {n}
          </button>
        ))}

        {/* Bottom row: Cancel / 0 / Clear */}
        <button
          onClick={onCancel}
          className="w-[76px] h-[76px] rounded-2xl bg-surface-700 text-text-secondary text-[16px] font-medium hover:bg-surface-600 active:scale-[0.92] transition-all duration-100"
        >
          {onCancel ? 'Cancel' : ''}
        </button>
        <button
          onClick={() => addDigit('0')}
          className="w-[76px] h-[76px] rounded-2xl bg-surface-700 text-text-primary text-3xl font-semibold hover:bg-surface-600 active:scale-[0.92] transition-all duration-100"
        >
          0
        </button>
        <button
          onClick={clear}
          className="w-[76px] h-[76px] rounded-2xl bg-surface-700 text-text-secondary text-[16px] font-medium hover:bg-surface-600 active:scale-[0.92] transition-all duration-100"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
