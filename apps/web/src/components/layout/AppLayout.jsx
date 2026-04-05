import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from '../Sidebar';
import BottomNav from './BottomNav';
import { useSSE } from '@/hooks';
import clsx from 'clsx';

export default function AppLayout() {
    // Initialize SSE connection for real-time alerts
    const { isConnected } = useSSE();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const location = useLocation();

    // Close sidebar on route change (mobile)
    React.useEffect(() => {
        setIsSidebarOpen(false);
    }, [location.pathname]);

    return (
        <div className="flex h-screen supports-[height:100dvh]:h-[100dvh] w-screen bg-background-dark overflow-hidden">
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
            
            {/* Polled Status Scanner (Top/Side indicator) */}
            <div className="absolute top-0 right-0 h-1 w-24 bg-primary animate-scanner-pulse z-50 rounded-bl-full pointer-events-none opacity-40 shadow-[0_0_10px_var(--primary)] lg:block hidden" />

            <main className="flex-1 flex flex-col overflow-hidden relative w-full">
                {/* Mobile Header (Glass Premium) */}
                <div className="lg:hidden h-16 border-b border-white/5 flex items-center justify-between px-4 glass-premium z-40">
                    <div className="flex items-center">
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="p-2 -ml-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-all"
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        <span className="ml-3 font-bold text-white tracking-tight">NetMonitor</span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <div className={clsx(
                            "w-2 h-2 rounded-full",
                            isConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-red-500 animate-pulse"
                        )} />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                            {isConnected ? 'LIVE' : 'SYNCING'}
                        </span>
                    </div>
                </div>

                <div className="flex-1 overflow-auto pb-16 lg:pb-0 custom-scrollbar">
                    <Outlet />
                </div>

                <BottomNav />
            </main>
        </div>
    );
}
