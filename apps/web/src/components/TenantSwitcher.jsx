import React, { useState, useRef, useEffect } from 'react';
import { Building, ChevronDown, Check, Globe } from 'lucide-react';
import { useTenants } from '../hooks/useTenants';
import { useCurrentUser } from '../hooks';
import { useRole } from '../lib/auth-client';
import clsx from 'clsx';

const TenantSwitcher = () => {
    const { isSuperAdmin } = useRole();
    const { data: currentUser } = useCurrentUser();
    const { data: tenants = [], isLoading } = useTenants();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    // Hooks must be called before any conditional returns
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Only render if superadmin OR user has multiple authorized tenants
    // This is now AFTER all hooks (useState, useRef, useEffect)
    if (!isSuperAdmin && tenants.length <= 1) return null;

    const activeTenantId = localStorage.getItem('active-tenant-id') || currentUser?.tenantId;

    // Find active tenant details
    const activeTenant = tenants.find(t => t.id === activeTenantId);
    const activeName = activeTenant ? activeTenant.name : (isLoading ? 'Loading ISPs...' : 'Main ISP (Default)');

    const handleSwitch = (tenantId) => {
        if (tenantId === activeTenantId) {
            setIsOpen(false);
            return;
        }

        if (tenantId) {
            localStorage.setItem('active-tenant-id', tenantId);
        } else {
            localStorage.removeItem('active-tenant-id');
        }

        setIsOpen(false);

        // Smart redirect: If on a detail page, go back to list to avoid 404
        const path = window.location.pathname;
        if (path.startsWith('/routers/') || path.startsWith('/olts/')) {
            const basePage = path.split('/')[1]; // 'routers' or 'olts'
            window.location.href = `/${basePage}`;
        } else {
            window.location.reload();
        }
    };

    return (
        <div className="px-3 py-2" ref={dropdownRef}>
            <div className="text-fg-muted text-[10px] font-bold uppercase tracking-widest mb-1.5 px-1">
                Active Environment {isSuperAdmin ? '(Super Admin)' : ''}
            </div>
            <div className="relative">
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className={clsx(
                        "w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-800/50 hover:bg-slate-800 border rounded-lg transition-all",
                        isOpen ? "border-primary shadow-[0_0_10px_rgba(59,130,246,0.15)]" : "border-slate-700/50"
                    )}
                >
                    <div className="flex items-center gap-2 overflow-hidden">
                        <div className="p-1.5 bg-primary/20 text-primary rounded-md shrink-0">
                            {activeTenantId === currentUser?.tenantId ? <Globe className="w-4 h-4" /> : <Building className="w-4 h-4" />}
                        </div>
                        <span className="text-sm font-bold text-fg truncate">
                            {activeName}
                        </span>
                    </div>
                    <ChevronDown className={clsx("w-4 h-4 text-fg-muted transition-transform", isOpen && "rotate-180")} />
                </button>

                {isOpen && (
                    <div className="absolute z-50 w-full mt-2 py-1 bg-surface-dark border border-slate-700 rounded-lg shadow-xl animate-in fade-in slide-in-from-top-2">
                        {/* Default Home Tenant Option */}
                        <div className="px-2 py-1">
                            <button
                                onClick={() => handleSwitch(currentUser?.tenantId)}
                                className={clsx(
                                    "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                                    (!localStorage.getItem('active-tenant-id') || localStorage.getItem('active-tenant-id') === currentUser?.tenantId)
                                        ? "bg-primary/10 text-primary font-bold"
                                        : "text-fg hover:bg-slate-800 hover:text-fg"
                                )}
                            >
                                <div className="flex items-center gap-2">
                                    <Globe className="w-4 h-4 opacity-70" />
                                    <span>Home ISP (Default)</span>
                                </div>
                                {(!localStorage.getItem('active-tenant-id') || localStorage.getItem('active-tenant-id') === currentUser?.tenantId) && (
                                    <Check className="w-4 h-4" />
                                )}
                            </button>
                        </div>

                        <div className="h-px bg-slate-800 my-1 mx-2" />

                        {/* Other Tenants Map */}
                        <div className="max-h-60 overflow-y-auto px-2 py-1 custom-scrollbar">
                            {tenants.map((tenant) => (
                                <button
                                    key={tenant.id}
                                    onClick={() => handleSwitch(tenant.id)}
                                    className={clsx(
                                        "w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors mb-0.5",
                                        activeTenantId === tenant.id
                                            ? "bg-primary/10 text-primary font-bold"
                                            : "text-fg hover:bg-slate-800 hover:text-fg"
                                    )}
                                >
                                    <div className="flex items-center gap-2 truncate">
                                        <Building className="w-4 h-4 opacity-70 shrink-0" />
                                        <span className="truncate">{tenant.name}</span>
                                    </div>
                                    {activeTenantId === tenant.id && (
                                        <Check className="w-4 h-4 shrink-0" />
                                    )}
                                </button>
                            ))}
                            {tenants.length === 0 && !isLoading && (
                                <div className="text-xs text-fg-muted text-center py-2">
                                    No other ISPs found.
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TenantSwitcher;
