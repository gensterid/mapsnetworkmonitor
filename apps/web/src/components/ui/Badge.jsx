import React from 'react';
import clsx from 'clsx';

// Variants ikut tema via @theme tokens. Default/secondary/ghost pakai
// text-fg / text-fg-muted supaya kontras betul di tema gelap dan
// tema terang (Daylight/Enterprise). Accent variants (primary/success/
// warning/danger) tetap pakai accent color karena bg-nya tinted +
// accent color sudah per-tema. `info` ditinggal blue hardcode — token
// --info belum ada di tema.
const variants = {
  default: "bg-slate-surface text-fg border-slate-border",
  primary: "bg-primary/10 text-primary border-primary/20",
  secondary: "bg-slate-surface/50 text-fg border-slate-border/50",
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  danger: "bg-danger/10 text-danger border-danger/20",
  info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  ghost: "bg-transparent text-fg-muted border-transparent",
};

const sizes = {
  xs: "px-1.5 py-0.5 text-[10px]",
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
};

export const Badge = ({ 
  children, 
  variant = 'default', 
  size = 'sm', 
  className,
  rounded = 'full',
  icon: Icon,
  ...props 
}) => {
  return (
    <span 
      className={clsx(
        "inline-flex items-center gap-1.5 font-bold uppercase tracking-wider border",
        variants[variant] || variants.default,
        sizes[size] || sizes.sm,
        rounded === 'full' ? 'rounded-full' : 'rounded-md',
        className
      )}
      {...props}
    >
      {Icon && <Icon className={clsx(
        size === 'xs' ? 'w-2.5 h-2.5' : 'w-3 h-3'
      )} />}
      {children}
    </span>
  );
};
