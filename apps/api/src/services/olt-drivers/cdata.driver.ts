import { BaseOltDriver, OnuInfo } from './olt-driver.interface.js';
import { Telnet } from 'telnet-client';
import crypto from 'crypto';

export class CDataDriver extends BaseOltDriver {
    private connection: any;

    constructor(config: any) {
        super(config);
        this.connection = new Telnet();
    }

    async connect(): Promise<void> {
        if (this.config.protocol === 'http' || this.config.protocol === 'https' || this.config.port === 80 || this.config.port === 443) {
            this.connected = true;
            return;
        }

        const params = {
            host: this.config.host,
            port: this.config.port || 23,
            username: this.config.username,
            password: this.config.password,
            timeout: this.config.timeout || 10000,
            loginPrompt: /Login:|User Name:/i,
            passwordPrompt: /Password:/i,
            shellPrompt: />|#|OLT/i,
            initialLFCR: true
        };

        try {
            await this.connection.connect(params);
            this.connected = true;
        } catch (error) {
            console.error('C-Data Connection failed:', error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.connected && this.config.protocol !== 'http' && this.config.protocol !== 'https') {
            await this.connection.end();
        }
        this.connected = false;
    }

    async testConnection(): Promise<boolean> {
        if (this.config.protocol === 'http' || this.config.protocol === 'https' || this.config.port === 80 || this.config.port === 443) {
            const protocol = this.config.protocol || (this.config.port === 443 ? 'https' : 'http');
            const baseUrl = `${protocol}://${this.config.host}:${this.config.port}`;

            // 1. Try modern API path (just check if it responds)
            let response = await fetch(`${baseUrl}/cgi-bin/h.cgi`, {
                method: 'GET'
            }).catch(() => null);

            if (response && (response.ok || response.status === 401 || response.status === 403)) {
                return true;
            }

            // 2. Legacy check (Basic Auth)
            const username = this.config.username || 'admin';
            const password = this.config.password || '';
            const auth = Buffer.from(`${username}:${password}`).toString('base64');

            response = await fetch(`${baseUrl}/api/onu/list`, {
                method: 'GET',
                headers: { 'Authorization': `Basic ${auth}` }
            }).catch(() => null);

            if (response && (response.ok || response.status === 401 || response.status === 403)) return true;

            // 3. Alternative Legacy
            response = await fetch(`${baseUrl}/cgi-bin/onu_status.cgi`, {
                method: 'GET',
                headers: { 'Authorization': `Basic ${auth}` }
            }).catch(() => null);

            return !!(response && (response.ok || response.status === 401 || response.status === 403));
        }

        try {
            await this.connect();
            await this.disconnect();
            return true;
        } catch (e) {
            return false;
        }
    }

    async getOnuList(): Promise<OnuInfo[]> {
        if (!this.connected) await this.connect();

        if (this.config.protocol === 'http' || this.config.protocol === 'https' || this.config.port === 80 || this.config.port === 443) {
            return this.getOnuListHttp();
        }

        try {
            const output = await this.connection.exec('show onu info all');
            console.log('C-Data ONU List Output:', output);
            return [output as any];
        } catch (error) {
            console.error('Failed to get ONU list via Telnet:', error);
            throw error;
        }
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
                headers: { 'Content-Type': 'application/json' }
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

        try {
            // 1. Try Modern API first
            console.log(`C-Data: Attempting modern login at ${baseUrl}...`);
            const token = await this.loginModern(baseUrl);

            if (token) {
                console.log('C-Data: Modern login successful, fetching ONU list...');
                const onuUrl = `${baseUrl}/cgi-bin/h.cgi?module=onu_list_get`;
                const response = await fetch(onuUrl, {
                    headers: { 'token': token }
                });

                if (response.ok) {
                    const data = await response.json() as any;
                    if (data.code === 0) {
                        const onus = this.parseOnuData(data);

                        // Signal Enrichment for Modern API
                        const hasMissingSignal = onus.some(o => o.status === 'online' && !o.signal);
                        if (hasMissingSignal) {
                            try {
                                const optUrl = `${baseUrl}/cgi-bin/h.cgi?module=optical_power_list_get`;
                                const optResponse = await fetch(optUrl, { headers: { 'token': token } });
                                if (optResponse.ok) {
                                    const optData = await optResponse.json() as any;
                                    const optList = optData.data?.list || optData.data || [];
                                    if (Array.isArray(optList)) {
                                        for (const onu of onus) {
                                            if (onu.status === 'online' && !onu.signal) {
                                                const opt = optList.find((it: any) =>
                                                    (it.PonId === onu.ponId && String(it.OnuId) === String(onu.onuId)) ||
                                                    (it.pon_id === onu.ponId && String(it.onu_id) === String(onu.onuId)) ||
                                                    (it.PonID === onu.ponId && String(it.OnuID) === String(onu.onuId))
                                                );
                                                if (opt) {
                                                    onu.signal = opt.RxPower || opt.rx_power || opt.rxPower || opt.rx_power_val || opt.OpticalPower || opt.receive_power || undefined;
                                                }
                                            }
                                        }
                                    }
                                }
                            } catch (e) {
                                console.warn('C-Data: Signal enrichment failed', e);
                            }
                        }
                        return onus;
                    }
                }
            }

            // 2. Fallback to Legacy APIs
            console.warn(`C-Data: Modern API failed or not supported. Trying legacy...`);
            const username = this.config.username || 'admin';
            const password = this.config.password || '';
            const auth = Buffer.from(`${username}:${password}`).toString('base64');

            const url = `${baseUrl}/api/onu/list`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                console.warn(`C-Data: Primary legacy endpoint failed (${response.status}). Trying alternative...`);
                const altUrl = `${baseUrl}/cgi-bin/onu_status.cgi`;
                const altResponse = await fetch(altUrl, {
                    headers: { 'Authorization': `Basic ${auth}` }
                });

                if (!altResponse.ok) {
                    const errorText = await altResponse.text().catch(() => 'No detail');
                    throw new Error(`C-Data OLT API responded with ${altResponse.status}: ${errorText.substring(0, 100)}`);
                }

                const text = await altResponse.text();
                try {
                    const data = JSON.parse(text);
                    return this.parseOnuData(data);
                } catch (e) {
                    throw new Error(`C-Data OLT returned invalid JSON from ${altUrl}: ${text.substring(0, 100)}`);
                }
            }

            const text = await response.text();
            try {
                const data = JSON.parse(text);
                return this.parseOnuData(data);
            } catch (e) {
                throw new Error(`C-Data OLT returned invalid JSON from ${url}: ${text.substring(0, 100)}`);
            }
        } catch (error: any) {
            console.error('C-Data HTTP Fetch failed:', error.message);
            throw error;
        }
    }

