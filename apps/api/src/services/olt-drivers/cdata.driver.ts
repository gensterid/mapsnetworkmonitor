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
                                    const optData = await optResponse.json();
                                    const optList = (optData as any).data || (optData as any).info || (optData as any).onus || (Array.isArray(optData) ? optData : []);
                                    if (Array.isArray(optList)) {
                                        for (const onu of onus) {
                                            if (onu.status === 'online' && !onu.signal) {
                                                const opt = optList.find((it: any) => {
                                                    const itPonId = String(it.PonId ?? it.pon_id ?? it.PonID ?? it.pon_no ?? '');
                                                    const itOnuId = String(it.OnuId ?? it.onu_id ?? it.OnuID ?? it.onu_no ?? '');

                                                    if (itOnuId !== onu.onuId) return false;
                                                    if (itPonId === onu.ponId) return true;

                                                    // Fuzzy match for PonId formatting (e.g. "0/0/1" vs "1")
                                                    if (onu.ponId.includes('/') && itPonId && (onu.ponId.endsWith('/' + itPonId) || onu.ponId.endsWith(':' + itPonId))) return true;
                                                    if (itPonId.includes('/') && onu.ponId && (itPonId.endsWith('/' + onu.ponId) || itPonId.endsWith(':' + onu.ponId))) return true;

                                                    return false;
                                                });

                                                if (opt) {
                                                    onu.signal = this.formatSignal(opt.RxPower || opt.rx_power || opt.rxPower || opt.rx_power_val || opt.OpticalPower || opt.receive_power || opt.InputPower || opt.ReceivePower || opt.rx_pwr || opt.rx_optical_power);
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
