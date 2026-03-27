import { type ReactNode, type ButtonHTMLAttributes } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
type ButtonSize = 'lg' | 'md' | 'sm';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'color'> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  color?: string;
  fullWidth?: boolean;
  icon?: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-accent-blue text-white hover:shadow-[0_0_20px_rgba(59,130,246,0.5)] hover:brightness-110',
  secondary: 'bg-surface-600 text-text-primary hover:bg-surface-500',
  danger:
    'bg-accent-red text-white hover:shadow-[0_0_20px_rgba(239,68,68,0.5)] hover:brightness-110',
  ghost: 'bg-transparent text-text-secondary hover:bg-surface-600 hover:text-text-primary',
};

const sizeStyles: Record<ButtonSize, string> = {
  lg: 'h-[70px] text-[22px] px-8',
  md: 'h-[56px] text-[20px] px-6',
  sm: 'h-[44px] text-[18px] px-4',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  color,
  disabled,
  fullWidth,
  icon,
  className = '',
  ...rest
}: ButtonProps) {
  const colorOverride = color
    ? `bg-[${color}] text-white hover:shadow-[0_0_20px_${color}80] hover:brightness-110`
    : '';

  return (
    <button
      disabled={disabled}
      className={[
        'rounded-xl font-semibold transition-all duration-150 select-none',
        'active:scale-[0.96]',
        'disabled:opacity-40 disabled:pointer-events-none',
        colorOverride || variantStyles[variant],
        sizeStyles[size],
        fullWidth ? 'w-full' : '',
        icon ? 'inline-flex items-center justify-center gap-3' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </button>
  );
}
