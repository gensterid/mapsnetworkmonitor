import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu, Search } from 'lucide-react';
import Sidebar from '../Sidebar';
import BottomNav from './BottomNav';
import { useSSE } from '@/hooks';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { GlobalSearchModal } from '../search/GlobalSearchModal';
import { useGlobalSearchShortcut } from '../search/useGlobalSearch';

/**
 * AppLayout — Top-level layout untuk halaman terproteksi.
 *
 * Layout setelah refactor Step 2:
 *   - Desktop (lg+): sidebar slim 64px permanent di kiri, main flex-1 sisanya
 *   - Mobile (<lg): sidebar drawer via hamburger, bottom nav 4 items
 *   - Main content area: full-bleed, page yang atur padding sendiri
 *     (memungkinkan NetworkMap full-screen tanpa terpotong)
 */
export default function AppLayout() {
    const { isConnected } = useSSE();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const location = useLocation();

    const { isOpen: searchOpen, open: openSearch, close: closeSearch } = useGlobalSearchShortcut();

    // Tutup sidebar drawer di mobile saat route berubah
    useEffect(() => {
        setIsSidebarOpen(false);
    }, [location.pathname]);

    return (
        <div className="flex h-screen supports-[height:100dvh]:h-[100dvh] w-screen bg-background-dark overflow-hidden">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <main className="flex-1 flex flex-col overflow-hidden relative w-full">
                {/* Mobile Header (hamburger + brand + search + status).
                    Per spec mobile: touch target min 44x44px untuk semua
                    button. p-2 sebelumnya = 36px (icon 20px + padding 16px),
                    bump ke min-h-[44px] min-w-[44px] explicit. */}
                <div className="lg:hidden h-14 border-b border-slate-border flex items-center justify-between px-3 bg-surface-darker/95 backdrop-blur-xl z-40 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setIsSidebarOpen(true)}
                            aria-label="Buka menu navigasi"
                            className="-ml-1 rounded-lg text-fg-muted hover:text-fg hover:bg-white/5 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                            <Menu className="w-5 h-5" aria-hidden="true" />
                        </button>
                        <span className="font-bold text-fg text-sm tracking-tight">NetMonitor</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={openSearch}
                            aria-label="Cari (Ctrl+K)"
                            className="rounded-lg text-fg-muted hover:text-fg hover:bg-white/5 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                        >
                            <Search className="w-5 h-5" aria-hidden="true" />
                        </button>
                        <div className="flex items-center gap-1.5" aria-label={isConnected ? 'Real-time terhubung' : 'Sinkronisasi'}>
                            <div
                                className={clsx(
                                    'w-2 h-2 rounded-full',
                                    isConnected
                                        ? 'bg-status-online shadow-[0_0_6px_var(--color-status-online)]'
                                        : 'bg-status-issue animate-pulse',
                                )}
                                aria-hidden="true"
                            />
                            <span className="text-[10px] font-bold text-fg-muted uppercase tracking-widest">
                                {isConnected ? 'LIVE' : 'SYNC'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Main content area — full bleed, no padding di sini.
                    Page-level component atur padding sendiri sehingga
                    NetworkMap bisa render full-screen. */}
                <div className="flex-1 overflow-auto pb-16 lg:pb-0 custom-scrollbar">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={location.pathname}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className="h-full w-full"
                        >
                            <Outlet />
                        </motion.div>
                    </AnimatePresence>
                </div>

                <BottomNav />
            </main>

            <GlobalSearchModal isOpen={searchOpen} onClose={closeSearch} />
        </div>
    );
}
