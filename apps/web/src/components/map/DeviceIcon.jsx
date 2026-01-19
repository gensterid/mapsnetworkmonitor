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
}) => {
    const config = deviceConfig[type] || deviceConfig.router;

    // Normalize status
    const normalizedStatus = (status === 'up' || status === 'online') ? 'online' :
        (status === 'down' || status === 'offline' || status === 'disable' || status === 'unknown' || !status) ? 'offline' :
            'unknown';

    const sizeClass = small ? 'device-icon--small' : '';
    const statusClass = `device-icon--${normalizedStatus}`;
    const iconSize = small ? 24 : 36;
    const iconFontSize = small ? 14 : 20;

    // Create minimal HTML for performance
    const html = `
        <div class="device-icon ${config.colorClass} ${statusClass} ${sizeClass}">
            <div class="device-icon__badge">
                <span class="material-symbols-outlined" style="font-size: ${iconFontSize}px; color: white;">
                    ${config.icon}
                </span>
            </div>
            ${showLabel && name ? `<span class="device-icon__label">${escapeHtml(name)}</span>` : ''}
        </div>
    `;

    return L.divIcon({
        className: 'custom-marker-icon',
        html,
        iconSize: [small ? 24 : 60, small ? 24 : 60],
        iconAnchor: [small ? 12 : 30, small ? 12 : 20],
        popupAnchor: [0, small ? -12 : -20],
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
