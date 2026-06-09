import React from 'react';
import clsx from 'clsx';

// Variants ikut tema via @theme tokens:
//   --primary, --success, --warning, --danger semua per-tema (mis. Mission
//   pakai success #22c55e, Daylight pakai #16a34a yang lebih gelap untuk
//   kontras di bg putih). Tanpa swap ini, success badge tetap emerald-500
//   di semua tema — terlihat lepas dari palette tema.
// `info` di-leave (#blue hardcode) karena --info belum di-define di tema.
// Text light/dark di Daylight masih kurang kontras untuk default/secondary —
// di luar scope Fase 2 (token foreground per-tema belum ada).
const variants = {
  default: "bg-slate-surface text-slate-300 border-slate-border",
  primary: "bg-primary/10 text-primary border-primary/20",
  secondary: "bg-slate-surface/50 text-slate-300 border-slate-border/50",
  success: "bg-success/10 text-success border-success/20",
  warning: "bg-warning/10 text-warning border-warning/20",
  danger: "bg-danger/10 text-danger border-danger/20",
  info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  ghost: "bg-transparent text-slate-400 border-transparent",
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
