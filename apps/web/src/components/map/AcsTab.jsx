import React, { useMemo, useState } from 'react';
import { RefreshCw, Wifi, Power, Cpu, Router, Signal, AlertCircle, Laptop, ChevronDown, ChevronRight, Cable } from 'lucide-react';
import { useGenieACSDevices, useGenieACSDevice, useRebootGenieACSDevice } from '@/hooks';
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

function rssiColor(rssi) {
    if (rssi === null || rssi === undefined) return 'text-slate-500';
    if (rssi >= -55) return 'text-emerald-400';
    if (rssi >= -70) return 'text-yellow-400';
    if (rssi >= -80) return 'text-orange-400';
    return 'text-red-400';
}

// Extract WiFi-associated clients from a single WLANConfiguration entry.
// Mirrors WifiTab.getAssociatedDevices so styling stays consistent.
function getAssociatedDevices(wlan) {
    if (!wlan?.AssociatedDevice) return [];
    const clients = [];
    Object.keys(wlan.AssociatedDevice).forEach((key) => {
        if (key.startsWith('_')) return;
        if (!/^\d+$/.test(key)) return;
        const dev = wlan.AssociatedDevice[key];
        if (!dev) return;
        const mac = dev.AssociatedDeviceMACAddress?._value || dev.MACAddress?._value || '';
        if (!mac) return;
        const ip = dev.IPAddress?._value || dev.X_HW_IPAddress?._value || dev.AssociatedDeviceIPAddress?._value || '';
        const rssiRaw = dev.SignalStrength?._value ?? dev.X_HW_RSSI?._value ?? dev.AssociatedDeviceRssi?._value ?? null;
        const rssi = rssiRaw !== null && rssiRaw !== undefined ? parseInt(rssiRaw) : null;
        const hostName = dev.HostName?._value || dev.X_HW_HostName?._value || '';
        clients.push({ mac, ip, rssi, hostName });
    });
    clients.sort((a, b) => {
        if (a.rssi === null) return 1;
        if (b.rssi === null) return -1;
        return b.rssi - a.rssi;
    });
    return clients;
}

// Enumerate every WLANConfiguration entry (TR-098). Each returns
// { index, ssid, enabled, band, clients }.
function getWlanConfigs(fullDevice) {
    if (!fullDevice) return [];
    const lan = fullDevice.InternetGatewayDevice?.LANDevice?.[1] || fullDevice.Device?.LANDevice?.[1];
    if (!lan?.WLANConfiguration) return [];

    const configs = [];
    Object.keys(lan.WLANConfiguration).forEach((key) => {
        if (key.startsWith('_')) return;
        if (!/^\d+$/.test(key)) return;
        const wlan = lan.WLANConfiguration[key];
        if (!wlan) return;

        const ssid = wlan.SSID?._value;
        const enableRaw = wlan.Enable?._value;
        const enabled = enableRaw === true || enableRaw === 'true' || enableRaw === '1' || enableRaw === 1;
        const standard = wlan.Standard?._value || wlan['X_HW_HardwareMode']?._value;
        let band = '2.4G';
        if (standard && /11(ac|ax|a|n5)/i.test(String(standard))) band = '5G';
        else if (parseInt(key) >= 5) band = '5G';

        configs.push({
            index: parseInt(key),
            ssid: ssid || `SSID${key}`,
            enabled,
            band,
            clients: getAssociatedDevices(wlan),
        });
    });

    return configs.sort((a, b) => a.index - b.index);
}

