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
 * Parse a date from the API, treating it as local time (not UTC)
 * The API returns dates like "2025-12-30T21:40:50.336Z" but the value is actually local time
 * (specifically Asia/Jakarta time, but marked as Z)
 */
function parseApiDate(dateInput) {
    if (!dateInput) return null;
    if (dateInput instanceof Date) return dateInput;

    const dateStr = String(dateInput);

    // If it's a string ending in Z, it's likely our backend quirk (Local-as-UTC)
    if (dateStr.endsWith('Z') && dateStr.includes('T')) {
        // We parse it as a naive string (strip Z) to let the browser treat it as local-ish
        // BUT to be offset-safe and dynamic, we want to convert it to a real UTC date
        // that represents the same absolute time as intended.

        // Assumption: Backend meant Asia/Jakarta (+7)
        const naiveDate = new Date(dateStr.slice(0, -1));
        if (!isNaN(naiveDate.getTime())) {
            // Since new Date(naive) creates a date in BROWSER local time,
            // and we eventually use toLocaleString with a target timezone,
            // this actually works correctly for getting the same wall-clock components 
            // if we use it carefully.

            // However, a more robust way is to treat components as UTC components
            // then subtract the 7 hour offset.
            const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
            if (match) {
                const [, y, m, d, h, min, s] = match;
                // Create UTC date with these components (21:40 UTC)
                const dObj = new Date(Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d), parseInt(h), parseInt(min), parseInt(s)));
                // Subtract 7 hours to get the real UTC time (14:40 UTC)
                // This makes it a true absolute timestamp.
                dObj.setHours(dObj.getHours() - 7);
                return dObj;
            }
        }
    }

    const date = new Date(dateInput);
    return isNaN(date.getTime()) ? null : date;
}

/**
 * Format a date from the API to the configured timezone
 * @param dateInput - Date string from API or Date object
 * @param timezone - Timezone string (e.g., 'Asia/Jakarta', 'Asia/Makassar')
 * @param options - Intl.DateTimeFormat options
 */
export function formatDateWithTimezone(dateInput, timezone = 'Asia/Jakarta', options = {}) {
    const date = parseApiDate(dateInput);
    if (!date) return '-';

    const defaultOptions = {
        ...DATE_FORMATS.FULL,
        timeZone: timezone,
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

