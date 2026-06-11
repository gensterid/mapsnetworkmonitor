import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
    Search,
    Router as RouterIcon,
    Box as BoxIcon,
    Server,
    User,
    Link as LinkIcon,
    Activity,
    X,
    Command,
    Loader2,
} from 'lucide-react';
import clsx from 'clsx';
import { useDebounce } from '@/hooks/useDebounce';
import { searchService } from '@/services/search.service';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 200;

// Mapping icon per type
const ICON_MAP = {
    router: RouterIcon,
    olt: Server,
    onu: BoxIcon,
    customer: User,
    pppoe: LinkIcon,
    netwatch: Activity,
};

const TYPE_LABEL = {
    router: 'Router',
    olt: 'OLT',
    onu: 'ONU',
    customer: 'Customer',
    pppoe: 'PPPoE',
    netwatch: 'Netwatch',
};

// Warna badge per type — biar gampang skimming. Bukan accent kuat,
// cuma tinted background supaya tidak overpower konten.
const TYPE_BADGE_CLS = {
    router: 'bg-blue-500/10 text-blue-400',
    olt: 'bg-purple-500/10 text-purple-400',
    onu: 'bg-amber-500/10 text-amber-400',
    customer: 'bg-emerald-500/10 text-emerald-400',
    pppoe: 'bg-cyan-500/10 text-cyan-400',
    netwatch: 'bg-pink-500/10 text-pink-400',
};

const TYPE_ORDER = ['router', 'olt', 'onu', 'customer', 'pppoe', 'netwatch'];

/**
 * Global Search Modal — Cmd+K / Ctrl+K trigger.
 *
 * - Input autofocus saat open
 * - Debounce 200ms ke API
 * - Keyboard nav: ↑↓ pilih, Enter buka, Esc tutup
 * - Click backdrop tutup
 * - Group result by type dengan icon
 */
