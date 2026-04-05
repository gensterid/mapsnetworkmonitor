import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signOut, useSession, useRole } from '../lib/auth-client';
import { useRouters, useUnreadAlertCount, useSettings, useCurrentUser } from '@/hooks';
import {
    LayoutDashboard,
    Map as MapIcon,
    Router as RouterIcon,
    Server,
    Bell,
    Users,
    Settings,
    LogOut,
    MessageSquare,
    Globe,
    X,
    BarChart3,
    Activity,
    Monitor,
    Building
} from 'lucide-react';
import clsx from 'clsx';
import TenantSwitcher from './TenantSwitcher';

// NavItem component moved outside Sidebar to prevent re-creation on every render
const NavItem = ({ path, icon: Icon, label, badge, badgeColor, isActive, onClose }) => (
    <Link
        to={path}
        onClick={() => onClose && onClose()}
        aria-current={isActive ? 'page' : undefined}
        aria-label={label}
        className={clsx(
            "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 group relative overflow-hidden mb-0.5",
            isActive
                ? "bg-primary/10 text-white font-semibold"
                : "text-slate-400 hover:bg-white/5 hover:text-slate-100"
        )}
    >
        {isActive && (
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-transparent animate-pulse opacity-50" />
        )}
        
        {isActive && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1.5 h-6 bg-primary rounded-r-full shadow-[0_0_15px_rgba(59,130,246,0.8)] z-20" />
        )}

        <Icon
            className={clsx(
                "w-5 h-5 transition-all duration-300 z-10",
                isActive ? "text-primary scale-110" : "group-hover:text-primary group-hover:scale-110"
            )}
        />
        <span className="text-sm z-10">{label}</span>
        {badge !== undefined && badge > 0 && (
            <span className={clsx(
                "ml-auto text-[10px] font-bold px-2 py-0.5 rounded-lg shadow-sm z-10",
                badgeColor || "bg-slate-800 text-slate-300"
            )}>
                {badge}
            </span>
        )}
    </Link>
);

