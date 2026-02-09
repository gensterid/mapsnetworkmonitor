import React, { useState, useEffect, useMemo } from 'react';
import './map.css';
import SearchableSelect from '../ui/SearchableSelect';

/**
 * DeviceModal - Modal for viewing and editing device properties
 * Includes connection source selection for network topology
 */
const DeviceModal = ({
    isOpen = false,
    device = null,
    routers = [], // Available routers for connection source
    devices = [], // Other devices (clients) for connection source
    onClose,
    onSave,
    onDelete,
    onEditPath,
    isSaving = false,
    routerInterfaces = [], // List of interfaces from the router (for heatmap)
}) => {
    const [formData, setFormData] = useState({
        name: '',
        type: 'router',
        host: '',
        notes: '',
        latitude: '',
        longitude: '',
        // Connection source fields
        connectionType: 'router', // 'router' or 'client'
        connectedToId: '', // ID of the router or client connected to
        targetInterface: '', // Heatmap traffic mapping
    });

    // Sync form data with device prop
    useEffect(() => {
        if (device) {
            setFormData({
                name: device.name || '',
                type: device.deviceType || device.type || 'router',
                host: device.host || '',
                notes: device.notes || '',
                latitude: device.latitude?.toString() || device.lat?.toString() || '',
                longitude: device.longitude?.toString() || device.lng?.toString() || '',
                connectionType: device.connectionType || 'router',
                connectedToId: device.connectedToId || device.routerId || '',
                targetInterface: device.targetInterface || '',
            });
        }
    }, [device]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (onSave) {
            // Determine routerId based on connection
            let targetRouterId = device?.routerId;

            if (formData.connectionType === 'router') {
                targetRouterId = formData.connectedToId;
            } else if (formData.connectedToId) {
                // If connecting to a client, find that client's routerId
                const parentDevice = devices.find(d => d.id === formData.connectedToId);
                if (parentDevice) {
                    targetRouterId = parentDevice.routerId;
                }
            }

            // Construct clean payload
            const payload = {
                id: device?.id, // Keep ID for reference
                routerId: targetRouterId,
                name: formData.name,
                deviceType: formData.type,
                host: formData.host,
                notes: formData.notes,
                latitude: formData.latitude,
                longitude: formData.longitude,
                connectionType: formData.connectionType,
                // Ensure connectedToId is null if empty string
                connectedToId: formData.connectedToId || null,
                targetInterface: formData.targetInterface || null,
            };

            onSave(payload);
        }
    };

    // Filter available connection sources based on type
    const connectionSources = useMemo(() => {
        if (formData.connectionType === 'router') {
            return routers.map(r => ({ id: r.id, name: r.name, host: r.host }));
        } else {
            // Filter out current device from list
            return devices
                .filter(d => d.id !== device?.id)
                .map(d => ({ id: d.id, name: d.name || d.host, host: d.host }));
        }
    }, [formData.connectionType, routers, devices, device]);

    // Filter interfaces for heatmap mapping (exclude PPPoE)
    const interfaceOptions = useMemo(() => {
        return routerInterfaces
            .filter(iface => {
                // "Kecualikan interface ppoe" - exclude types containing 'pppoe'
                const type = (iface.type || '').toLowerCase();
                return !type.includes('pppoe');
            })
            .map(iface => ({
                value: iface.name,
                label: iface.name + (iface.comment ? ` (${iface.comment})` : '')
            }));
    }, [routerInterfaces]);

    if (!isOpen) return null;

    // Check if this is a non-router device (can edit path)
    const isNetwatch = device?.deviceType !== 'router';

    return (
        <div className="device-modal-overlay" onClick={onClose}>
            <div className="device-modal" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="device-modal__header">
                    <h2 className="device-modal__title">
                        {device?.id ? 'Edit Device' : 'Add Device'}
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {(formData.latitude || device?.latitude || device?.lat) && (formData.longitude || device?.longitude || device?.lng) && (
                            <a
                                href={`https://www.google.com/maps?q=${formData.latitude || device?.latitude || device?.lat},${formData.longitude || device?.longitude || device?.lng}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="device-modal__close"
                                style={{ color: '#3b82f6', borderColor: 'rgba(59, 130, 246, 0.3)' }}
                                title="Open in Google Maps"
                            >
                                <span className="material-symbols-outlined">map</span>
                            </a>
                        )}
                        <button
                            className="device-modal__close"
                            onClick={onClose}
                            aria-label="Close"
                            disabled={isSaving}
                        >
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="device-modal__form">
                    <div className="device-modal__content">
                        {/* Device Name */}
                        <div className="device-modal__field">
                            <label className="device-modal__label">Device Name</label>
                            <input
                                type="text"
                                name="name"
                                className="device-modal__input"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="Enter device name"
                                required
                                disabled={isSaving}
                            />
                        </div>

                        {/* Device Type - read only for existing devices */}
                        <div className="device-modal__field">
                            <label className="device-modal__label">Device Type</label>
                            <select
                                name="type"
                                className="device-modal__select"
                                value={formData.type}
                                onChange={handleChange}
                                disabled={isSaving || (device?.id && (device.deviceType === 'router' || device.deviceType === 'pppoe'))}
                            >
                                <option value="router">Router</option>
                                <option value="olt">OLT</option>
                                <option value="odp">ODP</option>
                                <option value="client">Client / Netwatch</option>
                                <option value="pppoe">PPPoE Client</option>
                            </select>
                        </div>

                        {/* Host/IP */}
                        <div className="device-modal__field">
                            <label className="device-modal__label">Host / IP Address</label>
                            <input
                                type="text"
                                name="host"
                                className="device-modal__input"
                                value={formData.host}
                                onChange={handleChange}
                                placeholder="192.168.1.1"
                                disabled={isSaving}
                            />
                        </div>

                        {/* Location - Latitude */}
                        <div className="device-modal__field-row">
                            <div className="device-modal__field" style={{ flex: 1 }}>
                                <label className="device-modal__label">Latitude</label>
                                <input
                                    type="text"
                                    name="latitude"
                                    className="device-modal__input"
                                    value={formData.latitude}
                                    onChange={handleChange}
                                    onPaste={(e) => {
                                        const pasted = e.clipboardData.getData('text');
                                        if (pasted.includes(',')) {
                                            e.preventDefault();
                                            const [lat, lng] = pasted.split(',').map(s => s.trim());
                                            if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
                                                setFormData(prev => ({ ...prev, latitude: lat, longitude: lng }));
                                            }
                                        }
                                    }}
                                    placeholder="-8.123456"
                                    disabled={isSaving}
                                />
                            </div>
                            <div className="device-modal__field" style={{ flex: 1 }}>
                                <label className="device-modal__label">Longitude</label>
                                <input
                                    type="text"
                                    name="longitude"
                                    className="device-modal__input"
                                    value={formData.longitude}
                                    onChange={handleChange}
                                    onPaste={(e) => {
                                        const pasted = e.clipboardData.getData('text');
                                        if (pasted.includes(',')) {
                                            e.preventDefault();
                                            const [lat, lng] = pasted.split(',').map(s => s.trim());
                                            if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
                                                setFormData(prev => ({ ...prev, latitude: lat, longitude: lng }));
                                            }
                                        }
                                    }}
                                    placeholder="120.123456"
                                    disabled={isSaving}
                                />
                            </div>
                        </div>

                        {/* Connection Source (for non-router devices) */}
                        {isNetwatch && (
                            <>
                                <div className="device-modal__section-title" style={{
                                    color: 'rgba(255,255,255,0.5)',
                                    fontSize: 11,
                                    textTransform: 'uppercase',
                                    marginTop: 12,
                                    marginBottom: 8,
                                    letterSpacing: 0.5,
                                }}>
                                    Connection Source
                                </div>

                                {/* Connection Type */}
                                <div className="device-modal__field">
                                    <label className="device-modal__label">Connected To</label>
                                    <select
                                        name="connectionType"
                                        className="device-modal__select"
                                        value={formData.connectionType}
                                        onChange={handleChange}
                                        disabled={isSaving}
                                    >
                                        <option value="router">Direct to Router</option>
                                        <option value="client">Through Another Client</option>
                                    </select>
                                </div>

                                {/* Select Source Device */}
                                <div className="device-modal__field">
                                    <label className="device-modal__label">
                                        {formData.connectionType === 'router' ? 'Select Router' : 'Select Client'}
                                    </label>
                                    <SearchableSelect
                                        name="connectedToId"
                                        options={connectionSources.map(source => ({
                                            value: source.id,
                                            label: `${source.name} (${source.host})`
                                        }))}
                                        value={formData.connectedToId}
                                        onChange={handleChange}
                                        placeholder={formData.connectionType === 'router' ? "Select a router..." : "Select a client..."}
                                        disabled={isSaving}
                                    />
                                </div>


                                {/* Target Interface (Heatmap) */}
                                <div className="device-modal__field">
                                    <label className="device-modal__label">
                                        Traffic Source Interface (Heatmap)
                                        <span style={{ marginLeft: 6, fontSize: 10, color: '#64748b', fontWeight: 400 }}>
                                            (Optional) Matches 'tx-rate' from router interface
                                        </span>
                                    </label>
                                    <SearchableSelect
                                        name="targetInterface"
                                        options={interfaceOptions}
                                        value={formData.targetInterface}
                                        onChange={handleChange}
                                        placeholder="Select interface..."
                                        disabled={isSaving}
                                    />
                                </div>
                            </>
                        )}

                        {/* Notes */}
                        <div className="device-modal__field">
                            <label className="device-modal__label">Notes</label>
                            <textarea
                                name="notes"
                                className="device-modal__input"
                                value={formData.notes}
                                onChange={handleChange}
                                placeholder="Additional notes..."
                                rows={3}
                                style={{ resize: 'vertical' }}
                                disabled={isSaving}
                            />
                        </div>

                        {/* Status Info (read-only) */}
                        {device?.status && (
                            <div className="device-modal__field">
                                <label className="device-modal__label">Status</label>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    color: device.status === 'online' || device.status === 'up' ? '#10b981' : '#ef4444',
                                    fontWeight: 500,
                                }}>
                                    <span
                                        style={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: '50%',
                                            background: 'currentColor',
                                        }}
                                    />
                                    {device.status?.toUpperCase()}
                                </div>
                            </div>
                        )}

                        {/* Traffic Stats (Heatmap Mode / Read Only) */}
                        {device?.status && ['up', 'online'].includes(device.status) && (device.txRate > 0 || device.rxRate > 0) && (
                            <div className="device-modal__field" style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                                <label className="device-modal__label">
                                    <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 4, color: '#60a5fa' }}>monitor_heart</span>
                                    Traffic Analysis
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                    <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: 8, borderRadius: 6, textAlign: 'center' }}>
                                        <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>RX (Desc)</div>
                                        <div style={{ fontFamily: 'monospace', color: '#34d399', fontWeight: 'bold' }}>
                                            {device.rxRate >= 1000000 ? `${(device.rxRate / 1000000).toFixed(1)} Mbps` : device.rxRate >= 1000 ? `${(device.rxRate / 1000).toFixed(1)} Kbps` : `${device.rxRate} bps`}
                                        </div>
                                    </div>
                                    <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: 8, borderRadius: 6, textAlign: 'center' }}>
                                        <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 2 }}>TX (Upload)</div>
                                        <div style={{ fontFamily: 'monospace', color: '#60a5fa', fontWeight: 'bold' }}>
                                            {device.txRate >= 1000000 ? `${(device.txRate / 1000000).toFixed(1)} Mbps` : device.txRate >= 1000 ? `${(device.txRate / 1000).toFixed(1)} Kbps` : `${device.txRate} bps`}
                                        </div>
                                    </div>
                                </div>
                                {device.targetInterface && (
                                    <div style={{ marginTop: 6, fontSize: 11, color: '#64748b', textAlign: 'right' }}>
                                        Interface: <span style={{ fontFamily: 'monospace', color: '#94a3b8' }}>{device.targetInterface}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="device-modal__actions">
                        {/* Edit Path Button */}
                        {device?.id && onEditPath && isNetwatch && (
                            <button
                                type="button"
                                className="device-modal__btn device-modal__btn--secondary"
                                onClick={() => {
                                    onClose();
                                    onEditPath(device);
                                }}
                                disabled={isSaving}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                                    timeline
                                </span>
                                Edit Jalur (Geser/Tarik)
                            </button>
                        )}

                        {/* Save Button */}
                        <button
                            type="submit"
                            className="device-modal__btn device-modal__btn--primary"
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18, animation: 'spin 1s linear infinite' }}>
                                        sync
                                    </span>
                                    Saving...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                                        save
                                    </span>
                                    Save Device
                                </>
                            )}
                        </button>

                        {/* Delete Button */}
                        {device?.id && onDelete && (
                            <button
                                type="button"
                                className="device-modal__btn device-modal__btn--danger"
                                onClick={(e) => {
                                    e.preventDefault(); // Keep preventDefault to avoid form submit
                                    if (confirm('Yakin ingin menghapus perangkat ini?')) {
                                        onDelete(device);
                                    }
                                }}
                                disabled={isSaving}
                            >
                                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                                    delete
                                </span>
                                Hapus Perangkat
                            </button>
                        )}
                    </div>
                </form>
            </div >
        </div >
    );
};

export default DeviceModal;
