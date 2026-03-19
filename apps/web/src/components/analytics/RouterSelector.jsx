import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { Router as RouterIcon, ChevronDown, Search, Server } from 'lucide-react';
import clsx from 'clsx';

function RouterSelector({ routers, value, onChange }) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef(null);
    const buttonRef = useRef(null);

    const filteredRouters = useMemo(() => {
        if (!searchQuery) return routers;
        return routers.filter(r =>
            r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            r.host.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [routers, searchQuery]);

    const selectedRouter = routers.find(r => r.id === value);

    // Close on escape
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') setIsOpen(false);
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
        }
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    return (
        <div className="relative" ref={dropdownRef}>
            <Button 
                ref={buttonRef}
                variant="outline" 
                size="sm" 
                onClick={() => setIsOpen(!isOpen)}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-label={selectedRouter ? `Router terpilih: ${selectedRouter.name}` : "Pilih Router"}
            >
                <RouterIcon className="w-4 h-4 mr-2" aria-hidden="true" />
                {selectedRouter?.name || 'Semua Router'}
                <ChevronDown className={clsx("w-4 h-4 ml-2 transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
            </Button>
            
            {isOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} aria-hidden="true" />
                    <div 
                        className="absolute left-0 sm:right-0 sm:left-auto top-full mt-2 z-20 w-72 rounded-lg bg-slate-800 border border-slate-700 shadow-xl overflow-hidden focus:outline-none"
                        role="listbox"
                        aria-label="Daftar Router"
                    >
                        <div className="p-2 border-b border-slate-700">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" aria-hidden="true" />
                                <input
                                    type="text"
                                    placeholder="Cari router..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-primary"
                                    autoFocus
                                    aria-label="Cari router"
                                />
                            </div>
                        </div>
                        <div className="max-h-60 overflow-y-auto outline-none">
                            <button
                                role="option"
                                aria-selected={!value}
                                onClick={() => {
                                    onChange(null);
                                    setIsOpen(false);
                                    setSearchQuery('');
                                }}
                                className={clsx(
                                    "w-full px-4 py-2.5 text-left text-sm transition-colors flex items-center gap-2 outline-none focus:bg-slate-700",
                                    !value ? "bg-primary/10 text-primary" : "text-slate-300 hover:bg-slate-700"
                                )}
                            >
                                <Server className="w-4 h-4" aria-hidden="true" />
                                Semua Router
                            </button>
                            {filteredRouters.map((router) => (
                                <button
                                    key={router.id}
                                    role="option"
                                    aria-selected={value === router.id}
                                    onClick={() => {
                                        onChange(router.id);
                                        setIsOpen(false);
                                        setSearchQuery('');
                                    }}
                                    className={clsx(
                                        "w-full px-4 py-2.5 text-left text-sm transition-colors outline-none focus:bg-slate-700",
                                        value === router.id ? "bg-primary/10 text-primary" : "text-slate-300 hover:bg-slate-700"
                                    )}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium">{router.name}</span>
                                        <span 
                                            className={clsx(
                                                "w-2 h-2 rounded-full",
                                                router.status === 'online' ? 'bg-emerald-500' : 'bg-red-500'
                                            )} 
                                            aria-label={router.status === 'online' ? "Online" : "Offline"}
                                        />
                                    </div>
                                    <span className="text-xs text-slate-500 font-mono">{router.host}</span>
                                </button>
                            ))}
                            {filteredRouters.length === 0 && (
                                <p className="text-center text-slate-500 py-4 text-sm" role="status">Tidak ada router ditemukan</p>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default RouterSelector;
