import { BaseOltDriver, OnuInfo } from './olt-driver.interface.js';
import crypto from 'crypto';

export class CDataDriver extends BaseOltDriver {
    constructor(config: any) {
        super(config);
    }

    async connect(): Promise<void> {
        if (this.config.protocol === 'http' || this.config.protocol === 'https' || this.config.port === 80 || this.config.port === 443) {
            this.connected = true;
            return;
        }

        throw new Error('C-Data Telnet/SSH access is disabled. Please use HTTP/HTTPS.');
    }

    async disconnect(): Promise<void> {
        this.connected = false;
    }

    async testConnection(): Promise<boolean> {
        if (this.config.protocol === 'http' || this.config.protocol === 'https' || this.config.port === 80 || this.config.port === 443) {
            const protocol = this.config.protocol || (this.config.port === 443 ? 'https' : 'http');
            const baseUrl = `${protocol}://${this.config.host}:${this.config.port}`;
            const username = this.config.username || 'admin';
            const password = this.config.password || '';
            const auth = Buffer.from(`${username}:${password}`).toString('base64');

            // Probing endpoints
            const endpoints = [
                { path: '/cgi-bin/h.cgi', auth: 'none' },
                { path: '/cgi-bin/h.cgi?module=sys_login', auth: 'none' },
                { path: '/api/onu/list', auth: 'basic' },
                { path: '/cgi-bin/system.cgi', auth: 'basic' },
                { path: '/cgi-bin/onu_status.cgi', auth: 'basic' },
                { path: '/cgi-bin/onu_mgmt.cgi', auth: 'basic' },
                { path: '/index.cgi', auth: 'basic' },
                { path: '/onu_list.cgi', auth: 'basic' },
                { path: '/login.cgi', auth: 'none' }
            ];

            for (const ep of endpoints) {
                try {
                    const headers: any = { 'User-Agent': 'Mozilla/5.0' };
                    if (ep.auth === 'basic') headers['Authorization'] = `Basic ${auth}`;

                    const response = await fetch(`${baseUrl}${ep.path}`, {
                        method: 'GET',
                        headers,
                        signal: AbortSignal.timeout(4000)
                    }).catch(() => null);

                    if (response && (response.ok || response.status === 401 || response.status === 403)) {
                        return true;
                    }
                } catch (e) {
                    continue;
                }
            }
        }
        return false;
    }

    async getOnuList(): Promise<OnuInfo[]> {
        if (!this.connected) await this.connect();

        if (this.config.protocol === 'http' || this.config.protocol === 'https' || this.config.port === 80 || this.config.port === 443) {
            return this.getOnuListHttp();
        }

        throw new Error('C-Data Telnet/SSH access is disabled. Please use HTTP/HTTPS (Web Port 80/443).');
    }

