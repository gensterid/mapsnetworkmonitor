import React from 'react';
import NetworkMap from '@/components/NetworkMap';

function MapTab({ router, netwatch, realtimeTraffic, isLiveMode }) {
    return (
        <div className="h-[calc(100vh-250px)] rounded-lg overflow-hidden border border-slate-700 glass-panel">
            <NetworkMap
                routerId={router?.id}
                initialNetwatch={netwatch}
                realtimeTraffic={realtimeTraffic}
                isLiveMode={isLiveMode}
                autoZoom={true}
            />
        </div>
    );
}

export default MapTab;
