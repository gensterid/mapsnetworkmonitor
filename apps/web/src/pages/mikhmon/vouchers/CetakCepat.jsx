import React, { useState, useMemo } from 'react';
import { Printer, RefreshCw, Search, Filter } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import { useMikhmonVouchers, useHotspotUserProfiles, useMikhmonInfo } from '@/hooks/useMikhmon';
import { Button } from '@/components/ui/Button';

/**
 * MikHMON Cetak Cepat — quick voucher print page.
 *
 * Lets the operator print voucher cards in bulk without going through the
 * Voucher tab's row selection. Layout mirrors MikHMON external "Cetak Cepat":
 *   - Filters: Profile · Date · Search
 *   - Template selector: 3 / 5 / 8 columns per row (proxy for card size)
 *   - Live preview panel
 *   - Print button opens a printer-friendly window with the selected layout
 *
 * Data source: same /ip/hotspot/user list as the Voucher tab (filter the
 * MikHMON v3 legacy comment vouchers). Print rendering is browser-native
 * window.print() — no PDF library needed, works on all platforms.
 */

const TEMPLATES = [
    { id: 'small', label: '8 kolom (kartu kecil)', cols: 8, fontSize: 8, padding: 4 },
    { id: 'medium', label: '5 kolom (kartu sedang)', cols: 5, fontSize: 10, padding: 6 },
    { id: 'large', label: '3 kolom (kartu besar)', cols: 3, fontSize: 12, padding: 10 },
];

const DATE_FILTERS = [
    { id: 'all', label: 'Semua tanggal' },
    { id: 'today', label: 'Hari ini' },
    { id: '7d', label: '7 hari terakhir' },
    { id: '30d', label: '30 hari terakhir' },
];

