import React from 'react';
import './map.css';

/**
 * MapLegend - Legend showing status indicators
 */
const MapLegend = ({ showLabels = true, onToggleLabels }) => {
    return (
        <div className="map-legend">
            <div className="map-legend__title">Legend</div>
            <div className="map-legend__items">
                {/* Status indicators */}
                <div className="map-legend__item">
                    <span className="map-legend__dot map-legend__dot--online"></span>
                    <span className="map-legend__text">Online / Up</span>
                </div>
                <div className="map-legend__item">
                    <span className="map-legend__dot map-legend__dot--offline"></span>
                    <span className="map-legend__text">Offline / Down</span>
                </div>

                {/* Line status */}
                <div className="map-legend__item" style={{ marginTop: 8 }}>
                    <span className="map-legend__line map-legend__line--up"></span>
                    <span className="map-legend__text">Active Link</span>
                </div>
                <div className="map-legend__item">
                    <span className="map-legend__line map-legend__line--down"></span>
                    <span className="map-legend__text">Down Link</span>
                </div>
            </div>

            {/* Label toggle */}
            {onToggleLabels && (
                <button
                    onClick={onToggleLabels}
                    className="map-legend__toggle"
                    style={{
                        marginTop: 12,
                        padding: '6px 10px',
                        background: showLabels ? 'rgba(59, 130, 246, 0.2)' : 'rgba(71, 85, 105, 0.4)',
                        border: 'none',
                        borderRadius: 4,
                        color: 'white',
                        fontSize: 11,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        width: '100%',
                    }}
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                        {showLabels ? 'label' : 'label_off'}
                    </span>
                    {showLabels ? 'Hide Labels' : 'Show Labels'}
                </button>
            )}
        </div>
    );
};

export default MapLegend;
