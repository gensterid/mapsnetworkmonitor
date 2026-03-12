import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Map, Router, Bell } from 'lucide-react';
import clsx from 'clsx';

const NAV_ITEMS = [
    { label: 'Dash', icon: LayoutDashboard, path: '/' },
    { label: 'Map', icon: Map, path: '/map' },
    { label: 'Devices', icon: Router, path: '/routers' },
    { label: 'Alerts', icon: '/alerts' }, // Using path directly since we don't have all icons imported yet or can add Bell
];

export default function BottomNav() {
    return (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-900/90 backdrop-blur-lg border-t border-slate-800 flex items-center justify-around px-2 z-50 pb-safe">
            <NavLink
                to="/"
                className={({ isActive }) => clsx(
                    "flex flex-col items-center gap-1 min-w-[64px] transition-colors",
                    isActive ? "text-primary" : "text-slate-500 hover:text-slate-300"
                )}
            >
                <LayoutDashboard className="w-5 h-5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Dash</span>
            </NavLink>

            <NavLink
                to="/map"
                className={({ isActive }) => clsx(
                    "flex flex-col items-center gap-1 min-w-[64px] transition-colors",
                    isActive ? "text-primary" : "text-slate-500 hover:text-slate-300"
                )}
            >
                <Map className="w-5 h-5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Map</span>
            </NavLink>

            <NavLink
                to="/routers"
                className={({ isActive }) => clsx(
                    "flex flex-col items-center gap-1 min-w-[64px] transition-colors",
                    isActive ? "text-primary" : "text-slate-500 hover:text-slate-300"
                )}
            >
                <Router className="w-5 h-5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Devices</span>
            </NavLink>

            <NavLink
                to="/alerts"
                className={({ isActive }) => clsx(
                    "flex flex-col items-center gap-1 min-w-[64px] transition-colors",
                    isActive ? "text-primary" : "text-slate-500 hover:text-slate-300"
                )}
            >
                <Bell className="w-5 h-5" />
                <span className="text-[10px] font-bold uppercase tracking-wider">Alerts</span>
            </NavLink>
        </div>
    );
}