    private parseOnuData(data: any): OnuInfo[] {
        const items = data.data?.list || data.data || data.onus || (Array.isArray(data) ? data : []);

        return items.map((item: any) => {
            const runningState = item.RunningState !== undefined ? item.RunningState : item.running_state;
            const status = (runningState === 1 || item.status === 'online' || item.state === 'online') ? 'online' : 'offline';

            // Map Offline Reason
            let lastDownReason = undefined;
            if (status !== 'online') {
                const rawReason = item.LastDownCause || item.last_d_cause || item.last_offline_reason || item.state_reason || item.offline_reason;
                const reasonStr = String(rawReason || '').toLowerCase();

                if (rawReason === 1 || rawReason === '1' || reasonStr.includes('dying') || reasonStr.includes('power')) {
                    lastDownReason = 'Power Down';
                } else if (rawReason === 2 || rawReason === '2' || reasonStr.includes('los') || reasonStr.includes('loss') || reasonStr.includes('signal')) {
                    lastDownReason = 'Optical Loss';
                } else if (rawReason === 3 || rawReason === '3') {
                    lastDownReason = 'Offline/Deactive';
                } else if (reasonStr && reasonStr !== '0' && reasonStr !== 'null' && reasonStr !== '') {
                    lastDownReason = reasonStr.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                } else {
                    lastDownReason = 'Connection Lost';
                }
            }

            return {
                ponId: String(item.PonId || item.pon_id || item.ponIndex || '0'),
                onuId: String(item.OnuId || item.onu_id || item.onuIndex || '0'),
                sn: item.PonSn || item.sn || item.mac || item.onu_sn || 'Unknown',
                status: status,
                signal: item.RxPower || item.rx_power || item.rxPower || item.rx_power_val || item.optical_power || item.OpticalPower || item.ont_rx_power || undefined,
                name: item.OnuName || item.name || item.onu_name || undefined,
                description: item.OnuDesc || item.description || undefined,
                lastDownReason: lastDownReason,
                lastDownTime: this.formatCDataTime(item.LastDownTime || item.last_down_time),
                lastUpTime: this.formatCDataTime(item.LastUpTime || item.last_up_time),
            };
        });
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
        if (!this.connected) await this.connect();
        try {
            // e.g. "onu reboot <ponId> <onuId>"
            await this.connection.exec(`onu reboot ${ponId} ${onuId}`);
            return true;
        } catch (error) {
            console.error('Failed to reboot ONU:', error);
            return false;
        }
    }
}
