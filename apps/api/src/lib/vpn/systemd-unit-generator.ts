import { vpnPaths } from './path-config.js';

/**
 * Generate systemd unit file content untuk OpenVPN client.
 *
 * Pattern sama dengan unit yang dibikin manual di Phase 1 POC,
 * kecuali path-nya parametric (per-VPN ID).
 *
 * Restart=on-failure + RestartSec=10 → auto-reconnect kalau drop.
 */

export interface UnitGeneratorOptions {
    id: string;
    name: string;
}

export function generateSystemdUnit({ id, name }: UnitGeneratorOptions): string {
    const configPath = vpnPaths.configPath(id);
    const statusFile = `/run/openvpn-vpn-${id}.status`;

    return [
        `[Unit]`,
        `Description=OpenVPN Client — ${escapeForUnit(name)} (managed by app, id=${id})`,
        `After=network-online.target`,
        `Wants=network-online.target`,
        ``,
        `[Service]`,
        `Type=notify`,
        `PrivateTmp=true`,
        `ExecStart=/usr/sbin/openvpn --status ${statusFile} 10 --status-version 3 --suppress-timestamps --config ${configPath}`,
        `WorkingDirectory=/etc/openvpn`,
        `Restart=on-failure`,
        `RestartSec=10`,
        `LimitNPROC=10`,
        `DeviceAllow=/dev/null rw`,
        `DeviceAllow=/dev/net/tun rw`,
        `ProtectSystem=true`,
        `ProtectHome=true`,
        `KillMode=process`,
        ``,
        `[Install]`,
        `WantedBy=multi-user.target`,
        ``,
    ].join('\n');
}

/**
 * Escape characters yang special di systemd unit description.
 * Hindari newline atau character yang bikin parse error.
 */
function escapeForUnit(text: string): string {
    return text.replace(/[\r\n]/g, ' ').slice(0, 200);
}

export function getUnitName(id: string): string {
    return vpnPaths.unitName(id);
}
