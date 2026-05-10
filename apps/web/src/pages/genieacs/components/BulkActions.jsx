import React from 'react';
import { Power, Database, Cpu, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * Floating action bar that appears when ≥1 device is selected in the
 * GenieACS device list. Buttons map to bulk operations on the GenieACS
 * task queue.
 *
 * Reboot   — POSTs `reboot` task to each selected device, with
 *            `?connection_request` to force immediate execution. Use
 *            this after firmware/config changes that need a CPE restart.
 *
 * Config   — Opens the Preset Manager. Operator picks a saved WiFi or
 *            WAN preset, then "Apply" pushes the same config to ALL
 *            selected devices in parallel. Useful for rolling out new
 *            SSID/password to a batch of customers without editing each.
 *
 * Backup   — Creates a JSON snapshot of WAN/WiFi config for each device
 *            and stores it in the genieacs_backups table. Lets you roll
 *            back later if a config push goes wrong, or clone settings
 *            to a replacement CPE.
 *
 * Refresh  — Sends a "Summon" / connection-request to force each device
 *            to inform GenieACS now (instead of waiting for the next
 *            scheduled inform interval, often hours). Updates IP/RX
 *            power/uptime in the dashboard immediately.
 */
export default function BulkActions({
  selectedCount,
  onReboot,
  onPreset,
  onBackup,
  onRefresh,
  onClear,
  isRebootPending,
}) {
  if (selectedCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 bg-slate-800 p-1.5 rounded-lg animate-in fade-in slide-in-from-top-2 border border-primary/20 shadow-lg shadow-primary/5">
      <span className="text-xs text-white px-2 font-black uppercase tracking-widest">{selectedCount} Selected</span>

      <div className="hidden sm:block w-px h-4 bg-slate-700 mx-1" />

      <Button size="sm" variant="destructive" onClick={onReboot} loading={isRebootPending} aria-label="Reboot selected devices" title="Reboot semua device terpilih">
        <Power className="w-3.5 h-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Reboot</span>
      </Button>

      <Button size="sm" variant="primary" onClick={onPreset} aria-label="Apply preset config to selected devices" title="Push preset config (WiFi/WAN) ke semua device terpilih">
        <Cpu className="w-3.5 h-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Apply Preset</span><span className="sm:hidden">Preset</span>
      </Button>

      <Button size="sm" variant="secondary" onClick={onBackup} aria-label="Backup selected devices" title="Buat backup config untuk semua device terpilih">
        <Database className="w-3.5 h-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Backup</span>
      </Button>

      {onRefresh && (
        <Button size="sm" variant="ghost" onClick={onRefresh} aria-label="Refresh device data" title="Force device check-in sekarang (refresh data)">
          <RefreshCw className="w-3.5 h-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">Refresh</span>
        </Button>
      )}

      <Button size="sm" variant="ghost" onClick={onClear} aria-label="Cancel selection" title="Batal pilihan">
        <span className="hidden sm:inline">Cancel</span>
        <span className="sm:hidden">✕</span>
      </Button>
    </div>
  );
}
