import React, { useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import {
    User,
    Phone,
    Mail,
    MapPin,
    Wifi,
    WifiOff,
    AlertCircle,
    Activity,
    Receipt,
    Network,
    CalendarClock,
    ExternalLink,
    Loader2,
    ArrowLeft,
    CheckCircle2,
    XCircle,
    Clock,
    Box as BoxIcon,
    Router as RouterIcon,
    History,
} from 'lucide-react';
import clsx from 'clsx';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useCustomer360 } from '@/hooks/useCustomer360';

const TABS = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'tagihan', label: 'Tagihan', icon: Receipt },
    { id: 'network', label: 'Network', icon: Network },
    { id: 'aktivitas', label: 'Aktivitas', icon: History },
];

const VALID_TABS = new Set(TABS.map((t) => t.id));

export default function Customer360() {
    const { id } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const initialTab = (() => {
        const t = searchParams.get('tab');
        return t && VALID_TABS.has(t) ? t : 'overview';
    })();
    const [activeTab, setActiveTab] = useState(initialTab);

    const { data, isLoading, isError, error } = useCustomer360(id);

    const handleTabChange = (tab) => {
        setActiveTab(tab);
        if (tab === 'overview') {
            searchParams.delete('tab');
        } else {
            searchParams.set('tab', tab);
        }
        setSearchParams(searchParams, { replace: true });
    };

    if (isLoading) {
        return (
            <div className="p-6 flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-6 h-6 animate-spin text-fg-muted" />
            </div>
        );
    }

    if (isError) {
        return (
            <div className="p-6 max-w-4xl mx-auto">
                <Card>
                    <CardContent className="p-6 text-center">
                        <AlertCircle className="w-12 h-12 text-danger mx-auto mb-3" />
                        <h2 className="text-lg font-bold text-fg mb-1">Tidak bisa load customer</h2>
                        <p className="text-sm text-fg-muted">{error?.message || 'Customer tidak ditemukan atau tidak ada akses'}</p>
                        <Link to="/billing" className="inline-block mt-4">
                            <Button variant="ghost" size="sm">
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Kembali ke Billing
                            </Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!data) return null;

    const { customer, summary } = data;

    return (
        <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
            {/* Back link */}
            <Link to="/billing" className="inline-flex items-center gap-2 text-sm text-fg-muted hover:text-fg">
                <ArrowLeft className="w-4 h-4" />
                Kembali ke Billing
            </Link>

            {/* Header card */}
            <CustomerHeader customer={customer} summary={summary} />

            {/* Tabs */}
            <div className="border-b border-slate-border flex overflow-x-auto">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            className={clsx(
                                'flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-colors whitespace-nowrap',
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

            {/* Tab content */}
            {activeTab === 'overview' && <OverviewTab data={data} />}
            {activeTab === 'tagihan' && <TagihanTab data={data} />}
            {activeTab === 'network' && <NetworkTab data={data} />}
            {activeTab === 'aktivitas' && <AktivitasTab data={data} />}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────
// HEADER
// ─────────────────────────────────────────────────────────────────────────

function CustomerHeader({ customer, summary }) {
    const netStatus = summary.networkStatus;
    const netStatusBadge = {
        online: { label: '🟢 ONLINE', cls: 'bg-success/10 text-success' },
        offline: { label: '🔴 OFFLINE', cls: 'bg-danger/10 text-danger' },
        partial: { label: '🟡 PARTIAL', cls: 'bg-warning/10 text-warning' },
        unknown: { label: '— UNKNOWN', cls: 'bg-slate-surface text-fg-muted' },
    }[netStatus];

    return (
        <Card>
            <CardContent className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    {/* Left: customer info */}
                    <div className="flex items-start gap-4 min-w-0 flex-1">
                        <div className="p-3 rounded-xl bg-primary/10 text-primary shrink-0">
                            <User className="w-7 h-7" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <h1 className="text-xl font-bold text-fg truncate">{customer.name}</h1>
                                {customer.active ? (
                                    <Badge variant="success" size="xs">AKTIF</Badge>
                                ) : (
                                    <Badge variant="ghost" size="xs">INACTIVE</Badge>
                                )}
                            </div>
                            <div className="text-xs text-fg-muted font-mono mb-2">{customer.code}</div>
                            <div className="flex flex-wrap gap-3 text-xs text-fg-muted">
                                {customer.phone && (
                                    <span className="flex items-center gap-1.5">
                                        <Phone className="w-3.5 h-3.5" />
                                        {customer.phone}
                                    </span>
                                )}
                                {customer.email && (
                                    <span className="flex items-center gap-1.5">
                                        <Mail className="w-3.5 h-3.5" />
                                        {customer.email}
                                    </span>
                                )}
                                {customer.address && (
                                    <span className="flex items-center gap-1.5">
                                        <MapPin className="w-3.5 h-3.5" />
                                        {customer.address}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Right: status badges */}
                    <div className="flex flex-row sm:flex-col gap-2 shrink-0">
                        <span className={clsx(
                            'text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md',
                            netStatusBadge.cls
                        )}>
                            {netStatusBadge.label}
                        </span>
                        {summary.unpaidInvoices > 0 && (
                            <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-danger/10 text-danger">
                                {summary.unpaidInvoices} TAGIHAN BELUM BAYAR
                            </span>
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

// ─────────────────────────────────────────────────────────────────────────
// OVERVIEW TAB
// ─────────────────────────────────────────────────────────────────────────

function OverviewTab({ data }) {
    const { subscriptions, summary, pppoeActive, netwatch, onuLinked } = data;

    return (
        <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <SummaryCard
                    label="Subscription Aktif"
                    value={summary.activeSubscriptions}
                    icon={Wifi}
                    color={summary.activeSubscriptions > 0 ? 'success' : 'slate'}
                />
                <SummaryCard
                    label="Tagihan Belum Bayar"
                    value={summary.unpaidInvoices}
                    icon={Receipt}
                    color={summary.unpaidInvoices > 0 ? 'danger' : 'success'}
                    subValue={summary.unpaidAmount > 0 ? formatRupiah(summary.unpaidAmount) : null}
                />
                <SummaryCard
                    label="Next Due"
                    value={summary.nextDueAt ? formatDate(summary.nextDueAt) : '—'}
                    icon={CalendarClock}
                    color="slate"
                />
                <SummaryCard
                    label="ONU Terlink"
                    value={onuLinked.length}
                    icon={BoxIcon}
                    color={onuLinked.length > 0 ? 'slate' : 'slate'}
                />
            </div>

            {/* Active subscriptions */}
            <Card>
                <CardContent className="p-5">
                    <SectionTitle icon={Wifi} title="Subscription Aktif" />
                    {subscriptions.filter((s) => s.status === 'active').length === 0 ? (
                        <p className="text-sm text-fg-muted py-4">Tidak ada subscription aktif</p>
                    ) : (
                        <div className="space-y-2">
                            {subscriptions
                                .filter((s) => s.status === 'active')
                                .map((sub) => (
                                    <SubscriptionRow key={sub.id} sub={sub} />
                                ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Network at-a-glance */}
            <Card>
                <CardContent className="p-5">
                    <SectionTitle icon={Network} title="Network At-a-Glance" />
                    {pppoeActive.length === 0 && netwatch.length === 0 && onuLinked.length === 0 ? (
                        <p className="text-sm text-fg-muted py-4">Tidak ada data network terkait</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <NetworkMiniCard
                                label="PPPoE Session"
                                items={pppoeActive}
                                emptyText="Tidak ada session aktif"
                                renderItem={(p) => (
                                    <div>
                                        <div className="text-sm text-fg font-mono">{p.name}</div>
                                        <div className="text-xs text-fg-muted">{p.address || '—'}</div>
                                    </div>
                                )}
                            />
                            <NetworkMiniCard
                                label="Netwatch"
                                items={netwatch}
                                emptyText="Tidak ada monitoring entry"
                                renderItem={(n) => (
                                    <div>
                                        <div className="text-sm text-fg flex items-center gap-1.5">
                                            {n.status === 'up' ? (
                                                <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                                            ) : (
                                                <XCircle className="w-3.5 h-3.5 text-danger" />
                                            )}
                                            {n.host}
                                        </div>
                                        {n.latency != null && (
                                            <div className="text-xs text-fg-muted">{n.latency}ms</div>
                                        )}
                                    </div>
                                )}
                            />
                            <NetworkMiniCard
                                label="ONU Linked"
                                items={onuLinked}
                                emptyText="Tidak ada ONU terkait"
                                renderItem={(o) => (
                                    <Link to={`/olts/${o.oltId}?onu=${o.id}`} className="block hover:text-primary">
                                        <div className="text-sm font-mono">{o.sn}</div>
                                        <div className="text-xs text-fg-muted">RX: {o.lastRxPower || '—'}</div>
                                    </Link>
                                )}
                            />
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────
// TAGIHAN TAB
// ─────────────────────────────────────────────────────────────────────────

function TagihanTab({ data }) {
    const { invoices, payments } = data;

    return (
        <div className="space-y-4">
            <Card>
                <CardContent className="p-5">
                    <SectionTitle icon={Receipt} title={`Tagihan (${invoices.length})`} />
                    {invoices.length === 0 ? (
                        <p className="text-sm text-fg-muted py-4">Belum ada tagihan</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-xs uppercase text-fg-muted border-b border-slate-border">
                                    <tr>
                                        <th className="text-left py-2 px-2">No. Invoice</th>
                                        <th className="text-left py-2 px-2 hidden sm:table-cell">Periode</th>
                                        <th className="text-left py-2 px-2">Jatuh Tempo</th>
                                        <th className="text-right py-2 px-2">Jumlah</th>
                                        <th className="text-right py-2 px-2">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-border/40">
                                    {invoices.map((inv) => (
                                        <tr key={inv.id} className="hover:bg-slate-surface/30">
                                            <td className="py-2 px-2 font-mono text-xs text-fg">{inv.invoiceNumber}</td>
                                            <td className="py-2 px-2 text-fg-muted hidden sm:table-cell">
                                                {inv.periodStart ? `${formatDate(inv.periodStart)} – ${formatDate(inv.periodEnd)}` : '—'}
                                            </td>
                                            <td className="py-2 px-2 text-fg-muted">{formatDate(inv.dueAt)}</td>
                                            <td className="py-2 px-2 text-right text-fg font-semibold">{formatRupiah(inv.amount)}</td>
                                            <td className="py-2 px-2 text-right">
                                                <InvoiceStatusBadge status={inv.status} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-5">
                    <SectionTitle icon={CheckCircle2} title={`Pembayaran (${payments.length})`} />
                    {payments.length === 0 ? (
                        <p className="text-sm text-fg-muted py-4">Belum ada pembayaran</p>
                    ) : (
                        <div className="space-y-2">
                            {payments.map((p) => (
                                <div key={p.id} className="flex items-center justify-between py-2 border-b border-slate-border/40 last:border-0">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm text-fg font-mono">{p.invoiceNumber}</div>
                                        <div className="text-xs text-fg-muted">
                                            {formatDateTime(p.recordedAt)} · via <span className="uppercase">{p.method}</span>
                                            {p.recordedByName && ` · ${p.recordedByName}`}
                                        </div>
                                    </div>
                                    <span className="text-sm font-semibold text-success">{formatRupiah(p.amount)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────
// NETWORK TAB
// ─────────────────────────────────────────────────────────────────────────

function NetworkTab({ data }) {
    const { pppoeActive, netwatch, onuLinked, subscriptions } = data;

    // Kumpulkan router unik dari subscriptions
    const uniqRouters = [];
    const seen = new Set();
    for (const s of subscriptions) {
        if (s.routerId && !seen.has(s.routerId)) {
            seen.add(s.routerId);
            uniqRouters.push({ id: s.routerId, name: s.routerName, host: s.routerHost });
        }
    }

    return (
        <div className="space-y-4">
            <Card>
                <CardContent className="p-5">
                    <SectionTitle icon={RouterIcon} title={`Router (${uniqRouters.length})`} />
                    {uniqRouters.length === 0 ? (
                        <p className="text-sm text-fg-muted py-4">Tidak ada router yang terkait</p>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {uniqRouters.map((r) => (
                                <Link key={r.id} to={`/routers/${r.id}`} className="block p-3 rounded-lg bg-surface-darker/50 border border-slate-border/40 hover:bg-slate-surface/40">
                                    <div className="flex items-center justify-between">
                                        <div className="min-w-0 flex-1">
                                            <div className="text-sm font-semibold text-fg truncate">{r.name}</div>
                                            <div className="text-xs text-fg-muted font-mono">{r.host}</div>
                                        </div>
                                        <ExternalLink className="w-4 h-4 text-fg-muted shrink-0" />
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-5">
                    <SectionTitle icon={Wifi} title={`PPPoE Active Sessions (${pppoeActive.length})`} />
                    {pppoeActive.length === 0 ? (
                        <p className="text-sm text-fg-muted py-4">Tidak ada session aktif</p>
                    ) : (
                        <div className="space-y-2">
                            {pppoeActive.map((p, i) => (
                                <div key={i} className="flex items-center justify-between py-2 border-b border-slate-border/40 last:border-0">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-mono text-fg">{p.name}</div>
                                        <div className="text-xs text-fg-muted">
                                            {p.address || '—'} · {p.routerName}
                                        </div>
                                    </div>
                                    {p.uptime && <span className="text-xs text-fg-muted">{p.uptime}</span>}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-5">
                    <SectionTitle icon={Activity} title={`Netwatch (${netwatch.length})`} />
                    {netwatch.length === 0 ? (
                        <p className="text-sm text-fg-muted py-4">Tidak ada netwatch entry</p>
                    ) : (
                        <div className="space-y-2">
                            {netwatch.map((n) => (
                                <Link key={n.id} to={`/routers/${n.routerId}?tab=netwatch`} className="flex items-center justify-between py-2 border-b border-slate-border/40 last:border-0 hover:bg-slate-surface/30 rounded px-2">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                        {n.status === 'up' ? (
                                            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                                        ) : n.status === 'down' ? (
                                            <XCircle className="w-4 h-4 text-danger shrink-0" />
                                        ) : (
                                            <Clock className="w-4 h-4 text-fg-muted shrink-0" />
                                        )}
                                        <div className="min-w-0">
                                            <div className="text-sm text-fg font-mono">{n.host || n.name}</div>
                                            <div className="text-xs text-fg-muted">{n.routerName}</div>
                                        </div>
                                    </div>
                                    {n.latency != null && <span className="text-xs text-fg-muted">{n.latency}ms</span>}
                                </Link>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-5">
                    <SectionTitle icon={BoxIcon} title={`ONU Linked (${onuLinked.length})`} />
                    {onuLinked.length === 0 ? (
                        <p className="text-sm text-fg-muted py-4">Tidak ada ONU terkait</p>
                    ) : (
                        <div className="space-y-2">
                            {onuLinked.map((o) => (
                                <Link key={o.id} to={`/olts/${o.oltId}?onu=${o.id}`} className="flex items-center justify-between py-2 border-b border-slate-border/40 last:border-0 hover:bg-slate-surface/30 rounded px-2">
                                    <div className="min-w-0 flex-1">
                                        <div className="text-sm font-mono text-fg">{o.sn}</div>
                                        <div className="text-xs text-fg-muted">
                                            {o.name || '—'}
                                            {o.lastRxPower && ` · RX ${o.lastRxPower}`}
                                        </div>
                                    </div>
                                    <Badge
                                        variant={o.status === 'online' ? 'success' : o.status === 'offline' ? 'danger' : 'ghost'}
                                        size="xs"
                                    >
                                        {o.status}
                                    </Badge>
                                </Link>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────
// AKTIVITAS TAB
// ─────────────────────────────────────────────────────────────────────────

function AktivitasTab({ data }) {
    const { activity, waNotifs } = data;

    // Merge aktivitas + WA notif jadi 1 timeline, sort by waktu
    const merged = [
        ...activity.map((a) => ({ ...a, _kind: 'audit', _at: a.createdAt })),
        ...waNotifs.map((w) => ({ ...w, _kind: 'wa', _at: w.createdAt })),
    ].sort((a, b) => new Date(b._at).getTime() - new Date(a._at).getTime());

    if (merged.length === 0) {
        return (
            <Card>
                <CardContent className="p-6 text-center">
                    <History className="w-10 h-10 text-fg-muted mx-auto mb-3" />
                    <p className="text-sm text-fg-muted">Belum ada aktivitas tercatat</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card>
            <CardContent className="p-5">
                <SectionTitle icon={History} title={`Timeline (${merged.length})`} />
                <div className="space-y-3">
                    {merged.map((item, i) => (
                        <ActivityRow key={`${item._kind}-${item.id}-${i}`} item={item} />
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}

function ActivityRow({ item }) {
    if (item._kind === 'wa') {
        const statusColor = item.status === 'sent' || item.status === 'delivered' ? 'success' :
            item.status === 'failed' ? 'danger' : 'ghost';
        return (
            <div className="flex items-start gap-3 py-2 border-b border-slate-border/40 last:border-0">
                <div className="p-1.5 rounded-md bg-cyan-500/10 text-cyan-400 shrink-0">
                    <Phone className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="text-sm text-fg">
                        WA <span className="uppercase font-semibold">{item.type}</span> ke {item.toPhone}
                    </div>
                    <div className="text-xs text-fg-muted flex items-center gap-2">
                        {formatDateTime(item.createdAt)}
                        <Badge variant={statusColor} size="xs">{item.status}</Badge>
                        {item.error && <span className="text-danger truncate">{item.error}</span>}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-start gap-3 py-2 border-b border-slate-border/40 last:border-0">
            <div className="p-1.5 rounded-md bg-primary/10 text-primary shrink-0">
                <Activity className="w-3.5 h-3.5" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="text-sm text-fg">
                    <span className="font-semibold">{item.action}</span> · {item.entity}
                    {item.userName && <span className="text-fg-muted"> oleh {item.userName}</span>}
                </div>
                <div className="text-xs text-fg-muted">{formatDateTime(item.createdAt)}</div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, title }) {
    return (
        <h3 className="flex items-center gap-2 text-sm font-bold text-fg mb-3">
            <Icon className="w-4 h-4 text-fg-muted" />
            {title}
        </h3>
    );
}

function SummaryCard({ label, value, icon: Icon, color, subValue }) {
    const colorCls = {
        success: 'bg-success/10 text-success',
        danger: 'bg-danger/10 text-danger',
        warning: 'bg-warning/10 text-warning',
        slate: 'bg-slate-surface text-fg-muted',
    }[color] || 'bg-slate-surface text-fg-muted';

    return (
        <Card>
            <CardContent className="p-4">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-fg-muted mb-2">
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                </div>
                <div className={clsx('text-xl font-bold tabular-nums', colorCls.replace(/bg-[^ ]+ /, ''))}>
                    {value}
                </div>
                {subValue && <div className="text-xs text-fg-muted mt-1">{subValue}</div>}
            </CardContent>
        </Card>
    );
}

function SubscriptionRow({ sub }) {
    return (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-surface-darker/50 border border-slate-border/40">
            <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-fg truncate">{sub.packageName || '—'}</div>
                <div className="text-xs text-fg-muted">
                    {sub.type?.toUpperCase()} · {sub.mikrotikIdentity || '—'} · {sub.routerName || '—'}
                </div>
            </div>
            <div className="text-right shrink-0">
                <div className="text-sm font-semibold text-fg">{formatRupiah(sub.packagePrice)}</div>
                {sub.nextDueAt && (
                    <div className="text-[10px] text-fg-muted">due {formatDate(sub.nextDueAt)}</div>
                )}
            </div>
        </div>
    );
}

function NetworkMiniCard({ label, items, emptyText, renderItem }) {
    return (
        <div className="p-3 rounded-lg bg-surface-darker/50 border border-slate-border/40">
            <div className="text-[10px] font-bold uppercase tracking-wider text-fg-muted mb-2">{label}</div>
            {items.length === 0 ? (
                <p className="text-xs text-fg-muted">{emptyText}</p>
            ) : (
                <div className="space-y-2">
                    {items.slice(0, 3).map((item, i) => (
                        <div key={i}>{renderItem(item)}</div>
                    ))}
                    {items.length > 3 && (
                        <div className="text-[10px] text-fg-muted">+{items.length - 3} lainnya</div>
                    )}
                </div>
            )}
        </div>
    );
}

function InvoiceStatusBadge({ status }) {
    const cfg = {
        paid: { label: 'PAID', variant: 'success' },
        unpaid: { label: 'UNPAID', variant: 'warning' },
        overdue: { label: 'OVERDUE', variant: 'danger' },
        cancelled: { label: 'CANCELLED', variant: 'ghost' },
    }[status] || { label: status?.toUpperCase() || '—', variant: 'ghost' };

    return <Badge variant={cfg.variant} size="xs">{cfg.label}</Badge>;
}

function formatRupiah(n) {
    const v = Number(n) || 0;
    return 'Rp ' + v.toLocaleString('id-ID');
}

function formatDate(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
        return '—';
    }
}

function formatDateTime(iso) {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
        return '—';
    }
}
