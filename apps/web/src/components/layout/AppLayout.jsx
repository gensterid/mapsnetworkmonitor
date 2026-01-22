import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from '../Sidebar';
import { useSSE } from '@/hooks';

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
        <div className="flex h-screen supports-[height:100dvh]:h-[100dvh] w-screen bg-slate-950 overflow-hidden">
            {/* Mobile Sidebar Overlay */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden"
                    onClick={() => setIsSidebarOpen(false)}
                />
            )}

            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />

            <main className="flex-1 flex flex-col overflow-hidden relative w-full">
                {/* Mobile Header */}
                <div className="lg:hidden h-16 border-b border-slate-800 flex items-center px-4 bg-slate-900/50 backdrop-blur-md">
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="p-2 -ml-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                    >
                        <Menu className="w-6 h-6" />
                    </button>
                    <span className="ml-3 font-semibold text-white">NetMonitor</span>
                </div>

                <div className="flex-1 overflow-auto">
                    <Outlet />
                </div>
            </main>
        </div>
    );
}
