import React from 'react';
import './map.css';

/**
 * LineThicknessControl - A floating control to adjust map line thickness
 */
const LineThicknessControl = ({ thickness, onChange }) => {
    return (
        <div className="map-control-group" style={{ position: 'absolute', top: 80, right: 16, zIndex: 1000 }}>
            <div className="flex flex-col items-center gap-2">
                <button
                    className="map-control-btn"
                    onClick={() => onChange(Math.min(thickness + 1, 10))}
                    title="Increase Line Thickness"
                >
                    <span className="material-symbols-outlined">add</span>
                </button>
                <div className="text-white text-xs font-mono">{thickness}</div>
                <button
                    className="map-control-btn"
                    onClick={() => onChange(Math.max(thickness - 1, 1))}
                    title="Decrease Line Thickness"
                >
                    <span className="material-symbols-outlined">remove</span>
                </button>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-1" style={{ writingMode: 'vertical-rl' }}>
                    Lines
                </div>
            </div>
        </div>
    );
};

export default LineThicknessControl;
