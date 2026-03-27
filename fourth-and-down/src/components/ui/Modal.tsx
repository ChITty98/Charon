import { type ReactNode, useEffect } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

const sizeStyles = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={[
          'relative w-full bg-surface-800 rounded-2xl border border-surface-600 shadow-2xl',
          'animate-[scale-in_200ms_ease-out]',
          sizeStyles[size],
        ].join(' ')}
        style={{
          animation: 'scale-in 200ms ease-out',
        }}
      >
        {/* Header */}
        {(title || true) && (
          <div className="flex items-center justify-between p-5 pb-0">
            {title && (
              <h2 className="text-[22px] font-bold text-text-primary">{title}</h2>
            )}
            <button
              onClick={onClose}
              className="ml-auto w-[48px] h-[48px] flex items-center justify-center rounded-xl text-text-secondary hover:bg-surface-600 hover:text-text-primary transition-colors text-[24px]"
              aria-label="Close"
            >
              &#x2715;
            </button>
          </div>
        )}

        {/* Body */}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
