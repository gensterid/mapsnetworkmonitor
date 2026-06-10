/**
 * Whitelist validator untuk extra_config field di vpn_servers.
 *
 * Operator boleh tambah OpenVPN directive custom via UI, tapi kita
 * batasi hanya yang aman. Tujuan: hindari directive yang bisa execute
 * arbitrary script (up/down/client-connect) atau aktifkan plugin
 * berbahaya.
 *
 * Validation jalan saat POST/PATCH endpoint — reject simpan kalau
 * ada directive non-whitelist atau yang explicit forbidden.
 */

const ALLOWED_DIRECTIVES = new Set([
    // TLS tuning
    'tls-version-min', 'tls-version-max', 'tls-cipher', 'tls-ciphersuites',
    'remote-cert-tls', 'verify-x509-name', 'ns-cert-type',

    // Cipher / auth
    'cipher', 'auth', 'data-ciphers', 'data-ciphers-fallback',
    'auth-nocache', 'auth-retry',

    // MTU / fragmentation
    'tun-mtu', 'mssfix', 'fragment', 'link-mtu',

    // Connection behavior
    'keepalive', 'ping', 'ping-restart', 'ping-timer-rem', 'ping-exit',
    'connect-retry', 'connect-retry-max',
    'resolv-retry', 'inactive', 'persist-key', 'persist-tun',
    'nobind',

    // Routing
    'route-nopull', 'route', 'route-delay', 'route-metric',
    'pull-filter',

    // Logging / diagnostics
    'verb', 'mute', 'mute-replay-warnings',

    // Compression (allowed but discouraged for security)
    'compress', 'comp-lzo',

    // TLS auth/crypt key files (inline block ditangani terpisah, ini opsi flag-nya)
    'key-direction',

    // Misc safe options
    'remote-random', 'explicit-exit-notify',
]);

const FORBIDDEN_DIRECTIVES = new Set([
    // Script execution — RCE risk
    'up', 'down', 'route-up', 'route-pre-down',
    'client-connect', 'client-disconnect', 'auth-user-pass-verify',
    'tls-verify', 'ipchange',
    'script-security',

    // Plugin loading — bisa muat library asing
    'plugin',

    // Cert export — bisa bocorin private key
    'tls-export-cert',

    // File system access via management interface
    'management', 'management-client', 'management-hold',
    'management-query-passwords', 'management-external-key',
    'management-external-cert',

    // Daemonize / detach — kita pakai systemd
    'daemon', 'syslog',

    // Override credentials path (sudah di-set app)
    'auth-user-pass', 'askpass',

    // Inline cert blocks — kita handle terpisah via ca_cert_pem field
    'ca', 'cert', 'key', 'tls-auth', 'tls-crypt', 'tls-crypt-v2',

    // Remote — sudah di-set app dari host/port field
    'remote',
]);

export interface ValidationResult {
    ok: boolean;
    errors: string[];
}

/**
 * Validate user-supplied extra_config text.
 *
 * Rules:
 * - Empty / whitespace-only → OK (field optional)
 * - Comment lines (start with #) → ignored
 * - Each non-comment line must start with a directive in ALLOWED_DIRECTIVES
 * - Directives in FORBIDDEN_DIRECTIVES are rejected with a security-explicit error
 * - Unknown directives are rejected with "not allowed" error
 *
 * @returns {ok: true} if valid, {ok: false, errors} if invalid
 */
export function validateExtraConfig(text: string | null | undefined): ValidationResult {
    if (!text || !text.trim()) return { ok: true, errors: [] };

    const errors: string[] = [];
    const lines = text.split('\n');

    for (let i = 0; i < lines.length; i++) {
        const raw = lines[i];
        const line = raw.trim();
        if (!line || line.startsWith('#') || line.startsWith(';')) continue;

        // Directive = first whitespace-separated token
        const directive = line.split(/\s+/)[0];

        if (FORBIDDEN_DIRECTIVES.has(directive)) {
            errors.push(
                `Line ${i + 1}: directive "${directive}" dilarang ` +
                `(security risk atau di-handle oleh field lain)`
            );
        } else if (!ALLOWED_DIRECTIVES.has(directive)) {
            errors.push(
                `Line ${i + 1}: directive "${directive}" tidak dikenal. ` +
                `Lihat docs untuk daftar yang diizinkan.`
            );
        }
    }

    return { ok: errors.length === 0, errors };
}
