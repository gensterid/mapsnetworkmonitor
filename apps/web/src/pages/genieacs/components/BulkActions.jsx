import React from 'react';
import { Power, Database, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function BulkActions({ 
  selectedCount, 
  onBulkReboot, 
  onOpenPresets, 
  onBulkBackup, 
  onCancel,
  isRebootPending 
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex items-center gap-2 bg-slate-800 p-1.5 rounded-lg animate-in fade-in slide-in-from-top-2 border border-primary/20 shadow-lg shadow-primary/5">
      <span className="text-xs text-white px-2 font-black uppercase tracking-widest">{selectedCount} Selected</span>
      
      <div className="w-px h-4 bg-slate-700 mx-1" />
      
      <Button size="sm" variant="destructive" onClick={onBulkReboot} loading={isRebootPending}>
        <Power className="w-3 h-3 mr-1.5" /> Reboot
      </Button>
      
      <Button size="sm" variant="primary" onClick={onOpenPresets}>
        <Cpu className="w-3 h-3 mr-1.5" /> Config
      </Button>
      
      <Button size="sm" variant="secondary" onClick={onBulkBackup}>
        <Database className="w-3 h-3 mr-1.5" /> Backup
      </Button>
      
      <Button size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
