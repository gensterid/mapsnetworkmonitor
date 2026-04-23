import React, { useState } from 'react';
import { RefreshCw, Trash2, Radio, Signal, MapPin, Clock } from 'lucide-react';
import { useRebootOnu, useArchiveOnu } from '@/hooks';
import { formatShortDateTime } from '@/lib/timezone';
import { computeOnuSourceHealth, getSourceHealthLabel, getSourceHealthClasses } from '@/lib/onuSourceHealth';
import clsx from 'clsx';

/**
 * OLT Tab — shows ONU inventory info for a map device and exposes OLT actions.
 * Expects the `device` prop to contain fields from router_netwatch enriched
 * with ONU data via the netwatch repository join (sn, oltId, linkedOnuId,
 * lastRxPower, ponPort, onuIndex, oltName, physicalStatus, lastSeen,
 * lastDownReason, discoverySources).
 */
export default function OltTab({ device, timezone }) {
    const rebootMutation = useRebootOnu();
    const archiveMutation = useArchiveOnu();
    const [isRebooting, setIsRebooting] = useState(false);

    const onuId = device?.linkedOnuId || ((device?.type === 'onu' || device?.deviceType === 'onu') ? device?.id : null);
    const oltId = device?.oltId;
    const sn = device?.sn;
    const signal = device?.lastRxPower;
    const signalNum = signal ? parseFloat(signal) : null;
    const ponPort = device?.ponPort;
    const onuIndex = device?.onuIndex;
    const oltName = device?.oltName;
    const physicalStatus = device?.physicalStatus || device?.status;
    const sources = Array.isArray(device?.discoverySources) ? device.discoverySources : [];

    if (!onuId || !oltId) {
        return (
            <div className="p-6 text-center text-slate-500 text-sm">
                <Radio className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>Perangkat ini belum ter-link ke inventory OLT.</p>
                <p className="text-xs mt-2">Link ONU manual di tab <b>Settings</b> → <i>Link ONU ke OLT</i>.</p>
            </div>
        );
    }

    const handleReboot = () => {
        if (!ponPort) {
            window.alert('PON port tidak diketahui, tidak bisa reboot via OLT.');
            return;
        }
        const confirmed = window.confirm(
            `Reboot ONU "${device.name || sn}"?\n\n` +
            `Perangkat akan terputus sekitar 30–60 detik saat boot ulang.`
        );
        if (!confirmed) return;
        setIsRebooting(true);
        rebootMutation.mutate(
            { id: oltId, onuId, ponId: ponPort },
            { onSettled: () => setIsRebooting(false) }
        );
    };

    const handleArchive = () => {
        const confirmed = window.confirm(
            `Hapus ONU "${device.name || sn}" dari aplikasi?\n\n` +
            `ONU akan disembunyikan dari peta. Koordinat dan data custom tetap tersimpan dan akan otomatis kembali jika ONU muncul lagi di polling OLT. ` +
            `Setelah 60 hari tidak muncul, data akan dihapus permanen.`
        );
        if (!confirmed) return;
        archiveMutation.mutate({ id: oltId, onuId });
    };

    const signalColor = signalNum == null ? 'text-slate-400'
        : signalNum < -27 ? 'text-red-400'
        : signalNum < -24 ? 'text-yellow-400'
        : 'text-emerald-400';

    const health = computeOnuSourceHealth({ ...device, lastSeenOlt: device.lastSeenOlt, lastSeenAcs: device.lastSeenAcs });

    return (
        <div className="device-modal__content custom-scrollbar" style={{ padding: '1rem 1.5rem' }}>
            {/* Source health warning banner */}
            {(health.kind === 'missing-olt' || health.kind === 'ghost') && (
                <div className={clsx('mb-4 px-3 py-2 rounded-lg border text-xs flex items-center gap-2',
                    health.kind === 'ghost'
                        ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                        : 'bg-red-500/10 border-red-500/30 text-red-300'
                )}>
                    <span className="material-symbols-outlined text-[16px]">warning</span>
                    <div className="flex-1">
                        <div className="font-bold">{getSourceHealthLabel(health.kind)}</div>
                        <div className="opacity-80">
                            {health.kind === 'ghost'
                                ? 'OLT dan ACS sama-sama sudah tidak melaporkan ONU ini > 2 jam'
                                : 'OLT sudah tidak melaporkan ONU ini > 2 jam — kemungkinan dihapus dari konfigurasi OLT'}
                        </div>
                    </div>
                </div>
            )}

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                <InfoCard icon={<Radio className="w-4 h-4 text-blue-400" />} label="Serial Number" value={sn || '—'} mono />
                <InfoCard icon={<MapPin className="w-4 h-4 text-purple-400" />} label="PON Port" value={ponPort ? `${ponPort} / ${onuIndex || '?'}` : '—'} mono />
                <InfoCard
                    icon={<Signal className={clsx('w-4 h-4', signalColor)} />}
                    label="RX Signal"
                    value={signal ? `${signal}${!signal.toString().includes('dBm') ? ' dBm' : ''}` : '—'}
                    valueClass={signalColor}
                    mono
                />
                <InfoCard
                    icon={<Clock className="w-4 h-4 text-slate-400" />}
                    label="Status OLT"
                    value={physicalStatus?.toUpperCase() || 'UNKNOWN'}
                    valueClass={physicalStatus === 'online' ? 'text-emerald-400' : 'text-red-400'}
                />
            </div>

            {/* Secondary info */}
            <div className="space-y-2 mb-5 text-xs bg-slate-800/40 rounded-lg p-3 border border-slate-700/40">
                <Row label="OLT" value={oltName || '—'} valueClass="text-blue-400 font-mono" />
                {device?.lastDownReason && (
                    <Row label="Last Down Reason" value={device.lastDownReason} valueClass="text-amber-400" />
                )}
                {device?.lastSeen && (
                    <Row label="Terakhir Terlihat" value={formatShortDateTime(device.lastSeen, timezone)} valueClass="text-slate-300 font-mono" />
                )}
                {device?.lastSeenOlt && (
                    <Row label="Sync OLT Terakhir" value={formatShortDateTime(device.lastSeenOlt, timezone)} valueClass="text-slate-300 font-mono" />
                )}
                <Row
                    label="Sumber Data"
                    value={sources.length > 0 ? sources.join(', ').toUpperCase() : '—'}
                    valueClass="text-slate-300 font-bold"
                />
            </div>

            {/* Actions */}
            <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Aksi OLT</div>
                <button
                    type="button"
                    onClick={handleReboot}
                    disabled={isRebooting || rebootMutation.isPending || !ponPort}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-lg transition-colors font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <RefreshCw className={clsx('w-4 h-4', isRebooting && 'animate-spin')} />
                    {isRebooting ? 'Mengirim perintah...' : 'Reboot ONU via OLT'}
                </button>
                <button
                    type="button"
                    onClick={handleArchive}
                    disabled={archiveMutation.isPending}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-lg transition-colors font-medium text-sm disabled:opacity-50"
                >
                    <Trash2 className="w-4 h-4" />
                    Hapus dari Aplikasi (soft-delete)
                </button>
            </div>
        </div>
    );
}

function InfoCard({ icon, label, value, valueClass = 'text-slate-200', mono = false }) {
    return (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                {icon}
                {label}
            </div>
            <div className={clsx('text-sm font-bold truncate', valueClass, mono && 'font-mono')} title={String(value)}>
                {value}
            </div>
        </div>
    );
}

function Row({ label, value, valueClass = 'text-slate-200' }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500 uppercase text-[10px] font-bold tracking-tight">{label}</span>
            <span className={clsx('text-xs truncate max-w-[60%]', valueClass)} title={String(value)}>{value}</span>
        </div>
    );
}
