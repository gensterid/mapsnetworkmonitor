import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useRole } from '@/lib/auth-client';
import {
    useOlts,
    useCreateOlt,
    useUpdateOlt,
    useDeleteOlt,
    useRefreshOlt,
    useRouters,
    useOltOnus,
} from '@/hooks';
import { Plus, Server, CheckCircle, XCircle, RefreshCw, Trash2, Edit, Search, Layers, Clock } from 'lucide-react';
import { formatShortDateTime } from '@/lib/timezone';

// ONU List Modal
function OnuListModal({ isOpen, onClose, olt }) {
    const { data: onus = [], isLoading, error, refetch } = useOltOnus(olt?.id);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`ONU List - ${olt?.name}`}
            size="lg"
        >
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <p className="text-sm text-gray-500">
                        Total ONUs: {Array.isArray(onus) ? onus.length : 0}
                    </p>
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => refetch()}
                        disabled={isLoading}
                    >
                        <RefreshCw className={clsx("h-4 w-4 mr-2", isLoading && "animate-spin")} />
                        Refresh
                    </Button>
                </div>

                {isLoading ? (
                    <div className="flex justify-center py-8">
                        <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
                    </div>
                ) : error ? (
                    <div className="bg-red-50 text-red-600 p-4 rounded-md">
                        <p className="font-bold">Failed to fetch ONUs:</p>
                        <p className="text-sm whitespace-pre-wrap">{error.response?.data?.details || error.message}</p>
                    </div>
                ) : !onus || onus.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-md">
                        No ONUs found or driver output empty.
                    </div>
                ) : typeof onus[0] === 'object' && onus[0] !== null && 'sn' in onus[0] ? (
                    <div className="overflow-x-auto border rounded-md">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PON/ID</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SN / MAC</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Signal</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {Array.isArray(onus) && onus.map((onu, index) => (
                                    <tr key={index}>
                                        <td className="px-4 py-2 text-sm whitespace-nowrap">
                                            {onu.ponId}/{onu.onuId}
                                        </td>
                                        <td className="px-4 py-2 text-sm font-mono whitespace-nowrap">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-1.5 font-mono">
                                                    <span>{onu.sn}</span>
                                                    {onu.macAddress && (
                                                        <span className="text-[9px] px-1 bg-gray-100 text-gray-500 rounded border border-gray-200">
                                                            {onu.macAddress}
                                                        </span>
                                                    )}
                                                </div>
                                                {onu.name && <span className="text-xs text-gray-500 font-medium">{onu.name}</span>}
                                                {onu.description && onu.description !== onu.name && (
                                                    <span className="text-xs text-gray-400 italic">{onu.description}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-2 text-sm whitespace-nowrap">
                                            <span className={clsx(
                                                "px-2 py-0.5 rounded-full text-xs font-medium",
                                                onu.status === 'online' ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                                            )}>
                                                {onu.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-sm whitespace-nowrap">
                                            {onu.lastDownReason ? (
                                                <span className={clsx(
                                                    "px-2 py-0.5 rounded-full text-xs font-medium",
                                                    onu.lastDownReason === 'Power Down' ? "bg-amber-100 text-amber-800" :
                                                        onu.lastDownReason === 'Optical Loss' ? "bg-orange-100 text-orange-800" :
                                                            "bg-gray-100 text-gray-800"
                                                )}>
                                                    {onu.lastDownReason}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td className="px-4 py-2 text-sm whitespace-nowrap font-medium text-blue-600">
                                            {onu.signal || '-'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : null}

                {onus && Array.isArray(onus) && onus.length > 0 && typeof onus[0] === 'string' && (
                    <div className="bg-gray-900 text-gray-100 p-3 sm:p-4 rounded-md font-mono text-[10px] sm:text-xs overflow-auto max-h-[60vh] sm:max-h-[500px] whitespace-pre">
                        {onus.join('\n')}
                    </div>
                ) || null}
            </div>
        </Modal>
    );
}
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import clsx from 'clsx';
import toast from 'react-hot-toast';

// OLT Form Modal
function OltFormModal({ isOpen, onClose, olt = null }) {
    const createOlt = useCreateOlt();
    const updateOlt = useUpdateOlt();
    const { data: routers = [] } = useRouters();

    const [formData, setFormData] = useState({
        name: '',
        host: '',
        snmpPort: '161',
        snmpCommunity: 'public',
        type: 'generic',
        description: '',
        // Web Config
        webPort: '80',
        webUsername: '',
        webPassword: '',
        webProtocol: 'http',
        telnetPort: '',
        useSnmp: true,
        useWeb: false,
        parentId: '',
    });

    React.useEffect(() => {
        if (olt) {
            setFormData({
                name: olt.name || '',
                host: olt.host || '',
                snmpPort: String(olt.snmpPort || 161),
                snmpCommunity: olt.snmpCommunity || 'public',
                type: olt.type || 'generic',
                description: olt.description || '',
                // Web Config
                webPort: String(olt.webPort || 80),
                webUsername: olt.webUsername || '',
                webPassword: olt.webPassword || '',
                webProtocol: olt.webProtocol || 'http',
                telnetPort: olt.telnetPort ? String(olt.telnetPort) : '',
                useSnmp: olt.useSnmp !== undefined ? olt.useSnmp : true,
                useWeb: olt.useWeb || false,
                parentId: olt.parentId || '',
            });
        } else {
            setFormData({
                name: '',
                host: '',
                snmpPort: '161',
                snmpCommunity: 'public',
                type: 'generic',
                description: '',
                webPort: '80',
                webUsername: '',
                webPassword: '',
                webProtocol: 'http',
                telnetPort: '',
                useSnmp: true,
                useWeb: false,
                parentId: '',
            });
        }
    }, [olt, isOpen]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        const payload = {
            ...formData,
            snmpPort: parseInt(formData.snmpPort, 10) || 161,
            webPort: parseInt(formData.webPort, 10) || 80,
            // Kosong → null (driver pakai default 23); terisi → port override.
            telnetPort: formData.telnetPort ? parseInt(formData.telnetPort, 10) : null,
            parentId: formData.parentId || null,
        };

        if (olt) {
            updateOlt.mutate({ id: olt.id, data: payload }, {
                onSuccess: () => onClose()
            });
        } else {
            createOlt.mutate(payload, {
                onSuccess: () => onClose()
            });
        }
    };

    const isSubmitting = createOlt.isPending || updateOlt.isPending;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={olt ? "Edit OLT" : "Add New OLT"}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-fg">Name</label>
                    <Input name="name" value={formData.name} onChange={handleChange} placeholder="Main OLT" required />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-fg">IP Address</label>
                        <Input name="host" value={formData.host} onChange={handleChange} placeholder="192.168.100.1" required />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-fg">Type</label>
                        <select
                            name="type"
                            value={formData.type}
                            onChange={handleChange}
                            className="w-full bg-surface-dark border border-slate-border text-fg text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary"
                        >
                            <option value="generic">Generic SNMP</option>
                            <option value="hsgq">HSGQ</option>
                            <option value="cdata">C-Data</option>
                        </select>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-fg">Parent Router</label>
                    <select
                        name="parentId"
                        value={formData.parentId}
                        onChange={handleChange}
                        className="w-full bg-surface-dark border border-slate-border text-fg text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary"
                    >
                        <option value="">-- Select Parent Router --</option>
                        {routers.map(router => (
                            <option key={router.id} value={router.id}>
                                {router.name} ({router.host})
                            </option>
                        ))}
                    </select>
                    <p className="text-xs text-fg-muted">
                        Link this OLT to a specific MikroTik router for topology mapping.
                    </p>
                </div>


                <div className="space-y-3 pt-2">
                    <label className="text-sm font-medium text-fg">Protocols</label>
                    <div className="flex gap-6">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                name="useSnmp"
                                checked={formData.useSnmp}
                                onChange={handleChange}
                                className="w-4 h-4 rounded border-slate-border bg-surface-dark/50 text-primary focus:ring-primary focus:ring-offset-0"
                            />
                            <span className="text-sm text-fg">Enable SNMP</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                name="useWeb"
                                checked={formData.useWeb}
                                onChange={handleChange}
                                className="w-4 h-4 rounded border-slate-border bg-surface-dark/50 text-primary focus:ring-primary focus:ring-offset-0"
                            />
                            <span className="text-sm text-fg">Enable Web/API</span>
                        </label>
                    </div>
                </div>

                {formData.useSnmp && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg bg-surface-dark/30 border border-slate-border/50">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-fg">SNMP Port</label>
                            <Input type="number" name="snmpPort" value={formData.snmpPort} onChange={handleChange} required={formData.useSnmp} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-fg">SNMP Community</label>
                            <Input name="snmpCommunity" value={formData.snmpCommunity} onChange={handleChange} placeholder="public" required={formData.useSnmp} />
                        </div>
                    </div>
                )}

                {formData.useWeb && (
                    <div className="space-y-4 p-4 rounded-lg bg-surface-dark/30 border border-slate-border/50">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-fg">Protocol</label>
                                <select
                                    name="webProtocol"
                                    value={formData.webProtocol}
                                    onChange={handleChange}
                                    className="w-full bg-surface-dark/50 border border-slate-border text-fg text-sm rounded-lg px-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary"
                                >
                                    <option value="http">HTTP</option>
                                    <option value="https">HTTPS</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-fg">Web Port</label>
                                <Input type="number" name="webPort" value={formData.webPort} onChange={handleChange} required={formData.useWeb} />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-fg">Username</label>
                                <Input name="webUsername" value={formData.webUsername} onChange={handleChange} placeholder="admin" />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-fg">Password</label>
                                <Input type="password" name="webPassword" value={formData.webPassword} onChange={handleChange} placeholder="password" />
                            </div>
                        </div>
                    </div>
                )}

                <div className="space-y-2">
                    <label className="text-sm font-medium text-fg">Telnet Port <span className="text-fg-muted font-normal">(provisioning, opsional)</span></label>
                    <Input type="number" name="telnetPort" value={formData.telnetPort} onChange={handleChange} placeholder="23" />
                    <p className="text-xs text-fg-muted">Kosongkan untuk default 23. Isi bila OLT dijangkau via VPN port-forward dengan port eksternal custom (mis. 2323 → OLT:23).</p>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-fg">Description</label>
                    <Input name="description" value={formData.description} onChange={handleChange} placeholder="Optional notes" />
                </div>

                <div className="pt-4 flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
                    <Button type="submit" loading={isSubmitting}>
                        {olt ? 'Save Changes' : 'Add OLT'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

// Delete Confirmation Modal
function DeleteOltModal({ isOpen, onClose, olt }) {
    const deleteOlt = useDeleteOlt();

    const handleDelete = () => {
        if (!olt) return;
        deleteOlt.mutate(olt.id, {
            onSuccess: () => onClose()
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Delete OLT">
            <div className="space-y-4">
                <p className="text-fg">
                    Are you sure you want to delete <strong className="text-fg">{olt?.name}</strong>?
                    This action cannot be undone.
                </p>
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button variant="destructive" onClick={handleDelete} loading={deleteOlt.isPending}>
                        Delete
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

// Helper to format date to local string or relative time
function formatLastSync(date) {
    if (!date) return '--';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '--';

    const now = new Date();
    const diffMs = now - d;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    return formatShortDateTime(date);
}

export default function Olts() {
    const navigate = useNavigate();
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingOlt, setEditingOlt] = useState(null);
    const [deletingOlt, setDeletingOlt] = useState(null);
    const [viewingOnusOlt, setViewingOnusOlt] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    const { data: olts = [], isLoading, error } = useOlts();
    const refreshOlt = useRefreshOlt();
    const { isAdmin, isOperator } = useRole();

    const filteredOlts = olts.filter(olt =>
        olt.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        olt.host.includes(searchQuery)
    );

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-background-dark">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-background-dark p-8 text-center">
                <div className="text-red-400 mb-2">Error loading OLTs</div>
                <p className="text-fg-muted text-sm">{error.message}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background-dark overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-border flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-fg">OLT Devices</h1>
                    <p className="text-fg-muted text-sm">Manage your GPON/EPON OLTs</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
                        <input
                            type="text"
                            placeholder="Search OLTs..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-surface-dark border border-slate-border text-fg text-sm rounded-lg pl-9 pr-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary w-full sm:w-64"
                        />
                    </div>

                    {(isAdmin || isOperator) && (
                        <Button onClick={() => setIsAddModalOpen(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Add OLT
                        </Button>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredOlts.map((olt) => (
                        <Card
                            key={olt.id}
                            className="group hover:border-primary/50 transition-all active:scale-[0.98] cursor-pointer relative"
                            onClick={() => navigate(`/olts/${olt.id}`)}
                        >
                            {(isAdmin || isOperator) && (
                                <div className="absolute top-3 right-3 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10 bg-surface-dark/80 backdrop-blur-sm rounded-lg p-1 border border-slate-border/50 shadow-sm">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setViewingOnusOlt(olt); }}
                                        className="p-1.5 rounded-md hover:bg-slate-border text-fg-muted hover:text-blue-400 transition-colors"
                                        title="View ONUs"
                                    >
                                        <Layers className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); refreshOlt.mutate(olt.id); }}
                                        disabled={refreshOlt.isPending && refreshOlt.variables === olt.id}
                                        className="p-1.5 rounded-md hover:bg-slate-border text-fg-muted hover:text-emerald-400 transition-colors disabled:opacity-50"
                                        title="Refresh status"
                                    >
                                        <RefreshCw className={clsx("w-4 h-4", refreshOlt.isPending && refreshOlt.variables === olt.id && "animate-spin")} />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setEditingOlt(olt); }}
                                        className="p-1.5 rounded-md hover:bg-slate-border text-fg-muted hover:text-fg transition-colors"
                                        title="Edit OLT"
                                    >
                                        <Edit className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setDeletingOlt(olt); }}
                                        className="p-1.5 rounded-md hover:bg-red-500/10 text-fg-muted hover:text-red-400 transition-colors"
                                        title="Delete OLT"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                            <CardContent className="p-5">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3 overflow-hidden">
                                        <div className={clsx(
                                            "p-2.5 rounded-lg flex-shrink-0",
                                            olt.status === 'online' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                                        )}>
                                            <Server className="w-6 h-6" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-fg truncate pr-2">{olt.name}</h3>
                                            <div className="flex items-center gap-1.5 text-xs text-fg-muted mt-0.5">
                                                <span className={clsx(
                                                    "w-1.5 h-1.5 rounded-full flex-shrink-0",
                                                    olt.status === 'online' ? "bg-emerald-500" : "bg-red-500"
                                                )} />
                                                <span className="truncate">{olt.host}</span>
                                                <div className="ml-2 flex gap-1 items-center flex-shrink-0">
                                                    {olt.useSnmp && (
                                                        <span className={clsx(
                                                            "px-1.5 py-0.5 text-[9px] uppercase font-bold tracking-tight rounded border",
                                                            olt.lastSnmpStatus === 'online'
                                                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                                                : olt.lastSnmpStatus === 'offline'
                                                                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                                                                    : "bg-slate-500/10 text-fg-muted border-slate-500/20"
                                                        )}>
                                                            SNMP
                                                        </span>
                                                    )}
                                                    {olt.useWeb && (
                                                        <span className={clsx(
                                                            "px-1.5 py-0.5 text-[9px] uppercase font-bold tracking-tight rounded border",
                                                            olt.lastWebStatus === 'online'
                                                                ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                                                : olt.lastWebStatus === 'offline'
                                                                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                                                                    : "bg-slate-500/10 text-fg-muted border-slate-500/20"
                                                        )}>
                                                            WEB
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-2 text-sm text-fg-muted">
                                    <div className="flex justify-between">
                                        <span>Type:</span>
                                        <span className="text-fg capitalize">{olt.type || 'Generic'}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Community:</span>
                                        <span className="text-fg">{olt.snmpCommunity}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>Uptime:</span>
                                        <span className="text-fg">
                                            {olt.uptime ? `${Math.floor(olt.uptime / 3600)}h ${Math.floor((olt.uptime % 3600) / 60)}m` : '--'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between pt-1">
                                        <span>Last Sync:</span>
                                        <div className="flex items-center gap-1 text-fg font-mono text-[11px]">
                                            <Clock className="w-3 h-3 text-fg-muted" />
                                            {formatLastSync(olt.updatedAt)}
                                        </div>
                                    </div>
                                </div>

                                {olt.description && (
                                    <div className="mt-4 pt-3 border-t border-slate-border text-xs text-fg-muted truncate">
                                        {olt.description}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}

                    {olts.length === 0 && (
                        <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-border rounded-xl">
                            <div className="w-12 h-12 bg-slate-surface/50 text-fg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                                <Server className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-medium text-fg mb-1">No OLTs found</h3>
                            <p className="text-fg-muted mb-4">Add your first OLT device to start monitoring</p>
                            {(isAdmin || isOperator) && (
                                <Button onClick={() => setIsAddModalOpen(true)}>
                                    Add OLT
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Modals */}
            <OltFormModal
                isOpen={isAddModalOpen}
                onClose={() => setIsAddModalOpen(false)}
            />
            <OltFormModal
                isOpen={!!editingOlt}
                onClose={() => setEditingOlt(null)}
                olt={editingOlt}
            />
            <DeleteOltModal
                isOpen={!!deletingOlt}
                onClose={() => setDeletingOlt(null)}
                olt={deletingOlt}
            />
            <OnuListModal
                isOpen={!!viewingOnusOlt}
                onClose={() => setViewingOnusOlt(null)}
                olt={viewingOnusOlt}
            />
        </div>
    );
}
