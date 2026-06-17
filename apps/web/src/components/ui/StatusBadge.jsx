import React from 'react';
import clsx from 'clsx';
import {
    STATUS_CLASSES,
    STATUS_LABELS,
    mapToStatus,
} from '@/constants/status';

/**
 * StatusBadge — Single source untuk display status di seluruh app.
 *
 * Usage:
 *   <StatusBadge status="online" />              → "● Online"
 *   <StatusBadge status="active" />              → "● Online" (auto-mapping)
 *   <StatusBadge status="isolir" />              → "● Bermasalah"
 *   <StatusBadge status="online" label="Aktif"/> → "● Aktif" (override label)
 *   <StatusBadge status="online" size="sm"/>     → smaller variant
 *   <StatusBadge status="online" dot={false}/>   → tanpa dot indicator
 *
 * Token CSS: lihat src/index.css @theme block + src/constants/status.js
 */
export function StatusBadge({ status, label, size = 'md', dot = true, className }) {
    const canonical = mapToStatus(status);
    const colors = STATUS_CLASSES[canonical];
    const displayLabel = label ?? STATUS_LABELS[canonical];

    const sizeClasses = {
        xs: 'text-[9px] px-1.5 py-0 gap-1',
        sm: 'text-[10px] px-2 py-0.5 gap-1',
        md: 'text-xs px-2.5 py-1 gap-1.5',
        lg: 'text-sm px-3 py-1.5 gap-2',
    }[size];

    const dotSize = {
        xs: 'w-1 h-1',
        sm: 'w-1.5 h-1.5',
        md: 'w-1.5 h-1.5',
        lg: 'w-2 h-2',
    }[size];

    return (
        <span
            className={clsx(
                'inline-flex items-center rounded-md font-bold uppercase tracking-wider whitespace-nowrap',
                colors.bg,
                colors.text,
                colors.ring,
                sizeClasses,
                className,
            )}
        >
            {dot && <span className={clsx('rounded-full shrink-0', colors.dot, dotSize)} aria-hidden="true" />}
            {displayLabel}
        </span>
    );
}

/**
 * StatusDot — minimal indicator, no label. Untuk inline indicator di table cell.
 *   <StatusDot status="online" /> → cuma titik hijau
 */
export function StatusDot({ status, size = 'md', className, title }) {
    const colors = STATUS_CLASSES[mapToStatus(status)];
    const sizeClass = {
        xs: 'w-1.5 h-1.5',
        sm: 'w-2 h-2',
        md: 'w-2.5 h-2.5',
        lg: 'w-3 h-3',
    }[size];

    return (
        <span
            className={clsx('inline-block rounded-full', colors.dot, sizeClass, className)}
            title={title}
            aria-label={title || mapToStatus(status)}
        />
    );
}

export default StatusBadge;
