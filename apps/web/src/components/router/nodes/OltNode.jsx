import React, { memo } from 'react';
import BaseNode from './BaseNode';
import { Layers } from 'lucide-react';

const OltNode = (props) => {
    return (
        <BaseNode {...props} type="olt">
            <div className="node-icon-wrapper">
                <Layers size={20} className="node-main-icon" />
                <div className="sfp-detail-indicator">SFP</div>
            </div>
        </BaseNode>
    );
};

export default memo(OltNode);
