import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, Search } from 'lucide-react';
import Sidebar from '../Sidebar';
import BottomNav from './BottomNav';
import { useSSE } from '@/hooks';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { GlobalSearchModal } from '../search/GlobalSearchModal';
import { useGlobalSearchShortcut } from '../search/useGlobalSearch';

export default function AppLayout() {
    // Initialize SSE connection for real-time alerts
    const { isConnected } = useSSE();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const location = useLocation();

    // Global search shortcut Cmd+K / Ctrl+K — selalu accessible
    // di mana pun di app. Modal mount di akhir component tree.
    const { isOpen: searchOpen, open: openSearch, close: closeSearch } = useGlobalSearchShortcut();

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
                {/* Mobile Header — surface adapt per-tema. glass-premium alpha 0.4
                    bocor ke bg page di tema terang; bg-surface-darker/95 solid
                    sesuai tema. */}
                <div className="lg:hidden h-16 border-b border-slate-border flex items-center justify-between px-4 bg-surface-darker/95 backdrop-blur-xl z-40">
                    <div className="flex items-center">
                        <button
                            onClick={() => setIsSidebarOpen(true)}
                            className="p-2 -ml-2 rounded-xl text-fg-muted hover:text-fg hover:bg-white/5 transition-all"
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        <span className="ml-3 font-bold text-fg tracking-tight">NetMonitor</span>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Search button mobile — Cmd+K equivalent untuk
                            device tanpa keyboard. Trigger modal yang sama. */}
                        <button
                            onClick={openSearch}
                            aria-label="Cari (Ctrl+K)"
                            className="p-2 rounded-xl text-fg-muted hover:text-fg hover:bg-white/5 transition-all"
                        >
                            <Search className="w-5 h-5" />
                        </button>
                        <div className="flex items-center gap-2">
                            <div className={clsx(
                                "w-2 h-2 rounded-full",
                                isConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-red-500 animate-pulse"
                            )} />
                            <span className="text-[10px] font-bold text-fg-muted uppercase tracking-widest">
                                {isConnected ? 'LIVE' : 'SYNCING'}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-auto pb-16 lg:pb-0 custom-scrollbar relative">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.3, ease: 'easeOut' }}
                            className="h-full w-full"
                        >
                            <Outlet />
                        </motion.div>
                    </AnimatePresence>
                </div>

                <BottomNav />
            </main>

            {/* Global Search Modal — selalu mounted, control via state */}
            <GlobalSearchModal isOpen={searchOpen} onClose={closeSearch} />
        </div>
    );
}
