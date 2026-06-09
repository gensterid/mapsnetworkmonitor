import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { genieacsService } from '@/services/genieacs.service';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { RefreshCw, Info, Globe, Wifi, Settings } from 'lucide-react';
import clsx from 'clsx';

import SummaryTab from './SummaryTab';
import WanTab from './WanTab';
import WifiTab from './WifiTab';
import AdvancedTab from './AdvancedTab';

export default function DeviceDetailModal({ 
  isOpen, 
  onClose, 
  deviceId, 
  routerId, 
  onOpenWanConfig, 
  onOpenWifiConfig 
}) {
  const [activeTab, setActiveTab] = useState('summary');

  const { data: fullDevice, isLoading } = useQuery({
    queryKey: ['genieacs-devices', deviceId, 'full', routerId],
    queryFn: () => genieacsService.getDevice(deviceId, routerId),
    enabled: !!deviceId && isOpen
  });

  const tabs = [
    { id: 'summary', label: 'Summary', shortLabel: 'Summary', icon: Info, component: SummaryTab },
    { id: 'wan', label: 'WAN / Network', shortLabel: 'WAN', icon: Globe, component: WanTab },
    { id: 'wifi', label: 'Radio / WiFi', shortLabel: 'WiFi', icon: Wifi, component: WifiTab },
    { id: 'advanced', label: 'Advanced Parameters', shortLabel: 'Advanced', icon: Settings, component: AdvancedTab },
  ];

  const ActiveComponent = tabs.find(t => t.id === activeTab)?.component || SummaryTab;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={fullDevice ? `Device Detail: ${fullDevice._id}` : 'Loading...'}
      maxWidth="max-w-5xl"
    >
      <div className="flex flex-col h-[75vh]">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            <p className="text-fg-muted animate-pulse text-sm">Synchronizing with CPE...</p>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="flex overflow-x-auto border-b border-slate-border scrollbar-hide mb-4">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    "flex items-center gap-2 px-3 sm:px-5 md:px-6 py-3 border-b-2 transition-all whitespace-nowrap text-xs sm:text-sm font-bold uppercase tracking-wider",
                    activeTab === tab.id
                      ? "border-primary text-primary bg-primary/5"
                      : "border-transparent text-fg-muted hover:text-fg hover:bg-slate-surface/30"
                  )}
                >
                  <tab.icon className="w-4 h-4 shrink-0" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.shortLabel}</span>
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-auto custom-scrollbar pr-1">
              <ActiveComponent 
                fullDevice={fullDevice} 
                onOpenWanConfig={onOpenWanConfig}
                onOpenWifiConfig={onOpenWifiConfig}
              />
            </div>

            <div className="mt-6 flex justify-between items-center pt-4 border-t border-slate-border">
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
                  <RefreshCw className="w-3.5 h-3.5 mr-2" />
                  Synchronize
                </Button>
              </div>
              <Button variant="ghost" onClick={onClose}>Close Detail</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