const Sidebar = ({ isOpen, onClose }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const { data: routers = [] } = useRouters();
    const { data: alertCount } = useUnreadAlertCount();
    const { data: settings } = useSettings();
    const { user } = useSession(); // Access user profile
    const { isAdmin, isOperator, isSuperAdmin } = useRole();
    const { data: currentUser } = useCurrentUser();


    const isActive = (path) => location.pathname === path;

    const handleLogout = async () => {
        try {
            await signOut();
        } catch {
            // Even if signOut API call fails, force redirect to clear client state
        }
        // Use hard redirect instead of navigate() to fully clear all in-memory state
        // (React Query cache, Better Auth session cache, etc.)
        window.location.href = '/login';
    };

    return (
        <aside
            aria-label="Sidebar Navigation"
            className={clsx(
                "fixed lg:static inset-y-0 left-0 z-40 w-72 flex flex-col justify-between transition-all duration-500 ease-in-out shadow-2xl lg:shadow-none",
                isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
            )}>
            <div className="flex flex-col h-full glass-premium border-r border-white/5">
                {/* Header */}
                <div className="p-5 border-b border-slate-800/60 flex items-center justify-between">
                    <div className="flex gap-3 items-center">
                        <div
                            className="bg-center bg-no-repeat bg-cover rounded-full size-11 ring-2 ring-primary/30 shadow-[0_0_15px_rgba(59,130,246,0.3)] animate-scanner-pulse"
                            style={{ backgroundImage: `url("${currentUser?.image || 'https://lh3.googleusercontent.com/aida-public/AB6AXuC1XHZMAnwPDnl7XWDZTj6Fo5vz7tTYbe25rFl6RD5z5dbMYjPsgmj5EZYVGlNUcrblJmUFusaH1lZNUdSs98aMvJZZ2d2NcHmmbIFilw69mwIv5nKCWhOMx92t1dhoxq5djsd0kT1EP29FXVBiiY4NR3ExJa9rIS2O6QKmCxq6f5nDyDdaSKWgiDbh7AIhd9xvJUAnIwme70MpVL9eGWFGZtJ3R2wd61KiqrJ2hMOff1lm1ZUFtw_fI7TTg8Nj7-acAhqr3IOSNOet'}")` }}
                        >
                        </div>
                        <div className="flex flex-col">
                            <h1 className="text-white text-base font-bold leading-tight tracking-tight">
                                {settings?.appName || 'NetMonitor'}
                            </h1>
                            <p className="text-slate-500 text-xs font-medium">{currentUser?.name || 'User'}</p>
                        </div>
                    </div>

                    {/* Mobile Close Button */}
                    <button
                        onClick={onClose}
                        aria-label="Close sidebar"
                        className="lg:hidden p-2 text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Navigation */}
                <div className="flex flex-col gap-1.5 p-4 flex-1 overflow-y-auto custom-scrollbar">
                    <TenantSwitcher />

                    <div className="text-slate-500 text-[10px] font-bold uppercase tracking-widest px-3 py-2 mt-2">Main Menu</div>

                    <NavItem path="/" icon={LayoutDashboard} label="Dashboard" isActive={isActive("/")} onClose={onClose} />
                    <NavItem path="/map" icon={MapIcon} label="Network Map" isActive={isActive("/map")} onClose={onClose} />
                    <NavItem path="/routers" icon={RouterIcon} label="Devices" badge={routers.length} isActive={isActive("/routers")} onClose={onClose} />
                    <NavItem path="/olts" icon={Server} label="OLTs" isActive={isActive("/olts")} onClose={onClose} />
                    <div className="text-slate-500 text-[10px] font-bold uppercase tracking-widest px-3 py-2 mt-2">ACS (TR-069)</div>
                    <NavItem path="/genieacs" icon={Monitor} label="GenieACS" isActive={isActive("/genieacs")} onClose={onClose} />
                    <NavItem path="/alerts" icon={Bell} label="Alerts" badge={alertCount?.connectivity} badgeColor={alertCount?.connectivity > 0 ? "bg-red-500/10 text-red-400 border border-red-500/20" : undefined} isActive={isActive("/alerts")} onClose={onClose} />
                    <NavItem path="/issues" icon={Activity} label="Issues" badge={alertCount?.issues} badgeColor={alertCount?.issues > 0 ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20" : undefined} isActive={isActive("/issues")} onClose={onClose} />

                    <div className="text-slate-500 text-[10px] font-bold uppercase tracking-widest px-3 py-2 mt-6">System</div>

                    {isAdmin && <NavItem path="/netwatch" icon={Globe} label="Netwatch" isActive={isActive("/netwatch")} onClose={onClose} />}
                    {isSuperAdmin && <NavItem path="/tenants" icon={Building} label="ISPs / Tenants" isActive={isActive("/tenants")} onClose={onClose} />}
                    {isAdmin && <NavItem path="/users" icon={Users} label="Users" isActive={isActive("/users")} onClose={onClose} />}
                    {isAdmin && <NavItem path="/notification-groups" icon={MessageSquare} label="Notifications" isActive={isActive("/notification-groups")} onClose={onClose} />}
                    {(isAdmin || isOperator) && <NavItem path="/analytics" icon={BarChart3} label="Analytics" isActive={isActive("/analytics")} onClose={onClose} />}
                    <NavItem path="/settings" icon={Settings} label="Settings" isActive={isActive("/settings")} onClose={onClose} />
                </div>

                {/* Footer Actions */}
                <div className="p-4 border-t border-slate-800/60 bg-black/20">
                    <button
                        onClick={handleLogout}
                        className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-all duration-200 group"
                    >
                        <LogOut className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                        <span className="text-sm font-medium">Logout</span>
                    </button>
                </div>
            </div>
        </aside>
    );
};

export default Sidebar;


