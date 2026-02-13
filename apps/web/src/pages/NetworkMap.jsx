import React, { useState } from 'react';
import NetworkMapComponent from '../components/NetworkMap';
import { useRouters, useAllRoutersTraffic } from '@/hooks';

const NetworkMap = () => {
    const { data: routers = [] } = useRouters();
    const [isLiveMode, setIsLiveMode] = useState(false);

    // Subscribe to traffic for ALL routers when Live Mode is active
    const allTraffic = useAllRoutersTraffic(routers, isLiveMode);

    return (
        <NetworkMapComponent
            realtimeTraffic={allTraffic}
            isLiveMode={isLiveMode}
            onLiveModeChange={setIsLiveMode}
        />
    );
};

export default NetworkMap;
