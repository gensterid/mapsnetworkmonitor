import React from 'react';
import { NavLink } from 'react-router-dom';
import { Map as MapIcon, Bell, Router as RouterIcon, Settings as SettingsIcon } from 'lucide-react';
import clsx from 'clsx';
import { useRouters, useUnreadAlertCount } from '@/hooks';

/**
 * BottomNav — Mobile only (lg:hidden). 4 strict items, no overflow More.
 *
 * 4 items match Sidebar desktop main nav order:
 *   Map → Alert → Router → Settings
 *
 * Settings tap → /settings page (page-level navigation, no flyout di bottom nav).
 * Untuk akses sub-menu (Billing, Mikhmon, dst.) operator buka Sidebar drawer
 * via hamburger di header mobile, lalu klik "Menu" → flyout.
 */

const ITEMS = [
    { path: '/map', icon: MapIcon, label: 'Map' },
    { path: '/alerts', icon: Bell, label: 'Alert', badgeKey: 'alerts' },
    { path: '/routers', icon: RouterIcon, label: 'Router', badgeKey: 'routers' },
    { path: '/settings', icon: SettingsIcon, label: 'Menu' },
];

function NavButton({ item, badge, badgeColor }) {
    const Icon = item.icon;
    return (
        <NavLink
            to={item.path}
            className={({ isActive }) =>
                clsx(
                    'relative flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 py-1 transition-colors',
                    isActive ? 'text-primary' : 'text-fg-muted active:text-fg',
                )
            }
            aria-label={item.label}
        >
            <div className="relative">
                <Icon className="w-5 h-5" aria-hidden="true" />
                {badge !== undefined && badge > 0 && (
                    <span
                        className={clsx(
                            'absolute -top-1 -right-2 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center ring-2 ring-surface-darker',
                            badgeColor || 'bg-primary text-white',
                        )}
                    >
                        {badge > 99 ? '99+' : badge}
                    </span>
                )}
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">{item.label}</span>
        </NavLink>
    );
}

export default function BottomNav() {
    const { data: routers = [] } = useRouters();
    const { data: alertCount } = useUnreadAlertCount();

    const badges = {
        alerts: alertCount?.connectivity ?? 0,
        routers: routers.length,
    };

    const badgeColors = {
        alerts: 'bg-status-offline text-white',
    };

    return (
        <nav
            aria-label="Bottom navigation"
            className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface-darker/95 backdrop-blur-lg border-t border-slate-border flex items-stretch justify-around px-1 z-40 pb-safe"
        >
            {ITEMS.map((item) => (
                <NavButton
                    key={item.path}
                    item={item}
                    badge={item.badgeKey ? badges[item.badgeKey] : undefined}
                    badgeColor={item.badgeKey ? badgeColors[item.badgeKey] : undefined}
                />
            ))}
        </nav>
    );
}
