import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import { X, Pencil, RefreshCw, Power, Activity, Users, FileText } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { VpnStatusBadge } from './VpnStatusBadge';
import {
    useVpnServer,
    useVpnServerStatus,
    useVpnServerClients,
    useReconnectVpnServer,
    useDisconnectVpnServer,
    useConnectVpnServer,
} from '@/hooks/useVpnServers';
import { Link } from 'react-router-dom';

const TABS = [
    { id: 'status', label: 'Status', icon: Activity },
    { id: 'clients', label: 'Router', icon: Users },
    { id: 'config', label: 'Config', icon: FileText },
];

/**
 * Slide-in drawer dari kanan, menampilkan detail VPN server.
 * - Status tab: realtime metrics (polling 10s)
 * - Clients tab: list router yang link
 * - Config tab: read-only preview field config
 */
export function VpnServerDrawer({ vpnServerId, onClose, onEdit }) {
    const [activeTab, setActiveTab] = useState('status');
    const { data: server } = useVpnServer(vpnServerId);
    const { data: status } = useVpnServerStatus(vpnServerId);

    // ESC untuk close
    useEffect(() => {
        if (!vpnServerId) return;
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [vpnServerId, onClose]);

    if (!vpnServerId) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Drawer panel — slide dari kanan */}
            <aside
                className="fixed top-0 right-0 bottom-0 z-[101] w-full sm:w-[480px] md:w-[560px] bg-surface-dark border-l border-slate-border shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
                role="dialog"
                aria-labelledby="vpn-drawer-title"
            >
                {/* Header */}
                <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-border shrink-0">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                            <VpnStatusBadge status={status?.status || server?.status} />
                            {server?.region && (
                                <span className="text-xs text-fg-muted">· {server.region}</span>
                            )}
                        </div>
                        <h2 id="vpn-drawer-title" className="text-base font-bold text-fg truncate">
                            {server?.name || 'Memuat…'}
                        </h2>
                        <p className="text-xs text-fg-muted font-mono mt-0.5 truncate">
                            {server ? `${server.type.toUpperCase()} · ${server.host}:${server.port}` : ''}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-lg text-fg-muted hover:text-fg hover:bg-slate-surface shrink-0"
                        aria-label="Close drawer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-border px-2 shrink-0">
                    {TABS.map((tab) => {
                        const Icon = tab.icon;
                        const active = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={clsx(
                                    'flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-colors',
                                    active
                                        ? 'border-primary text-fg font-semibold'
                                        : 'border-transparent text-fg-muted hover:text-fg'
                                )}
                            >
                                <Icon className="w-4 h-4" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5">
                    {!server ? (
                        <div className="text-center text-fg-muted py-12">
                            <RefreshCw className="w-5 h-5 animate-spin inline-block mr-2" />
                            Memuat detail…
                        </div>
                    ) : activeTab === 'status' ? (
                        <StatusTab server={server} status={status} />
                    ) : activeTab === 'clients' ? (
                        <ClientsTab vpnServerId={vpnServerId} />
                    ) : (
                        <ConfigTab server={server} />
                    )}
                </div>

                {/* Footer actions */}
                {server && (
                    <FooterActions server={server} onEdit={() => onEdit(server)} />
                )}
            </aside>
        </>
    );
}

function StatusTab({ server, status }) {
    const s = status || server;
    const rows = [
        { label: 'Tunnel IP', value: s.tunnelIp || '—', mono: true },
        { label: 'Subnet', value: server.clientSubnet, mono: true },
        { label: 'Priority', value: server.priority },
        { label: 'Enabled', value: server.enabled ? 'Ya' : 'Tidak' },
        { label: 'Last connected', value: formatDate(s.lastConnectedAt) },
        { label: 'Last disconnected', value: formatDate(s.lastDisconnectedAt) },
        { label: 'Last checked', value: formatDate(s.lastCheckedAt) },
        { label: 'Connection attempts', value: s.connectionAttempts ?? 0 },
    ];

    return (
        <div className="space-y-4">
            {s.lastError && (
                <div className="p-3 bg-danger/10 border border-danger/20 rounded-lg">
                    <div className="text-xs font-bold uppercase text-danger mb-1">Last Error</div>
                    <p className="text-sm text-fg font-mono break-all">{s.lastError}</p>
                </div>
            )}

            <div className="grid grid-cols-2 gap-3">
                {rows.map((row) => (
                    <div key={row.label} className="p-3 bg-surface-darker/50 border border-slate-border/40 rounded-lg">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-fg-muted mb-1">
                            {row.label}
                        </div>
                        <div className={clsx(
                            'text-sm text-fg break-all',
                            row.mono && 'font-mono'
                        )}>
                            {row.value}
                        </div>
                    </div>
                ))}
            </div>

            {server.notes && (
                <div className="p-3 bg-surface-darker/50 border border-slate-border/40 rounded-lg">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-fg-muted mb-1">
                        Catatan
                    </div>
                    <p className="text-sm text-fg whitespace-pre-wrap">{server.notes}</p>
                </div>
            )}
        </div>
    );
}

function ClientsTab({ vpnServerId }) {
    const { data: clients = [], isLoading } = useVpnServerClients(vpnServerId);

    if (isLoading) {
        return (
            <div className="text-center text-fg-muted py-12">
                <RefreshCw className="w-5 h-5 animate-spin inline-block mr-2" />
                Memuat…
            </div>
        );
    }

    if (clients.length === 0) {
        return (
            <div className="text-center py-12">
                <Users className="w-10 h-10 text-fg-muted mx-auto mb-3" />
                <p className="text-sm text-fg-muted">Belum ada router yang link ke VPN ini</p>
                <p className="text-xs text-fg-muted mt-1">
                    Edit router di halaman Routers, set field "VPN Server" untuk link.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <div className="text-xs text-fg-muted mb-2">
                {clients.length} router pakai VPN ini
            </div>
            {clients.map((client) => (
                <Link
                    key={client.id}
                    to={`/routers/${client.id}`}
                    className="block p-3 bg-surface-darker/50 border border-slate-border/40 rounded-lg hover:bg-slate-surface/40 transition-colors"
                >
                    <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-fg truncate">{client.name}</div>
                            <div className="text-xs text-fg-muted font-mono mt-0.5">{client.host}</div>
                        </div>
                        <span className={clsx(
                            'text-xs font-bold uppercase px-2 py-0.5 rounded',
                            client.status === 'online'
                                ? 'bg-success/10 text-success'
                                : client.status === 'offline'
                                ? 'bg-danger/10 text-danger'
                                : 'bg-slate-surface text-fg-muted'
                        )}>
                            {client.status || 'unknown'}
                        </span>
                    </div>
                </Link>
            ))}
        </div>
    );
}

function ConfigTab({ server }) {
    const fields = [
        { label: 'Mode', value: server.mode },
        { label: 'Cipher', value: server.cipher },
        { label: 'Auth', value: server.auth },
        { label: 'Protocol', value: server.proto },
        { label: 'Verify Server Cert', value: server.verifyServerCert ? 'Yes' : 'No' },
        { label: 'Has Password', value: server.hasPassword ? 'Yes' : 'No (perlu set)' },
        { label: 'Has CA Cert', value: server.caCertPem ? 'Yes' : 'No' },
    ];

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
                {fields.map((f) => (
                    <div key={f.label} className="p-2 bg-surface-darker/50 border border-slate-border/40 rounded-md">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                            {f.label}
                        </div>
                        <div className="text-xs text-fg font-mono">{f.value}</div>
                    </div>
                ))}
            </div>

            {server.caCertPem && (
                <details className="group">
                    <summary className="text-xs font-bold uppercase tracking-wider text-fg-muted cursor-pointer hover:text-fg">
                        CA Certificate (klik untuk lihat)
                    </summary>
                    <pre className="mt-2 p-3 bg-surface-darker border border-slate-border rounded-lg text-[10px] font-mono text-fg-muted overflow-x-auto whitespace-pre-wrap break-all">
                        {server.caCertPem}
                    </pre>
                </details>
            )}

            {server.extraConfig && (
                <details className="group">
                    <summary className="text-xs font-bold uppercase tracking-wider text-fg-muted cursor-pointer hover:text-fg">
                        Extra Config
                    </summary>
                    <pre className="mt-2 p-3 bg-surface-darker border border-slate-border rounded-lg text-xs font-mono text-fg-muted overflow-x-auto">
                        {server.extraConfig}
                    </pre>
                </details>
            )}
        </div>
    );
}

function FooterActions({ server, onEdit }) {
    const reconnect = useReconnectVpnServer();
    const disconnect = useDisconnectVpnServer();
    const connect = useConnectVpnServer();

    const isPending = reconnect.isPending || disconnect.isPending || connect.isPending;
    const isConnected = ['connected', 'connecting'].includes(server.status);

    return (
        <div className="border-t border-slate-border px-5 py-3 flex flex-wrap gap-2 shrink-0">
            {isConnected ? (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => disconnect.mutate(server.id)}
                    disabled={isPending}
                >
                    <Power className="w-3.5 h-3.5 mr-1" />
                    Disconnect
                </Button>
            ) : (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => connect.mutate(server.id)}
                    disabled={isPending || !server.enabled}
                >
                    <Power className="w-3.5 h-3.5 mr-1" />
                    Connect
                </Button>
            )}
            <Button
                variant="ghost"
                size="sm"
                onClick={() => reconnect.mutate(server.id)}
                disabled={isPending || !server.enabled}
            >
                <RefreshCw className={clsx('w-3.5 h-3.5 mr-1', reconnect.isPending && 'animate-spin')} />
                Reconnect
            </Button>
            <div className="flex-1" />
            <Button variant="primary" size="sm" onClick={onEdit}>
                <Pencil className="w-3.5 h-3.5 mr-1" />
                Edit
            </Button>
        </div>
    );
}

function formatDate(iso) {
    if (!iso) return '—';
    try {
        const d = new Date(iso);
        return d.toLocaleString('id-ID', {
            dateStyle: 'short',
            timeStyle: 'medium',
        });
    } catch {
        return '—';
    }
}
