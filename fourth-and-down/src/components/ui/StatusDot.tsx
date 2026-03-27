type Status = 'connected' | 'disconnected' | 'connecting';

interface StatusDotProps {
  status: Status;
  label?: string;
}

const dotStyles: Record<Status, string> = {
  connected: 'bg-accent-green',
  disconnected: 'bg-accent-red',
  connecting: 'bg-accent-amber animate-pulse',
};

const labelText: Record<Status, string> = {
  connected: 'Connected',
  disconnected: 'Disconnected',
  connecting: 'Connecting',
};

export function StatusDot({ status, label }: StatusDotProps) {
  return (
    <div className="inline-flex items-center gap-2">
      <span
        className={`w-[10px] h-[10px] rounded-full shrink-0 ${dotStyles[status]}`}
      />
      {label !== undefined ? (
        <span className="text-text-secondary text-[16px]">{label}</span>
      ) : (
        <span className="text-text-secondary text-[16px]">{labelText[status]}</span>
      )}
    </div>
  );
}
