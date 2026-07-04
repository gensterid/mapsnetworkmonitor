import React, { useState, useEffect, useMemo } from 'react';
import './map.css';
import SearchableSelect from '../ui/SearchableSelect';
import { DeleteConfirmationModal } from '../ui/DeleteConfirmationModal';
import { X, Trash2, Save, Edit2, Link as LinkIcon, Info, Settings, History, Radio, Router } from 'lucide-react';
import HistoryTab from '../router/tabs/HistoryTab';
import OltTab from './OltTab';
import AcsTab from './AcsTab';
import { useAppTimezone } from '@/hooks';
import { CORE_COUNTS, coreColor, buildCores } from '@/lib/fiberColors';

// DB enum device type yang valid. 'netwatch' adalah tipe map-node UI, BUKAN
// device type DB — harus dinormalisasi ke 'client'.
const VALID_DEVICE_TYPES = ['client', 'olt', 'odp', 'router', 'switch'];
const normalizeDeviceType = (t) => (VALID_DEVICE_TYPES.includes(t) ? t : 'client');

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
    isDeleting = false,
    routerInterfaces = [], // List of interfaces from the router (for heatmap)
    initialTab = 'settings',
    onStartPicking = null, // Callback to start map click capture
    isPicking = false, // Current picking state
}) => {
    const [activeTab, setActiveTab] = useState(initialTab);
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
        linkedOnuId: '', // Manual link to ONU inventory
        portCapacity: 8, // ODP Port Capacity
        linkLocked: false, // Prevent auto-linkage from overwriting manual choice
    });

    // Penanda jarak di garis: [{ side:'source'|'dest', meters, label }]
    const [distMarkers, setDistMarkers] = useState([]);
    const [dmDraft, setDmDraft] = useState({ meters: '', side: 'source', label: '' });

    const addDistMarker = () => {
        const meters = parseFloat(dmDraft.meters);
        if (!(meters >= 0)) return;
        setDistMarkers(list => [...list, { side: dmDraft.side === 'dest' ? 'dest' : 'source', meters, label: dmDraft.label.trim() }]);
        setDmDraft({ meters: '', side: dmDraft.side, label: '' });
    };

    // Fiber multi-core: { coreCount, cores:[{ i, color, dest, note }] } | null
    const [fiber, setFiber] = useState(null);
    // Accordion untuk section tambahan: 'distance' | 'fiber' | null (default null
    // → keduanya minimize supaya edit device leluasa; buka satu → yang lain nutup).
    const [openExtra, setOpenExtra] = useState(null);
    // Apakah operator mengubah Device Type. Kalau TIDAK, jangan kirim deviceType
    // saat save → backend pertahankan tipe asli (ODP tetap ODP, client tetap client).
    const [typeTouched, setTypeTouched] = useState(false);
    const setCoreCount = (count) => {
        const c = parseInt(count) || 0;
        if (!c) { setFiber(null); return; }
        setFiber(prev => ({ coreCount: c, cores: buildCores(c, prev?.cores || []) }));
    };
    const updateCore = (i, field, value) => {
        setFiber(prev => prev ? ({ ...prev, cores: prev.cores.map(c => c.i === i ? { ...c, [field]: value } : c) }) : prev);
    };

    const [availableOnus, setAvailableOnus] = useState([]);
    const [isLoadingOnus, setIsLoadingOnus] = useState(false);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const timezone = useAppTimezone();

    // Show OLT tab if device is linked to ONU inventory
    const showOltTab = !!(device?.linkedOnuId || device?.oltId || device?.sn);
    // Show ACS tab if device has SN + parent router (required for GenieACS lookup)
    const showAcsTab = !!(device?.sn && device?.routerId);

    useEffect(() => {
        if (isOpen) {
            setActiveTab(initialTab);
            setIsDeleteConfirmOpen(false); // Reset delete state when modal opens
        }
    }, [isOpen, initialTab]);

    // Sync form data with device prop
    useEffect(() => {
        if (device) {
            const isNew = device.isNew || !device.id;
            
            setFormData(prev => {
                // Determine if we should reset the form fields (Name/Host/Notes)
                // We reset if:
                // 1. We just switched from a real device to a NEW device (Addition mode)
                // 2. We just switched from one real device to a DIFFERENT real device
                const isDifferentDevice = prev.id !== (device.id || null);
                const isFreshAddition = isNew && prev.id !== null;
                const shouldResetFields = isDifferentDevice || isFreshAddition;

                const base = shouldResetFields ? {} : prev;

                return {
                    ...base,
                    id: device.id || null,
                    
                    // Preserve or initialize Name
                    name: shouldResetFields 
                        ? (isNew ? '' : (device.name || '')) 
                        : (prev.name || device.name || ''),
                        
                    // Preserve or initialize Type. Normalize generic map-node
                    // type 'netwatch' → 'client' (DB enum tidak punya 'netwatch';
                    // option dropdown juga tidak ada → kalau dibiarkan, select
                    // mismatch + backend tolak 400).
                    // Device baru / quick-place tanpa type eksplisit → default
                    // 'client' (Client/Netwatch), BUKAN 'router', supaya konsisten
                    // dengan enum DB dan tidak memicu error deviceType lagi.
                    type: normalizeDeviceType(
                        device.deviceType || device.type || (shouldResetFields && isNew ? 'client' : prev.type),
                    ),
                    
                    // Preserve or initialize Host/Notes
                    host: shouldResetFields 
                        ? (isNew ? '' : (device.host || '')) 
                        : (prev.host || device.host || ''),
                    notes: shouldResetFields 
                        ? (isNew ? '' : (device.notes || '')) 
                        : (prev.notes || device.notes || ''),
                    
                    // Coordinates ALWAYS sync from props (source of truth from map/picking)
                    latitude: device.latitude?.toString() || device.lat?.toString() || (shouldResetFields ? '' : prev.latitude) || '',
                    longitude: device.longitude?.toString() || device.lng?.toString() || (shouldResetFields ? '' : prev.longitude) || '',
                    
                    // Connection handles
                    connectionType: device.connectionType || (shouldResetFields ? 'router' : prev.connectionType) || 'router',
                    connectedToId: device.connectedToId || device.routerId || (shouldResetFields ? (isNew ? (device.routerId || '') : '') : prev.connectedToId) || '',
                    targetInterface: device.targetInterface || (shouldResetFields ? '' : prev.targetInterface) || '',
                    linkedOnuId: device.linkedOnuId || (shouldResetFields ? '' : prev.linkedOnuId) || '',
                    portCapacity: device.portCapacity || (shouldResetFields ? 8 : prev.portCapacity) || 8,
                    linkLocked: device.linkLocked ?? (shouldResetFields ? false : prev.linkLocked) ?? false,
                    splitterRatio: device.splitterRatio || (shouldResetFields ? '' : prev.splitterRatio) || '',
                };
            });
        }
    }, [device?.id, device?.isNew, device?.latitude, device?.longitude, device?.lat, device?.lng]);

    // Init penanda jarak — effect TERPISAH supaya ikut ter-update saat data
    // device (distanceMarkers) berubah dari refetch, tidak cuma saat id berubah.
    useEffect(() => {
        const dm = device?.distanceMarkers;
        try {
            setDistMarkers(Array.isArray(dm) ? dm : (dm ? JSON.parse(dm) : []));
        } catch { setDistMarkers([]); }
    }, [device?.id, device?.distanceMarkers]);

    // Reset "type disentuh" tiap ganti device.
    useEffect(() => { setTypeTouched(false); }, [device?.id]);

    // Init fiber core.
    useEffect(() => {
        const fc = device?.fiberCores;
        try {
            const parsed = typeof fc === 'string' ? (fc ? JSON.parse(fc) : null) : fc;
            setFiber(parsed && parsed.coreCount ? parsed : null);
        } catch { setFiber(null); }
    }, [device?.id, device?.fiberCores]);

    // Fetch available ONUs for the selected router
    useEffect(() => {
        const fetchOnus = async (routerId) => {
            if (!routerId) {
                setAvailableOnus([]);
                return;
            }
            setIsLoadingOnus(true);
            try {
                const { apiClient } = await import('@/lib/api');
                const res = await apiClient.get(`/olts/onus/by-router/${routerId}`);
                // Use .data.data if wrapped, or .data if not, ensuring it's always an array
                const data = res.data?.data || (Array.isArray(res.data) ? res.data : []);
                setAvailableOnus(data);
            } catch (err) {
                console.error('Failed to fetch ONUs for dropdown:', err);
                setAvailableOnus([]);
            } finally {
                setIsLoadingOnus(false);
            }
        };

        let targetRouterId = null;
        if (formData.connectionType === 'router' && formData.connectedToId) {
            targetRouterId = formData.connectedToId;
        } else if (device?.routerId) {
            targetRouterId = device.routerId;
        }

        fetchOnus(targetRouterId);
    }, [formData.connectedToId, formData.connectionType, device?.routerId]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => {
            const next = { ...prev, [name]: value };
            // Switching the device type to ODP must clear any previously-picked
            // ONU link — the UI hides the field for ODP, and we don't want a
            // stale linkedOnuId to be persisted on save.
            if (name === 'type' && value === 'odp' && prev.linkedOnuId) {
                next.linkedOnuId = '';
            }
            return next;
        });
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
                deviceType: normalizeDeviceType(formData.type),
                host: formData.host,
                notes: formData.notes,
                latitude: formData.latitude,
                longitude: formData.longitude,
                connectionType: formData.connectionType,
                // Ensure connectedToId is null if empty string
                connectedToId: formData.connectedToId || null,
                targetInterface: formData.targetInterface || null,
                linkedOnuId: formData.linkedOnuId || null,
                portCapacity: parseInt(formData.portCapacity) || 8,
                linkLocked: formData.linkLocked,
                splitterRatio: formData.splitterRatio || null,
                // Penanda jarak → JSON string (atau null kalau kosong).
                distanceMarkers: distMarkers.length ? JSON.stringify(distMarkers) : null,
                // Fiber multi-core → JSON string (atau null).
                fiberCores: (fiber && fiber.coreCount) ? JSON.stringify(fiber) : null,
            };

            // Pertahankan tipe device: kalau operator TIDAK mengubah dropdown
            // Device Type pada device existing, jangan kirim deviceType → backend
            // biarkan tipe asli (cegah ODP tak sengaja jadi client).
            if (device?.id && !device?.isNew && !typeTouched) {
                delete payload.deviceType;
            }

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

    // Opsi tujuan core = SEMUA device di HILIR device ini (anak, cucu, cicit —
    // via connectedToId), bukan cuma anak langsung. Endpoint boleh beberapa
    // lompatan; warna core nanti melukis seluruh jalur dari kabel sampai endpoint.
    const coreDestOptions = useMemo(() => {
        if (!device?.id) return [];
        // Index anak per parent → telusuri subtree.
        const childrenBy = new Map();
        for (const d of devices) {
            if (!d.connectedToId) continue;
            if (!childrenBy.has(d.connectedToId)) childrenBy.set(d.connectedToId, []);
            childrenBy.get(d.connectedToId).push(d);
        }
        const opts = [];
        const seen = new Set();
        const visited = new Set();
        const stack = [...(childrenBy.get(device.id) || [])];
        while (stack.length) {
            const d = stack.pop();
            if (visited.has(d.id)) continue; // cycle guard
            visited.add(d.id);
            const nm = d.name || d.host || d.id;
            if (!seen.has(nm)) {
                seen.add(nm);
                const t = d.deviceType || d.type;
                opts.push({ value: nm, label: t ? `${nm} (${t})` : nm });
            }
            for (const ch of (childrenBy.get(d.id) || [])) stack.push(ch);
        }
        return opts.sort((a, b) => a.label.localeCompare(b.label));
    }, [devices, device?.id]);

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
        <div 
            className={`device-modal-overlay ${isPicking ? 'device-modal-overlay--picking' : ''}`} 
            onClick={() => !isPicking && onClose()}
        >
            <div 
                className={`device-modal ${isPicking ? 'device-modal--picking' : ''}`}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="device-modal__header">
                    <h2 className="device-modal__title">
                        {device?.id ? (activeTab === 'history' ? 'Device History' : 'Edit Device') : 'Add Device'}
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

                {/* Tabs */}
                {device?.id && (
                    <div className="device-modal__tabs">
                        <div
                            className={`device-modal__tab ${activeTab === 'settings' ? 'device-modal__tab--active' : ''}`}
                            onClick={() => setActiveTab('settings')}
                        >
                            <Settings className="w-4 h-4" />
                            Settings
                        </div>
                        <div
                            className={`device-modal__tab ${activeTab === 'history' ? 'device-modal__tab--active' : ''}`}
                            onClick={() => setActiveTab('history')}
                        >
                            <History className="w-4 h-4" />
                            History
                        </div>
                        {showOltTab && (
                            <div
                                className={`device-modal__tab ${activeTab === 'olt' ? 'device-modal__tab--active' : ''}`}
                                onClick={() => setActiveTab('olt')}
                                title="Info & aksi dari sisi OLT"
                            >
                                <Radio className="w-4 h-4" />
                                OLT
                            </div>
                        )}
                        {showAcsTab && (
                            <div
                                className={`device-modal__tab ${activeTab === 'acs' ? 'device-modal__tab--active' : ''}`}
                                onClick={() => setActiveTab('acs')}
                                title="Info & aksi dari sisi GenieACS"
                            >
                                <Router className="w-4 h-4" />
                                ACS
                            </div>
                        )}
                    </div>
                )}

                {/* Content */}
                {activeTab === 'history' ? (
                    <div className="device-modal__content custom-scrollbar" style={{ padding: 0 }}>
                        <HistoryTab
                            routerId={device?.routerId}
                            deviceName={device?.name}
                            deviceHost={device?.host}
                            onuId={device?.linkedOnuId || ((device?.type === 'onu' || device?.deviceType === 'onu' || device?.device_type === 'onu') ? device?.id : null)}
                        />
                    </div>
                ) : activeTab === 'olt' ? (
                    <OltTab device={device} timezone={timezone} />
                ) : activeTab === 'acs' ? (
                    <AcsTab device={device} timezone={timezone} />
                ) : (
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
                                    onChange={(e) => { setTypeTouched(true); handleChange(e); }}
                                    disabled={isSaving || (device?.id && (device.deviceType === 'router' || device.deviceType === 'pppoe'))}
                                >
                                    <option value="router">Router</option>
                                    <option value="olt">OLT</option>
                                    <option value="odp">ODP</option>
                                    <option value="client">Client / Netwatch</option>
                                    <option value="pppoe">PPPoE Client</option>
                                </select>
                            </div>

                            {/* ODP Port Capacity */}
                            {formData.type === 'odp' && (
                                <div className="device-modal__field">
                                    <label className="device-modal__label">
                                        Port Capacity
                                        <span style={{ marginLeft: 6, fontSize: 10, color: '#64748b', fontWeight: 400 }}>
                                            Total ports in this ODP
                                        </span>
                                    </label>
                                    <input
                                        type="number"
                                        name="portCapacity"
                                        className="device-modal__input"
                                        value={formData.portCapacity}
                                        onChange={handleChange}
                                        min="1"
                                        max="128"
                                    />
                                </div>
                            )}

                            {/* ODP Splitter Ratio */}
                            {formData.type === 'odp' && (
                                <div className="device-modal__field">
                                    <label className="device-modal__label">
                                        Splitter Ratio
                                        <span style={{ marginLeft: 6, fontSize: 10, color: '#64748b', fontWeight: 400 }}>
                                            e.g. 1:8, 5:95, 10:90
                                        </span>
                                    </label>
                                    <input
                                        type="text"
                                        name="splitterRatio"
                                        className="device-modal__input"
                                        value={formData.splitterRatio}
                                        onChange={handleChange}
                                        placeholder="5:95"
                                        disabled={isSaving}
                                    />
                                </div>
                            )}

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

                            {/* Location - Latitude & Longitude */}
                            <div className="device-modal__field" style={{ gap: 4 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                                    <label className="device-modal__label">Location Coordinates</label>
                                    {onStartPicking && (
                                        <button
                                            type="button"
                                            className={`device-modal__pick-btn-text ${isPicking ? 'device-modal__pick-btn-text--active' : ''}`}
                                            onClick={() => onStartPicking(!isPicking)}
                                            style={{
                                                fontSize: '11px',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                color: isPicking ? '#3b82f6' : '#60a5fa',
                                                background: 'transparent',
                                                border: 'none',
                                                cursor: 'pointer',
                                                padding: '2px 4px',
                                                borderRadius: '4px'
                                            }}
                                        >
                                            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                                                {isPicking ? 'near_me' : 'add_location_alt'}
                                            </span>
                                            {isPicking ? 'Klik di Peta...' : 'Pilih dari Peta'}
                                        </button>
                                    )}
                                </div>
                                <div className="device-modal__field-row">
                                    <div className="device-modal__field" style={{ flex: 1 }}>
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
                                            placeholder="Latitude"
                                            disabled={isSaving}
                                        />
                                    </div>
                                    <div className="device-modal__field" style={{ flex: 1 }}>
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
                                            placeholder="Longitude"
                                            disabled={isSaving}
                                        />
                                    </div>
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

                                    {/* Link to ONU (Manual) — ODP is a passive splitter, not a CPE,
                                        so linking it to a specific ONU does not apply. */}
                                    {formData.type !== 'odp' && (
                                        <div className="device-modal__field" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: 16, paddingTop: 16 }}>
                                            <label className="device-modal__label">
                                                Link to OLT ONU (Manual)
                                                <span style={{ marginLeft: 6, fontSize: 10, color: '#64748b', fontWeight: 400 }}>
                                                    Optional fallback for passive devices
                                                </span>
                                            </label>
                                            <SearchableSelect
                                                name="linkedOnuId"
                                                options={(Array.isArray(availableOnus) ? availableOnus : []).map(onu => ({
                                                    value: onu.id,
                                                    label: `${onu.name || 'Unnamed ONU'} [SN: ${onu.sn}]`
                                                }))}
                                                value={formData.linkedOnuId}
                                                onChange={handleChange}
                                                placeholder={isLoadingOnus ? "Loading ONUs..." : "Select ONU to link..."}
                                                disabled={isSaving || isLoadingOnus}
                                            />
                                            {isLoadingOnus && <div className="text-[10px] text-blue-400 mt-1">Fetching ONUs from OLTs...</div>}

                                            {/* Auto-link status + lock toggle */}
                                            {device?.id && (device.linkSource || device.linkLocked) && (
                                                <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                                    <div style={{ fontSize: 10, color: '#64748b' }}>
                                                        <span style={{ color: '#94a3b8', fontWeight: 600 }}>Auto-link: </span>
                                                        {device.linkSource === 'sn' ? 'SN match' :
                                                         device.linkSource === 'pppoe_user' ? 'PPPoE user' :
                                                         device.linkSource === 'pppoe_ip' ? 'PPPoE IP' :
                                                         device.linkSource === 'mgmt_ip' ? 'TR-069 IP' :
                                                         device.linkSource === 'host' ? 'Host IP' :
                                                         device.linkSource === 'name_exact' ? 'Name match' :
                                                         device.linkSource === 'name_fuzzy' ? 'Name fuzzy' :
                                                         device.linkSource || '—'}
                                                    </div>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 10 }}>
                                                        <span style={{ color: formData.linkLocked ? '#f59e0b' : '#64748b' }}>
                                                            {formData.linkLocked ? '🔒 Locked' : '🔓 Unlocked'}
                                                        </span>
                                                        <input
                                                            type="checkbox"
                                                            checked={!!formData.linkLocked}
                                                            onChange={e => setFormData(prev => ({ ...prev, linkLocked: e.target.checked }))}
                                                            disabled={isSaving}
                                                            title={formData.linkLocked ? 'Click to allow auto-linkage to update this entry' : 'Click to lock — prevent auto-linkage from overwriting'}
                                                            style={{ accentColor: '#f59e0b', width: 14, height: 14, cursor: 'pointer' }}
                                                        />
                                                    </label>
                                                </div>
                                            )}
                                        </div>
                                    )}
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

                        {/* Penanda Jarak di Garis */}
                        {device?.id && (
                            <div className="device-modal__field" style={{ marginTop: 4, padding: '0 20px' }}>
                                <button type="button" onClick={() => setOpenExtra(o => (o === 'distance' ? null : 'distance'))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                    <span className="device-modal__label" style={{ margin: 0 }}>Penanda Jarak di Garis{distMarkers.length ? ` (${distMarkers.length})` : ''}</span>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#94a3b8', transition: 'transform .15s', transform: openExtra === 'distance' ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                                </button>
                                {openExtra === 'distance' && (<div style={{ marginTop: 8 }}>
                                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
                                    Tandai titik sejauh X meter dari sisi source / destination (mis. lokasi closure/sambungan).
                                </div>
                                {distMarkers.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
                                        {distMarkers.map((m, i) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(15,23,42,0.5)', border: '1px solid rgba(148,163,184,0.2)', borderRadius: 6, padding: '4px 8px' }}>
                                                <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: m.side === 'dest' ? 'rgba(245,158,11,0.15)' : 'rgba(6,182,212,0.15)', color: m.side === 'dest' ? '#f59e0b' : '#06b6d4' }}>
                                                    {m.side === 'dest' ? 'DEST' : 'SOURCE'}
                                                </span>
                                                <span style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 700 }}>{m.meters} m</span>
                                                {m.label && <span style={{ fontSize: 11, color: '#94a3b8' }}>· {m.label}</span>}
                                                <button type="button" onClick={() => setDistMarkers(list => list.filter((_, idx) => idx !== i))} style={{ marginLeft: 'auto', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', display: 'flex' }} title="Hapus">
                                                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <input
                                        type="number" min="0" step="1"
                                        value={dmDraft.meters}
                                        onChange={(e) => setDmDraft(d => ({ ...d, meters: e.target.value }))}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDistMarker(); } }}
                                        placeholder="meter"
                                        style={{ width: 80, background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, padding: '5px 8px', color: '#e2e8f0', fontSize: 12 }}
                                    />
                                    <select
                                        value={dmDraft.side}
                                        onChange={(e) => setDmDraft(d => ({ ...d, side: e.target.value }))}
                                        style={{ background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, padding: '5px 8px', color: '#e2e8f0', fontSize: 12 }}
                                    >
                                        <option value="source">dari Source</option>
                                        <option value="dest">dari Destination</option>
                                    </select>
                                    <input
                                        type="text"
                                        value={dmDraft.label}
                                        onChange={(e) => setDmDraft(d => ({ ...d, label: e.target.value }))}
                                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDistMarker(); } }}
                                        placeholder="label (opsional)"
                                        style={{ flex: '1 1 90px', minWidth: 0, boxSizing: 'border-box', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, padding: '5px 8px', color: '#e2e8f0', fontSize: 12 }}
                                    />
                                    <button type="button" onClick={addDistMarker} className="device-modal__btn device-modal__btn--secondary" style={{ padding: '5px 10px' }}>
                                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
                                    </button>
                                </div>
                                </div>)}
                            </div>
                        )}

                        {/* Fiber Multi-Core */}
                        {device?.id && (
                            <div className="device-modal__field" style={{ marginTop: 4, padding: '0 20px' }}>
                                <button type="button" onClick={() => setOpenExtra(o => (o === 'fiber' ? null : 'fiber'))} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                                    <span className="device-modal__label" style={{ margin: 0 }}>Fiber Core{fiber?.coreCount ? ` (${fiber.coreCount} core)` : ''}</span>
                                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#94a3b8', transition: 'transform .15s', transform: openExtra === 'fiber' ? 'rotate(180deg)' : 'none' }}>expand_more</span>
                                </button>
                                {openExtra === 'fiber' && (<div style={{ marginTop: 8 }}>
                                <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>
                                    Warna core standar TIA-598. Isi tujuan tiap core (mis. ODP B).
                                </div>
                                <select
                                    value={fiber?.coreCount || ''}
                                    onChange={(e) => setCoreCount(e.target.value)}
                                    className="device-modal__select"
                                    style={{ width: '100%', marginBottom: fiber ? 8 : 0 }}
                                >
                                    <option value="">— Tidak ada / non-fiber —</option>
                                    {CORE_COUNTS.map(c => <option key={c} value={c}>{c} core</option>)}
                                </select>
                                {fiber && Array.isArray(fiber.cores) && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                                        {fiber.cores.map((c) => {
                                            const col = coreColor(c.i);
                                            return (
                                                <div key={c.i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span title={col.name} style={{ width: 16, height: 16, borderRadius: 4, background: col.hex, border: '1px solid rgba(255,255,255,0.35)', flexShrink: 0 }} />
                                                    <span style={{ fontSize: 11, color: '#94a3b8', width: 46, flexShrink: 0 }}>C{c.i} · {col.name}</span>
                                                    <select
                                                        value={c.dest || ''}
                                                        onChange={(e) => updateCore(c.i, 'dest', e.target.value)}
                                                        disabled={isSaving}
                                                        style={{ flex: '1 1 0', minWidth: 0, boxSizing: 'border-box', background: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 6, padding: '4px 8px', color: '#e2e8f0', fontSize: 12 }}
                                                    >
                                                        <option value="">— pilih tujuan —</option>
                                                        {coreDestOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                                    </select>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                                </div>)}
                            </div>
                        )}

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
                                        e.preventDefault();
                                        setIsDeleteConfirmOpen(true);
                                    }}
                                    disabled={isSaving || isDeleting}
                                >
                                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                                        delete
                                    </span>
                                    Hapus Perangkat
                                </button>
                            )}
                        </div>
                    </form>
                )}
            </div>

            <DeleteConfirmationModal
                isOpen={isDeleteConfirmOpen}
                onClose={() => setIsDeleteConfirmOpen(false)}
                onConfirm={(deleteFromMikrotik) => {
                    onDelete(deleteFromMikrotik);
                    // Deletion handler will close the modal locally on success
                }}
                itemName={device?.name || device?.host}
                message="Yakin ingin menghapus perangkat ini dari peta?"
                showMikrotikOption={device && (device.deviceType === 'client' || !device.deviceType) && !device.isAppOnly}
                isDeleting={isDeleting}
            />
        </div>
    );
};

export default DeviceModal;