    private async loginModern(baseUrl: string): Promise<string | null> {
        try {
            const uname = this.config.username || 'admin';
            const password = this.config.password || '';
            const md5Password = crypto.createHash('md5').update(password).digest('hex');

            const payload = {
                Usrname: uname,
                Password: md5Password
            };

            const response = await fetch(`${baseUrl}/cgi-bin/h.cgi?module=sys_login`, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(5000)
            });

            if (!response.ok) return null;

            const data = await response.json() as any;
            if (data.code === 0) {
                return data.token || (data.data && data.data.token) || null;
            }
            return null;
        } catch (e) {
            return null;
        }
    }

    private async getOnuListHttp(): Promise<OnuInfo[]> {
        const protocol = this.config.protocol || (this.config.port === 443 ? 'https' : 'http');
        const baseUrl = `${protocol}://${this.config.host}:${this.config.port}`;
        const username = this.config.username || 'admin';
        const password = this.config.password || '';
        const auth = Buffer.from(`${username}:${password}`).toString('base64');

        // 1. Try Modern API Path (/cgi-bin/h.cgi)
        try {
            console.log(`C-Data: Attempting modern login at ${baseUrl}...`);
            const token = await this.loginModern(baseUrl);

            if (token) {
                console.log('C-Data: Modern login successful, fetching ONU list...');
                const onuUrl = `${baseUrl}/cgi-bin/h.cgi?module=onu_list_get`;
                const response = await fetch(onuUrl, {
                    headers: { 'token': token },
                    signal: AbortSignal.timeout(10000)
                });

                if (response.ok) {
                    const data = await response.json() as any;
                    if (data.code === 0) {
                        const onus = this.parseOnuData(data);
                        // Signal Enrichment
                        try {
                            const optUrl = `${baseUrl}/cgi-bin/h.cgi?module=optical_power_list_get`;
                            const optResponse = await fetch(optUrl, { headers: { 'token': token }, signal: AbortSignal.timeout(5000) });
                            if (optResponse.ok) {
                                const optData = await optResponse.json();
                                const optList = (optData as any).data || (optData as any).info || (optData as any).onus || (Array.isArray(optData) ? optData : []);
                                if (Array.isArray(optList)) {
                                    for (const onu of onus) {
                                        if (onu.status === 'online' && !onu.signal) {
                                            const opt = optList.find((it: any) => {
                                                const itPonId = String(it.PonId ?? it.pon_id ?? it.PonID ?? it.pon_no ?? '');
                                                const itOnuId = String(it.OnuId ?? it.onu_id ?? it.OnuID ?? it.onu_no ?? '');
                                                return itOnuId === onu.onuId && (itPonId === onu.ponId || onu.ponId.endsWith('/' + itPonId));
                                            });
                                            if (opt) onu.signal = this.formatSignal(opt.RxPower || opt.rx_power || opt.rx_optical_power);
                                        }
                                    }
                                }
                            }
                        } catch (e) { }
                        return onus;
                    }
                }
            }
        } catch (e) { }

        // 2. Comprehensive Legacy Probing
        const legacyEndpoints = [
            '/api/onu/list',
            '/cgi-bin/system.cgi?module=onu_list',
            '/cgi-bin/onu_status.cgi',
            '/cgi-bin/onu_mgmt.cgi',
            '/cgi-bin/system.cgi',
            '/onu_list.cgi',
            '/onu_mgmt.cgi',
            '/api/v1/onu/status',
            '/cgi-bin/h.cgi?module=onu_status_get'
        ];

        for (const path of legacyEndpoints) {
            try {
                const url = `${baseUrl}${path}`;
                const response = await fetch(url, {
                    headers: {
                        'Authorization': `Basic ${auth}`,
                        'User-Agent': 'Mozilla/5.0'
                    },
                    signal: AbortSignal.timeout(8000)
                });

                if (response.ok) {
                    const text = await response.text();
                    if (text.includes('redirect') || text.includes('login.cgi') || text.includes('<html')) {
                        continue;
                    }

                    try {
                        const data = JSON.parse(text);
                        const onus = this.parseOnuData(data);
                        if (onus && onus.length > 0) {
                            return onus;
                        }
                    } catch (e) { }
                }
            } catch (e: any) {
                continue;
            }
        }

        throw new Error(`C-Data OLT: All Web API endpoints failed (Modern & Legacy). Please check OLT model and Web Port.`);
    }

    private parseOnuData(data: any): OnuInfo[] {
        const items = data.data?.list || data.data || data.onus || (Array.isArray(data) ? data : []);

        return items.map((item: any) => {
            const runningState = item.RunningState !== undefined ? item.RunningState : item.running_state;
            const status = (runningState === 1 || item.status === 'online' || item.state === 'online') ? 'online' : 'offline';

            // Map Reason (Only if NOT online, to avoid misleading UI badges)
            let lastDownReason = undefined;
            if (status !== 'online') {
                const rawReason = item.LastDownCause || item.last_d_cause || item.last_offline_reason || item.state_reason || item.offline_reason || item.RunningStateReason;
                const reasonStr = String(rawReason || '').toLowerCase();

                // C-Data Reason Mapping (Confirmed from user OLT logs & screenshots):
                // 2 = Dying Gasp (Power Down) - Confirmed from user ONT ZTEGCC590215
                // 1 = LOS (Optical Loss) - Inferred from other ONUs
                // 5 = Possible alternative Power Down code
                if (rawReason === 2 || rawReason === '2' || rawReason === 5 || rawReason === '5' ||
                    reasonStr.includes('dying') || reasonStr.includes('power') || reasonStr.includes('dg') || reasonStr.includes('gasp')) {
                    lastDownReason = 'Power Down';
                } else if (rawReason === 1 || rawReason === '1' || reasonStr.includes('los') || reasonStr.includes('loss') || reasonStr.includes('signal')) {
                    lastDownReason = 'Optical Loss';
                } else if (rawReason === 3 || rawReason === '3') {
                    lastDownReason = 'Offline/Deactive';
                } else if (reasonStr && reasonStr !== '0' && reasonStr !== 'null' && reasonStr !== '') {
                    lastDownReason = reasonStr.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                } else {
                    lastDownReason = 'Connection Lost';
                }
            }

            // Map Signal (RX Power)
            const signal = this.formatSignal(item.RxPower || item.rx_power || item.rxPower || item.rx_power_val ||
                item.optical_power || item.OpticalPower || item.ont_rx_power ||
                item.InputPower || item.receive_power || item.ReceivePower || item.rx_pwr || item.rx_optical_power);

            return {
                ponId: String(item.PonId || item.pon_id || item.ponIndex || '0'),
                onuId: String(item.OnuId || item.onu_id || item.onuIndex || '0'),
                sn: item.PonSn || item.sn || item.mac || item.onu_sn || 'Unknown',
                status: status,
                signal: signal,
                name: item.OnuName || item.name || item.onu_name || undefined,
                description: item.OnuDesc || item.description || undefined,
                lastDownReason: lastDownReason,
                lastDownTime: this.formatCDataTime(item.LastDownTime || item.last_down_time),
                lastUpTime: this.formatCDataTime(item.LastUpTime || item.last_up_time),
            };
        });
    }

    private formatSignal(rawSignal: any): string | undefined {
        if (rawSignal === undefined || rawSignal === null || rawSignal === '' || rawSignal === '0') {
            return undefined;
        }

        const numSignal = parseFloat(rawSignal);
        if (numSignal !== 0) {
            // Check for raw integer values (e.g. -2500 -> -25.0)
            if (numSignal < -100 || numSignal > 100) {
                const val = numSignal / 100;
                if (val <= -40 || val >= 40) return undefined; // Out of range / No signal
                return val.toFixed(2) + ' dBm';
            } else {
                if (numSignal <= -40 || numSignal >= 40) return undefined;
                return numSignal.toFixed(2) + ' dBm';
            }
        }
        return undefined;
    }

    private formatCDataTime(time: any): string | undefined {
        if (!time || time === '0' || time === 0) return undefined;
        if (typeof time === 'number' || !isNaN(Number(time))) {
            const date = new Date(Number(time) * 1000);
            return date.toISOString().replace('T', ' ').substring(0, 19);
        }
        return String(time);
    }

    async getOnuDetails(ponId: string, onuId: string): Promise<OnuInfo | null> {
        return null;
    }

    async rebootOnu(ponId: string, onuId: string): Promise<boolean> {
        throw new Error('C-Data ONU Reboot via Telnet is disabled.');
    }
}