// Normalize MAC to lower-case colon-separated for set comparisons
function normMac(s) {
    return String(s || '').toLowerCase().replace(/-/g, ':').trim();
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

    const acsDeviceFromList = useMemo(() => {
        if (!devices || !Array.isArray(devices) || !sn) return null;
        const snLower = String(sn).toLowerCase();
        return devices.find(d =>
            String(d._serialNumber || '').toLowerCase() === snLower ||
            String(d._id || '').toLowerCase().includes(snLower)
        ) || null;
    }, [devices, sn]);

    // List-view projection omits Hosts.Host (bandwidth saver), so connected
    // clients aren't available there. Fetch full detail by id when we know
    // _id so _connectedHosts is populated.
    const { data: acsDeviceDetail } = useGenieACSDevice(acsDeviceFromList?._id, routerId);
    const acsDevice = acsDeviceDetail || acsDeviceFromList;

    // Build per-interface groupings: LAN (wired) + one section per active SSID.
    // WiFi MAC set is used to subtract WiFi clients from the Hosts.Host list
    // so LAN only contains wired devices.
    const interfaceGroups = useMemo(() => {
        const wlans = getWlanConfigs(acsDevice);
        const wifiMacSet = new Set();
        wlans.forEach((w) => w.clients.forEach((c) => wifiMacSet.add(normMac(c.mac))));

        const hosts = Array.isArray(acsDevice?._connectedHosts) ? acsDevice._connectedHosts : [];
        const lanHosts = hosts.filter((h) => {
            const mac = normMac(h.macAddress);
            if (mac && wifiMacSet.has(mac)) return false; // it's a WiFi client, not LAN
            // Also exclude if InterfaceType clearly says wireless
            const iface = String(h.interfaceType || '').toLowerCase();
            if (iface.includes('wlan') || iface.includes('wifi') || iface.includes('wireless')) return false;
            return true;
        });

        const ssidSections = wlans
            .filter((w) => w.enabled && w.clients.length > 0)
            .map((w) => ({
                key: `ssid-${w.index}`,
                title: w.ssid,
                badge: w.band,
                index: w.index,
                clients: w.clients,
                kind: 'wifi',
            }));

        const sections = [];
        if (lanHosts.length > 0) {
            sections.push({ key: 'lan', title: 'LAN (Kabel)', kind: 'lan', hosts: lanHosts });
        }
        sections.push(...ssidSections);
        return sections;
    }, [acsDevice]);

    const totalConnected = useMemo(() => {
        return interfaceGroups.reduce((sum, s) => sum + (s.kind === 'lan' ? s.hosts.length : s.clients.length), 0);
    }, [interfaceGroups]);

    // One section expanded at a time
    const [expandedSection, setExpandedSection] = useState(null);
    const toggleSection = (key) => setExpandedSection((prev) => (prev === key ? null : key));

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

            {/* Connected Devices — grouped per interface (LAN + each active SSID) */}
            {interfaceGroups.length > 0 && (
                <div className="mb-5">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                            <Laptop className="w-3.5 h-3.5" />
                            Connected Devices
                        </div>
                        <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded', getClientStatusColor(totalConnected))}>
                            {totalConnected} total
                        </span>
                    </div>

                    <div className="space-y-2">
                        {interfaceGroups.map((section) => {
                            const isExpanded = expandedSection === section.key;
                            const count = section.kind === 'lan' ? section.hosts.length : section.clients.length;
                            const Icon = section.kind === 'lan' ? Cable : Wifi;
                            const iconColor = section.kind === 'lan' ? 'text-sky-400' : (section.badge === '5G' ? 'text-purple-400' : 'text-cyan-400');
                            return (
                                <div key={section.key} className="bg-slate-800/40 rounded-lg border border-slate-700/40 overflow-hidden">
                                    <button
                                        type="button"
                                        onClick={() => toggleSection(section.key)}
                                        className="w-full flex items-center justify-between px-3 py-2 hover:bg-slate-800/60 transition-colors text-left"
                                    >
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                            <Icon className={clsx('w-4 h-4 shrink-0', iconColor)} />
                                            <span className="text-xs font-bold text-slate-200 truncate">{section.title}</span>
                                            {section.kind === 'wifi' && section.badge && (
                                                <span className={clsx(
                                                    'text-[9px] px-1.5 py-0.5 rounded font-bold tracking-tight',
                                                    section.badge === '5G'
                                                        ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30'
                                                        : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                                )}>
                                                    {section.badge}
                                                </span>
                                            )}
                                            {section.kind === 'wifi' && (
                                                <span className="text-[9px] px-1.5 py-0.5 bg-slate-700/50 text-slate-400 rounded font-mono">
                                                    #{section.index}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className={clsx('text-[10px] font-bold', getClientStatusColor(count))}>
                                                {count} {section.kind === 'lan' ? 'host' : 'client'}{count === 1 ? '' : 's'}
                                            </span>
                                            {isExpanded
                                                ? <ChevronDown className="w-4 h-4 text-slate-500" />
                                                : <ChevronRight className="w-4 h-4 text-slate-500" />
                                            }
                                        </div>
                                    </button>
                                    {isExpanded && (
                                        <div className="divide-y divide-slate-700/30 border-t border-slate-700/40 max-h-64 overflow-y-auto custom-scrollbar">
                                            {section.kind === 'lan' && section.hosts.map((host, idx) => {
                                                const isActive = host.active !== false;
                                                return (
                                                    <div key={idx} className="p-2.5 hover:bg-slate-800/40 transition-colors">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className={clsx(
                                                                'w-1.5 h-1.5 rounded-full shrink-0',
                                                                isActive ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.6)]' : 'bg-slate-600'
                                                            )} />
                                                            <span className={clsx('text-xs font-bold truncate flex-1',
                                                                isActive ? 'text-slate-200' : 'text-slate-500 line-through')}>
                                                                {host.hostname || host.ipAddress || host.macAddress || 'Unknown'}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono ml-3.5">
                                                            {host.ipAddress && <span>{host.ipAddress}</span>}
                                                            {host.macAddress && <span className="truncate">{host.macAddress}</span>}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {section.kind === 'wifi' && section.clients.map((client, idx) => (
                                                <div key={idx} className="p-2.5 hover:bg-slate-800/40 transition-colors">
                                                    <div className="flex items-center justify-between gap-2 mb-1">
                                                        <span className="text-xs font-bold text-slate-200 font-mono truncate flex-1">
                                                            {client.mac}
                                                        </span>
                                                        <span className={clsx('text-[10px] font-bold shrink-0 font-mono', rssiColor(client.rssi))}>
                                                            {client.rssi !== null ? `${client.rssi} dBm` : '—'}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 text-[10px] text-slate-500 font-mono ml-0">
                                                        {client.ip && <span>{client.ip}</span>}
                                                        {client.hostName && <span className="truncate">{client.hostName}</span>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
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
