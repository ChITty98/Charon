interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  size?: 'lg' | 'md';
}

const sizeConfig = {
  lg: { track: 'w-[80px] h-[44px]', thumb: 'w-[36px] h-[36px]', offset: 'translate-x-[40px]', label: 'text-[20px]' },
  md: { track: 'w-[60px] h-[34px]', thumb: 'w-[28px] h-[28px]', offset: 'translate-x-[29px]', label: 'text-[18px]' },
};

export function Toggle({ checked, onChange, label, size = 'lg' }: ToggleProps) {
  const cfg = sizeConfig[size];

  return (
    <label className="inline-flex items-center gap-4 cursor-pointer select-none">
      {label && (
        <span className={`text-text-primary font-medium ${cfg.label}`}>{label}</span>
      )}
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={[
          cfg.track,
          'rounded-full relative transition-colors duration-200 shrink-0',
          checked ? 'bg-accent-green' : 'bg-surface-600',
        ].join(' ')}
      >
        <span
          className={[
            cfg.thumb,
            'absolute top-1/2 -translate-y-1/2 left-[4px] rounded-full bg-white shadow-md',
            'transition-transform duration-200',
            checked ? cfg.offset : 'translate-x-0',
          ].join(' ')}
        />
      </button>
    </label>
  );
}
