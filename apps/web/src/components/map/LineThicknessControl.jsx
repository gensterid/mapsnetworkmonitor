import React from 'react';
import './map.css';

/**
 * LineThicknessControl - A floating control to adjust map line thickness
 */
const LineThicknessControl = ({ thickness, onChange }) => {
    return (
        <div className="map-control-group hidden sm:block" style={{ position: 'absolute', top: 80, right: 16, zIndex: 1000 }}>
            <div className="flex flex-col items-center gap-3 p-1">
                <div className="text-white text-[10px] font-bold uppercase tracking-wider mb-1">Size</div>

                <div className="h-24 py-2">
                    <input
                        type="range"
                        min="1"
                        max="10"
                        step="1"
                        value={thickness}
                        onChange={(e) => onChange(parseInt(e.target.value, 10))}
                        className="thickness-slider"
                        style={{
                            writingMode: 'bt-lr', /* IE */
                            WebkitAppearance: 'slider-vertical', /* WebKit */
                            width: '4px',
                            height: '100%',
                        }}
                    />
                </div>

                <div className="text-white text-xs font-mono bg-slate-800 w-6 h-6 rounded flex items-center justify-center border border-slate-700">
                    {thickness}
                </div>
            </div>
        </div>
    );
};

export default LineThicknessControl;
