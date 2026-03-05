import { logger } from './logger.js';

export class MockRouterOS {
    connected = true;
    host: string;

    constructor(config: any) {
        this.host = config.host;
        logger.info({ host: this.host }, '🛠️ Entering DUMMY MODE for MikroTik connection');
    }

    async connect() {
        return this;
    }

    async write(command: string | string[]) {
        const cmd = Array.isArray(command) ? command[0] : command;
        logger.debug({ host: this.host, cmd }, '🔍 Dummy API Request');

        if (cmd === '/system/identity/print') {
            return [{ name: `Dummy-Router-${this.host.replace(/\./g, '-')}` }];
        }

        if (cmd === '/system/resource/print') {
            return [{
                version: '7.15',
                'cpu-load': Math.floor(Math.random() * 20),
                'total-memory': 1024 * 1024 * 1024,
                'free-memory': 512 * 1024 * 1024,
                'total-hdd-space': 2048 * 1024 * 1024,
                'free-hdd-space': 1024 * 1024 * 1024,
                'board-name': 'hEX',
                'architecture-name': 'mmips'
            }];
        }

        if (cmd === '/interface/print') {
            return [
                { name: 'ether1', type: 'ether', running: 'true', disabled: 'false', 'mac-address': '01:02:03:04:05:06', 'tx-byte': 1000, 'rx-byte': 2000 },
                { name: 'ether2', type: 'ether', running: 'false', disabled: 'false', 'mac-address': '01:02:03:04:05:07', 'tx-byte': 0, 'rx-byte': 0 },
                { name: 'pppoe-out1', type: 'pppoe-out', running: 'true', disabled: 'false', 'mac-address': '00:00:00:00:00:00', 'tx-byte': 500, 'rx-byte': 1500 }
            ];
        }

        if (cmd === '/ppp/active/print') {
            return [
                { name: 'user-jakarta-1', address: '10.10.1.5', service: 'pppoe', uptime: '1d 05:20:10', 'caller-id': 'AA:BB:CC:DD:EE:01', 'session-id': '0x81000001' },
                { name: 'user-medan-2', address: '10.10.1.22', service: 'pppoe', uptime: '02:15:45', 'caller-id': 'AA:BB:CC:DD:EE:02', 'session-id': '0x81000002' },
                { name: 'user-surabaya-3', address: '10.10.1.45', service: 'pppoe', uptime: '12:00:00', 'caller-id': 'AA:BB:CC:DD:EE:03', 'session-id': '0x81000003' },
                { name: 'user-bandung-4', address: '10.10.1.66', service: 'pppoe', uptime: '00:05:12', 'caller-id': 'AA:BB:CC:DD:EE:04', 'session-id': '0x81000004' },
                { name: 'user-yogya-5', address: '10.10.1.77', service: 'pppoe', uptime: '03:45:22', 'caller-id': 'AA:BB:CC:DD:EE:05', 'session-id': '0x81000005' },
                { name: 'user-bali-6', address: '10.10.1.88', service: 'pppoe', uptime: '15:20:00', 'caller-id': 'AA:BB:CC:DD:EE:06', 'session-id': '0x81000006' },
                { name: 'user-makassar-7', address: '10.10.1.99', service: 'pppoe', uptime: '08:12:34', 'caller-id': 'AA:BB:CC:DD:EE:07', 'session-id': '0x81000007' },
                { name: 'user-papua-8', address: '10.10.1.10', service: 'pppoe', uptime: '22:30:15', 'caller-id': 'AA:BB:CC:DD:EE:08', 'session-id': '0x81000008' }
            ];
        }

        if (cmd === '/tool/netwatch/print') {
            return [
                { host: '8.8.8.8', status: 'up', since: 'mar/01/2026 10:00:00', comment: 'Google DNS', disabled: 'false' },
                { host: '1.1.1.1', status: 'up', since: 'mar/01/2026 10:00:00', comment: 'Cloudflare', disabled: 'false' },
                { host: '10.0.0.50', status: 'down', since: 'mar/05/2026 09:00:00', comment: 'Office Printer', disabled: 'false' },
                { host: '192.168.1.100', status: 'up', since: 'mar/05/2026 12:00:00', comment: 'CCTV Entrance', disabled: 'true' },
                { host: '10.0.0.10', status: 'up', since: 'mar/05/2026 08:00:00', comment: 'OLT-CDATA-MOCK', disabled: 'false' },
                { host: '10.0.0.20', status: 'up', since: 'mar/05/2026 08:00:00', comment: 'OLT-HSGQ-MOCK', disabled: 'false' },
                { host: '10.0.0.30', status: 'up', since: 'mar/05/2026 08:00:00', comment: 'GENIEACS-MOCK', disabled: 'false' }
            ];
        }

        if (cmd === '/ip/neighbor/print' || cmd === '/tool/romon/neighbor/print') {
            return [
                { interface: 'ether1', address: '10.0.0.10', 'mac-address': 'AA:BB:CC:00:00:10', identity: 'OLT-CDATA-MOCK', platform: 'Olt' },
                { interface: 'ether1', address: '10.0.0.20', 'mac-address': 'AA:BB:CC:00:00:20', identity: 'OLT-HSGQ-MOCK', platform: 'Olt' },
                { interface: 'ether1', address: '10.0.0.30', 'mac-address': 'AA:BB:CC:00:00:30', identity: 'GENIEACS-MOCK', platform: 'Linux' }
            ];
        }

        if (cmd && Array.isArray(cmd) && cmd[0] === '/interface/monitor-traffic') {
            const result: any[] = [];
            const names = cmd.find(p => p.startsWith('=interface='))?.replace('=interface=', '').split(',') || [];
            names.forEach((name: string) => {
                result.push({
                    name,
                    'rx-bits-per-second': Math.floor(Math.random() * 5000000),
                    'tx-bits-per-second': Math.floor(Math.random() * 2000000)
                });
            });
            return result;
        }

        if (cmd === '/system/clock/print') {
            const now = new Date();
            return [{
                time: now.toTimeString().split(' ')[0],
                date: now.toDateString().toLowerCase().replace(/ /g, '/'),
                'time-zone-name': 'UTC',
                'gmt-offset': '+00:00'
            }];
        }

        if (cmd && Array.isArray(cmd) && cmd[0] === '/tool/ping') {
            return [{
                host: '8.8.8.8',
                avg: '15ms',
                'packet-loss': 0
            }];
        }

        if (cmd === '/queues/simple/print') {
            return [
                { name: 'user-jakarta-1', 'rx-rate': '1048576', 'tx-rate': '2097152' },
                { name: 'user-medan-2', 'rx-rate': '524288', 'tx-rate': '1048576' }
            ];
        }

        return [];
    }

    async close() {
        this.connected = false;
        logger.info({ host: this.host }, '🔌 Closing Dummy connection');
    }

    // Pass-through for EventEmitter behavior if needed
    on(event: string, listener: any) {
        return this;
    }
}
