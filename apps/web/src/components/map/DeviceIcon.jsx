import L from 'leaflet';

/**
 * Device Icon Factory
 * Creates custom Leaflet icons for different device types with status indicators.
 * 
 * Performance optimizations:
 * - Uses CSS classes for styling instead of inline styles
 * - Minimal DOM structure
 * - Icons are cached internally by Leaflet
 */

// Device type configurations
const deviceConfig = {
    router: {
        icon: 'router',
        colorClass: 'device-icon--router',
    },
    olt: {
        icon: 'hub',
        colorClass: 'device-icon--olt',
    },
    odp: {
        icon: 'device_hub',
        colorClass: 'device-icon--odp',
    },
    client: {
        icon: 'person',
        colorClass: 'device-icon--client',
    },
    netwatch: {
        icon: 'wifi',
        colorClass: 'device-icon--client',
    },
    onu: {
        icon: 'settings_input_antenna',
        colorClass: 'device-icon--client',
    },
    pppoe: {
        icon: 'account_circle',
        colorClass: 'device-icon--pppoe',
    },
};

/**
 * Create a device icon with the given type and status
 * @param {Object} options
 * @param {string} options.type - Device type: 'router', 'olt', 'odp', 'client', 'netwatch'
 * @param {string} options.status - Device status: 'online'|'up', 'offline'|'down', 'unknown'
 * @param {string} options.name - Device name for label
 * @param {boolean} options.showLabel - Whether to show the label
 * @param {boolean} options.small - Use smaller icon size
 */
export const createDeviceIcon = ({
    type = 'router',
    status = 'unknown',
    name = '',
    showLabel = true,
    small = false,
    latency = null,
    packetLoss = null,
}) => {
    const config = deviceConfig[type] || deviceConfig.router;

    // Determine if there's a performance issue (high latency or packet loss)
    const hasPerformanceIssue = (latency !== null && latency > 100) || (packetLoss !== null && packetLoss > 0);

    // Normalize status - prioritize 'down' first, then specific device types, then warning
    let normalizedStatus;
    if (status === 'down' || status === 'offline' || status === 'lost' || status === 'power_down' || status === 'dying_gasp' || status === 'disable' || status === 'disconnected' || status === 'unknown' || !status) {
        normalizedStatus = 'offline';
    } else if (type === 'odp') {
        normalizedStatus = 'odp'; // Always Orange if UP
    } else if (type === 'pppoe') {
        normalizedStatus = 'pppoe'; // Always Purple if UP
    } else if (hasPerformanceIssue) {
        normalizedStatus = 'warning'; // Yellow only for other devices with high latency
    } else {
        normalizedStatus = 'online'; // Green
    }

    const sizeClass = small ? 'device-icon--small' : '';
    const statusClass = `device-icon--${normalizedStatus}`;
    const iconSize = small ? 32 : 44;
    const iconFontSize = small ? 18 : 28; // Smaller icon font to fit in halo

    // Create HTML with Halo + Glow structure
    const html = `
        <div class="device-icon ${config.colorClass} ${statusClass} ${sizeClass}">
            <div class="device-icon__badge">
                <span class="material-symbols-outlined" style="font-size: ${iconFontSize}px; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">
                    ${config.icon}
                </span>
            </div>
            ${showLabel && name ? `<span class="device-icon__label">${escapeHtml(name)}</span>` : ''}
        </div>
    `;

    // Simplified animation logic to prevent flickering
    const animationClass = ''; // Disabled animations: normalizedStatus === 'offline' ? 'marker-pulse-danger' : ...

    return L.divIcon({
        className: `custom-marker-icon ${animationClass}`,
        html,
        iconSize: [small ? 32 : 64, small ? 32 : 64],
        iconAnchor: [small ? 16 : 32, small ? 16 : 24],
        popupAnchor: [0, small ? -16 : -24],
    });
};

/**
 * Create a router-specific icon (backwards compatible)
 */
export const createRouterIcon = (status) => {
    return createDeviceIcon({
        type: 'router',
        status,
        showLabel: false,
    });
};

/**
 * Create a netwatch/client icon (backwards compatible)
 */
export const createNetwatchIcon = (status) => {
    return createDeviceIcon({
        type: 'netwatch',
        status,
        showLabel: false,
        small: true,
    });
};

/**
 * Create a path edit handle icon
 */
export const createEditHandleIcon = (isNew = false) => {
    return L.divIcon({
        className: 'custom-marker-icon path-handle-container',
        html: `<div class="path-edit-handle ${isNew ? 'path-edit-handle--new' : ''}"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
    });
};

// Helper to escape HTML
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

export default {
    createDeviceIcon,
    createRouterIcon,
    createNetwatchIcon,
    createEditHandleIcon,
};
