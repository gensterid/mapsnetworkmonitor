/**
 * Escape karakter khusus HTML untuk Telegram `parse_mode: HTML` (dan teks HTML
 * umum). Dipakai bersama oleh jalur notifikasi alert dan laporan provisioning
 * agar aturan escape konsisten di satu tempat.
 */
export function escapeHtml(text: string): string {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
