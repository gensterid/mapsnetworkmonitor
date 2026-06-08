import React, { useState } from 'react';
import { Outlet, NavLink } from 'react-router-dom';
import {
    LayoutDashboard, Wifi, Users, ScrollText, Activity, ShieldCheck, Network,
    Gauge, FileBox, Server, Ticket, BarChart3, Menu, X, Printer, Upload, FileCode2,
} from 'lucide-react';
import RouterSelector from '@/components/mikhmon/RouterSelector';
import AutoRefreshSelect from '@/components/mikhmon/AutoRefreshSelect';
import ResourceWidget from '@/components/mikhmon/ResourceWidget';
import ModeBadge from '@/components/mikhmon/ModeBadge';
import { MikhmonProvider } from '@/contexts/MikhmonContext';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import clsx from 'clsx';

/**
 * MikHMON Console shell — Phase A1.
 *
 * Left sidebar lists every section we plan to support; pages are added
 * phase by phase. Items without a route yet are rendered as "Soon" so
 * operators see the planned scope but can't navigate to a 404.
 *
 * Hotspot-related menus are hidden when hotspot_mode === 'disabled' to
 * match the badge tooltip — operator who explicitly disabled hotspot
 * shouldn't see dead links.
 */

const SECTIONS = [
    {
        group: 'Console',
        items: [
            { path: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, ready: true },
        ],
    },
    {
        group: 'Hotspot',
        hotspotOnly: true,
        items: [
            { path: 'hotspot/users', label: 'Users', icon: Users, ready: true },
            { path: 'hotspot/profiles', label: 'User Profile', icon: ShieldCheck, ready: true },
            { path: 'hotspot/active', label: 'Active', icon: Activity, ready: true },
            { path: 'hotspot/hosts', label: 'Hosts', icon: Network, ready: true },
            { path: 'hotspot/ip-bindings', label: 'IP Binding', icon: ShieldCheck, ready: true },
            { path: 'hotspot/walled-garden', label: 'Walled Garden', icon: ShieldCheck, ready: true },
            { path: 'hotspot/cookies', label: 'Cookies', icon: FileBox, ready: true },
            { path: 'hotspot/server-profiles', label: 'Server Profile', icon: Server, ready: true },
        ],
    },
    {
        group: 'PPP',
        items: [
            { path: 'ppp/secrets', label: 'Secrets', icon: Users, ready: true },
            { path: 'ppp/profiles', label: 'Profile', icon: ShieldCheck, ready: true },
            { path: 'ppp/active', label: 'Active', icon: Activity, ready: true },
        ],
    },
    {
        group: 'IP / Queue',
        items: [
            { path: 'queues', label: 'Simple Queue', icon: Gauge, ready: true },
            { path: 'ip/pool', label: 'IP Pool', icon: Network, ready: true },
            { path: 'ip/dhcp-lease', label: 'DHCP Lease', icon: Network, ready: true },
            { path: 'ip/address-list', label: 'Address List', icon: Network, ready: true },
        ],
    },
    {
        group: 'System',
        items: [
            { path: 'system/log', label: 'Log', icon: ScrollText, ready: true },
            { path: 'system/scheduler', label: 'Scheduler', icon: Activity, ready: true },
            { path: 'system/backup', label: 'Backup', icon: FileBox, ready: true },
            { path: 'system/packages', label: 'Packages', icon: Server, ready: true },
        ],
    },
    {
        group: 'Billing',
        hotspotOnly: true,
        items: [
            { path: 'vouchers', label: 'Voucher', icon: Ticket, ready: true },
            { path: 'cetak-cepat', label: 'Cetak Cepat', icon: Printer, ready: true },
            { path: 'reports', label: 'Reports', icon: BarChart3, ready: true },
        ],
    },
    {
        group: 'Settings Voucher',
        hotspotOnly: true,
        items: [
            { path: 'settings/upload-logo', label: 'Upload Logo', icon: Upload, ready: true },
            { path: 'settings/template', label: 'Template Editor', icon: FileCode2, ready: true },
        ],
    },
];

function SidebarLink({ item }) {
    const Icon = item.icon;
    if (!item.ready) {
        return (
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg text-slate-500/70 cursor-not-allowed">
                <Icon className="w-4 h-4 shrink-0" />
                <span className="text-xs flex-1">{item.label}</span>
                <span className="text-[9px] uppercase tracking-wider opacity-60">Soon</span>
            </div>
        );
    }
    return (
        <NavLink
            to={item.path}
            className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2 rounded-lg transition-colors',
                isActive
                    ? 'bg-primary/10 text-white font-semibold'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
            )}
        >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="text-xs flex-1">{item.label}</span>
        </NavLink>
    );
}

export default function MikhmonLayout() {
    return (
        <MikhmonProvider>
            <MikhmonShell />
        </MikhmonProvider>
    );
}

function MikhmonShell() {
    const { selectedRouterId } = useMikhmonContext();
    const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

    return (
        <div className="flex h-[calc(100vh-0px)] bg-slate-950">
            {/* Sidebar — desktop */}
            <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-slate-800/60 bg-slate-900/40">
                <div className="px-4 py-3 border-b border-slate-800/60">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Console</div>
                    <div className="text-sm font-bold text-slate-200">MikHMON</div>
                </div>
                <SidebarSections />
            </aside>

            {/* Sidebar — mobile drawer */}
            {mobileSidebarOpen && (
                <div className="md:hidden fixed inset-0 z-40 flex">
                    <div className="w-56 bg-slate-900 border-r border-slate-800 flex flex-col">
                        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                            <div>
                                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Console</div>
                                <div className="text-sm font-bold text-slate-200">MikHMON</div>
                            </div>
                            <button onClick={() => setMobileSidebarOpen(false)} className="p-1 text-slate-400">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <SidebarSections onNavigate={() => setMobileSidebarOpen(false)} />
                    </div>
                    <div className="flex-1 bg-black/60" onClick={() => setMobileSidebarOpen(false)} />
                </div>
            )}

            {/* Main column */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top bar */}
                <header className="h-14 shrink-0 border-b border-slate-800/60 bg-slate-900/40 flex items-center gap-3 px-3 md:px-4">
                    <button
                        onClick={() => setMobileSidebarOpen(true)}
                        className="md:hidden p-1 text-slate-300"
                        aria-label="Buka menu"
                    >
                        <Menu className="w-5 h-5" />
                    </button>
                    <RouterSelector />
                    <ModeBadge className="hidden sm:inline-flex" />
                    <div className="flex-1" />
                    <ResourceWidget className="hidden lg:flex" />
                    <AutoRefreshSelect />
                </header>

                {/* Page body */}
                <main className="flex-1 overflow-y-auto p-4 md:p-6">
                    {!selectedRouterId ? (
                        <div className="text-center text-slate-500 text-sm py-20">
                            <Wifi className="w-10 h-10 mx-auto mb-3 opacity-40" />
                            <p>Pilih router di top bar untuk mulai.</p>
                        </div>
                    ) : (
                        <Outlet />
                    )}
                </main>
            </div>
        </div>
    );
}

function SidebarSections({ onNavigate }) {
    return (
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4 custom-scrollbar">
            {SECTIONS.map((sec) => (
                <div key={sec.group}>
                    <div className="px-3 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {sec.group}
                    </div>
                    <div className="space-y-0.5" onClick={onNavigate}>
                        {sec.items.map((item) => (
                            <SidebarLink key={item.path} item={item} />
                        ))}
                    </div>
                </div>
            ))}
        </nav>
    );
}
