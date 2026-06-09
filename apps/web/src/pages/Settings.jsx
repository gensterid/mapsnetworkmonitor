import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSettings, useUpdateSetting, useCurrentUser, useUpdateUser } from '@/hooks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Settings as SettingsIcon, Save, RefreshCw, Bell, Globe, Clock, AlertTriangle, User, Database, Upload, Download, Activity, Plus, Trash2, Palette, Monitor, Info, Sparkles, Wrench, History, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react';
import { useExportDatabase, useImportDatabase, useBackups, useDeleteBackup, useRestoreBackup, useTriggerManualBackup } from '@/hooks';
import { useTheme } from '@/context/ThemeContext';
import AlertSettingsPanel from '@/components/settings/AlertSettingsPanel';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { getAnimationStyleNames } from '@/components/map/animationStyles';
import { DEFAULT_MAP_COLORS } from '@/components/map/mapColors';
import ProfileSettings from '@/components/settings/ProfileSettings';
import GeneralSettings from '@/components/settings/GeneralSettings';
import MapColorsSettings from '@/components/settings/MapColorsSettings';
import PollingSettings from '@/components/settings/PollingSettings';
import MaintenanceSettings from '@/components/settings/MaintenanceSettings';
import AISettings from '@/components/settings/AISettings';
import SystemHealthGuide from '@/components/settings/SystemHealthGuide';
import DiagnosticsSettings from '@/components/settings/DiagnosticsSettings';

const TABS = [
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'general', label: 'General', icon: SettingsIcon },
    { id: 'map-colors', label: 'Map Colors', icon: Palette },
    { id: 'alerts', label: 'Alert Thresholds', icon: AlertTriangle },
    { id: 'polling', label: 'Polling & Sync', icon: Clock },
    { id: 'ai', label: 'AI Intelligence', icon: Sparkles },
    { id: 'maintenance', label: 'Maintenance', icon: Wrench },
    { id: 'diagnostics', label: 'Diagnostics', icon: Activity, superadminOnly: true },
    // Superadmin-only tab. Filtered out of the nav for other roles below.
    { id: 'system-guide', label: 'Panduan Sistem', icon: ShieldCheck, superadminOnly: true },
];

// Helper components moved to PollingSettings.jsx

