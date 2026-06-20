import React, { useMemo } from 'react';
import { ToggleLeft, Loader2, Info } from 'lucide-react';
import Toggle from '@/components/ui/Toggle';
import { useFeatureFlags, useUpdateFeatureFlags } from '@/hooks';
import { FEATURE_REGISTRY, DEFAULT_FEATURE_FLAGS } from '@/constants/features';
import toast from 'react-hot-toast';

/**
 * FeatureFlagsCard — superadmin-only. List semua fitur opsional dengan toggle
 * on/off. Fitur yang dimatikan hilang untuk admin/operator/user di semua
 * tenant; superadmin tetap melihat semua.
 *
 * Grup berdasarkan FEATURE_REGISTRY[].group.
 */
export default function FeatureFlagsCard() {
    const { data: flags = DEFAULT_FEATURE_FLAGS, isLoading } = useFeatureFlags();
    const updateFlags = useUpdateFeatureFlags();

    // Group fitur untuk tampilan rapi
    const grouped = useMemo(() => {
        const map = new Map();
        for (const f of FEATURE_REGISTRY) {
            if (!map.has(f.group)) map.set(f.group, []);
            map.get(f.group).push(f);
        }
        return Array.from(map.entries());
    }, []);

    const enabledCount = FEATURE_REGISTRY.filter((f) => flags?.[f.key] !== false).length;

    const handleToggle = (key, nextEnabled) => {
        updateFlags.mutate(
            { [key]: nextEnabled },
            {
                onSuccess: () => {
                    const label = FEATURE_REGISTRY.find((f) => f.key === key)?.label || key;
                    toast.success(`${label} ${nextEnabled ? 'diaktifkan' : 'dimatikan'}`);
                },
                onError: () => toast.error('Gagal menyimpan. Coba lagi.'),
            },
        );
    };

    return (
        <div className="bg-surface-dark border border-slate-border rounded-xl overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-border bg-surface-darker/40">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/15 text-primary flex items-center justify-center flex-shrink-0">
                        <ToggleLeft className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-base font-bold text-fg">Manajemen Fitur</h2>
                        <p className="text-xs text-fg-muted mt-0.5">
                            Aktif: <span className="text-fg font-semibold">{enabledCount}</span> / {FEATURE_REGISTRY.length} fitur
                        </p>
                    </div>
                </div>
            </div>

            {/* Info banner */}
            <div className="mx-5 mt-4 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-primary/5 border border-primary/15 text-[11px] text-fg-muted leading-relaxed">
                <Info className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                    Fitur yang dimatikan akan <span className="text-fg font-semibold">hilang dari menu</span> untuk
                    admin, operator, dan user di semua tenant. <span className="text-fg font-semibold">Superadmin
                    tetap melihat semua</span> agar bisa mengelola & mengaktifkan kembali. Fitur inti
                    (Map, Router, Alert, Dashboard, Settings) selalu aktif.
                </span>
            </div>

            {/* Loading */}
            {isLoading ? (
                <div className="px-5 py-10 text-center text-fg-muted">
                    <Loader2 className="w-5 h-5 animate-spin inline-block mr-2" />
                    Memuat status fitur…
                </div>
            ) : (
                <div className="p-5 space-y-5">
                    {grouped.map(([groupName, features]) => (
                        <div key={groupName}>
                            <h3 className="text-[10px] font-bold uppercase tracking-widest text-fg-muted mb-2 px-1">
                                {groupName}
                            </h3>
                            <div className="space-y-2">
                                {features.map((f) => {
                                    const enabled = flags?.[f.key] !== false;
                                    return (
                                        <div
                                            key={f.key}
                                            className="flex items-center gap-3 px-3 py-3 rounded-lg bg-surface-darker/40 border border-slate-border/60"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-semibold text-fg">{f.label}</span>
                                                    {!enabled && (
                                                        <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-status-offline/15 text-status-offline">
                                                            Off
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[11px] text-fg-muted leading-snug mt-0.5">
                                                    {f.description}
                                                </p>
                                            </div>
                                            <Toggle
                                                checked={enabled}
                                                onChange={(next) => handleToggle(f.key, next)}
                                                disabled={updateFlags.isPending}
                                                ariaLabel={`${enabled ? 'Matikan' : 'Aktifkan'} ${f.label}`}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
