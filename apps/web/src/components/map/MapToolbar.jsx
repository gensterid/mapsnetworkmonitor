import React from 'react';
import './map.css';

/**
 * MapToolbar - Toolbar shown during path editing mode
 * 
 * Displays:
 * - Cable/path length in meters
 * - Reset to straight line button
 * - Cancel and Save buttons
 */
const MapToolbar = ({
    isVisible = false,
    pathLength = 0,
    onReset,
    onCancel,
    onSave,
}) => {
    if (!isVisible) return null;

    // Format length for display
    const formatLength = (meters) => {
        if (meters >= 1000) {
            return `${(meters / 1000).toFixed(2)} km`;
        }
        return `${Math.round(meters)} m`;
    };

    return (
        <div className="path-edit-toolbar">
            <div className="path-edit-toolbar__length">
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#60a5fa' }}>
                    straighten
                </span>
                <span>PANJANG KABEL:</span>
                <span className="path-edit-toolbar__length-value">
                    {formatLength(pathLength)}
                </span>
            </div>

            {/* Help text for path editing */}
            <div style={{
                fontSize: 11,
                color: 'rgba(255,255,255,0.7)',
                padding: '4px 12px',
                borderLeft: '1px solid rgba(255,255,255,0.2)',
                marginLeft: 8,
            }}>
                💡 Klik garis → tambah titik | Geser titik → pindah | Klik kanan → hapus titik
            </div>

            <div className="path-edit-toolbar__actions">
                <button
                    className="path-edit-toolbar__btn path-edit-toolbar__btn--reset"
                    onClick={onReset}
                    title="Reset to straight line"
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        undo
                    </span>
                    Reset Lurus
                </button>

                <button
                    className="path-edit-toolbar__btn path-edit-toolbar__btn--cancel"
                    onClick={onCancel}
                    title="Cancel editing"
                >
                    Batal
                </button>

                <button
                    className="path-edit-toolbar__btn path-edit-toolbar__btn--save"
                    onClick={onSave}
                    title="Save path"
                >
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                        save
                    </span>
                    Simpan Jalur
                </button>
            </div>
        </div>
    );
};

export default MapToolbar;
