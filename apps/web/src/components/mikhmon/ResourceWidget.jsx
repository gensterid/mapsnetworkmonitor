import React from 'react';
import { useMikhmonResource } from '@/hooks/useMikhmon';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import { Cpu, MemoryStick, Clock, Thermometer } from 'lucide-react';
import clsx from 'clsx';

/**
 * Compact top-bar widget showing live CPU / RAM / uptime / temperature.
 * Polling cadence follows the global auto-refresh context.
 *
 * Values are intentionally short — this lives in the header, not a full
 * dashboard. Dashboard page will render a fuller card.
 */
function formatUptime(uptime) {
    if (!uptime) return '—';
    // RouterOS reports uptime like "2d05h08m27s" or "1w2d3h4m5s"
    const m = String(uptime).match(/(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
    if (!m) return String(uptime);
    const [, w, d, h, mi] = m;
    const parts = [];
    if (w) parts.push(`${w}w`);
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (!w && !d && mi) parts.push(`${mi}m`);
    return parts.join(' ') || String(uptime);
}

function formatMem(used, total) {
    if (!total) return '—';
    const usedMB = Math.round((used || 0) / (1024 * 1024));
    const totalMB = Math.round(total / (1024 * 1024));
    const pct = Math.round(((used || 0) / total) * 100);
    return { label: `${usedMB}/${totalMB} MB`, pct };
}

function cpuColor(load) {
    if (load == null) return 'text-slate-500';
    if (load < 40) return 'text-emerald-400';
    if (load < 75) return 'text-yellow-400';
    return 'text-red-400';
}

function memColor(pct) {
    if (pct == null) return 'text-slate-500';
    if (pct < 60) return 'text-emerald-400';
    if (pct < 85) return 'text-yellow-400';
    return 'text-red-400';
}

export default function ResourceWidget({ className }) {
    const { selectedRouterId } = useMikhmonContext();
    const { data, isError, isLoading } = useMikhmonResource(selectedRouterId);

    if (!selectedRouterId) {
        return (
            <div className={clsx('text-[11px] text-slate-500 italic', className)}>
                Pilih router untuk melihat status
            </div>
        );
    }

    if (isLoading && !data) {
        return (
            <div className={clsx('text-[11px] text-slate-500 italic', className)}>
                Memuat status…
            </div>
        );
    }

    if (isError) {
        return (
            <div className={clsx('text-[11px] text-red-400', className)}>
                Gagal ambil resource
            </div>
        );
    }

    const r = data || {};
    const mem = formatMem(r.usedMemory, r.totalMemory);

    return (
        <div className={clsx('flex items-center gap-3 text-[11px] font-mono', className)}>
            <span className="flex items-center gap-1" title="CPU load">
                <Cpu className={clsx('w-3.5 h-3.5', cpuColor(r.cpuLoad))} />
                <span className={cpuColor(r.cpuLoad)}>{r.cpuLoad ?? '—'}%</span>
            </span>
            {mem !== '—' && (
                <span className="flex items-center gap-1" title={`RAM ${mem.label}`}>
                    <MemoryStick className={clsx('w-3.5 h-3.5', memColor(mem.pct))} />
                    <span className={memColor(mem.pct)}>{mem.pct}%</span>
                </span>
            )}
            {r.boardTemp != null && (
                <span className="flex items-center gap-1" title="Suhu board">
                    <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-amber-300">{r.boardTemp}°C</span>
                </span>
            )}
            <span className="flex items-center gap-1 text-slate-400" title="Uptime">
                <Clock className="w-3.5 h-3.5" />
                <span>{formatUptime(r.uptime)}</span>
            </span>
        </div>
    );
}
