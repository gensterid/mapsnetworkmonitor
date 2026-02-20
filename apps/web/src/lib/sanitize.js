/**
 * Lightweight HTML sanitizer for map tooltips and popups.
 * Strips dangerous tags (script, iframe, etc.) while preserving safe formatting HTML.
 * 
 * This is intentionally simple — for map tooltip/popup content only.
 * For a full application, use a library like DOMPurify.
 */

// Tags that are allowed in tooltips/popups
const ALLOWED_TAGS = new Set([
    'b', 'i', 'em', 'strong', 'span', 'div', 'p', 'br',
    'small', 'sub', 'sup', 'ul', 'ol', 'li',
    'table', 'tr', 'td', 'th', 'thead', 'tbody',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
]);

// Attributes that are allowed (only safe ones)
const ALLOWED_ATTRS = new Set([
    'class', 'style', 'title',
]);

/**
 * Sanitize HTML string by removing dangerous tags and attributes.
 * @param {string} html - Raw HTML string
 * @returns {string} Sanitized HTML string
 */
export function sanitizeHtml(html) {
    if (!html || typeof html !== 'string') return '';

    // Remove script tags and their content
    let clean = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Remove event handler attributes (onclick, onerror, onload, etc.)
    clean = clean.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');

    // Remove javascript: URLs
    clean = clean.replace(/href\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi, '');

    // Remove dangerous tags (iframe, object, embed, form, input, etc.)
    const DANGEROUS_TAGS = ['iframe', 'object', 'embed', 'form', 'input', 'textarea', 'select', 'button', 'link', 'meta', 'base', 'applet'];
    for (const tag of DANGEROUS_TAGS) {
        const openRegex = new RegExp(`<${tag}\\b[^>]*>`, 'gi');
        const closeRegex = new RegExp(`</${tag}>`, 'gi');
        clean = clean.replace(openRegex, '');
        clean = clean.replace(closeRegex, '');
    }

    return clean;
}

export default sanitizeHtml;
