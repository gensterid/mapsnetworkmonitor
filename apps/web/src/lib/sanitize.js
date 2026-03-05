/**
 * HTML sanitizer using DOMPurify.
 * Strips dangerous tags/attributes while preserving safe formatting HTML.
 * Used for map tooltips, popups, and any user-facing HTML content.
 */
import DOMPurify from 'dompurify';

// Configure DOMPurify to allow only safe tags for tooltips/popups
const PURIFY_CONFIG = {
    ALLOWED_TAGS: [
        'b', 'i', 'em', 'strong', 'span', 'div', 'p', 'br',
        'small', 'sub', 'sup', 'ul', 'ol', 'li',
        'table', 'tr', 'td', 'th', 'thead', 'tbody',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    ],
    ALLOWED_ATTR: ['class', 'style', 'title'],
    ALLOW_DATA_ATTR: false,
};

/**
 * Sanitize HTML string by removing dangerous tags and attributes.
 * @param {string} html - Raw HTML string
 * @returns {string} Sanitized HTML string
 */
export function sanitizeHtml(html) {
    if (!html || typeof html !== 'string') return '';
    return DOMPurify.sanitize(html, PURIFY_CONFIG);
}

export default sanitizeHtml;