export default function Settings() {
    const location = useLocation();
    const { theme, setTheme, themes, themeDetails } = useTheme();

    // Support deep-linking to tabs via ?tab=tabId
    const getInitialTab = () => {
        const params = new URLSearchParams(location.search);
        const tab = params.get('tab');
        return TABS.some(t => t.id === tab) ? tab : 'profile';
    };

    const [activeTab, setActiveTab] = useState(getInitialTab());
    const [formData, setFormData] = useState({
        appName: 'NetMonitor',
        pollingInterval: '30',
        alertEmailEnabled: false,
        alertEmail: '',
        googleMapsApiKey: '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        animationStyle: 'default',
        // Profile fields
        name: '',
        username: '',
        image: '',
        // Map Colors
        mapColors: { ...DEFAULT_MAP_COLORS },
        // Polling (New)
        olt_polling_interval: '1', // SNMP
        olt_web_interval: '10', // Web
        acs_polling_interval: '10', // ACS
        olt_sync_enabled: true,
        acs_sync_enabled: true,
        genieacs_enabled: true,
        genieacs_global_enabled: true,
        // GenieACS
        genieacs_url: '',
        genieacs_username: '',
        genieacs_password: '',
        webhook_base_url: 'http://localhost:5173',
        aiEnabled: false,
        aiApiKey: '',
        // Retention Settings
        metrics_retention_days: '360',
        interface_metrics_retention_days: '360',
        alerts_retention_days: '60',
        audit_logs_retention_days: '365',
        performance_retention_days: '30',
        backups_retention_days: '90',
        pppoe_retention_days: '30',
    });
    const [saveStatus, setSaveStatus] = useState('');
    const [pingTargets, setPingTargets] = useState([
        { ip: '8.8.8.8', label: 'Google DNS' },
        { ip: '1.1.1.1', label: 'Cloudflare' }
    ]);

    const { data: settings, isLoading: isSettingsLoading } = useSettings();
    const { data: currentUser, isLoading: isUserLoading } = useCurrentUser();

    const updateSettingMutation = useUpdateSetting();
    const updateUserMutation = useUpdateUser();
    const exportDatabaseMutation = useExportDatabase();
    const importDatabaseMutation = useImportDatabase();
    const backupHistory = useBackups();
    const deleteBackupMutation = useDeleteBackup();
    const restoreBackupMutation = useRestoreBackup();
    const triggerBackupMutation = useTriggerManualBackup();

    const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
    const [selectedBackupFile, setSelectedBackupFile] = useState(null);
    const [localBackupToRestore, setLocalBackupToRestore] = useState(null);
    const [isLocalRestoreModalOpen, setIsLocalRestoreModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [backupToDelete, setBackupToDelete] = useState(null);

    const handleFileSelect = (e) => {
        if (e.target.files && e.target.files[0]) {
            setSelectedBackupFile(e.target.files[0]);
            setIsRestoreModalOpen(true);
        }
    };

    const confirmRestore = async () => {
        if (selectedBackupFile) {
            await importDatabaseMutation.mutateAsync(selectedBackupFile);
            setIsRestoreModalOpen(false);
            setSelectedBackupFile(null);
        }
    };

    const confirmLocalRestore = async () => {
        if (localBackupToRestore) {
            await restoreBackupMutation.mutateAsync(localBackupToRestore);
            setIsLocalRestoreModalOpen(false);
            setLocalBackupToRestore(null);
        }
    };

    const confirmDelete = async () => {
        if (backupToDelete) {
            await deleteBackupMutation.mutateAsync(backupToDelete);
            setIsDeleteModalOpen(false);
            setBackupToDelete(null);
            backupHistory.refetch();
        }
    };

    const handleManualBackup = async () => {
        await triggerBackupMutation.mutateAsync();
        backupHistory.refetch();
    };

    useEffect(() => {
        if (settings) {
            setFormData(prev => ({
                ...prev,
                appName: settings.appName || 'NetMonitor',
                pollingInterval: String(settings.pollingInterval || 30),
                alertEmailEnabled: settings.alertEmailEnabled === 'true' || settings.alertEmailEnabled === true,
                alertEmail: settings.alertEmail || '',
                googleMapsApiKey: settings.googleMapsApiKey || '',
                webhook_base_url: settings.webhook_base_url || 'http://localhost:5173',
                genieacs_url: settings.genieacs_url || '',
                genieacs_username: settings.genieacs_username || '',
                genieacs_password: settings.genieacs_password_encrypted || '',
                olt_sync_enabled: settings.olt_sync_enabled === 'true' || settings.olt_sync_enabled === true,
                acs_sync_enabled: settings.acs_sync_enabled === 'true' || settings.acs_sync_enabled === true,
                genieacs_enabled: settings.genieacs_enabled === 'true' || settings.genieacs_enabled === true || settings.genieacs_enabled === undefined,
                genieacs_global_enabled: settings.genieacs_global_enabled === 'true' || settings.genieacs_global_enabled === true || settings.genieacs_global_enabled === undefined,
                olt_web_interval: String(settings.olt_web_interval || 10),
                acs_polling_interval: String(settings.acs_polling_interval || 10),
            }));
            // Load ping targets from settings
            if (settings.pingTargets && Array.isArray(settings.pingTargets)) {
                setPingTargets(settings.pingTargets);
            }
            // Load Retention Settings
            setFormData(prev => ({
                ...prev,
                metrics_retention_days: String(settings.metrics_retention_days || 360),
                interface_metrics_retention_days: String(settings.interface_metrics_retention_days || 360),
                alerts_retention_days: String(settings.alerts_retention_days || 60),
                audit_logs_retention_days: String(settings.audit_logs_retention_days || 365),
                performance_retention_days: String(settings.performance_retention_days || 30),
                backups_retention_days: String(settings.backups_retention_days || 90),
                pppoe_retention_days: String(settings.pppoe_retention_days || 30),
            }));
            // Load map colors
            if (settings.mapColors) {
                setFormData(prev => ({
                    ...prev,
                    genieacs_username: settings.genieacs_username || '',
                    genieacs_password: settings.genieacs_password_encrypted || '',
                    mapColors: settings.mapColors,
                }));
            }
        }
    }, [settings]);

    useEffect(() => {
        if (currentUser) {
            setFormData(prev => ({
                ...prev,
                timezone: currentUser.timezone,
                name: currentUser.name || '',
                username: currentUser.username || '',
                image: currentUser.image || '',
                animationStyle: currentUser.animationStyle || 'default',
                aiEnabled: currentUser.aiEnabled || false,
                aiApiKey: currentUser.aiApiKey || '',
            }));
        }
    }, [currentUser]);

    const handleChange = (e) => {
        const { name, value, type, checked, dataset } = e.target;

        // Handle nested mapColors changes
        if (dataset.group === 'mapColors') {
            setFormData(prev => ({
                ...prev,
                mapColors: {
                    ...prev.mapColors,
                    [name]: value
                }
            }));
            return;
        }

        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaveStatus('Saving...');

        try {
            // Update Global Settings (Admin Only)
            if (currentUser?.role === 'admin' || currentUser?.role === 'superadmin') {
                await updateSettingMutation.mutateAsync({ key: 'appName', value: formData.appName });
                await updateSettingMutation.mutateAsync({ key: 'pollingInterval', value: parseInt(formData.pollingInterval, 10) });
                await updateSettingMutation.mutateAsync({ key: 'alertEmailEnabled', value: formData.alertEmailEnabled });
                await updateSettingMutation.mutateAsync({ key: 'alertEmail', value: formData.alertEmail });
                await updateSettingMutation.mutateAsync({ key: 'googleMapsApiKey', value: formData.googleMapsApiKey });

                // Save ping targets (filter out empty ones)
                const validTargets = pingTargets.filter(t => t.ip.trim() !== '');
                await updateSettingMutation.mutateAsync({ key: 'pingTargets', value: validTargets });
                await updateSettingMutation.mutateAsync({ key: 'mapColors', value: formData.mapColors });
                await updateSettingMutation.mutateAsync({ key: 'webhook_base_url', value: formData.webhook_base_url });
                await updateSettingMutation.mutateAsync({ key: 'genieacs_url', value: formData.genieacs_url });
                await updateSettingMutation.mutateAsync({ key: 'genieacs_username', value: formData.genieacs_username });
                await updateSettingMutation.mutateAsync({ key: 'genieacs_password_encrypted', value: formData.genieacs_password });

                // Save Polling Settings
                await updateSettingMutation.mutateAsync({ key: 'olt_polling_interval', value: parseInt(formData.olt_polling_interval) });
                await updateSettingMutation.mutateAsync({ key: 'olt_web_interval', value: parseInt(formData.olt_web_interval) });
                await updateSettingMutation.mutateAsync({ key: 'acs_polling_interval', value: parseInt(formData.acs_polling_interval) });
                await updateSettingMutation.mutateAsync({ key: 'olt_sync_enabled', value: formData.olt_sync_enabled });
                await updateSettingMutation.mutateAsync({ key: 'acs_sync_enabled', value: formData.acs_sync_enabled });
                await updateSettingMutation.mutateAsync({ key: 'genieacs_enabled', value: formData.genieacs_enabled });
                await updateSettingMutation.mutateAsync({ key: 'genieacs_global_enabled', value: formData.genieacs_global_enabled });

                // Save Retention Settings
                await updateSettingMutation.mutateAsync({ key: 'metrics_retention_days', value: parseInt(formData.metrics_retention_days, 10) });
                await updateSettingMutation.mutateAsync({ key: 'interface_metrics_retention_days', value: parseInt(formData.interface_metrics_retention_days, 10) });
                await updateSettingMutation.mutateAsync({ key: 'alerts_retention_days', value: parseInt(formData.alerts_retention_days, 10) });
                await updateSettingMutation.mutateAsync({ key: 'audit_logs_retention_days', value: parseInt(formData.audit_logs_retention_days, 10) });
                await updateSettingMutation.mutateAsync({ key: 'performance_retention_days', value: parseInt(formData.performance_retention_days, 10) });
                await updateSettingMutation.mutateAsync({ key: 'backups_retention_days', value: parseInt(formData.backups_retention_days, 10) });
                await updateSettingMutation.mutateAsync({ key: 'pppoe_retention_days', value: parseInt(formData.pppoe_retention_days, 10) });
            }

            // Update User Profile (Self)
            if (currentUser) {
                const userUpdates = {
                    name: formData.name,
                    username: formData.username,
                    image: formData.image,
                    timezone: formData.timezone,
                    animationStyle: formData.animationStyle,
                    aiEnabled: formData.aiEnabled,
                    aiApiKey: formData.aiApiKey,
                };
                await updateUserMutation.mutateAsync({
                    id: currentUser.id,
                    data: userUpdates
                });
            }

            setSaveStatus('Settings saved successfully!');
            toast.success('Settings saved');
            setTimeout(() => setSaveStatus(''), 3000);
        } catch (error) {
            setSaveStatus('Failed to save: ' + (error.message || 'Unknown error'));
            toast.error('Failed to save settings: ' + (error.message || 'Unknown error'));
        }
    };

    if (isSettingsLoading || isUserLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-slate-950">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background-dark overflow-hidden">
            <div className="p-6 border-b border-slate-800">
                <h1 className="text-2xl font-bold text-fg">Settings</h1>
                <p className="text-fg-muted text-sm">Configure application settings</p>
            </div>

            {/* Tab Navigation */}
            <div className="px-6 border-b border-slate-800">
                <nav className="flex gap-1 overflow-x-auto">
                    {TABS.filter(tab => !tab.superadminOnly || currentUser?.role === 'superadmin').map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={clsx(
                                "flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-[2px] whitespace-nowrap",
                                activeTab === tab.id
                                    ? "border-primary text-primary"
                                    : "border-transparent text-fg-muted hover:text-fg hover:border-slate-border"
                            )}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                            {tab.superadminOnly && (
                                <span className="px-1.5 py-0.5 text-[9px] font-bold bg-primary/10 text-primary rounded uppercase tracking-wider">SA</span>
                            )}
                        </button>
                    ))}
                </nav>
            </div>

            <div className="flex-1 overflow-auto p-6">
                {activeTab === 'profile' && (
                    <ProfileSettings
                        formData={formData}
                        handleChange={handleChange}
                        currentUser={currentUser}
                        updateUserMutation={updateUserMutation}
                        saveStatus={saveStatus}
                        handleSubmit={handleSubmit}
                    />
                )}

                {activeTab === 'general' && (
                    <GeneralSettings
                        formData={formData}
                        handleChange={handleChange}
                        setFormData={setFormData}
                        currentUser={currentUser}
                        theme={theme}
                        setTheme={setTheme}
                        themes={themes}
                        themeDetails={themeDetails}
                        saveStatus={saveStatus}
                        handleSubmit={handleSubmit}
                        updateSettingMutation={updateSettingMutation}
                        updateUserMutation={updateUserMutation}
                        pingTargets={pingTargets}
                        setPingTargets={setPingTargets}
                        getAnimationStyleNames={getAnimationStyleNames}
                    />
                )}

                {activeTab === 'maintenance' && (
                    <MaintenanceSettings
                        formData={formData}
                        handleChange={handleChange}
                        currentUser={currentUser}
                        handleSubmit={handleSubmit}
                        updateSettingMutation={updateSettingMutation}
                        exportDatabaseMutation={exportDatabaseMutation}
                        importDatabaseMutation={importDatabaseMutation}
                        backupHistory={backupHistory}
                        deleteBackupMutation={deleteBackupMutation}
                        restoreBackupMutation={restoreBackupMutation}
                        triggerBackupMutation={triggerBackupMutation}
                        handleFileSelect={handleFileSelect}
                        handleManualBackup={handleManualBackup}
                        setLocalBackupToRestore={setLocalBackupToRestore}
                        setIsLocalRestoreModalOpen={setIsLocalRestoreModalOpen}
                        setBackupToDelete={setBackupToDelete}
                        setIsDeleteModalOpen={setIsDeleteModalOpen}
                    />
                )}

                {activeTab === 'polling' && (
                    <PollingSettings
                        formData={formData}
                        handleChange={handleChange}
                        handleSubmit={handleSubmit}
                        updateSettingMutation={updateSettingMutation}
                        saveStatus={saveStatus}
                    />
                )}

                {activeTab === 'map-colors' && (
                    <MapColorsSettings
                        formData={formData}
                        handleChange={handleChange}
                        setFormData={setFormData}
                        handleSubmit={handleSubmit}
                        updateSettingMutation={updateSettingMutation}
                        saveStatus={saveStatus}
                        DEFAULT_MAP_COLORS={DEFAULT_MAP_COLORS}
                    />
                )}

                {activeTab === 'ai' && (
                    <AISettings
                        formData={formData}
                        handleChange={handleChange}
                        handleSubmit={handleSubmit}
                        updateUserMutation={updateUserMutation}
                        saveStatus={saveStatus}
                    />
                )}

                {activeTab === 'alerts' && (
                    <div className="max-w-2xl">
                        <AlertSettingsPanel />
                    </div>
                )}

                {activeTab === 'system-guide' && (
                    <SystemHealthGuide currentUser={currentUser} />
                )}

                {activeTab === 'diagnostics' && (
                    <DiagnosticsSettings />
                )}

            </div>
 
            {/* Restore Upload Confirmation Modal */}
            <Modal
                isOpen={isRestoreModalOpen}
                onClose={() => {
                    setIsRestoreModalOpen(false);
                    setSelectedBackupFile(null);
                }}
                title="Confirm SQL Import"
            >
                <div className="space-y-4">
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <div className="text-sm text-amber-200">
                            <p className="font-bold mb-1">Warning: Database Overwrite</p>
                            <p>Importing this SQL file will <strong>overwrite your entire database</strong>. Current data will be lost unless you have a backup.</p>
                        </div>
                    </div>

                    {selectedBackupFile && (
                        <div className="text-fg text-sm">
                            <p>File selected: <span className="font-mono text-fg bg-slate-800 px-1 rounded">{selectedBackupFile.name}</span></p>
                            <p className="text-xs text-fg-muted mt-1">Size: {(selectedBackupFile.size / 1024).toFixed(2)} KB</p>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 mt-6">
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setIsRestoreModalOpen(false);
                                setSelectedBackupFile(null);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmRestore}
                            loading={importDatabaseMutation.isPending}
                        >
                            <Upload className="w-4 h-4 mr-2" />
                            Confirm Import
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Restore Local Confirmation Modal */}
            <Modal
                isOpen={isLocalRestoreModalOpen}
                onClose={() => {
                    setIsLocalRestoreModalOpen(false);
                    setLocalBackupToRestore(null);
                }}
                title="Confirm System Restore"
            >
                <div className="space-y-4">
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <div className="text-sm text-amber-200">
                            <p className="font-bold mb-1">Warning: System Rollback</p>
                            <p>You are about to restore the database to an older state. All data created after this backup was taken will be <strong>lost forever</strong>.</p>
                        </div>
                    </div>

                    <div className="text-fg text-sm">
                        <p>Restoring from: <span className="font-mono text-fg bg-slate-800 px-1 rounded">{localBackupToRestore}</span></p>
                    </div>

                    <div className="flex justify-end gap-3 mt-6">
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setIsLocalRestoreModalOpen(false);
                                setLocalBackupToRestore(null);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmLocalRestore}
                            loading={restoreBackupMutation.isPending}
                        >
                            <RefreshCw className={`w-4 h-4 mr-2 ${restoreBackupMutation.isPending ? 'animate-spin' : ''}`} />
                            Restore Now
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                isOpen={isDeleteModalOpen}
                onClose={() => {
                    setIsDeleteModalOpen(false);
                    setBackupToDelete(null);
                }}
                title="Delete Backup File"
            >
                <div className="space-y-4">
                    <p className="text-fg text-sm">
                        Are you sure you want to permanently delete the backup file <span className="font-mono text-fg">{backupToDelete}</span> from the server?
                    </p>

                    <div className="flex justify-end gap-3 mt-6">
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setIsDeleteModalOpen(false);
                                setBackupToDelete(null);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmDelete}
                            loading={deleteBackupMutation.isPending}
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete Permanently
                        </Button>
                    </div>
                </div>
            </Modal>
        </div >
    );
}
