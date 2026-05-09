import React, { useState } from 'react';
import { useAppTimezone } from '@/hooks';
import { formatDateOnly } from '@/lib/timezone';
import {
    useTenants,
    useCreateTenant,
    useUpdateTenant,
    useDeleteTenant
} from '../hooks/useTenants';
import {
    Building,
    Plus,
    Edit2,
    Trash2,
    Layout,
    Info,
    Loader2,
    AlertCircle,
    ChevronRight,
    Search,
    Filter
} from 'lucide-react';
import clsx from 'clsx';

const Tenants = () => {
    const { data: tenants = [], isLoading, isError, error } = useTenants();
    const timezone = useAppTimezone();
    const createMutation = useCreateTenant();
    const updateMutation = useUpdateTenant();
    const deleteMutation = useDeleteTenant();

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingTenant, setEditingTenant] = useState(null);
    const [formData, setFormData] = useState({ name: '', slug: '', description: '' });

    const handleOpenModal = (tenant = null) => {
        if (tenant) {
            setEditingTenant(tenant);
            setFormData({
                name: tenant.name,
                slug: tenant.slug,
                description: tenant.description || ''
            });
        } else {
            setEditingTenant(null);
            setFormData({ name: '', slug: '', description: '' });
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingTenant) {
                await updateMutation.mutateAsync({ id: editingTenant.id, data: formData });
            } else {
                await createMutation.mutateAsync(formData);
            }
            setIsModalOpen(false);
        } catch (err) {
            // Error handled by hook
        }
    };

    const handleDelete = async (id, name) => {
        if (window.confirm(`Hapus ISP "${name}"? Seluruh data terkait mungkin tidak terjangkau.`)) {
            await deleteMutation.mutateAsync(id);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-slate-400 animate-pulse">Memuat daftar ISP...</p>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-2xl flex items-center gap-4 max-w-2xl mx-auto my-12">
                <AlertCircle className="w-8 h-8 text-red-500 shrink-0" />
                <div>
                    <h3 className="text-red-400 font-bold mb-1">Gagal Memuat Data</h3>
                    <p className="text-red-400/80 text-sm">{error.message}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-primary/10 rounded-2xl ring-1 ring-primary/20 shadow-lg shadow-primary/10">
                        <Building className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-white tracking-tight">ISP / Multi-Tenant</h1>
                        <p className="text-slate-400 text-sm font-medium">Kelola akses dan infrastruktur terpisah untuk setiap ISP</p>
                    </div>
                </div>

                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95 font-semibold text-sm"
                >
                    <Plus className="w-4 h-4" />
                    Tambah ISP Baru
                </button>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-surface-dark/50 border border-slate-800/60 p-6 rounded-2xl backdrop-blur-sm">
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-2">Total ISP</p>
                    <p className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{tenants.length}</p>
                </div>
                <div className="bg-surface-dark/50 border border-slate-800/60 p-6 rounded-2xl backdrop-blur-sm">
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-2">Status Sistem</p>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                        <p className="text-lg font-bold text-emerald-400">Multi-ISP Ready</p>
                    </div>
                </div>
                <div className="bg-surface-dark/50 border border-slate-800/60 p-6 rounded-2xl backdrop-blur-sm">
                    <p className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-2">Isolasi Data</p>
                    <p className="text-lg font-bold text-blue-400">Hardware Level Secured</p>
                </div>
            </div>

            {/* Content Table */}
            <div className="bg-surface-dark/30 border border-slate-800/60 rounded-2xl overflow-hidden backdrop-blur-md">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-800/60 bg-slate-900/40">
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Informasi ISP</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Slug / ID</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Tgl Dibuat</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {tenants.map((tenant) => (
                                <tr key={tenant.id} className="group hover:bg-slate-800/20 transition-colors">
                                    <td className="px-6 py-5">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-xl bg-slate-800/50 flex items-center justify-center text-slate-300 font-bold group-hover:bg-primary/20 group-hover:text-primary transition-all duration-300">
                                                {tenant.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="text-white font-bold group-hover:text-primary transition-colors">{tenant.name}</p>
                                                <p className="text-slate-500 text-xs mt-0.5 line-clamp-1">{tenant.description || 'Tidak ada deskripsi'}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-5">
                                        <code className="text-xs px-2 py-1 bg-slate-800/50 rounded-md text-slate-400 font-mono">
                                            {tenant.slug}
                                        </code>
                                    </td>
                                    <td className="px-6 py-5 text-sm text-slate-400">
                                        {formatDateOnly(tenant.createdAt, timezone)}
                                    </td>
                                    <td className="px-6 py-5 text-right">
                                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleOpenModal(tenant)}
                                                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition-all"
                                                title="Edit ISP"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(tenant.id, tenant.name)}
                                                className="p-2 text-red-500/70 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                                title="Hapus ISP"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {tenants.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
                        <div className="p-4 bg-slate-800/30 rounded-full ring-1 ring-slate-700/50">
                            <Building className="w-8 h-8 text-slate-600" />
                        </div>
                        <div>
                            <p className="text-white font-bold">Belum ada ISP terdaftar</p>
                            <p className="text-slate-500 text-sm">Tambahkan ISP pertama Anda untuk memulai konfigurasi terpisah.</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
                    <div className="bg-slate-900 border border-slate-700/50 rounded-3xl w-full max-w-md overflow-hidden relative shadow-2xl animate-in zoom-in-95 duration-300">
                        <div className="p-6 border-b border-slate-800/80 bg-slate-800/20">
                            <h3 className="text-xl font-bold text-white flex items-center gap-3">
                                <Layout className="w-5 h-5 text-primary" />
                                {editingTenant ? 'Edit ISP' : 'Tambah ISP Baru'}
                            </h3>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Nama ISP</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-slate-800/50 border border-slate-700 text-white rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                                    placeholder="Contoh: Media Link"
                                />
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Slug (Link ID)</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.slug}
                                    onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                                    className="w-full bg-slate-800/50 border border-slate-700 text-white rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all font-mono text-sm"
                                    placeholder="media-link"
                                    disabled={!!editingTenant} // Avoid breaking links if possible
                                />
                                <p className="text-[10px] text-slate-500 ml-1">Identitas unik untuk filter URL dan database.</p>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-1">Deskripsi</label>
                                <textarea
                                    rows={3}
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full bg-slate-800/50 border border-slate-700 text-white rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all resize-none text-sm"
                                    placeholder="Keterangan singkat mengenai ISP ini..."
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="flex-1 px-4 py-2.5 border border-slate-700 text-slate-300 rounded-xl hover:bg-slate-800 transition-colors font-medium"
                                >
                                    Batal
                                </button>
                                <button
                                    type="submit"
                                    disabled={createMutation.isPending || updateMutation.isPending}
                                    className="flex-1 px-4 py-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {createMutation.isPending || updateMutation.isPending ? (
                                        <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                                    ) : (
                                        editingTenant ? 'Simpan' : 'Tambahkan'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Tenants;
