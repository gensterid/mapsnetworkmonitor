import React, { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatsCard } from '@/components/ui/StatsCard';
import { Plus, Network, Wifi, WifiOff, AlertCircle, Pencil, Trash2, RefreshCw, Power, Search } from 'lucide-react';
import { useVpnServers, useVpnServerSummary, useDeleteVpnServer, useReconnectVpnServer, useConnectVpnServer } from '@/hooks/useVpnServers';
import { VpnStatusBadge } from './VpnStatusBadge';
import { VpnServerFormModal } from './VpnServerFormModal';
import { VpnServerDrawer } from './VpnServerDrawer';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import clsx from 'clsx';
import toast from 'react-hot-toast';

/**
 * SuperAdmin VPN Server management page.
 * - Summary cards (total, connected, down, total clients)
 * - Table list dengan status realtime (polling 10s)
 * - Add/Edit via modal, detail via slide-in drawer
 */
export default function VpnServersPage() {
    const { data: servers = [], isLoading } = useVpnServers();
    const { data: summary } = useVpnServerSummary();
    const deleteMutation = useDeleteVpnServer();
    const reconnectMutation = useReconnectVpnServer();
    const connectMutation = useConnectVpnServer();

    const [formOpen, setFormOpen] = useState(false);
    const [editing, setEditing] = useState(null);            // VpnServer | null
    const [drawerId, setDrawerId] = useState(null);          // id atau null
    const [deleting, setDeleting] = useState(null);          // VpnServer | null
    const [deleteDetails, setDeleteDetails] = useState(null); // { linkedRouters, linkedCount }
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!search.trim()) return servers;
        const q = search.toLowerCase();
        return servers.filter(s =>
            s.name.toLowerCase().includes(q) ||
            s.host.toLowerCase().includes(q) ||
            s.region?.toLowerCase().includes(q) ||
            s.clientSubnet.toLowerCase().includes(q)
        );
    }, [servers, search]);

    const handleAdd = () => {
        setEditing(null);
        setFormOpen(true);
    };

    const handleEdit = (server) => {
        setEditing(server);
        setFormOpen(true);
    };

    const handleDelete = (server) => {
        setDeleting(server);
        setDeleteDetails(null);
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        try {
            await deleteMutation.mutateAsync(deleting.id);
            setDeleting(null);
            setDeleteDetails(null);
        } catch (err) {
            // 409 — backend kasih details.linkedRouters supaya kita tampilkan
            if (err?.status === 409 && err?.details?.linkedRouters) {
                setDeleteDetails(err.details);
            }
        }
    };

    /**
     * Smart action: kalau status disconnected/error/disabled → Connect (write
     * config + start systemd). Kalau connected/connecting → Reconnect
     * (restart unit). Hindari Reconnect ke unit yang belum ada — sebelumnya
     * fail silent karena restart unit non-existent return error tapi tidak
     * di-throw oleh systemctl.
     */
    const handleSmartAction = async (server) => {
        const isLive = ['connected', 'connecting'].includes(server.status);
        if (isLive) {
            await reconnectMutation.mutateAsync(server.id);
        } else {
            await connectMutation.mutateAsync(server.id);
        }
    };

    return (
        <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
                        <Network className="w-6 h-6 text-primary" />
                        VPN Servers
                    </h1>
                    <p className="text-sm text-fg-muted mt-1">
                        Kelola koneksi VPN ke router fleet. Hanya SuperAdmin.
                    </p>
                </div>
                <Button onClick={handleAdd} variant="primary">
                    <Plus className="w-4 h-4 mr-2" />
                    Tambah VPN Server
                </Button>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatsCard
                    icon={Network}
                    label="Total Servers"
                    value={summary?.total ?? '—'}
                    color="blue"
                />
                <StatsCard
                    icon={Wifi}
                    label="Connected"
                    value={summary ? `${summary.connected} / ${summary.total}` : '—'}
                    color="emerald"
                    subValue={summary?.connected === summary?.total ? 'Semua terhubung' : null}
                />
                <StatsCard
                    icon={WifiOff}
                    label="Disconnected"
                    value={summary?.disconnected ?? '—'}
                    color={summary?.disconnected > 0 ? 'amber' : 'slate'}
                />
                <StatsCard
                    icon={AlertCircle}
                    label="Clients Reachable"
                    value={summary?.totalClients ?? '—'}
                    color="slate"
                    subValue="Router yang link"
                />
            </div>

            {/* Search */}
            <div className="relative w-full sm:max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari nama, host, subnet…"
                    className="bg-surface-darker border border-slate-border text-fg text-sm rounded-lg pl-9 pr-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary w-full"
                />
            </div>

            {/* Table */}
            <Card>
                <CardContent className="!p-0 overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-border text-xs uppercase text-fg-muted font-semibold tracking-wider">
                                <th className="text-left px-4 py-3">Status</th>
                                <th className="text-left px-4 py-3">Nama</th>
                                <th className="text-left px-4 py-3 hidden sm:table-cell">Tipe</th>
                                <th className="text-left px-4 py-3 hidden md:table-cell">Host</th>
                                <th className="text-left px-4 py-3 hidden lg:table-cell">Subnet</th>
                                <th className="text-left px-4 py-3 hidden lg:table-cell">Tunnel IP</th>
                                <th className="text-right px-4 py-3">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-border/40">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={7} className="text-center py-12 text-fg-muted">
                                        <RefreshCw className="w-5 h-5 animate-spin inline-block mr-2" />
                                        Memuat data…
                                    </td>
                                </tr>
                            ) : filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="text-center py-12">
                                        <p className="text-fg-muted text-sm">
                                            {search ? `Tidak ada VPN server yang match "${search}"` : 'Belum ada VPN server.'}
                                        </p>
                                        {!search && (
                                            <Button variant="ghost" className="mt-3" onClick={handleAdd}>
                                                <Plus className="w-4 h-4 mr-2" />
                                                Tambah VPN Server pertama
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                            ) : (
                                filtered.map((server) => (
                                    <tr
                                        key={server.id}
                                        onClick={() => setDrawerId(server.id)}
                                        className="hover:bg-slate-surface/40 cursor-pointer transition-colors"
                                    >
                                        <td className="px-4 py-3">
                                            <VpnStatusBadge status={server.status} />
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-semibold text-fg">{server.name}</div>
                                            {server.region && (
                                                <div className="text-xs text-fg-muted mt-0.5">{server.region}</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 hidden sm:table-cell">
                                            <span className="text-xs font-mono uppercase text-fg-muted">
                                                {server.type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 hidden md:table-cell">
                                            <div className="font-mono text-xs text-fg truncate max-w-[200px]">{server.host}</div>
                                            <div className="text-[10px] text-fg-muted">port {server.port}</div>
                                        </td>
                                        <td className="px-4 py-3 hidden lg:table-cell">
                                            <span className="font-mono text-xs text-fg">{server.clientSubnet}</span>
                                        </td>
                                        <td className="px-4 py-3 hidden lg:table-cell">
                                            <span className="font-mono text-xs text-fg-muted">
                                                {server.tunnelIp || '—'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                            <div className="flex items-center justify-end gap-1">
                                                {(() => {
                                                    const isLive = ['connected', 'connecting'].includes(server.status);
                                                    const Icon = isLive ? RefreshCw : Power;
                                                    const title = isLive ? 'Reconnect' : 'Connect';
                                                    const pending =
                                                        (reconnectMutation.isPending && reconnectMutation.variables === server.id) ||
                                                        (connectMutation.isPending && connectMutation.variables === server.id);
                                                    return (
                                                        <button
                                                            onClick={() => handleSmartAction(server)}
                                                            title={title}
                                                            className="p-1.5 rounded-md hover:bg-slate-surface text-fg-muted hover:text-fg transition-colors"
                                                        >
                                                            <Icon className={clsx(
                                                                'w-4 h-4',
                                                                pending && isLive && 'animate-spin'
                                                            )} />
                                                        </button>
                                                    );
                                                })()}
                                                <button
                                                    onClick={() => handleEdit(server)}
                                                    title="Edit"
                                                    className="p-1.5 rounded-md hover:bg-slate-surface text-fg-muted hover:text-fg transition-colors"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(server)}
                                                    title="Hapus"
                                                    className="p-1.5 rounded-md hover:bg-danger/10 text-fg-muted hover:text-danger transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </CardContent>
            </Card>

            {/* Form modal */}
            <VpnServerFormModal
                isOpen={formOpen}
                onClose={() => setFormOpen(false)}
                editing={editing}
            />

            {/* Detail drawer */}
            <VpnServerDrawer
                vpnServerId={drawerId}
                onClose={() => setDrawerId(null)}
                onEdit={(server) => {
                    setDrawerId(null);
                    handleEdit(server);
                }}
            />

            {/* Delete confirmation — special handling kalau ada linked routers */}
            {deleting && (
                <DeleteConfirmationModal
                    isOpen={true}
                    onClose={() => {
                        setDeleting(null);
                        setDeleteDetails(null);
                    }}
                    onConfirm={confirmDelete}
                    title={deleteDetails ? 'Tidak Bisa Dihapus' : 'Hapus VPN Server?'}
                    message={
                        deleteDetails
                            ? `VPN "${deleting.name}" masih dipakai ${deleteDetails.linkedCount} router. Pindahkan atau hapus router di bawah dulu.`
                            : `Hapus VPN server "${deleting.name}"? Aksi ini tidak bisa di-undo.`
                    }
                    itemName={deleting.name}
                    confirmText={deleteDetails ? 'Mengerti' : 'Hapus'}
                    isDeleting={deleteMutation.isPending}
                />
            )}

            {/* Linked routers list — render di bawah delete modal kalau 409 */}
            {deleteDetails && deleteDetails.linkedRouters?.length > 0 && (
                <LinkedRoutersHelper routers={deleteDetails.linkedRouters} />
            )}
        </div>
    );
}

/**
 * Helper component: render daftar router yang link via portal-ish
 * positioning. Karena DeleteConfirmationModal pakai posisi fixed,
 * kita tampilkan info ini sebagai toast list sementara — simpler
 * daripada custom modal.
 */
function LinkedRoutersHelper({ routers }) {
    React.useEffect(() => {
        const lines = routers.slice(0, 5).map(r => `• ${r.name} (${r.host})`).join('\n');
        const more = routers.length > 5 ? `\n... dan ${routers.length - 5} lagi` : '';
        toast(`Router yang link:\n${lines}${more}`, {
            duration: 8000,
            icon: '🔗',
            style: { whiteSpace: 'pre-line' },
        });
    }, [routers]);
    return null;
}
