import { join } from 'path';

/**
 * Centralized file system paths untuk VPN connection manager.
 *
 * Default = Linux production layout:
 *   /etc/openvpn/client/        ← OpenVPN config files (.conf)
 *   /etc/openvpn/credentials/   ← username + password files (mode 600)
 *   /etc/systemd/system/        ← systemd unit files
 *   /var/log/openvpn/           ← log files (per-VPN)
 *
 * Override via env `VPN_BASE_DIR`:
 *   - Untuk dev/test: VPN_BASE_DIR=/tmp/vpn-test
 *   - Untuk container dengan layout berbeda: bisa di-set sesuai mount point
 *
 * Path generation:
 *   - configPath(id)   → <configDir>/vpn-<id>.conf
 *   - credsPath(id)    → <credsDir>/vpn-<id>.txt
 *   - unitName(id)     → openvpn-vpn-<id>.service
 *   - unitPath(id)     → <systemdDir>/<unitName>
 *   - logPath(id)      → <logDir>/vpn-<id>.log
 */

const BASE_DIR_ENV = process.env.VPN_BASE_DIR;

export const vpnPaths = {
    configDir: BASE_DIR_ENV
        ? join(BASE_DIR_ENV, 'openvpn/client')
        : '/etc/openvpn/client',
    credsDir: BASE_DIR_ENV
        ? join(BASE_DIR_ENV, 'openvpn/credentials')
        : '/etc/openvpn/credentials',
    systemdDir: BASE_DIR_ENV
        ? join(BASE_DIR_ENV, 'systemd/system')
        : '/etc/systemd/system',
    logDir: BASE_DIR_ENV
        ? join(BASE_DIR_ENV, 'log/openvpn')
        : '/var/log/openvpn',

    configPath(id: string): string {
        return join(this.configDir, `vpn-${id}.conf`);
    },

    credsPath(id: string): string {
        return join(this.credsDir, `vpn-${id}.txt`);
    },

    unitName(id: string): string {
        return `openvpn-vpn-${id}.service`;
    },

    unitPath(id: string): string {
        return join(this.systemdDir, this.unitName(id));
    },

    logPath(id: string): string {
        return join(this.logDir, `vpn-${id}.log`);
    },
};

/**
 * Disable systemd integration (untuk dev di Windows/Mac, atau test mode).
 * Saat aktif, connection-manager tetap update DB status tapi skip exec
 * systemctl. Berguna untuk run API di non-Linux tanpa crash.
 */
export const VPN_SYSTEMD_DISABLED = process.env.VPN_DISABLE_SYSTEMD === '1';
