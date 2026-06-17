import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signOut, useSession, useRole } from '../lib/auth-client';
import {
    useRouters,
    useUnreadAlertCount,
    useSettings,
    useCurrentUser,
} from '@/hooks';
import { useDriftSummary } from '@/hooks/useBillingDrift';
import {
    Map as MapIcon,
    Bell,
    Router as RouterIcon,
    Settings as SettingsIcon,
    LogOut,
    X,
    LayoutDashboard,
    BarChart3,
    Receipt,
    Wifi,
    Monitor,
    Server,
    Activity,
    Globe,
    Users,
    History,
    MessageSquare,
    Building,
    Network,
    ChevronRight,
} from 'lucide-react';
import clsx from 'clsx';
import TenantSwitcher from './TenantSwitcher';

/**
 * Sidebar — Slim icon-only (56px) di desktop, overlay di mobile.
 *
 * Brief:
 *   - 4 main nav: Map → Alert → Router → Settings
 *   - Settings click → opens flyout panel dengan semua sub-menu lain
 *   - Map jadi pusat perhatian — sidebar hanya 56px, tidak ngambil banyak space
 *
 * Sub-menu di flyout (categorized):
 *   - Overview: Dashboard, Analytics
 *   - Bisnis: Billing, MikHMON Console
 *   - Monitoring: GenieACS, OLTs, System Issues, Service Health
 *   - Administrasi: Users, Audit Log, Notifications, Tenants, VPN Servers
 *   - App: Pengaturan Aplikasi
 *
 * Reference: docs/REFACTORING-PLAN.md Part D + brief user "max 4 nav item"
 */

const MAIN_NAV = [
    { path: '/map', icon: MapIcon, label: 'Map' },
    { path: '/alerts', icon: Bell, label: 'Alert', badgeKey: 'alerts' },
    { path: '/routers', icon: RouterIcon, label: 'Router', badgeKey: 'routers' },
];

