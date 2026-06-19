import React, { useState } from 'react';
import { Receipt, Users as UsersIcon, Package as PackageIcon, Settings as SettingsIcon, Ticket, BarChart3, MessageSquare, CreditCard, AlertTriangle, HandCoins } from 'lucide-react';
import clsx from 'clsx';

import { useDriftSummary } from '@/hooks/useBillingDrift';
import { usePromiseSummary } from '@/hooks/usePromiseToPay';

// Tab components — semua extract per file di pages/billing/ untuk
// maintainability. Sebelumnya inline di Billing.jsx (1694 baris monolith).
import PelangganTab from './billing/PelangganTab';
import PackagesTab from './billing/PackagesTab';
import InvoicesTab from './billing/InvoicesTab';
import TransaksiTab from './billing/TransaksiTab';
import VouchersTab from './billing/VouchersTab';
import ReportsTab from './billing/ReportsTab';
import WaTab from './billing/WaTab';
import PromisesTab from './billing/PromisesTab';
import DriftTab from './billing/DriftTab';
import SettingsTab from './billing/SettingsTab';

const TABS = [
    // Operasional harian
    { id: 'pelanggan', label: 'Pelanggan', icon: UsersIcon },
    { id: 'invoices', label: 'Tagihan', icon: Receipt },
    { id: 'transaksi', label: 'Transaksi', icon: CreditCard },
    { id: 'promises', label: 'Janji Bayar', icon: HandCoins },
    { id: 'vouchers', label: 'Voucher Hotspot', icon: Ticket },
    // Tools
    { id: 'reports', label: 'Laporan', icon: BarChart3 },
    { id: 'wa', label: 'Notifikasi WA', icon: MessageSquare },
    { id: 'drift', label: 'Drift Check', icon: AlertTriangle },
    // Setup (jarang diubah)
    { id: 'packages', label: 'Paket', icon: PackageIcon },
    { id: 'settings', label: 'Pengaturan Router', icon: SettingsIcon },
];

// ─── Page root ─────────────────────────────────────────────────────────────
export default function Billing() {
    const [tab, setTab] = useState('pelanggan');
    const { data: driftSummary } = useDriftSummary();
    const { data: promiseSummary } = usePromiseSummary();
    return (
        <div className="flex flex-col h-full bg-background-dark overflow-hidden">
            <div className="px-4 sm:px-6 pt-4 sm:pt-6 border-b border-slate-border bg-surface-dark/20">
                <div className="flex items-center justify-between mb-4 sm:mb-6">
                    <div>
                        <h1 className="text-xl sm:text-2xl font-bold text-fg flex items-center gap-2">
                            <Receipt className="w-6 h-6 sm:w-7 sm:h-7 text-primary" />
                            Billing & Manajemen Pelanggan
                        </h1>
                        <p className="text-fg-muted text-xs sm:text-sm">Pelanggan PPPoE & Hotspot, paket, tagihan, isolir otomatis</p>
                    </div>
                </div>
                {/* Tabs container — overflow-x-auto supaya bisa di-scroll horizontal
                    di mobile (10 tab tidak muat di lebar layar). shrink-0 di tiap
                    button supaya tidak ke-shrink jadi 2 baris. */}
                <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar -mx-4 sm:-mx-6 px-4 sm:px-6">
                    {TABS.map(t => {
                        const Icon = t.icon;
                        return (
                            <button key={t.id} onClick={() => setTab(t.id)} className={clsx(
                                'shrink-0 px-3 sm:px-5 py-3 text-xs sm:text-sm font-bold uppercase tracking-wider transition-all border-b-2 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap',
                                tab === t.id ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-fg-muted hover:text-fg'
                            )}>
                                <Icon className="w-4 h-4 shrink-0" /> {t.label}
                                {t.id === 'drift' && driftSummary?.count > 0 && (
                                    <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                        {driftSummary.count}
                                    </span>
                                )}
                                {t.id === 'promises' && promiseSummary?.pending > 0 && (
                                    <span className={clsx(
                                        'ml-1 text-[10px] px-1.5 py-0.5 rounded border',
                                        promiseSummary.overdue > 0
                                            ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                            : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                    )}>
                                        {promiseSummary.pending}{promiseSummary.overdue > 0 ? ` (${promiseSummary.overdue} lewat)` : ''}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                {tab === 'pelanggan' && <PelangganTab />}
                {tab === 'packages' && <PackagesTab />}
                {tab === 'invoices' && <InvoicesTab />}
                {tab === 'transaksi' && <TransaksiTab />}
                {tab === 'vouchers' && <VouchersTab />}
                {tab === 'reports' && <ReportsTab />}
                {tab === 'wa' && <WaTab />}
                {tab === 'promises' && <PromisesTab />}
                {tab === 'drift' && <DriftTab />}
                {tab === 'settings' && <SettingsTab />}
            </div>
        </div>
    );
}