function ymdLocal(d) {
    const date = new Date(d);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export default function CetakCepat() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: info } = useMikhmonInfo(selectedRouterId);
    const { data: payload, isPending, refetch, isFetching } = useMikhmonVouchers(selectedRouterId);
    const { data: profiles = [] } = useHotspotUserProfiles(selectedRouterId);

    const items = payload?.data || [];

    const [profileFilter, setProfileFilter] = useState('all');
    const [dateFilter, setDateFilter] = useState('all');
    const [commentFilter, setCommentFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [template, setTemplate] = useState('medium');
    const [maxCount, setMaxCount] = useState(0); // 0 = no cap

    // Default to UNUSED vouchers only — operator doesn't want to print
    // vouchers that have already been redeemed by someone.
    const [onlyUnused, setOnlyUnused] = useState(true);

    // Comments come in batches when operator generates vouchers — every
    // generate-N call shares the same vc-NNN-mm.dd.yy-note tag. Group by
    // that tag so the operator can print "voucher batch hari ini" with
    // one click. Matches MikHMON external "Filter by Comment" dropdown.
    const commentBuckets = useMemo(() => {
        const map = new Map();
        for (const v of items) {
            const key = (v.note?.trim() || v.comment || '').trim();
            if (!key) continue;
            // Normalize: strip the trailing "-" some comments leave from
            // empty note positions, so vc-925-02.04.26- and vc-925-02.04.26
            // collapse into one bucket.
            const norm = key.replace(/-+$/, '');
            const cur = map.get(norm) || { key: norm, count: 0 };
            cur.count++;
            map.set(norm, cur);
        }
        // Sort newest first by date embedded in the comment tag if present
        // (vc-XXX-mm.dd.yy-...), otherwise alphabetic.
        return Array.from(map.values()).sort((a, b) => {
            const da = /\d{2}\.\d{2}\.\d{2}/.exec(a.key)?.[0] || '';
            const db = /\d{2}\.\d{2}\.\d{2}/.exec(b.key)?.[0] || '';
            if (da && db) return db.localeCompare(da); // newest first
            return a.key.localeCompare(b.key);
        });
    }, [items]);

    const filtered = useMemo(() => {
        const today = ymdLocal(new Date());
        const cutoff7 = new Date(); cutoff7.setDate(cutoff7.getDate() - 7);
        const cutoff30 = new Date(); cutoff30.setDate(cutoff30.getDate() - 30);
        const q = search.trim().toLowerCase();
        return items.filter((v) => {
            if (profileFilter !== 'all' && v.profile !== profileFilter) return false;
            if (commentFilter !== 'all') {
                const key = (v.note?.trim() || v.comment || '').replace(/-+$/, '');
                if (key !== commentFilter) return false;
            }
            if (dateFilter !== 'all' && v.generatedAt) {
                const d = new Date(v.generatedAt);
                if (dateFilter === 'today' && ymdLocal(d) !== today) return false;
                if (dateFilter === '7d' && d < cutoff7) return false;
                if (dateFilter === '30d' && d < cutoff30) return false;
            }
            if (onlyUnused && v.uptime && v.uptime !== '0s' && v.uptime !== '00:00:00') return false;
            if (q) {
                const hay = `${v.name} ${v.profile || ''} ${v.note || ''}`.toLowerCase();
                if (!hay.includes(q)) return false;
            }
            return true;
        });
    }, [items, profileFilter, commentFilter, dateFilter, search, onlyUnused]);

    const toPrint = useMemo(() => {
        if (maxCount > 0) return filtered.slice(0, maxCount);
        return filtered;
    }, [filtered, maxCount]);

    const tplConfig = TEMPLATES.find((t) => t.id === template) || TEMPLATES[1];

    const handlePrint = () => {
        if (toPrint.length === 0) {
            toast.error('Tidak ada voucher untuk dicetak');
            return;
        }
        const w = window.open('', '_blank', 'width=1000,height=800');
        if (!w) return;
        const routerName = info?.router?.name || '';
        const cardsHtml = toPrint.map((v) => `
            <div class="card">
                <div class="hdr">
                    <span class="lbl">USER</span>
                    <span class="profile">${v.profile || ''}</span>
                </div>
                <div class="code">${v.name}</div>
                ${v.mode === 'up' ? `
                    <div class="hdr"><span class="lbl">PASS</span></div>
                    <div class="code">${v.password || ''}</div>
                ` : ''}
                <div class="meta">${v.note || ''}${v.limitUptime ? ' · ' + v.limitUptime : ''}</div>
            </div>
        `).join('');
        w.document.write(`<!doctype html>
<html><head><title>Voucher Print</title>
<style>
    @page { margin: 8mm; size: A4; }
    body {
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        margin: 0;
        padding: 8px;
        color: #000;
    }
    .header {
        font-size: 11px;
        margin: 0 0 8px;
        display: flex;
        justify-content: space-between;
        color: #555;
        border-bottom: 1px solid #ddd;
        padding-bottom: 4px;
    }
    .grid {
        display: grid;
        grid-template-columns: repeat(${tplConfig.cols}, 1fr);
        gap: 4px;
    }
    .card {
        border: 1px dashed #444;
        padding: ${tplConfig.padding}px;
        break-inside: avoid;
        page-break-inside: avoid;
        font-size: ${tplConfig.fontSize}px;
    }
    .card .hdr {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        font-size: ${Math.max(tplConfig.fontSize - 2, 7)}px;
        color: #777;
        margin-bottom: 2px;
    }
    .card .profile { font-weight: 600; color: #333; }
    .card .code {
        font-family: ui-monospace, SF Mono, Menlo, monospace;
        font-size: ${tplConfig.fontSize + 4}px;
        font-weight: bold;
        letter-spacing: 1px;
        margin: 2px 0;
    }
    .card .meta {
        font-size: ${Math.max(tplConfig.fontSize - 2, 7)}px;
        color: #888;
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    @media print { .noprint { display: none; } }
</style></head>
<body>
    <div class="header">
        <span>${routerName} · ${toPrint.length} voucher</span>
        <span>${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
    </div>
    <div class="grid">${cardsHtml}</div>
    <script>setTimeout(() => window.print(), 200);</script>
</body></html>`);
        w.document.close();
    };

    const profileOptions = useMemo(() => {
        const set = new Set();
        for (const p of profiles) set.add(p.name);
        for (const v of items) if (v.profile) set.add(v.profile);
        return ['all', ...Array.from(set).sort()];
    }, [profiles, items]);

    return (
        <div className="space-y-4 max-w-6xl">
            <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                    <Printer className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-slate-100">Cetak Cepat</h1>
                        <p className="text-xs text-slate-500">Cetak voucher dalam jumlah banyak — filter dulu, pilih template, lalu print.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 disabled:opacity-40"
                        title="Refresh"
                    >
                        <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
                    </button>
                    <Button onClick={handlePrint} disabled={toPrint.length === 0}>
                        <Printer className="w-4 h-4 mr-1" />
                        Cetak ({toPrint.length})
                    </Button>
                </div>
            </div>

            {/* Filter & template — two columns layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="lg:col-span-2 space-y-3">
                    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
                            <Filter className="w-3.5 h-3.5" />
                            Filter Voucher
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Profile</span>
                                <select
                                    value={profileFilter}
                                    onChange={(e) => setProfileFilter(e.target.value)}
                                    className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2"
                                >
                                    {profileOptions.map((p) => <option key={p} value={p}>{p === 'all' ? 'Semua profile' : p}</option>)}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Tanggal Generate</span>
                                <select
                                    value={dateFilter}
                                    onChange={(e) => setDateFilter(e.target.value)}
                                    className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2"
                                >
                                    {DATE_FILTERS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                                </select>
                            </label>
                            <label className="flex flex-col gap-1 sm:col-span-2">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                                    Filter by Comment
                                    <span className="text-slate-600 normal-case font-normal ml-1">— print per batch generation</span>
                                </span>
                                <select
                                    value={commentFilter}
                                    onChange={(e) => setCommentFilter(e.target.value)}
                                    className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2"
                                >
                                    <option value="all">Semua comment</option>
                                    {commentBuckets.map((b) => (
                                        <option key={b.key} value={b.key}>{b.key} [{b.count}]</option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <div className="relative">
                            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Cari kode / profile / note…"
                                className="w-full pl-9 pr-3 py-2 bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg"
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <label className="flex flex-col gap-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Maksimal Cetak</span>
                                <input
                                    type="number"
                                    min={0}
                                    value={maxCount}
                                    onChange={(e) => setMaxCount(parseInt(e.target.value, 10) || 0)}
                                    placeholder="0 = semua"
                                    className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2"
                                />
                                <span className="text-[10px] text-slate-600 italic">0 = cetak semua hasil filter</span>
                            </label>
                            <label className="flex items-end gap-2 text-xs text-slate-300 cursor-pointer pb-1">
                                <input
                                    type="checkbox"
                                    checked={onlyUnused}
                                    onChange={(e) => setOnlyUnused(e.target.checked)}
                                    className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary/40"
                                />
                                <span>Hanya voucher yang belum dipakai</span>
                            </label>
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-slate-800/60 text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                            <span>Preview ({toPrint.length} dari {filtered.length} hasil filter)</span>
                            <span className="normal-case text-[10px] text-slate-600">Template: {tplConfig.label}</span>
                        </div>
                        <div className="p-4 max-h-[400px] overflow-y-auto custom-scrollbar bg-white/3">
                            {isPending ? (
                                <div className="text-center text-slate-500 text-xs py-10">Memuat voucher…</div>
                            ) : toPrint.length === 0 ? (
                                <div className="text-center text-slate-500 text-xs py-10">
                                    Tidak ada voucher cocok filter.
                                    <div className="mt-2 opacity-70">
                                        {items.length === 0
                                            ? 'Generate voucher dulu di tab Voucher.'
                                            : 'Coba ubah filter / hapus pencarian.'}
                                    </div>
                                </div>
                            ) : (
                                <div
                                    className="grid gap-1"
                                    style={{ gridTemplateColumns: `repeat(${tplConfig.cols}, minmax(0, 1fr))` }}
                                >
                                    {toPrint.slice(0, 30).map((v) => (
                                        <div key={v.id} className="border border-dashed border-slate-600 rounded p-1.5">
                                            <div className="flex items-center justify-between text-[8px] uppercase text-slate-500">
                                                <span>USER</span>
                                                <span className="text-slate-400 font-semibold">{v.profile || ''}</span>
                                            </div>
                                            <div className="font-mono font-bold text-slate-100 text-[11px] tracking-wider truncate">{v.name}</div>
                                            {v.mode === 'up' && (
                                                <>
                                                    <div className="text-[8px] uppercase text-slate-500 mt-0.5">PASS</div>
                                                    <div className="font-mono font-bold text-slate-100 text-[11px] tracking-wider truncate">{v.password}</div>
                                                </>
                                            )}
                                            <div className="text-[8px] text-slate-500 truncate">{v.note || ''}</div>
                                        </div>
                                    ))}
                                    {toPrint.length > 30 && (
                                        <div className="col-span-full text-center text-[10px] text-slate-500 py-2">
                                            … +{toPrint.length - 30} voucher lain
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Template Selector — right column */}
                <div className="space-y-3">
                    <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 space-y-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Template</div>
                        {TEMPLATES.map((t) => (
                            <label
                                key={t.id}
                                className={clsx(
                                    'flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors',
                                    template === t.id
                                        ? 'border-primary/50 bg-primary/10'
                                        : 'border-slate-700/40 hover:bg-white/5',
                                )}
                            >
                                <input
                                    type="radio"
                                    checked={template === t.id}
                                    onChange={() => setTemplate(t.id)}
                                    className="text-primary focus:ring-primary/40"
                                />
                                <span className="text-xs text-slate-200">{t.label}</span>
                            </label>
                        ))}
                        <p className="text-[10px] text-slate-600 leading-relaxed pt-2 border-t border-slate-800/60">
                            Kartu kecil cocok untuk banyak voucher per lembar A4 (cetak voucher harian). Kartu besar untuk paket bulanan / langganan yang dicetak satu-satu.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
