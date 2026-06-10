import { execFile } from 'child_process';
import { promisify } from 'util';
import { logger } from '../logger.js';
import { VPN_SYSTEMD_DISABLED } from './path-config.js';

const execFileAsync = promisify(execFile);

/**
 * Wrapper untuk exec systemctl + ip(8) commands dengan error handling
 * yang predictable.
 *
 * Eksekusi via `execFile` (bukan `exec` shell) untuk hindari injection
 * dari user input — semua arg di-pass sebagai array, tidak di-interpolasi
 * ke shell string.
 *
 * Permission: butuh sudoers rule yang allow Node.js user run `systemctl`
 * + `ip addr show` tanpa password. Sample sudoers ada di docs/VPN-SETUP.md.
 *
 * Untuk dev di non-Linux (Windows/Mac): set env VPN_DISABLE_SYSTEMD=1.
 * Semua function di sini jadi no-op + return mock data.
 */

const SYSTEMCTL = '/bin/systemctl';
const SUDO = '/usr/bin/sudo';
const IP_CMD = '/sbin/ip';

export type SystemctlState = 'active' | 'inactive' | 'failed' | 'activating' | 'deactivating' | 'unknown';

export interface UnitStatus {
    state: SystemctlState;
    activeEnter?: Date;
    mainPid?: number;
    rawOutput?: string;
}

/**
 * Jalankan systemctl <verb> <unit>.
 * Skip kalau VPN_DISABLE_SYSTEMD aktif.
 */
async function runSystemctl(verb: string, unitName?: string): Promise<{ stdout: string; stderr: string }> {
    if (VPN_SYSTEMD_DISABLED) {
        logger.debug({ verb, unitName }, '[vpn-systemd] disabled — skip exec');
        return { stdout: '', stderr: '' };
    }

    const args = [SYSTEMCTL, verb];
    if (unitName) args.push(unitName);

    try {
        const { stdout, stderr } = await execFileAsync(SUDO, args, {
            timeout: 15_000,                    // systemctl shouldn't take >15s
            maxBuffer: 512 * 1024,              // 512KB output max
        });
        return { stdout, stderr };
    } catch (err: any) {
        // systemctl status returns non-zero exit code untuk inactive/failed unit —
        // ini bukan error sebenarnya, kita masih dapet output.
        if (err.stdout || err.stderr) {
            return { stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
        }
        throw new Error(
            `Failed exec systemctl ${verb} ${unitName ?? ''}: ${err.message ?? String(err)}`
        );
    }
}

export async function daemonReload(): Promise<void> {
    await runSystemctl('daemon-reload');
}

export async function startUnit(unitName: string): Promise<void> {
    await runSystemctl('start', unitName);
}

export async function stopUnit(unitName: string): Promise<void> {
    await runSystemctl('stop', unitName);
}

export async function restartUnit(unitName: string): Promise<void> {
    await runSystemctl('restart', unitName);
}

export async function enableUnit(unitName: string): Promise<void> {
    await runSystemctl('enable', unitName);
}

export async function disableUnit(unitName: string): Promise<void> {
    await runSystemctl('disable', unitName);
}

/**
 * Get systemd unit status. Parse output untuk extract state + uptime.
 * Return unknown state kalau systemctl gak available atau parse gagal.
 */
export async function getUnitStatus(unitName: string): Promise<UnitStatus> {
    if (VPN_SYSTEMD_DISABLED) {
        return { state: 'unknown' };
    }

    try {
        // `systemctl show` lebih machine-readable daripada `status`
        const { stdout } = await execFileAsync(
            SUDO,
            [SYSTEMCTL, 'show', unitName, '--no-page', '--property=ActiveState,SubState,MainPID,ActiveEnterTimestamp'],
            { timeout: 10_000 }
        );

        const props = parseShowOutput(stdout);
        const activeState = props.ActiveState ?? 'unknown';
        const subState = props.SubState;

        // Map ActiveState ke SystemctlState
        let state: SystemctlState = 'unknown';
        if (activeState === 'active') {
            state = 'active';
        } else if (activeState === 'inactive') {
            state = 'inactive';
        } else if (activeState === 'failed') {
            state = 'failed';
        } else if (activeState === 'activating') {
            state = 'activating';
        } else if (activeState === 'deactivating') {
            state = 'deactivating';
        }

        // Sub-state precedence: kalau active + sub=running, tetap active.
        // Kalau failed (auto-restart in progress), tampilkan failed.
        if (subState === 'failed') state = 'failed';

        const mainPid = props.MainPID ? parseInt(props.MainPID, 10) : undefined;
        const activeEnter = props.ActiveEnterTimestamp
            ? parseSystemdTimestamp(props.ActiveEnterTimestamp)
            : undefined;

        return {
            state,
            mainPid: mainPid && mainPid > 0 ? mainPid : undefined,
            activeEnter,
            rawOutput: stdout,
        };
    } catch (err: any) {
        logger.warn({ err: err.message, unitName }, '[vpn-systemd] failed get status');
        return { state: 'unknown' };
    }
}

function parseShowOutput(stdout: string): Record<string, string> {
    const props: Record<string, string> = {};
    for (const line of stdout.split('\n')) {
        const eq = line.indexOf('=');
        if (eq > 0) {
            props[line.slice(0, eq)] = line.slice(eq + 1).trim();
        }
    }
    return props;
}

function parseSystemdTimestamp(s: string): Date | undefined {
    if (!s || s === '0' || s === 'n/a') return undefined;
    const d = new Date(s);
    return isNaN(d.getTime()) ? undefined : d;
}

/**
 * Read IP address dari tap/tun interface (mis. "tap0", "tun0").
 * Return null kalau interface tidak ada (VPN belum connect).
 */
export async function getInterfaceIp(ifaceName: string): Promise<string | null> {
    if (VPN_SYSTEMD_DISABLED) return null;

    try {
        const { stdout } = await execFileAsync(IP_CMD, ['-4', 'addr', 'show', ifaceName], {
            timeout: 5_000,
        });
        // Cari "inet x.x.x.x/yy" di output
        const match = stdout.match(/inet (\d+\.\d+\.\d+\.\d+)\/\d+/);
        return match ? match[1] : null;
    } catch {
        // Interface tidak ada → return null (bukan error)
        return null;
    }
}

/**
 * Cari interface yang ada di subnet target (untuk auto-discover
 * tunnel IP saat VPN multiple). Iterate semua interface yang match
 * pattern (tap0, tap1, tun0, tun1, ...).
 */
export async function findTunnelIpInSubnet(
    subnetCidr: string,
    candidateIfaces: string[] = ['tap0', 'tap1', 'tap2', 'tun0', 'tun1', 'tun2']
): Promise<{ iface: string; ip: string } | null> {
    if (VPN_SYSTEMD_DISABLED) return null;

    const [network, prefixStr] = subnetCidr.split('/');
    const prefix = parseInt(prefixStr, 10);
    if (isNaN(prefix)) return null;

    for (const iface of candidateIfaces) {
        const ip = await getInterfaceIp(iface);
        if (ip && isInSubnet(ip, network, prefix)) {
            return { iface, ip };
        }
    }
    return null;
}

function isInSubnet(ip: string, networkIp: string, prefix: number): boolean {
    const ipNum = ipToNumber(ip);
    const netNum = ipToNumber(networkIp);
    if (ipNum === null || netNum === null) return false;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return (ipNum & mask) === (netNum & mask);
}

function ipToNumber(ip: string): number | null {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return null;
    return (parts[0] << 24 | parts[1] << 16 | parts[2] << 8 | parts[3]) >>> 0;
}