const SETTINGS_GROUPS = [
    {
        title: 'Overview',
        items: [
            { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
            { path: '/analytics', icon: BarChart3, label: 'Analytics', roles: ['admin', 'operator'] },
        ],
    },
    {
        title: 'Bisnis',
        items: [
            { path: '/billing', icon: Receipt, label: 'Billing', roles: ['admin', 'operator'], badgeKey: 'drift' },
            { path: '/mikhmon', icon: Wifi, label: 'MikHMON Console', roles: ['admin', 'operator'] },
        ],
    },
    {
        title: 'Monitoring',
        items: [
            { path: '/genieacs', icon: Monitor, label: 'GenieACS' },
            { path: '/olts', icon: Server, label: 'OLTs' },
            { path: '/issues', icon: Activity, label: 'System Issues', badgeKey: 'issues' },
            { path: '/netwatch', icon: Globe, label: 'Service Health', roles: ['admin'] },
        ],
    },
    {
        title: 'Administrasi',
        items: [
            { path: '/users', icon: Users, label: 'Users', roles: ['admin'] },
            { path: '/audit-logs', icon: History, label: 'Audit Log', roles: ['admin'] },
            { path: '/notification-groups', icon: MessageSquare, label: 'Notifications', roles: ['admin'] },
            { path: '/tenants', icon: Building, label: 'Tenants / ISPs', roles: ['superadmin'] },
            { path: '/settings/vpn-servers', icon: Network, label: 'VPN Servers', roles: ['superadmin'] },
        ],
    },
    {
        title: 'Aplikasi',
        items: [
            { path: '/settings', icon: SettingsIcon, label: 'Pengaturan Aplikasi' },
        ],
    },
];

function canAccess(item, roles) {
    if (!item.roles) return true;
    const { isAdmin, isOperator, isSuperAdmin } = roles;
    if (item.roles.includes('superadmin')) return isSuperAdmin;
    if (item.roles.includes('admin')) return isAdmin || isSuperAdmin;
    if (item.roles.includes('operator')) return isAdmin || isOperator || isSuperAdmin;
    return true;
}

function NavIconButton({ to, icon: Icon, label, isActive, badge, badgeColor, onClick }) {
    const className = clsx(
        'group relative flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-200',
        isActive
            ? 'bg-primary/15 text-primary'
            : 'text-fg-muted hover:bg-white/5 hover:text-fg',
    );

    const content = (
        <>
            {isActive && (
                <span
                    className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1.5 w-1 h-6 bg-primary rounded-r-full shadow-[0_0_8px_var(--primary)]"
                    aria-hidden="true"
                />
            )}
            <Icon className={clsx('w-5 h-5 transition-transform group-hover:scale-110', isActive && 'scale-110')} aria-hidden="true" />
            {badge !== undefined && badge > 0 && (
                <span
                    className={clsx(
                        'absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-bold flex items-center justify-center ring-2 ring-surface-darker',
                        badgeColor || 'bg-primary text-white',
                    )}
                    aria-label={`${badge} ${label.toLowerCase()}`}
                >
                    {badge > 99 ? '99+' : badge}
                </span>
            )}
            {/* Tooltip kanan saat hover */}
            <span
                role="tooltip"
                className="pointer-events-none absolute left-full ml-3 px-2.5 py-1.5 rounded-md bg-surface-dark border border-slate-border text-xs font-medium text-fg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 shadow-xl z-50"
            >
                {label}
            </span>
        </>
    );

    if (onClick) {
        return (
            <button type="button" onClick={onClick} className={className} aria-label={label}>
                {content}
            </button>
        );
    }
    return (
        <Link to={to} className={className} aria-label={label} aria-current={isActive ? 'page' : undefined}>
            {content}
        </Link>
    );
}

function SettingsFlyout({ isOpen, onClose, navigate, location, roles, badges }) {
    const panelRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleNav = (path) => {
        navigate(path);
        onClose();
    };

    return (
        <>
            {/* Backdrop + panel z-index harus di atas Sidebar mobile drawer (z-2001)
                supaya flyout tidak tertutupi drawer. */}
            <div
                className="fixed inset-0 z-[2050] bg-black/50 backdrop-blur-sm dl-backdrop-in"
                onClick={onClose}
                aria-hidden="true"
            />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label="Menu Settings"
                className={clsx(
                    'fixed z-[2060] bg-surface-dark border border-slate-border shadow-2xl flex flex-col dl-card-in',
                    'inset-x-0 bottom-0 rounded-t-2xl max-h-[85vh]',
                    'lg:left-16 lg:inset-y-4 lg:right-auto lg:w-72 lg:rounded-2xl lg:max-h-none',
                )}
            >
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-border">
                    <h3 className="text-sm font-bold text-fg uppercase tracking-wider">Menu</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Tutup menu"
                        className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-white/5 transition-colors"
                    >
                        <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3 space-y-4">
                    {SETTINGS_GROUPS.map((group) => {
                        const visible = group.items.filter((it) => canAccess(it, roles));
                        if (visible.length === 0) return null;
                        return (
                            <div key={group.title}>
                                <h4 className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-fg-muted">
                                    {group.title}
                                </h4>
                                <div className="flex flex-col gap-0.5">
                                    {visible.map((it) => {
                                        const Icon = it.icon;
                                        const isActive = location.pathname === it.path;
                                        const badge = it.badgeKey ? badges[it.badgeKey] : undefined;
                                        return (
                                            <button
                                                key={it.path}
                                                type="button"
                                                onClick={() => handleNav(it.path)}
                                                aria-current={isActive ? 'page' : undefined}
                                                className={clsx(
                                                    'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors',
                                                    isActive
                                                        ? 'bg-primary/10 text-primary'
                                                        : 'text-fg-muted hover:bg-white/5 hover:text-fg',
                                                )}
                                            >
                                                <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                                                <span className="text-sm font-medium flex-1">{it.label}</span>
                                                {badge !== undefined && badge > 0 && (
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-status-issue/15 text-status-issue">
                                                        {badge > 99 ? '99+' : badge}
                                                    </span>
                                                )}
                                                <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="px-3 py-3 border-t border-slate-border">
                    <TenantSwitcher />
                </div>
            </div>
        </>
    );
}

function Sidebar({ isOpen, onClose }) {
    const location = useLocation();
    const navigate = useNavigate();
    const { data: routers = [] } = useRouters();
    const { data: alertCount } = useUnreadAlertCount();
    const { data: settings } = useSettings();
    const { isAdmin, isOperator, isSuperAdmin } = useRole();
    const { data: currentUser } = useCurrentUser();
    const { data: driftSummary } = useDriftSummary({ enabled: isAdmin || isOperator });

    const [settingsOpen, setSettingsOpen] = useState(false);

    // Close settings flyout saat route berubah
    useEffect(() => {
        setSettingsOpen(false);
    }, [location.pathname]);

    const handleLogout = useCallback(async () => {
        try {
            await signOut();
        } catch {
            // signOut bisa gagal kalau session sudah expired di server
        }
        window.location.href = '/login';
    }, []);

    const isMainActive = (path) => location.pathname === path || location.pathname.startsWith(`${path}/`);

    const badges = {
        alerts: alertCount?.connectivity ?? 0,
        routers: routers.length,
        issues: alertCount?.issues ?? 0,
        drift: driftSummary?.count ?? 0,
    };

    // Settings dianggap "active" kalau current route ada di mana pun di SETTINGS_GROUPS
    const isSettingsActive = SETTINGS_GROUPS.some((g) =>
        g.items.some((it) => location.pathname === it.path || location.pathname.startsWith(`${it.path}/`)),
    );

    return (
        <>
            {/* Backdrop mobile saat drawer terbuka */}
            {isOpen && (
                <div
                    className="fixed inset-0 z-[2000] bg-black/60 backdrop-blur-sm lg:hidden"
                    onClick={onClose}
                    aria-hidden="true"
                />
            )}

            <aside
                aria-label="Sidebar Navigation"
                className={clsx(
                    // Mobile: drawer 240px slide-in
                    'fixed inset-y-0 left-0 z-[2001] flex flex-col bg-surface-darker/95 backdrop-blur-xl border-r border-slate-border transition-transform duration-300',
                    'w-60 lg:w-16',
                    isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
                    // Desktop: permanent slim 64px, normal layout
                    'lg:static lg:z-40 lg:shadow-none',
                )}
            >
                {/* Top: avatar / brand */}
                <div className="flex items-center justify-center h-16 border-b border-slate-border lg:px-2 px-4">
                    <div
                        role="img"
                        aria-label={`Profile ${currentUser?.name || 'User'}`}
                        title={settings?.appName || 'NetMonitor'}
                        className="w-10 h-10 rounded-lg bg-cover bg-center ring-2 ring-primary/30 shadow-[0_0_10px_rgba(59,130,246,0.25)]"
                        style={{
                            backgroundImage: currentUser?.image
                                ? `url("${currentUser.image}")`
                                : 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                        }}
                    />
                    {/* Mobile only: app name + close button */}
                    <div className="lg:hidden ml-3 flex-1 min-w-0">
                        <div className="text-sm font-bold text-fg truncate">{settings?.appName || 'NetMonitor'}</div>
                        <div className="text-xs text-fg-muted truncate">{currentUser?.name || 'User'}</div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Tutup sidebar"
                        className="lg:hidden p-2 text-fg-muted hover:text-fg"
                    >
                        <X className="w-5 h-5" aria-hidden="true" />
                    </button>
                </div>

                {/* Main 4 nav items */}
                <nav
                    role="navigation"
                    aria-label="Main Navigation"
                    className="flex-1 flex flex-col items-center gap-1.5 py-4 lg:px-2 px-3 overflow-y-auto custom-scrollbar"
                >
                    {/* Mobile: TenantSwitcher di atas nav */}
                    <div className="w-full lg:hidden mb-3">
                        <TenantSwitcher />
                    </div>

                    {MAIN_NAV.map((item) => {
                        const isActive = isMainActive(item.path);
                        const badge = item.badgeKey ? badges[item.badgeKey] : undefined;
                        // Badge color: alerts/issues pakai status warna, lain default
                        const badgeColor =
                            item.badgeKey === 'alerts' && badge > 0
                                ? 'bg-status-offline text-white'
                                : item.badgeKey === 'issues' && badge > 0
                                  ? 'bg-status-issue text-black'
                                  : undefined;
                        return (
                            <div key={item.path} className="lg:w-auto w-full">
                                {/* Desktop: icon only */}
                                <div className="hidden lg:block">
                                    <NavIconButton
                                        to={item.path}
                                        icon={item.icon}
                                        label={item.label}
                                        isActive={isActive}
                                        badge={badge}
                                        badgeColor={badgeColor}
                                    />
                                </div>
                                {/* Mobile: icon + label horizontal */}
                                <Link
                                    to={item.path}
                                    onClick={onClose}
                                    aria-current={isActive ? 'page' : undefined}
                                    className={clsx(
                                        'lg:hidden flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-colors',
                                        isActive
                                            ? 'bg-primary/15 text-primary'
                                            : 'text-fg-muted hover:bg-white/5 hover:text-fg',
                                    )}
                                >
                                    <item.icon className="w-5 h-5" aria-hidden="true" />
                                    <span className="text-sm font-medium flex-1">{item.label}</span>
                                    {badge !== undefined && badge > 0 && (
                                        <span
                                            className={clsx(
                                                'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                                                badgeColor || 'bg-primary text-white',
                                            )}
                                        >
                                            {badge > 99 ? '99+' : badge}
                                        </span>
                                    )}
                                </Link>
                            </div>
                        );
                    })}

                    {/* Settings — opens flyout */}
                    <div className="lg:w-auto w-full lg:mt-auto mt-4">
                        <div className="hidden lg:block">
                            <NavIconButton
                                icon={SettingsIcon}
                                label="Menu"
                                isActive={settingsOpen || isSettingsActive}
                                onClick={() => setSettingsOpen((v) => !v)}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                // Mobile: tutup drawer dulu, lalu buka flyout sebagai
                                // bottom sheet — supaya flyout tidak tertutupi drawer.
                                onClose();
                                setSettingsOpen(true);
                            }}
                            className={clsx(
                                'lg:hidden flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-colors',
                                isSettingsActive
                                    ? 'bg-primary/15 text-primary'
                                    : 'text-fg-muted hover:bg-white/5 hover:text-fg',
                            )}
                        >
                            <SettingsIcon className="w-5 h-5" aria-hidden="true" />
                            <span className="text-sm font-medium flex-1 text-left">Menu</span>
                            <ChevronRight className="w-4 h-4" aria-hidden="true" />
                        </button>
                    </div>
                </nav>

                {/* Bottom: logout */}
                <div className="border-t border-slate-border lg:p-2 p-3">
                    <div className="hidden lg:block">
                        <NavIconButton
                            icon={LogOut}
                            label="Logout"
                            onClick={handleLogout}
                        />
                    </div>
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="lg:hidden flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-status-offline hover:bg-status-offline/10 transition-colors"
                        aria-label="Logout"
                    >
                        <LogOut className="w-5 h-5" aria-hidden="true" />
                        <span className="text-sm font-medium">Logout</span>
                    </button>
                </div>
            </aside>

            <SettingsFlyout
                isOpen={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                navigate={navigate}
                location={location}
                roles={{ isAdmin, isOperator, isSuperAdmin }}
                badges={badges}
            />
        </>
    );
}

export default Sidebar;
