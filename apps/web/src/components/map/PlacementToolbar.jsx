import React from 'react';

const PlacementToolbar = ({
    selectedDevice,
    onCancel
}) => {
    if (!selectedDevice) return null;

    const deviceName = selectedDevice.name || selectedDevice.host || 'Unknown Device';
    const type = selectedDevice.deviceType || selectedDevice.type || 'device';

    return (
        <div className="placement-toolbar">
            <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center animate-pulse">
                    <span className="material-symbols-outlined text-white">location_on</span>
                </div>

                <div className="placement-toolbar__text">
                    <div className="placement-toolbar__title">MENUNGGU PENEMPATAN: {deviceName}</div>
                    <div className="placement-toolbar__sub">Klik di mana saja pada peta untuk menentukan lokasi {type} ini.</div>
                </div>

                <div className="h-8 w-px bg-white/20 mx-2"></div>

                <button
                    className="placement-toolbar__cancel"
                    onClick={onCancel}
                >
                    Batalkan
                </button>
            </div>
        </div>
    );
};

export default PlacementToolbar;
