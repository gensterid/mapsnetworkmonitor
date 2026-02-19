/**
 * Timezone utility functions
 * Ensures consistent date/time handling across the application
 * 
 * NOTE: The backend stores dates as local time but returns them with 'Z' suffix.
 * This utility compensates for that by treating the dates as local time.
 */

/**
 * Standard formats for consistent UI display
 */
export const DATE_FORMATS = {
    FULL: {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    },
    SHORT: {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    },
    DATE_ONLY: {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    },
    TIME_ONLY: {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }
};

/**
 * Parse a date from the API.
 * The API returns true UTC dates like "2025-12-30T21:40:50.336Z".
 */
function parseApiDate(dateInput) {
    if (!dateInput) return null;
    if (dateInput instanceof Date) return dateInput;

    const dateStr = String(dateInput);

    // If it's a string ending in Z, the browser's new Date() correctly treats it as UTC.
    // We no longer need the hardcoded -7 shift as the backend is sending true UTC.
    const date = new Date(dateInput);
    return isNaN(date.getTime()) ? null : date;
}

/**
 * Format a date to a specific timezone
 * @param dateInput - Date string or Date object
 * @param timezone - Timezone string (e.g., 'Asia/Jakarta', 'Asia/Makassar')
 * @param options - Intl.DateTimeFormat options
 */
export function formatDateWithTimezone(dateInput, timezone = null, options = {}) {
    const date = parseApiDate(dateInput);
    if (!date) return '-';

    // Priority: 
    // 1. Explicit timezone passed to function
    // 2. Browser's detected timezone
    // 3. Absolute fallback: Asia/Jakarta
    let validTimezone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta';

    try {
        Intl.DateTimeFormat(undefined, { timeZone: validTimezone });
    } catch (e) {
        console.warn(`Invalid timezone: ${validTimezone}, falling back to Asia/Jakarta`);
        validTimezone = 'Asia/Jakarta';
    }


    const defaultOptions = {
        ...DATE_FORMATS.FULL,
        timeZone: validTimezone,
        ...options
    };

    return date.toLocaleString('id-ID', defaultOptions);
}

/**
 * Higher-level formatting functions
 */

export function formatFullDateTime(dateInput, timezone = 'Asia/Jakarta') {
    return formatDateWithTimezone(dateInput, timezone, DATE_FORMATS.FULL);
}

export function formatShortDateTime(dateInput, timezone = 'Asia/Jakarta') {
    return formatDateWithTimezone(dateInput, timezone, DATE_FORMATS.SHORT);
}

export function formatDateOnly(dateInput, timezone = 'Asia/Jakarta') {
    return formatDateWithTimezone(dateInput, timezone, DATE_FORMATS.DATE_ONLY);
}

export function formatTimeOnly(dateInput, timezone = 'Asia/Jakarta') {
    return formatDateWithTimezone(dateInput, timezone, DATE_FORMATS.TIME_ONLY);
}

/**
 * Format a date to show relative time (e.g., "5m yang lalu")
 */
export function formatRelativeTime(dateInput, timezone = 'Asia/Jakarta') {
    const date = parseApiDate(dateInput);
    if (!date) return 'Unknown';

    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // Handle future dates (shouldn't happen but just in case)
    if (diff < 0) return 'Baru saja';

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (seconds < 60) return 'Baru saja';
    if (minutes < 60) return `${minutes}m yang lalu`;
    if (hours < 24) return `${hours}j yang lalu`;
    if (days < 7) return `${days}h yang lalu`;

    return formatShortDateTime(dateInput, timezone);
}

