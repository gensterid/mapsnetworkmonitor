import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
    Download, 
    Trash2, 
    FileText, 
    FileArchive, 
    FileJson,
    Plus, 
    Loader2, 
    AlertCircle, 
    CheckCircle2,
    HardDrive,
    History,
    Wand2,
    Mail,
    Settings
} from 'lucide-react';
import { routerBackupService } from '@/lib/api/services/router-backup.service';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { formatBytes, formatLastSync } from '@/components/router/router-utils';
import clsx from 'clsx';

export default function BackupsTab({ routerId }) {
    const queryClient = useQueryClient();
    const [backupType, setBackupType] = useState('json');
    const [comment, setComment] = useState('');
    const [delay, setDelay] = useState(10);
    
    // Automated Email Backup State
    const [showEmailSettings, setShowEmailSettings] = useState(false);
    const [emailConfig, setEmailConfig] = useState({
        server: '',
        port: 587,
        user: '',
        pass: '',
        recipient: '',
        interval: '24h'
    });

    // Fetch backups
    const { data: backups = [], isLoading, error } = useQuery({
        queryKey: ['router-backups', routerId],
        queryFn: () => routerBackupService.listBackups(routerId)
    });

    // Create backup mutation
    const createMutation = useMutation({
        mutationFn: ({ type, comment, delay }) => routerBackupService.createBackup(routerId, type, comment, delay),
        onSuccess: () => {
            queryClient.invalidateQueries(['router-backups', routerId]);
            setComment('');
        }
    });

    // Delete backup mutation
    const deleteMutation = useMutation({
        mutationFn: (backupId) => routerBackupService.deleteBackup(backupId),
        onSuccess: () => {
            queryClient.invalidateQueries(['router-backups', routerId]);
        }
    });

    const convertMutation = useMutation({
        mutationFn: (backupId) => routerBackupService.convertSnapshot(backupId),
        onSuccess: () => {
            queryClient.invalidateQueries(['router-backups', routerId]);
        }
    });

    const emailConfigMutation = useMutation({
        mutationFn: (config) => routerBackupService.pushEmailConfig(routerId, config),
        onSuccess: (data) => {
            setShowEmailSettings(false);
        }
    });

    const handleCreate = () => {
        createMutation.mutate({ type: backupType, comment, delay: parseInt(delay) || 10 });
    };

    const handleDownload = (backupId) => {
        window.open(routerBackupService.getDownloadUrl(backupId), '_blank');
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-slate-400">Loading backup history...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Create Backup Card */}
            <Card className="border-primary/20 bg-slate-900/40">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Plus className="w-5 h-5 text-primary" />
                        Create New Backup
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col md:flex-row gap-4 items-end">
                        <div className="flex-1 space-y-2 w-full">
                            <label className="text-sm font-medium text-slate-400">Format</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setBackupType('backup')}
                                    className={clsx(
                                        "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-all pointer-events-none opacity-50",
                                        backupType === 'backup' 
                                            ? "bg-primary/20 border-primary text-primary" 
                                            : "bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600"
                                    )}
                                    title="Disabled: Requires OS v7 due to TLS truncation bugs."
                                >
                                    <FileArchive className="w-4 h-4" />
                                    <span className="text-xs">.backup</span>
                                </button>
                                <button
                                    onClick={() => setBackupType('rsc')}
                                    className={clsx(
                                        "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-all",
                                        backupType === 'rsc' 
                                            ? "bg-primary/20 border-primary text-primary" 
                                            : "bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600"
                                    )}
                                >
                                    <FileText className="w-4 h-4" />
                                    <span className="text-xs">.rsc</span>
                                </button>
                                <button
                                    onClick={() => setBackupType('json')}
                                    className={clsx(
                                        "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border transition-all shadow-[0_0_15px_rgba(34,197,94,0.1)]",
                                        backupType === 'json' 
                                            ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" 
                                            : "bg-slate-800/50 border-emerald-900/50 text-slate-400 hover:border-emerald-600/50"
                                    )}
                                    title="100% Reliable Native API Extraction"
                                >
                                    <FileJson className="w-4 h-4" />
                                    <span className="text-xs">Snapshot</span>
                                </button>
                            </div>
                        </div>
                        <div className="flex-[2] space-y-2 w-full">
                            <label className="text-sm font-medium text-slate-400">Comment (Optional)</label>
                            <Input 
                                placeholder="Purpose of this backup..."
                                value={comment}
                                onChange={(e) => setComment(e.target.value)}
                                className="bg-slate-800/50 border-slate-700"
                            />
                        </div>
                        <div className="flex-1 space-y-2 w-full">
                            <label className="text-sm font-medium text-slate-400">Wait Time (Seconds)</label>
                            <Input 
                                type="number"
                                min="3"
                                max="300"
                                value={delay}
                                onChange={(e) => setDelay(e.target.value)}
                                className="bg-slate-800/50 border-slate-700"
                            />
                        </div>
                        <Button 
                            onClick={handleCreate}
                            loading={createMutation.isPending}
                            className="w-full md:w-auto h-10 px-8"
                        >
                            Take Backup
                        </Button>
                    </div>

                    {createMutation.isSuccess && (
                        <div className="mt-4 flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
                            <CheckCircle2 className="w-4 h-4" />
                            Backup created and downloaded to monitor server successfully.
                        </div>
                    )}
                    {createMutation.isError && (
                        <div className="mt-4 flex items-center gap-2 text-red-400 text-sm bg-red-500/10 p-3 rounded-lg border border-red-500/20">
                            <AlertCircle className="w-4 h-4" />
                            Error: {createMutation.error.message}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Automated Email Backup Configuration */}
            <Card className="bg-slate-900/50 border-slate-800 border-dashed">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-slate-300 flex items-center gap-2">
                        <Mail className="w-4 h-4 text-emerald-400" />
                        Automated Direct-to-Email Backup
                    </CardTitle>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setShowEmailSettings(!showEmailSettings)}
                        className="text-slate-400 hover:text-white"
                    >
                        {showEmailSettings ? 'Cancel' : 'Configure Scheduler'}
                        <Settings className={clsx("w-4 h-4 ml-2 transition-transform", showEmailSettings && "rotate-90")} />
                    </Button>
                </CardHeader>
                <CardContent>
                    {!showEmailSettings ? (
                        <p className="text-xs text-slate-500">
                            Configure your MikroTik to automatically export and email its configuration (.rsc) directly to your inbox without passing through this server.
                        </p>
                    ) : (
                        <div className="space-y-4 pt-2">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">SMTP Server</label>
                                    <Input 
                                        placeholder="e.g. smtp.gmail.com"
                                        value={emailConfig.server}
                                        onChange={(e) => setEmailConfig({...emailConfig, server: e.target.value})}
                                        className="bg-slate-800/50 border-slate-700"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">SMTP Port</label>
                                    <Input 
                                        type="number"
                                        placeholder="587"
                                        value={emailConfig.port}
                                        onChange={(e) => setEmailConfig({...emailConfig, port: parseInt(e.target.value)})}
                                        className="bg-slate-800/50 border-slate-700"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">SMTP User</label>
                                    <Input 
                                        placeholder="Your email"
                                        value={emailConfig.user}
                                        onChange={(e) => setEmailConfig({...emailConfig, user: e.target.value})}
                                        className="bg-slate-800/50 border-slate-700"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">SMTP Password</label>
                                    <Input 
                                        type="password"
                                        placeholder="App password or login pass"
                                        value={emailConfig.pass}
                                        onChange={(e) => setEmailConfig({...emailConfig, pass: e.target.value})}
                                        className="bg-slate-800/50 border-slate-700"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Recipient Email</label>
                                    <Input 
                                        placeholder="Who gets the backup?"
                                        value={emailConfig.recipient}
                                        onChange={(e) => setEmailConfig({...emailConfig, recipient: e.target.value})}
                                        className="bg-slate-800/50 border-slate-700"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Interval (Frequency)</label>
                                    <select 
                                        className="w-full bg-slate-800/50 border border-slate-700 rounded-md p-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                        value={emailConfig.interval}
                                        onChange={(e) => setEmailConfig({...emailConfig, interval: e.target.value})}
                                    >
                                        <option value="01:00:00">Hourly</option>
                                        <option value="12:00:00">Every 12 Hours</option>
                                        <option value="24:00:00">Daily</option>
                                        <option value="7d 00:00:00">Weekly</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <Button 
                                    variant="ghost" 
                                    onClick={() => setShowEmailSettings(false)}
                                    className="text-slate-400"
                                >
                                    Cancel
                                </Button>
                                <Button 
                                    onClick={() => emailConfigMutation.mutate(emailConfig)}
                                    loading={emailConfigMutation.isPending}
                                    className="bg-emerald-600 hover:bg-emerald-500"
                                >
                                    Inject Automatic Script
                                </Button>
                            </div>
                            {emailConfigMutation.isSuccess && (
                                <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Configured! Check MikroTik Scheduler.
                                </p>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Backup List */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <History className="w-5 h-5 text-slate-400" />
                        Backup History
                    </h2>
                    <span className="text-xs text-slate-500">{backups.length} records found</span>
                </div>

                {backups.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 bg-slate-900/20 border border-dashed border-slate-700 rounded-xl gap-3">
                        <HardDrive className="w-10 h-10 text-slate-700" />
                        <p className="text-slate-500 text-sm">No backups found for this router yet.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-3">
                        {backups.map((bkp) => (
                            <div 
                                key={bkp.id}
                                className="group flex items-center justify-between p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl hover:border-slate-600 transition-all hover:bg-slate-800/50"
                            >
                                <div className="flex items-center gap-4">
                                    <div className={clsx(
                                        "p-2.5 rounded-lg",
                                        bkp.type === 'backup' ? "bg-amber-500/10 text-amber-500" : 
                                        bkp.type === 'json' ? "bg-emerald-500/10 text-emerald-500" : "bg-blue-500/10 text-blue-500"
                                    )}>
                                        {bkp.type === 'backup' ? <FileArchive className="w-5 h-5" /> : 
                                         bkp.type === 'json' ? <FileJson className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                                    </div>
                                    <div>
                                        <div className="font-medium text-slate-200">{bkp.filename}</div>
                                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                                            <span>{formatLastSync(bkp.createdAt)}</span>
                                            <span className="w-1 h-1 bg-slate-700 rounded-full" />
                                            <span>{formatBytes(bkp.size)}</span>
                                            {bkp.comment && (
                                                <>
                                                    <span className="w-1 h-1 bg-slate-700 rounded-full" />
                                                    <span className="text-slate-400 italic">"{bkp.comment}"</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {bkp.type === 'json' && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                                            onClick={() => convertMutation.mutate(bkp.id)}
                                            loading={convertMutation.isPending && convertMutation.variables === bkp.id}
                                            title="Magic Wand: Reconstruct .rsc Script from this Snapshot"
                                        >
                                            <Wand2 className="w-4 h-4" />
                                        </Button>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleDownload(bkp.id)}
                                        title="Download to PC"
                                        className="text-slate-400 hover:text-primary hover:bg-primary/10"
                                    >
                                        <Download className="w-4 h-4" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                            if (window.confirm('Are you sure you want to delete this backup?')) {
                                                deleteMutation.mutate(bkp.id);
                                            }
                                        }}
                                        title="Delete"
                                        className="text-slate-400 hover:text-red-500 hover:bg-red-500/10"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
