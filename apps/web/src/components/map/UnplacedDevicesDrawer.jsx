import React, { useMemo, useState } from 'react';

const UnplacedDevicesDrawer = ({
    isOpen,
    onClose,
    unplacedDevices,
    selectedDevice,
    onSelectDevice
}) => {
    const [searchQuery, setSearchQuery] = useState('');

    // Filter unplaced devices based on search query
    const filteredDevices = useMemo(() => {
        if (!searchQuery.trim()) return unplacedDevices;

        const query = searchQuery.toLowerCase();
        return unplacedDevices.filter(device =>
            (device.name || '').toLowerCase().includes(query) ||
            (device.host || '').toLowerCase().includes(query) ||
            (device.address || '').toLowerCase().includes(query)
        );
    }, [unplacedDevices, searchQuery]);

    // Group devices by type
    const groupedDevices = useMemo(() => {
        const groups = {
            router: [],
            olt: [],
            onu: [],
            netwatch: [],
            pppoe: []
        };

        filteredDevices.forEach(device => {
            const type = device.deviceType || device.type || 'netwatch';
            if (groups[type]) {
                groups[type].push(device);
            } else {
                groups['netwatch'].push(device);
            }
        });

        return groups;
    }, [filteredDevices]);

    const getTypeIcon = (type) => {
        switch (type) {
            case 'router': return 'router';
            case 'olt': return 'hub';
            case 'onu': return 'settings_input_antenna';
            case 'netwatch': return 'analytics';
            case 'pppoe': return 'person';
            default: return 'help';
        }
    };

    const getTypeName = (type) => {
        switch (type) {
            case 'router': return 'Mikrotik Routers';
            case 'olt': return 'OLTs';
            case 'onu': return 'ONUs / Passive Nodes';
            case 'netwatch': return 'Netwatch Entities';
            case 'pppoe': return 'PPPoE Clients';
            default: return 'Others';
        }
    };

    return (
        <div className={`unplaced-devices-drawer ${isOpen ? 'unplaced-devices-drawer--open' : ''}`}>
            <div className="unplaced-devices-drawer__header">
                <div className="unplaced-devices-drawer__title">
                    <span className="material-symbols-outlined">location_off</span>
                    <span>Perangkat Tanpa Lokasi</span>
                </div>
                <button className="device-modal__close" onClick={onClose}>
                    <span className="material-symbols-outlined">close</span>
                </button>
            </div>

            <div className="unplaced-devices-drawer__search">
                <div className="unplaced-search-bar">
                    <span className="material-symbols-outlined unplaced-search-bar__icon">search</span>
                    <input
                        type="text"
                        className="unplaced-search-bar__input"
                        placeholder="Cari perangkat..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                    {searchQuery && (
                        <button
                            className="unplaced-search-bar__clear"
                            onClick={() => setSearchQuery('')}
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    )}
                </div>
            </div>

            <div className="unplaced-devices-drawer__content">
                {unplacedDevices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4 opacity-50">
                        <span className="material-symbols-outlined text-4xl">check_circle</span>
                        <p className="text-sm">Semua perangkat sudah terpasang!</p>
                    </div>
                ) : filteredDevices.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-4 opacity-70">
                        <span className="material-symbols-outlined text-4xl">search_off</span>
                        <p className="text-sm">Pencarian untuk "{searchQuery}" tidak ditemukan.</p>
                        <button
                            className="text-xs text-primary font-bold uppercase tracking-wider hover:underline"
                            onClick={() => setSearchQuery('')}
                        >
                            Reset Pencarian
                        </button>
                    </div>
                ) : (
                    Object.entries(groupedDevices).map(([type, items]) => (
                        items.length > 0 && (
                            <div key={type} className="unplaced-group">
                                <div className="unplaced-group__title">{getTypeName(type)} ({items.length})</div>
                                {items.map(device => (
                                    <div
                                        key={`${type}-${device.id}`}
                                        className={`unplaced-item ${selectedDevice?.id === device.id ? 'unplaced-item--selected' : ''}`}
                                        onClick={() => onSelectDevice(device)}
                                    >
                                        <div className="unplaced-item__info">
                                            <span className="unplaced-item__name">{device.name || device.host || 'Unknown'}</span>
                                            <span className="unplaced-item__host">{device.host || device.address || 'No IP'}</span>
                                        </div>
                                        <div className="unplaced-item__icon">
                                            <span className="material-symbols-outlined text-[18px]">
                                                {getTypeIcon(type)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    ))
                )}
            </div>

            <div className="p-4 bg-blue-500/10 border-t border-blue-500/20">
                <p className="text-[10px] text-blue-400 font-medium italic">
                    💡 Tips: Pilih perangkat dari daftar, lalu klik di mana saja pada peta untuk memasang koordinatnya.
                </p>
            </div>
        </div>
    );
};

export default UnplacedDevicesDrawer;
