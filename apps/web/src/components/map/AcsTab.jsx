import React, { useMemo, useState } from 'react';
import { RefreshCw, Wifi, Power, Cpu, Router, Signal, AlertCircle, Laptop } from 'lucide-react';
import { useGenieACSDevices, useRebootGenieACSDevice } from '@/hooks';
import { formatShortDateTime } from '@/lib/timezone';
import WifiConfigModal from '@/components/genieacs/WifiConfigModal';
import clsx from 'clsx';

function getClientStatusColor(count) {
    const val = parseInt(count || 0);
    if (val === 0) return 'text-slate-400';
    if (val <= 3) return 'text-emerald-400';
    if (val <= 6) return 'text-amber-400';
    return 'text-red-400';
}

/**
 * ACS Tab — shows GenieACS (TR-069 CPE) info for a map device and exposes
 * CPE actions (reboot, refresh, WiFi config). Lookup is done by SN against
 * the GenieACS device list for the device's parent router.
 */
export default function AcsTab({ device, timezone }) {
    const routerId = device?.routerId;
    const sn = device?.sn;
    const [isWifiModalOpen, setIsWifiModalOpen] = useState(false);

    const { data: devices, isLoading, error } = useGenieACSDevices(routerId, {
        enabled: !!routerId && !!sn,
    });

    const acsDevice = useMemo(() => {
        if (!devices || !Array.isArray(devices) || !sn) return null;
        const snLower = String(sn).toLowerCase();
        return devices.find(d =>
            String(d._serialNumber || '').toLowerCase() === snLower ||
            String(d._id || '').toLowerCase().includes(snLower)
        ) || null;
    }, [devices, sn]);

    const rebootMutation = useRebootGenieACSDevice();

    if (!routerId || !sn) {
        return (
            <div className="p-6 text-center text-slate-500 text-sm">
                <Router className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>Perangkat ini belum punya Serial Number atau belum ter-link ke router.</p>
                <p className="text-xs mt-2">Pastikan ONU sudah discover lewat OLT supaya SN-nya muncul.</p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="p-6 text-center text-slate-500 text-sm">
                <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin opacity-60" />
                <p>Memuat data dari GenieACS...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6 text-center text-red-400 text-sm">
                <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-60" />
                <p className="font-bold">Gagal mengambil data GenieACS</p>
                <p className="text-xs mt-2 opacity-70">
                    {error.response?.data?.error || 'Cek apakah ACS server bisa dijangkau dan fitur GenieACS diaktifkan untuk router ini.'}
                </p>
            </div>
        );
    }

    if (!acsDevice) {
        return (
            <div className="p-6 text-center text-slate-500 text-sm">
                <Router className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <p>CPE dengan SN <span className="font-mono text-slate-300">{sn}</span> tidak ditemukan di GenieACS.</p>
                <p className="text-xs mt-2">Kemungkinan CPE belum sempat inform ke ACS server, atau menggunakan SN yang berbeda.</p>
            </div>
        );
    }

    const lastInform = acsDevice._lastInform ? formatShortDateTime(acsDevice._lastInform, timezone) : '—';
    const lastInformAge = acsDevice._lastInform ? Date.now() - new Date(acsDevice._lastInform).getTime() : null;
    const isOnlineAcs = lastInformAge != null && lastInformAge < 5 * 60 * 1000; // 5 min

    const handleReboot = () => {
        const confirmed = window.confirm(
            `Reboot CPE "${acsDevice._ssid || sn}" via GenieACS?\n\n` +
            `Pelanggan akan kehilangan koneksi sekitar 1–2 menit.`
        );
        if (!confirmed) return;
        rebootMutation.mutate({ id: acsDevice._id, routerId });
    };

    return (
        <div className="device-modal__content custom-scrollbar" style={{ padding: '1rem 1.5rem' }}>
            {/* Status pill */}
            <div className={clsx(
                'mb-4 px-3 py-2 rounded-lg border text-xs flex items-center justify-between',
                isOnlineAcs
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            )}>
                <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px]">
                        {isOnlineAcs ? 'wifi' : 'wifi_off'}
                    </span>
                    <span className="font-bold">
                        {isOnlineAcs ? 'CPE Online di ACS' : 'CPE Tidak Inform Baru-baru Ini'}
                    </span>
                </div>
                <span className="font-mono opacity-70 text-[10px]">{lastInform}</span>
            </div>

            {/* Info grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                <InfoCard icon={<Wifi className="w-4 h-4 text-cyan-400" />} label="SSID WiFi" value={acsDevice._ssid || '—'} />
                <InfoCard icon={<Router className="w-4 h-4 text-blue-400" />} label="IP Management" value={acsDevice._ip || '—'} mono />
                <InfoCard
                    icon={<Laptop className={clsx('w-4 h-4', getClientStatusColor(acsDevice._clientCount))} />}
                    label="Active Clients"
                    value={`${acsDevice._clientCount ?? 0} Device${(acsDevice._clientCount ?? 0) === 1 ? '' : 's'}`}
                    valueClass={getClientStatusColor(acsDevice._clientCount)}
                />
                <InfoCard icon={<Signal className="w-4 h-4 text-amber-400" />} label="RX Power" value={acsDevice._rxPower ? `${acsDevice._rxPower} dBm` : '—'} mono />
                <InfoCard icon={<Cpu className="w-4 h-4 text-purple-400" />} label="Model" value={acsDevice._productClass || '—'} />
            </div>

            {/* Secondary info */}
            <div className="space-y-2 mb-5 text-xs bg-slate-800/40 rounded-lg p-3 border border-slate-700/40">
                <Row label="Firmware" value={acsDevice._softwareVersion || '—'} valueClass="text-slate-300 font-mono" />
                <Row label="MAC Address" value={acsDevice._macAddress || '—'} valueClass="text-slate-300 font-mono" />
                {acsDevice._pppoeUser && (
                    <Row label="PPPoE User" value={acsDevice._pppoeUser} valueClass="text-slate-300 font-mono" />
                )}
                {acsDevice._temperature && (
                    <Row label="Temperatur" value={`${acsDevice._temperature}°C`} valueClass="text-amber-300" />
                )}
                <Row label="Last Inform" value={lastInform} valueClass="text-slate-300 font-mono" />
                <Row label="Device ID" value={acsDevice._id} valueClass="text-slate-400 font-mono text-[10px]" />
            </div>

            {/* Connected Hosts list */}
            {Array.isArray(acsDevice._connectedHosts) && acsDevice._connectedHosts.length > 0 && (
                <div className="mb-5">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                            <Laptop className="w-3.5 h-3.5" />
                            Connected Devices
                        </div>
                        <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded', getClientStatusColor(acsDevice._clientCount))}>
                            {acsDevice._connectedHosts.length} host{acsDevice._connectedHosts.length === 1 ? '' : 's'}
                        </span>
                    </div>
                    <div className="bg-slate-800/40 rounded-lg border border-slate-700/40 divide-y divide-slate-700/30 max-h-64 overflow-y-auto custom-scrollbar">
                        {acsDevice._connectedHosts.map((host, idx) => {
                            const isActive = host.active !== false; // treat undefined as active
                            return (
                                <div key={idx} className="p-2.5 hover:bg-slate-800/40 transition-colors">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={clsx(
                                            'w-1.5 h-1.5 rounded-full',
                                            isActive ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.6)]' : 'bg-slate-600'
                                        )} />
                                        <span className={clsx('text-xs font-bold truncate flex-1',
                                            isActive ? 'text-slate-200' : 'text-slate-500 line-through')}>
                                            {host.hostname || host.ipAddress || host.macAddress || 'Unknown'}
                                        </span>
                                        {host.interfaceType && (
                                            <span className="text-[9px] px-1.5 py-0.5 bg-slate-700/50 text-slate-400 rounded uppercase font-bold tracking-tight">
                                                {host.interfaceType.includes('Wi') || host.interfaceType.includes('wifi') || host.interfaceType.includes('WLAN') ? 'WiFi' : 'LAN'}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono ml-3.5">
                                        {host.ipAddress && <span>{host.ipAddress}</span>}
                                        {host.macAddress && <span className="truncate">{host.macAddress}</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Actions */}
            <div className="space-y-2">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Aksi GenieACS</div>
                <button
                    type="button"
                    onClick={() => setIsWifiModalOpen(true)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 rounded-lg transition-colors font-medium text-sm"
                >
                    <Wifi className="w-4 h-4" />
                    Ubah SSID / Password WiFi
                </button>
                <button
                    type="button"
                    onClick={handleReboot}
                    disabled={rebootMutation.isPending}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded-lg transition-colors font-medium text-sm disabled:opacity-50"
                >
                    <Power className={clsx('w-4 h-4', rebootMutation.isPending && 'animate-pulse')} />
                    {rebootMutation.isPending ? 'Mengirim perintah...' : 'Reboot CPE via ACS'}
                </button>
            </div>

            {/* WiFi config modal (reuses existing component) */}
            <WifiConfigModal
                isOpen={isWifiModalOpen}
                onClose={() => setIsWifiModalOpen(false)}
                device={acsDevice}
                routerId={routerId}
            />
        </div>
    );
}

function InfoCard({ icon, label, value, mono = false, valueClass = 'text-slate-200' }) {
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
