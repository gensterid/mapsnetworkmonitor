import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard, Map, Router, Bell, Receipt,
    MoreHorizontal, X, Server, Monitor, Activity, Globe,
    BarChart3, Users, MessageSquare, Settings as SettingsIcon, Building,
} from 'lucide-react';
import clsx from 'clsx';
import { useRole } from '@/lib/auth-client';

/**
 * Bottom nav for mobile (lg:hidden). Shows 5 primary items + a "More"
 * button that opens a drawer with the rest of the sidebar destinations.
 *
 * Primary items chosen by frequency of use for an operator on the field:
 * Dashboard, Map, Routers, Billing, Alerts. Everything else (GenieACS,
 * OLTs, System Issues, Service Health, Users, Settings, Tenants, etc)
 * lives in the More drawer.
 */

const PRIMARY_ITEMS = [
    { label: 'Dash', icon: LayoutDashboard, path: '/' },
    { label: 'Map', icon: Map, path: '/map' },
    { label: 'Routers', icon: Router, path: '/routers' },
    { label: 'Billing', icon: Receipt, path: '/billing', minRole: 'operator' },
    { label: 'Alerts', icon: Bell, path: '/alerts' },
];

function NavButton({ item }) {
    const Icon = item.icon;
    return (
        <NavLink
            to={item.path}
            className={({ isActive }) => clsx(
                'flex flex-col items-center gap-1 flex-1 min-w-0 transition-colors',
                isActive ? 'text-primary' : 'text-fg-muted hover:text-fg'
            )}
        >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>
        </NavLink>
    );
}

export default function BottomNav() {
    const [drawerOpen, setDrawerOpen] = useState(false);
    const navigate = useNavigate();
    const { isAdmin, isSuperAdmin, isOperator } = useRole();

    const visiblePrimary = PRIMARY_ITEMS.filter((it) => {
        if (it.minRole === 'operator') return isAdmin || isOperator;
        return true;
    });

    const drawerItems = [
        { label: 'GenieACS', icon: Monitor, path: '/genieacs' },
        { label: 'OLTs', icon: Server, path: '/olts' },
        { label: 'System Issues', icon: Activity, path: '/issues' },
        ...(isAdmin ? [{ label: 'Service Health', icon: Globe, path: '/netwatch' }] : []),
        ...((isAdmin || isOperator) ? [{ label: 'Analytics', icon: BarChart3, path: '/analytics' }] : []),
        ...(isSuperAdmin ? [{ label: 'Tenants', icon: Building, path: '/tenants' }] : []),
        ...(isAdmin ? [{ label: 'Users', icon: Users, path: '/users' }] : []),
        ...(isAdmin ? [{ label: 'Notifications', icon: MessageSquare, path: '/notification-groups' }] : []),
        { label: 'Settings', icon: SettingsIcon, path: '/settings' },
    ];

    const goto = (path) => {
        setDrawerOpen(false);
        navigate(path);
    };

    return (
        <>
            <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface-darker/95 backdrop-blur-lg border-t border-slate-border flex items-stretch justify-between px-1 z-50 pb-safe">
                {visiblePrimary.map((item) => <NavButton key={item.path} item={item} />)}
                <button
                    type="button"
                    onClick={() => setDrawerOpen(true)}
                    className="flex flex-col items-center gap-1 flex-1 min-w-0 transition-colors text-fg-muted hover:text-fg"
                    aria-label="More navigation"
                >
                    <MoreHorizontal className="w-5 h-5" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">More</span>
                </button>
            </div>

            {drawerOpen && (
                <div
                    className="lg:hidden fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-end"
                    onClick={() => setDrawerOpen(false)}
                >
                    <div
                        className="w-full bg-surface-dark border-t border-slate-border rounded-t-2xl pb-safe"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-border">
                            <h3 className="text-sm font-bold text-fg uppercase tracking-wider">Menu Lainnya</h3>
                            <button onClick={() => setDrawerOpen(false)} className="text-fg-muted hover:text-fg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 p-4">
                            {drawerItems.map((it) => {
                                const Icon = it.icon;
                                return (
                                    <button
                                        key={it.path}
                                        onClick={() => goto(it.path)}
                                        className="flex flex-col items-center gap-2 p-3 rounded-lg bg-slate-surface/50 hover:bg-slate-surface active:scale-95 transition"
                                    >
                                        <Icon className="w-5 h-5 text-primary" />
                                        <span className="text-xs text-fg text-center leading-tight">{it.label}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
