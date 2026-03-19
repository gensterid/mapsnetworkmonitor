import React from 'react';
import clsx from 'clsx';

const variants = {
  default: "bg-slate-800 text-slate-300 border-slate-700",
  primary: "bg-primary/10 text-primary border-primary/20",
  secondary: "bg-slate-700/50 text-slate-300 border-slate-600/50",
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  danger: "bg-red-500/10 text-red-400 border-red-500/20",
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
