import { type ReactNode, type HTMLAttributes } from 'react';

type CardPadding = 'lg' | 'md' | 'none';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  glow?: string;
  padding?: CardPadding;
}

const paddingStyles: Record<CardPadding, string> = {
  lg: 'p-6',
  md: 'p-4',
  none: 'p-0',
};

export function Card({
  children,
  className = '',
  onClick,
  glow,
  padding = 'md',
  ...rest
}: CardProps) {
  const glowStyle = glow
    ? {
        boxShadow: `0 0 15px ${glow}33, inset 0 0 15px ${glow}11`,
        borderColor: `${glow}66`,
      }
    : undefined;

  return (
    <div
      onClick={onClick}
      style={glowStyle}
      className={[
        'bg-surface-800 rounded-2xl border border-surface-600 transition-all duration-200',
        paddingStyles[padding],
        onClick
          ? 'cursor-pointer active:scale-[0.98] hover:border-accent-blue/50'
          : '',
        glow ? 'animate-pulse-subtle' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
