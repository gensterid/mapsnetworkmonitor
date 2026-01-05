/**
 * Timezone utility functions
 * Ensures consistent date/time handling across the application
 * 
 * NOTE: The backend stores dates as local time but returns them with 'Z' suffix.
 * This utility compensates for that by treating the dates as local time.
 */

/**
 * Parse a date from the API, treating it as local time (not UTC)
 * The API returns dates like "2025-12-30T21:40:50.336Z" but the value is actually local time
 */
function parseApiDate(dateInput) {
    if (!dateInput) return null;

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
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: timezone,
        ...options
    };

    return date.toLocaleString('id-ID', defaultOptions);
}

/**
 * Format a date to show relative time (e.g., "5m yang lalu")
 * @param dateInput - Date string from API or Date object
 * @param timezone - Timezone string (for fallback display)
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

    // For older dates, show the full date
    return formatDateWithTimezone(dateInput, timezone, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: undefined,
        minute: undefined,
        second: undefined
    });
}

/**
 * Format date only (no time)
 */
export function formatDateOnly(dateInput, timezone = 'Asia/Jakarta') {
    return formatDateWithTimezone(dateInput, timezone, {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        weekday: 'long',
        hour: undefined,
        minute: undefined,
        second: undefined
    });
}

/**
 * Format time only (no date)
 */
export function formatTimeOnly(dateInput, timezone = 'Asia/Jakarta') {
    return formatDateWithTimezone(dateInput, timezone, {
        day: undefined,
        month: undefined,
        year: undefined,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}
