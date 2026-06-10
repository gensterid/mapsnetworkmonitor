import type { VpnServer } from '../../db/schema/index.js';
import { vpnPaths } from './path-config.js';
import { validateExtraConfig } from './extra-config-whitelist.js';

/**
 * Generate OpenVPN client config + credentials file content
 * dari row vpn_servers di DB.
 *
 * Format hasil match dengan config Phase 1 POC yang sudah terbukti
 * jalan di CT206 (Linux openvpn 2.5.x + MikroTik OVPN ethernet TAP).
 *
 * IMPORTANT: caller wajib decrypt password sebelum panggil ini
 * (passwordEncrypted dari DB, hasil decrypt jadi plaintext yang
 * di-paste ke creds file).
 */

export interface GeneratedConfig {
    /** Content untuk /etc/openvpn/client/vpn-<id>.conf */
    ovpnContent: string;
    /** Content untuk /etc/openvpn/credentials/vpn-<id>.txt (username\npassword\n) */
    credsContent: string;
}

/**
 * Build .ovpn client config + credentials file content.
 * Type system memastikan caller punya password plain (bukan encrypted).
 */
export function generateOpenVpnConfig(
    row: VpnServer,
    passwordPlain: string
): GeneratedConfig {
    const credsPath = vpnPaths.credsPath(row.id);
    const logPath = vpnPaths.logPath(row.id);

    const lines: string[] = [
        `# OpenVPN client config — managed by app, do NOT edit manually`,
        `# VPN: ${row.name} (${row.id})`,
        `# Generated: ${new Date().toISOString()}`,
        ``,
        `client`,
        `dev ${row.mode}`,                              // 'tap' | 'tun'
        `proto ${row.proto}`,                           // 'tcp' | 'udp'
        `remote ${row.host} ${row.port}`,
        ``,
        `# Credentials di file terpisah (mode 600)`,
        `auth-user-pass ${credsPath}`,
        ``,
        `# Crypto match dengan server`,
        `cipher ${row.cipher}`,
        `auth ${row.auth}`,
        ``,
        `# OpenVPN 2.5 + OpenSSL 3.0 default disable cipher lama —`,
        `# allow eksplisit untuk MikroTik OVPN server`,
        `data-ciphers ${row.cipher}`,
        `data-ciphers-fallback ${row.cipher}`,
        `tls-cipher "DEFAULT:@SECLEVEL=0"`,
        ``,
    ];

    // TLS server cert verification — matching MikroTik client "Verify Server Certificate"
    if (row.verifyServerCert) {
        lines.push(`remote-cert-tls server`);
    } else {
        // Skip server cert verify — masih butuh CA untuk handshake
        // (OpenVPN 2.5 enforce CA file kecuali pakai static key mode)
        lines.push(`# Server cert verification dilewati (verify_server_cert=false)`);
    }

    lines.push(
        ``,
        `# Don't pull default route (route VPN hanya untuk subnet client)`,
        `route-nopull`,
        ``,
        `# Tambah route ke subnet VPN`,
        `route ${cidrToNetmask(row.clientSubnet)}`,
        ``,
        `# Connection retry + keepalive`,
        `connect-retry 2 30`,
        `connect-retry-max 0`,
        `keepalive 10 60`,
        `ping-timer-rem`,
        `persist-key`,
        `persist-tun`,
        `nobind`,
        ``,
        `# MTU tuning untuk MikroTik OVPN TCP`,
        `tun-mtu 1400`,
        `mssfix 1360`,
        ``,
        `verb 3`,
        ``,
        `# Log file`,
        `log-append ${logPath}`,
        ``,
    );

    // Extra config user-supplied (validated again here untuk defense-in-depth)
    if (row.extraConfig && row.extraConfig.trim()) {
        const check = validateExtraConfig(row.extraConfig);
        if (!check.ok) {
            throw new Error(
                `Extra config invalid: ${check.errors.join('; ')}. ` +
                `Tolak generate config supaya tidak inject directive berbahaya.`
            );
        }
        lines.push(`# === Extra config (user-supplied, whitelist-validated) ===`);
        lines.push(row.extraConfig.trim());
        lines.push(``);
    }

    // CA cert inline (kalau ada). Wajib untuk MikroTik OVPN server yang
    // pakai self-signed cert — extracted dari /certificate export.
    if (row.caCertPem && row.caCertPem.trim()) {
        lines.push(`<ca>`);
        lines.push(row.caCertPem.trim());
        lines.push(`</ca>`);
        lines.push(``);
    } else {
        lines.push(
            `# WARNING: No CA cert configured. OpenVPN 2.5+ requires --ca`,
            `# unless using static key mode. Add CA cert via UI (caCertPem).`,
            ``,
        );
    }

    const ovpnContent = lines.join('\n');

    // Credentials file: username\npassword\n (mode 600 after write)
    const credsContent = `${row.username}\n${passwordPlain}\n`;

    return { ovpnContent, credsContent };
}

/**
 * Convert CIDR "172.18.19.0/24" → "172.18.19.0 255.255.255.0"
 * (OpenVPN `route` directive format).
 */
function cidrToNetmask(cidr: string): string {
    const [network, prefixStr] = cidr.split('/');
    const prefix = parseInt(prefixStr, 10);
    if (isNaN(prefix) || prefix < 0 || prefix > 32) {
        throw new Error(`Invalid CIDR: ${cidr}`);
    }

    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const netmask = [
        (mask >>> 24) & 0xff,
        (mask >>> 16) & 0xff,
        (mask >>> 8) & 0xff,
        mask & 0xff,
    ].join('.');

    return `${network} ${netmask}`;
}
