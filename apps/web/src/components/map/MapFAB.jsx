import React, { useState, useCallback } from 'react';
import './map.css';

/**
 * MapFAB - Floating Action Button for adding new devices to the map
 * 
 * Features:
 * - Expandable menu with device type options
 * - Smooth animations
 * - Accessible keyboard navigation
 */
const MapFAB = ({ onAddDevice, disabled = false }) => {
    const [isOpen, setIsOpen] = useState(false);

    const toggleMenu = useCallback(() => {
        if (!disabled) {
            setIsOpen(prev => !prev);
        }
    }, [disabled]);

    const handleAddDevice = useCallback((type) => {
        setIsOpen(false);
        if (onAddDevice) {
            onAddDevice(type);
        }
    }, [onAddDevice]);

    const menuItems = [
        { type: 'router', label: 'Add Router', icon: 'router' },
        { type: 'olt', label: 'Add OLT', icon: 'hub' },
        { type: 'odp', label: 'Add ODP', icon: 'device_hub' },
        { type: 'client', label: 'Add Client', icon: 'person' },
    ];

    return (
        <div className="map-fab">
            {/* Menu Items */}
            <div className={`map-fab__menu ${isOpen ? 'map-fab__menu--open' : ''}`}>
                {menuItems.map((item, index) => (
                    <div
                        key={item.type}
                        className="map-fab__item"
                        style={{ transitionDelay: `${index * 50}ms` }}
                    >
                        <span className="map-fab__item-label">{item.label}</span>
                        <button
                            className={`map-fab__item-btn map-fab__item-btn--${item.type}`}
                            onClick={() => handleAddDevice(item.type)}
                            title={item.label}
                            aria-label={item.label}
                        >
                            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                                {item.icon}
                            </span>
                        </button>
                    </div>
                ))}
            </div>

            {/* Main FAB Button */}
            <button
                className={`map-fab__main ${isOpen ? 'map-fab__main--open' : ''}`}
                onClick={toggleMenu}
                disabled={disabled}
                title={isOpen ? 'Close menu' : 'Add device'}
                aria-label={isOpen ? 'Close menu' : 'Add device'}
                aria-expanded={isOpen}
            >
                <span className="material-symbols-outlined" style={{ fontSize: 28 }}>
                    add
                </span>
            </button>
        </div>
    );
};

export default MapFAB;
