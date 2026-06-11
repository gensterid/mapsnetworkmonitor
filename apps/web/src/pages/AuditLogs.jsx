import React, { useState, useMemo } from 'react';
import {
    History,
    Search,
    Filter,
    User,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Loader2,
    X,
} from 'lucide-react';
import clsx from 'clsx';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { useAuditLogs, useAuditLogDistinct } from '@/hooks/useAuditLogs';
import { useDebounce } from '@/hooks/useDebounce';

const PAGE_SIZE = 50;

const ACTION_BADGE = {
    create: 'success',
    update: 'primary',
    delete: 'danger',
    login: 'info',
    logout: 'ghost',
    reboot: 'warning',
};

/**
 * Audit Log Viewer — Admin/SuperAdmin only.
 *
 * Forensic view untuk lihat siapa ngapain kapan. Backend endpoint
 * (`/api/settings/audit-logs`) sudah ada dari Phase A3 tapi UI baru
 * ditambahkan di Phase ini.
 *
 * Filter: search (text di details JSON), entity, action, user, date range.
 * Pagination: PAGE_SIZE per halaman.
 */
export default function AuditLogs() {
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebounce(search, 300);
    const [entity, setEntity] = useState('');
    const [action, setAction] = useState('');
    const [userId, setUserId] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [page, setPage] = useState(0);

    const filters = useMemo(() => ({
        search: debouncedSearch || undefined,
        entity: entity || undefined,
        action: action || undefined,
        userId: userId || undefined,
        startDate: startDate ? new Date(startDate).toISOString() : undefined,
        endDate: endDate ? new Date(endDate + 'T23:59:59').toISOString() : undefined,
    }), [debouncedSearch, entity, action, userId, startDate, endDate]);

    const { data, isLoading, isFetching } = useAuditLogs(filters, PAGE_SIZE, page * PAGE_SIZE);
    const { data: distinct } = useAuditLogDistinct();

    const logs = data?.logs ?? [];
    const total = data?.total ?? 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    const hasFilter = !!(debouncedSearch || entity || action || userId || startDate || endDate);

    const handleClearFilters = () => {
        setSearch('');
        setEntity('');
        setAction('');
        setUserId('');
        setStartDate('');
        setEndDate('');
        setPage(0);
    };

    // Reset ke page 0 kalau filter berubah
    React.useEffect(() => {
        setPage(0);
    }, [debouncedSearch, entity, action, userId, startDate, endDate]);

    return (
        <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-fg flex items-center gap-2">
                    <History className="w-6 h-6 text-primary" />
                    Audit Log
                </h1>
                <p className="text-fg-muted text-sm mt-1">
                    Riwayat semua aksi yang dicatat di sistem. Hanya Admin/SuperAdmin.
                </p>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-fg-muted">
                        <Filter className="w-3.5 h-3.5" />
                        Filter
                        {hasFilter && (
                            <Button variant="ghost" size="sm" onClick={handleClearFilters} className="ml-auto">
                                <X className="w-3 h-3 mr-1" />
                                Reset
                            </Button>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
                            <Input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Cari di details…"
                                className="pl-9"
                            />
                        </div>

                        {/* Entity */}
                        <select
                            value={entity}
                            onChange={(e) => setEntity(e.target.value)}
                            className="bg-surface-darker border border-slate-border text-fg text-sm rounded-lg px-3 py-2 h-10 focus:ring-1 focus:ring-primary focus:border-primary w-full"
                        >
                            <option value="">— Semua Entity —</option>
                            {distinct?.entities.map((e) => (
                                <option key={e} value={e}>{e}</option>
                            ))}
                        </select>

                        {/* Action */}
                        <select
                            value={action}
                            onChange={(e) => setAction(e.target.value)}
                            className="bg-surface-darker border border-slate-border text-fg text-sm rounded-lg px-3 py-2 h-10 focus:ring-1 focus:ring-primary focus:border-primary w-full"
                        >
                            <option value="">— Semua Aksi —</option>
                            {distinct?.actions.map((a) => (
                                <option key={a} value={a}>{a}</option>
                            ))}
                        </select>

                        {/* User */}
                        <select
                            value={userId}
                            onChange={(e) => setUserId(e.target.value)}
                            className="bg-surface-darker border border-slate-border text-fg text-sm rounded-lg px-3 py-2 h-10 focus:ring-1 focus:ring-primary focus:border-primary w-full"
                        >
                            <option value="">— Semua User —</option>
                            {distinct?.users.map((u) => (
                                <option key={u.id} value={u.id}>
                                    {u.name} {u.email && `(${u.email})`}
                                </option>
                            ))}
                        </select>

                        {/* Date range */}
                        <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-fg-muted shrink-0" />
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="bg-surface-darker border border-slate-border text-fg text-sm rounded-lg px-2 py-2 h-10 focus:ring-1 focus:ring-primary focus:border-primary flex-1 min-w-0"
                            />
                            <span className="text-fg-muted text-xs">—</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="bg-surface-darker border border-slate-border text-fg text-sm rounded-lg px-2 py-2 h-10 focus:ring-1 focus:ring-primary focus:border-primary flex-1 min-w-0"
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Table + pagination */}
            <Card>
                <CardContent className="!p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-border text-xs uppercase text-fg-muted font-semibold tracking-wider">
                                    <th className="text-left px-4 py-3">Waktu</th>
                                    <th className="text-left px-4 py-3">User</th>
                                    <th className="text-left px-4 py-3">Aksi</th>
                                    <th className="text-left px-4 py-3">Entity</th>
                                    <th className="text-left px-4 py-3 hidden lg:table-cell">Detail</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-border/40">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan={5} className="text-center py-12 text-fg-muted">
                                            <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                                            Memuat…
                                        </td>
                                    </tr>
                                ) : logs.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="text-center py-12 text-fg-muted">
                                            {hasFilter ? 'Tidak ada log yang match filter' : 'Belum ada log'}
                                        </td>
                                    </tr>
                                ) : (
                                    logs.map((log) => (
                                        <LogRow key={log.id} log={log} />
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Pagination footer */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-border bg-surface-darker/50">
                            <div className="text-xs text-fg-muted">
                                {isFetching && <Loader2 className="w-3 h-3 animate-spin inline-block mr-2" />}
                                Menampilkan <span className="font-semibold text-fg">{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)}</span> dari <span className="font-semibold text-fg">{total.toLocaleString('id-ID')}</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                                    disabled={page === 0}
                                >
                                    <ChevronLeft className="w-4 h-4 mr-1" />
                                    Sebelumnya
                                </Button>
                                <span className="text-xs text-fg-muted">
                                    {page + 1} / {totalPages}
                                </span>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                                    disabled={page >= totalPages - 1}
                                >
                                    Selanjutnya
                                    <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

function LogRow({ log }) {
    const [expanded, setExpanded] = React.useState(false);
    const actionVariant = ACTION_BADGE[log.action] || 'default';
    const hasDetails = log.details && Object.keys(log.details).length > 0;

    return (
        <>
            <tr
                className={clsx('hover:bg-slate-surface/30', hasDetails && 'cursor-pointer')}
                onClick={() => hasDetails && setExpanded((v) => !v)}
            >
                <td className="px-4 py-3 text-xs text-fg-muted whitespace-nowrap">
                    {formatDateTime(log.createdAt)}
                </td>
                <td className="px-4 py-3">
                    {log.userName ? (
                        <div className="min-w-0">
                            <div className="text-sm text-fg truncate flex items-center gap-1.5">
                                <User className="w-3 h-3 text-fg-muted shrink-0" />
                                {log.userName}
                            </div>
                            {log.userRole && (
                                <div className="text-[10px] text-fg-muted uppercase">{log.userRole}</div>
                            )}
                        </div>
                    ) : (
                        <span className="text-xs text-fg-muted italic">sistem</span>
                    )}
                </td>
                <td className="px-4 py-3">
                    <Badge variant={actionVariant} size="xs">{log.action}</Badge>
                </td>
                <td className="px-4 py-3">
                    <div className="text-sm text-fg font-mono">{log.entity}</div>
                    {log.entityId && (
                        <div className="text-[10px] text-fg-muted font-mono truncate max-w-[180px]">
                            {log.entityId}
                        </div>
                    )}
                </td>
                <td className="px-4 py-3 hidden lg:table-cell">
                    {hasDetails ? (
                        <span className="text-xs text-fg-muted">
                            {expanded ? '▼' : '▶'} {Object.keys(log.details).length} field
                        </span>
                    ) : (
                        <span className="text-xs text-fg-muted italic">—</span>
                    )}
                </td>
            </tr>
            {expanded && hasDetails && (
                <tr className="bg-surface-darker/30">
                    <td colSpan={5} className="px-4 py-3">
                        <pre className="text-xs font-mono text-fg-muted whitespace-pre-wrap break-all overflow-x-auto bg-surface-darker rounded p-3 border border-slate-border/40">
                            {JSON.stringify(log.details, null, 2)}
                        </pre>
                        {log.ipAddress && (
                            <div className="text-[10px] text-fg-muted mt-2 font-mono">
                                IP: {log.ipAddress}
                                {log.userAgent && ` · UA: ${log.userAgent.slice(0, 80)}`}
                            </div>
                        )}
                    </td>
                </tr>
            )}
        </>
    );
}

function formatDateTime(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('id-ID', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        });
    } catch {
        return '—';
    }
}
