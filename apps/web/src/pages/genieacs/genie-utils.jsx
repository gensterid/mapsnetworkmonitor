import clsx from 'clsx';

/**
 * Helper for Status Dots & Labels
 */
export const StatusBadge = ({ value, label, colorClass, icon: Icon }) => (
    <div className="flex items-center gap-1.5 min-w-fit">
        {Icon && <Icon className="w-3 h-3 text-slate-400" />}
        <span className="text-xs font-bold text-white whitespace-nowrap">{value}</span>
        <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", colorClass)}></span>
        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">{label}</span>
    </div>
);

/**
 * Signal Status Info helpers
 */
export const getSignalStatusInfo = (rssi) => {
    if (!rssi) return { label: 'No Signal', color: 'bg-slate-700', value: 'N/A' };
    const val = parseFloat(rssi);
    if (val >= -20) return { label: 'Excellent', color: 'bg-emerald-500', value: `${val} dBm` };
    if (val >= -24) return { label: 'Lumayan', color: 'bg-amber-500', value: `${val} dBm` };
    if (val >= -27) return { label: 'Fair', color: 'bg-orange-500', value: `${val} dBm` };
    return { label: 'Poor', color: 'bg-red-500', value: `${val} dBm` };
};

export const getTempStatusInfo = (temp) => {
    if (!temp) return null;
    const val = parseFloat(temp);
    if (val < 50) return { label: 'Cool', color: 'bg-emerald-500', value: `${val} °C` };
    if (val <= 65) return { label: 'Normal', color: 'bg-amber-500', value: `${val} °C` };
    return { label: 'Hot', color: 'bg-red-500', value: `${val} °C` };
};

export const getClientStatusInfo = (count) => {
    const val = parseInt(count || 0);
    if (val === 0) return { label: 'Idle', color: 'bg-slate-600', value: '0 Device' };
    if (val <= 3) return { label: 'Low', color: 'bg-emerald-500', value: `${val} Device` };
    if (val <= 6) return { label: 'Medium', color: 'bg-amber-500', value: `${val} Device` };
    return { label: 'High', color: 'bg-red-500', value: `${val} Device` };
};
