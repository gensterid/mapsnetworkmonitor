import React from 'react';
import { formatShortDateTime } from '@/lib/timezone';
import { History, AlertTriangle, Save, Database, Download, Upload, RefreshCw, Info, Plus, Trash2, PieChart } from 'lucide-react';
import { useDatabaseStats } from '@/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function MaintenanceSettings({
    formData,
    handleChange,
    currentUser,
    handleSubmit,
    updateSettingMutation,
    exportDatabaseMutation,
    importDatabaseMutation,
    backupHistory,
    triggerBackupMutation,
    handleFileSelect,
    handleManualBackup,
    setLocalBackupToRestore,
    setIsLocalRestoreModalOpen,
    setBackupToDelete,
    setIsDeleteModalOpen
}) {
    return (
        <div className="max-w-4xl space-y-6">
            {/* Data Retention Policy (Admin Only) */}
            {(currentUser?.role === 'admin' || currentUser?.role === 'superadmin') && (
                <Card className="border-primary/20 shadow-lg shadow-primary/5">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <History className="w-5 h-5 text-primary" />
                            Data Retention Policy
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Device Metrics (CPU/RAM/Temp)</label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        name="metrics_retention_days"
                                        value={formData.metrics_retention_days}
                                        onChange={handleChange}
                                        min={1}
                                        className="bg-slate-900/50"
                                    />
                                    <span className="text-xs text-slate-500 w-12">Days</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Traffic History (Links)</label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        name="interface_metrics_retention_days"
                                        value={formData.interface_metrics_retention_days}
                                        onChange={handleChange}
                                        min={1}
                                        className="bg-slate-900/50"
                                    />
                                    <span className="text-xs text-slate-500 w-12">Days</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Resolved Alerts</label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        name="alerts_retention_days"
                                        value={formData.alerts_retention_days}
                                        onChange={handleChange}
                                        min={1}
                                        className="bg-slate-900/50"
                                    />
                                    <span className="text-xs text-slate-500 w-12">Days</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">System Audit Logs</label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        name="audit_logs_retention_days"
                                        value={formData.audit_logs_retention_days}
                                        onChange={handleChange}
                                        min={1}
                                        className="bg-slate-900/50"
                                    />
                                    <span className="text-xs text-slate-500 w-12">Days</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Latency & Signal History</label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        name="performance_retention_days"
                                        value={formData.performance_retention_days}
                                        onChange={handleChange}
                                        min={1}
                                        className="bg-slate-900/50"
                                    />
                                    <span className="text-xs text-slate-500 w-12">Days</span>
                                </div>
                                <p className="text-[10px] text-slate-500 italic mt-1">*Data paling berat. Disarankan 30-90 hari.</p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Backup Storage (DB Records)</label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        name="backups_retention_days"
                                        value={formData.backups_retention_days}
                                        onChange={handleChange}
                                        min={1}
                                        className="bg-slate-900/50"
                                    />
                                    <span className="text-xs text-slate-500 w-12">Days</span>
                                </div>
                                <p className="text-[10px] text-slate-500 italic mt-1">*Hanya catatan histori, bukan file fisik.</p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-300">Disconnected PPPoE Sessions</label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        name="pppoe_retention_days"
                                        value={formData.pppoe_retention_days}
                                        onChange={handleChange}
                                        min={1}
                                        className="bg-slate-900/50"
                                    />
                                    <span className="text-xs text-slate-500 w-12">Days</span>
                                </div>
                                <p className="text-[10px] text-slate-500 italic mt-1">*Data sesi yang sudah terputus/off.</p>
                            </div>
                        </div>

                        <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                            <div className="text-xs text-slate-400">
                                <p className="font-bold text-amber-500/80 mb-1">Catatan Skalabilitas</p>
                                Menyimpan data trafik untuk 500+ perangkat selama 360 hari akan menghasilkan ratusan juta baris data.
                                Pastikan kapasitas disk server mencukupi. Pembersihan otomatis berjalan setiap hari pukul 00:00.
                            </div>
                        </div>

                        <div className="flex justify-end pt-2">
                            <Button
                                onClick={handleSubmit}
                                loading={updateSettingMutation.isPending}
                                className="shadow-lg shadow-primary/20"
                            >
                                <Save className="w-4 h-4 mr-2" />
                                Update Policy
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Database Usage Statistics (Admin Only) */}
            {(currentUser?.role === 'admin' || currentUser?.role === 'superadmin') && (
                <DatabaseUsageStats />
            )}

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Database className="w-5 h-5 text-primary" />
                        Database Management
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 space-y-3">
                            <div>
                                <h3 className="text-white font-medium mb-1">Manual Export</h3>
                                <p className="text-xs text-slate-400">Download full SQL backup to your local computer.</p>
                            </div>
                            <Button
                                type="button"
                                className="w-full"
                                variant="outline"
                                onClick={() => exportDatabaseMutation.mutate()}
                                disabled={exportDatabaseMutation.isPending}
                            >
                                {exportDatabaseMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                                Download SQL File
                            </Button>
                        </div>

                        <div className="p-4 bg-slate-900 rounded-xl border border-slate-800 space-y-3">
                            <div>
                                <h3 className="text-white font-medium mb-1">Manual Import</h3>
                                <p className="text-xs text-slate-400">Upload and restore from a local SQL file.</p>
                            </div>
                            <div className="relative">
                                <input
                                    type="file"
                                    accept=".sql"
                                    className="hidden"
                                    id="restore-upload-maintenance"
                                    onChange={handleFileSelect}
                                    disabled={importDatabaseMutation.isPending}
                                />
                                <Button
                                    type="button"
                                    variant="destructive"
                                    className="w-full"
                                    asChild
                                >
                                    <label htmlFor="restore-upload-maintenance" className="cursor-pointer">
                                        {importDatabaseMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                                        Upload & Restore
                                    </label>
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl flex items-start gap-3">
                        <Info className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                        <div className="text-xs text-slate-400 leading-relaxed">
                            <p className="font-bold text-white mb-1">Pro Tip: Automated Backups</p>
                            Sistem secara otomatis melakukan backup setiap 24 jam dan menyimpannya di server. Anda dapat mengunduh atau memulihkan data langsung dari tabel riwayat di bawah.
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                    <CardTitle className="flex items-center gap-2">
                        <History className="w-5 h-5 text-primary" />
                        Backup History
                    </CardTitle>
                    <Button
                        size="sm"
                        onClick={handleManualBackup}
                        disabled={triggerBackupMutation.isPending}
                    >
                        <Plus className="w-4 h-4 mr-1" />
                        Backup Now
                    </Button>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-slate-500 uppercase bg-slate-900/50">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Filename</th>
                                    <th className="px-4 py-3 font-medium">Date Created</th>
                                    <th className="px-4 py-3 font-medium text-right">Size</th>
                                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {backupHistory.isLoading ? (
                                    <tr>
                                        <td colSpan="4" className="px-4 py-8 text-center text-slate-500">
                                            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2" />
                                            Loading backups...
                                        </td>
                                    </tr>
                                ) : backupHistory.data?.length === 0 ? (
                                    <tr>
                                        <td colSpan="4" className="px-4 py-8 text-center text-slate-500">
                                            No backups found on server.
                                        </td>
                                    </tr>
                                ) : (
                                    backupHistory.data?.map((backup) => (
                                        <tr key={backup.filename} className="hover:bg-slate-900/50 transition-colors group">
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <Database className="w-4 h-4 text-slate-500" />
                                                    <span className="font-mono text-slate-300">{backup.filename}</span>
                                                    {backup.filename.startsWith('auto-') && (
                                                        <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-500 text-[10px] font-bold border border-emerald-500/20">AUTO</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-slate-400 text-xs">
                                                {formatShortDateTime(backup.createdAt)}
                                            </td>
                                            <td className="px-4 py-3 text-right text-slate-400 text-xs">
                                                {(backup.size / 1024 / 1024).toFixed(2)} MB
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-primary hover:bg-primary/10"
                                                        title="Download"
                                                        asChild
                                                    >
                                                        <a href={`${import.meta.env.VITE_API_URL || '/api'}/backup/export?filename=${backup.filename}`} download>
                                                            <Download className="w-4 h-4" />
                                                        </a>
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-amber-500 hover:bg-amber-500/10"
                                                        title="Restore"
                                                        onClick={() => {
                                                            setLocalBackupToRestore(backup.filename);
                                                            setIsLocalRestoreModalOpen(true);
                                                        }}
                                                    >
                                                        <RefreshCw className="w-4 h-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-red-500 hover:bg-red-500/10"
                                                        title="Delete"
                                                        onClick={() => {
                                                            setBackupToDelete(backup.filename);
                                                            setIsDeleteModalOpen(true);
                                                        }}
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function DatabaseUsageStats() {
    const { data: stats, isLoading, refetch } = useDatabaseStats();

    // Mapping table names to human readable labels
    const getTableLabel = (name) => {
        const labels = {
            'router_interface_metrics': 'Traffic History (Bandwidth)',
            'router_metrics': 'Device Metrics (CPU/RAM)',
            'device_performance_history': 'Latency & Signal History',
            'audit_logs': 'System Audit Logs',
            'alerts': 'Incident / Alert History',
            'pppoe_sessions': 'PPPoE Session Data',
            'router_netwatch': 'Netwatch Monitor Data',
            'router_backups': 'Router Backup History',
            'genieacs_backups': 'GenieACS Backup History'
        };
        return labels[name] || name;
    };

    if (isLoading) return (
        <Card className="border-slate-800 bg-slate-950/50">
            <CardContent className="h-32 flex items-center justify-center">
                <RefreshCw className="w-5 h-5 animate-spin text-primary" />
            </CardContent>
        </Card>
    );

    return (
        <Card className="border-slate-800 bg-slate-950/50 overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <PieChart className="w-4 h-4 text-primary" />
                    Database Usage Statistics
                </CardTitle>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 hover:bg-slate-800"
                    onClick={() => refetch()}
                >
                    <RefreshCw className="w-3.5 h-3.5" />
                </Button>
            </CardHeader>
            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <table className="w-full text-[11px] text-left">
                        <thead className="bg-slate-900/50 text-slate-500 uppercase">
                            <tr>
                                <th className="px-4 py-2 font-medium">Data Category</th>
                                <th className="px-4 py-2 font-medium text-right">Rows</th>
                                <th className="px-4 py-2 font-medium text-right">Total Size</th>
                                <th className="px-4 py-2 font-medium text-right">Indices</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {stats?.slice(0, 10).map((row, idx) => (
                                <tr key={idx} className="hover:bg-slate-900/30 transition-colors">
                                    <td className="px-4 py-2 text-slate-300 font-medium">
                                        <div className="flex flex-col">
                                            <span>{getTableLabel(row.table_name)}</span>
                                            <span className="text-[9px] text-slate-600 font-mono">{row.table_name}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-2 text-right text-slate-400 font-mono">
                                        {Number(row.row_count).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-2 text-right">
                                        <span className={clsx(
                                            "font-semibold",
                                            row.total_size.includes('GB') ? "text-red-400" :
                                            row.total_size.includes('MB') && parseInt(row.total_size) > 100 ? "text-amber-400" :
                                            "text-slate-400"
                                        )}>
                                            {row.total_size}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 text-right text-slate-500 text-[10px]">
                                        {row.index_size}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="p-3 bg-slate-900/20 text-[10px] text-slate-500 italic flex items-center gap-2">
                    <Info className="w-3 h-3 text-primary" />
                    Statistik di atas membantu Anda menentukan masa retensi yang tepat agar disk server tidak cepat penuh.
                </div>
            </CardContent>
        </Card>
    );
}
