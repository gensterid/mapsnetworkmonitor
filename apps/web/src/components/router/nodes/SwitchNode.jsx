import React, { memo } from 'react';
import BaseNode from './BaseNode';
import { Network } from 'lucide-react';

const SwitchNode = (props) => {
    return (
        <BaseNode {...props} type="switch">
            <div className="node-icon-wrapper">
                <Network size={20} className="node-main-icon" />
            </div>
        </BaseNode>
    );
};

export default memo(SwitchNode);