export function GlobalSearchModal({ isOpen, onClose }) {
    const [query, setQuery] = useState('');
    const debouncedQuery = useDebounce(query, DEBOUNCE_MS);
    const [activeIdx, setActiveIdx] = useState(0);
    const navigate = useNavigate();
    const inputRef = useRef(null);
    const listRef = useRef(null);

    // Reset state saat modal close
    useEffect(() => {
        if (!isOpen) {
            setQuery('');
            setActiveIdx(0);
        } else {
            // Focus input next tick
            setTimeout(() => inputRef.current?.focus(), 0);
        }
    }, [isOpen]);

    // Fetch results
    const { data: results, isFetching } = useQuery({
        queryKey: ['global-search', debouncedQuery],
        queryFn: () => searchService.globalSearch(debouncedQuery),
        enabled: isOpen && debouncedQuery.length >= MIN_QUERY_LENGTH,
        staleTime: 30_000,
    });

    // Flatten results untuk keyboard nav
    const flatItems = useMemo(() => {
        if (!results) return [];
        const out = [];
        for (const type of TYPE_ORDER) {
            for (const item of results[type] || []) {
                out.push({ ...item, type });
            }
        }
        return out;
    }, [results]);

    // Reset activeIdx saat results berubah
    useEffect(() => {
        setActiveIdx(0);
    }, [debouncedQuery, results]);

    // Keyboard handlers
    useEffect(() => {
        if (!isOpen) return;

        const handler = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIdx((i) => Math.min(i + 1, flatItems.length - 1));
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIdx((i) => Math.max(i - 1, 0));
                return;
            }
            if (e.key === 'Enter') {
                const item = flatItems[activeIdx];
                if (item) {
                    e.preventDefault();
                    navigate(item.navigate);
                    onClose();
                }
            }
        };

        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [isOpen, flatItems, activeIdx, navigate, onClose]);

    // Scroll active item ke viewport
    useEffect(() => {
        if (!listRef.current) return;
        const el = listRef.current.querySelector(`[data-idx="${activeIdx}"]`);
        if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [activeIdx]);

    const handleItemClick = (item) => {
        navigate(item.navigate);
        onClose();
    };

    if (!isOpen) return null;

    const showMinHint = query.length > 0 && query.length < MIN_QUERY_LENGTH;
    const showEmpty = debouncedQuery.length >= MIN_QUERY_LENGTH && results && results.total === 0;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal — di tengah-atas (pattern modern command palette) */}
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Global Search"
                className="fixed top-[10vh] left-1/2 -translate-x-1/2 z-[201] w-[95vw] max-w-2xl"
            >
                <div className="bg-surface-dark border border-slate-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                    {/* Input */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-border shrink-0">
                        <Search className="w-5 h-5 text-fg-muted shrink-0" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Cari router, customer, ONU SN, PPPoE user, IP…"
                            className="flex-1 bg-transparent text-fg text-base placeholder:text-fg-muted focus:outline-none"
                            autoComplete="off"
                            spellCheck={false}
                        />
                        {isFetching && <Loader2 className="w-4 h-4 text-fg-muted animate-spin shrink-0" />}
                        <button
                            onClick={onClose}
                            className="text-fg-muted hover:text-fg p-1 rounded shrink-0"
                            aria-label="Close"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Results */}
                    <div ref={listRef} className="flex-1 overflow-y-auto">
                        {showMinHint ? (
                            <div className="p-6 text-center text-sm text-fg-muted">
                                Ketik minimal {MIN_QUERY_LENGTH} karakter…
                            </div>
                        ) : !query ? (
                            <EmptyHelp />
                        ) : !results ? (
                            // Saat debouncedQuery >= MIN tapi response belum datang,
                            // jangan render ResultsList (results undefined → crash).
                            // Spinner sudah tampil di input area; di sini tampilkan
                            // hint singkat supaya tidak kosong sepi.
                            <div className="p-6 text-center text-sm text-fg-muted">
                                Mencari…
                            </div>
                        ) : showEmpty ? (
                            <div className="p-6 text-center text-sm text-fg-muted">
                                Tidak ada hasil untuk &quot;{debouncedQuery}&quot;
                            </div>
                        ) : (
                            <ResultsList
                                results={results}
                                flatItems={flatItems}
                                activeIdx={activeIdx}
                                onItemClick={handleItemClick}
                                onItemHover={setActiveIdx}
                            />
                        )}
                    </div>

                    {/* Footer hint */}
                    <div className="border-t border-slate-border px-4 py-2 text-[10px] text-fg-muted flex items-center gap-4 shrink-0 bg-surface-darker/50">
                        <KbdHint keys={['↑', '↓']} label="navigate" />
                        <KbdHint keys={['Enter']} label="pilih" />
                        <KbdHint keys={['Esc']} label="tutup" />
                        {results && results.total > 0 && (
                            <span className="ml-auto">{results.total} hasil</span>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

function ResultsList({ results, flatItems, activeIdx, onItemClick, onItemHover }) {
    // Defense-in-depth: caller sudah filter undefined, tapi guard ekstra
    // supaya komponen tidak pernah throw kalau dipakai di tempat lain.
    if (!results) return null;

    let runningIdx = 0;

    return (
        <div className="py-2">
            {TYPE_ORDER.map((type) => {
                const items = results[type] || [];
                if (items.length === 0) return null;

                return (
                    <div key={type} className="mb-2">
                        <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest text-fg-muted">
                            {TYPE_LABEL[type]} ({items.length})
                        </div>
                        {items.map((item) => {
                            const Icon = ICON_MAP[type] || Search;
                            const idx = runningIdx++;
                            const isActive = idx === activeIdx;
                            return (
                                <button
                                    key={`${type}-${item.id}`}
                                    data-idx={idx}
                                    onClick={() => onItemClick(item)}
                                    onMouseEnter={() => onItemHover(idx)}
                                    className={clsx(
                                        'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                                        isActive
                                            ? 'bg-primary/10 text-fg'
                                            : 'text-fg hover:bg-slate-surface/50'
                                    )}
                                >
                                    <div className={clsx(
                                        'p-1.5 rounded-md shrink-0',
                                        isActive ? 'bg-primary/20 text-primary' : 'bg-slate-surface/50 text-fg-muted'
                                    )}>
                                        <Icon className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <div className="text-sm font-semibold truncate">{item.label}</div>
                                            {/* Type badge — visual cue tambahan supaya operator
                                                tau tipe entity tanpa harus baca heading. */}
                                            <span className={clsx(
                                                'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0',
                                                TYPE_BADGE_CLS[type] || 'bg-slate-surface text-fg-muted'
                                            )}>
                                                {TYPE_LABEL[type]}
                                            </span>
                                        </div>
                                        {item.subtitle && (
                                            <div className="text-xs text-fg-muted truncate">{item.subtitle}</div>
                                        )}
                                    </div>
                                    {item.badge && (
                                        <span className={clsx(
                                            'text-[10px] font-bold uppercase px-1.5 py-0.5 rounded',
                                            item.badge === 'online' || item.badge === 'up'
                                                ? 'bg-success/10 text-success'
                                                : item.badge === 'offline' || item.badge === 'down'
                                                ? 'bg-danger/10 text-danger'
                                                : 'bg-slate-surface text-fg-muted'
                                        )}>
                                            {item.badge}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}

function EmptyHelp() {
    return (
        <div className="p-6 space-y-3">
            <p className="text-sm text-fg-muted">Cari cepat ke seluruh data:</p>
            <ul className="space-y-2 text-sm">
                <Hint icon={RouterIcon} label="Router" desc="nama, IP, identity, model" />
                <Hint icon={Server} label="OLT" desc="nama, host, deskripsi" />
                <Hint icon={BoxIcon} label="ONU" desc="serial number, alias" />
                <Hint icon={User} label="Customer" desc="nama, kode, telepon, email" />
                <Hint icon={LinkIcon} label="PPPoE" desc="username session" />
                <Hint icon={Activity} label="Netwatch" desc="host IP, nama" />
            </ul>
        </div>
    );
}

function Hint({ icon: Icon, label, desc }) {
    return (
        <li className="flex items-center gap-3 text-fg-muted">
            <Icon className="w-4 h-4 shrink-0" />
            <span className="font-semibold text-fg">{label}</span>
            <span className="text-xs">— {desc}</span>
        </li>
    );
}

function KbdHint({ keys, label }) {
    return (
        <span className="inline-flex items-center gap-1">
            {keys.map((k, i) => (
                <kbd key={i} className="px-1.5 py-0.5 bg-slate-surface border border-slate-border rounded text-[10px] font-mono">
                    {k}
                </kbd>
            ))}
            <span>{label}</span>
        </span>
    );
}
