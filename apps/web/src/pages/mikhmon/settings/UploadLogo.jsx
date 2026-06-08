import React, { useRef, useState } from 'react';
import { Upload, RefreshCw, Trash2, Image as ImageIcon } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import { useMikhmonLogos, useUploadMikhmonLogo, useDeleteMikhmonLogo, useMikhmonInfo } from '@/hooks/useMikhmon';
import { Button } from '@/components/ui/Button';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { apiClient } from '@/lib/api';

/**
 * MikHMON Upload Logo — per-router voucher branding.
 *
 * Mirrors MikHMON external Settings → Upload Logo. Files live on the
 * server filesystem (configurable via MIKHMON_LOGO_DIR env) and are
 * referenced by filename from the Template Editor + Cetak Cepat.
 *
 * Recommended naming: logo-<routerName>.png so the convention matches
 * MikHMON external — operator can drop the same file across both apps.
 */

const ACCEPTED = ['image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp'];
const MAX_KB = 500;

function fmtSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
}

export default function UploadLogo() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: info } = useMikhmonInfo(selectedRouterId);
    const { data: logos = [], isPending, refetch, isFetching } = useMikhmonLogos(selectedRouterId);
    const uploadMutation = useUploadMikhmonLogo(selectedRouterId);
    const deleteMutation = useDeleteMikhmonLogo(selectedRouterId);

    const fileInputRef = useRef(null);
    const [deleting, setDeleting] = useState(null);

    const recommendedName = info?.router?.name
        ? `logo-${info.router.name.replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase()}.png`
        : 'logo-<NAMA-ROUTER>.png';

    const handleUpload = (file) => {
        if (!file) return;
        if (!ACCEPTED.includes(file.type)) {
            toast.error('Format file harus PNG / JPG / GIF / SVG / WebP');
            return;
        }
        if (file.size > MAX_KB * 1024) {
            toast.error(`File terlalu besar (maks ${MAX_KB} KB)`);
            return;
        }
        uploadMutation.mutate(file, {
            onSuccess: (entry) => {
                toast.success(`Logo "${entry?.filename}" tersimpan`);
                if (fileInputRef.current) fileInputRef.current.value = '';
            },
            onError: (e) => toast.error(e?.response?.data?.message || 'Upload gagal'),
        });
    };

    const handleDelete = () => {
        if (!deleting?.filename) return;
        deleteMutation.mutate(deleting.filename, {
            onSuccess: () => {
                toast.success(`Logo "${deleting.filename}" dihapus`);
                setDeleting(null);
            },
        });
    };

    // Logo URLs go through the authenticated apiClient — build them via
    // its baseURL so cookies are sent. defaults.baseURL ends with "/api".
    const baseURL = apiClient?.defaults?.baseURL || '/api';
    const logoUrl = (filename) =>
        `${baseURL}/mikhmon/${selectedRouterId}/logos/${encodeURIComponent(filename)}`;

    return (
        <div className="space-y-4 max-w-3xl">
            <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                    <Upload className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-slate-100">Upload Logo</h1>
                        <p className="text-xs text-slate-500">Logo untuk template cetak voucher. Per router.</p>
                    </div>
                </div>
                <button
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 disabled:opacity-40"
                    title="Refresh"
                >
                    <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
                </button>
            </div>

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-4 space-y-3">
                <div className="text-xs text-slate-500">
                    Rekomendasi nama file: <span className="font-mono text-slate-300">{recommendedName}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={ACCEPTED.join(',')}
                        onChange={(e) => handleUpload(e.target.files?.[0])}
                        className="flex-1 text-sm text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-slate-700 file:text-slate-200 file:cursor-pointer hover:file:bg-slate-600"
                    />
                    <Button
                        onClick={() => fileInputRef.current?.click()}
                        loading={uploadMutation.isPending}
                        disabled={uploadMutation.isPending}
                    >
                        <Upload className="w-4 h-4 mr-1" />
                        Upload
                    </Button>
                </div>
                <p className="text-[10px] text-slate-600">
                    Format: PNG / JPG / GIF / SVG / WebP — maks {MAX_KB} KB.
                </p>
            </div>

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-800/60 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Daftar Logo ({logos.length})
                </div>
                <div className="divide-y divide-slate-800/40">
                    {isPending ? (
                        <div className="px-4 py-8 text-center text-slate-500 text-xs">Memuat…</div>
                    ) : logos.length === 0 ? (
                        <div className="px-4 py-8 text-center text-slate-500 text-xs">
                            <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            Belum ada logo. Upload file di atas.
                        </div>
                    ) : logos.map((logo) => (
                        <div key={logo.filename} className="px-4 py-3 flex items-center gap-3 hover:bg-slate-800/30 transition-colors">
                            <img
                                src={logoUrl(logo.filename)}
                                alt={logo.filename}
                                className="w-12 h-12 object-contain bg-white/5 rounded border border-slate-700/40"
                            />
                            <div className="flex-1 min-w-0">
                                <div className="font-mono text-sm text-slate-200 truncate">{logo.filename}</div>
                                <div className="text-[10px] text-slate-500">
                                    {fmtSize(logo.size)} · {new Date(logo.uploadedAt).toLocaleString('id-ID')}
                                </div>
                            </div>
                            <button
                                onClick={() => setDeleting(logo)}
                                className="p-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                title="Hapus"
                            >
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <DeleteConfirmationModal
                isOpen={!!deleting}
                onClose={() => setDeleting(null)}
                onConfirm={handleDelete}
                title="Hapus Logo"
                message="Logo akan dihapus dari server. Template yang memakai logo ini akan tampil tanpa logo sampai Anda upload lagi."
                itemName={deleting?.filename || ''}
                confirmText="Hapus Logo"
                isDeleting={deleteMutation.isPending}
            />
        </div>
    );
}
