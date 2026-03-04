import React from 'react';
import { Wifi, Network } from 'lucide-react';
import StatsCard from './StatsCard';
import { useRouterHotspotActive, useRouterPppActive } from '@/hooks';

function ActiveUsersCard({ routerId }) {
    const { data: hotspotCount } = useRouterHotspotActive(routerId);
    const { data: pppCount } = useRouterPppActive(routerId);

    return (
        <div className="grid grid-cols-2 gap-4">
            <StatsCard
                icon={Wifi}
                label="Hotspot Active"
                value={hotspotCount?.count || 0}
                color="orange"
                subValue="Users"
            />
            <StatsCard
                icon={Network}
                label="PPPoE Active"
                value={pppCount?.count || 0}
                color="blue"
                subValue="Connections"
            />
        </div>
    );
}

export default ActiveUsersCard;
