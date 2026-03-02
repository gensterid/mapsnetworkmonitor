import React, { memo } from 'react';
import BaseNode from './BaseNode';
import { Router } from 'lucide-react';

const RouterNode = (props) => {
    return (
        <BaseNode {...props} type="router">
            <div className="node-icon-wrapper">
                <Router size={20} className="node-main-icon" />
            </div>
        </BaseNode>
    );
};

export default memo(RouterNode);
