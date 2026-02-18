import { BaseOltDriver, OnuInfo } from './olt-driver.interface.js';
import crypto from 'crypto';
import { logger } from '../../lib/logger.js';

export class HsgqDriver extends BaseOltDriver {
    constructor(config: any) {
        super(config);
    }

    async connect(): Promise<void> {
        if (this.config.protocol === 'http' || this.config.protocol === 'https' || [80, 443, 5785, 8080].includes(this.config.port)) {
            // HTTP is stateless or handled with token headers
            this.connected = true;
            return;
        }

        throw new Error('HSGQ Telnet/SSH access is disabled. Please use HTTP/HTTPS.');
    }

    async disconnect(): Promise<void> {
        this.connected = false;
    }

    async testConnection(): Promise<boolean> {
        const protocol = this.config.protocol || (this.config.port === 443 ? 'https' : 'http');
        const baseUrl = `${protocol}://${this.config.host}:${this.config.port}`;

        logger.info({ baseUrl }, 'HSGQ: testConnection starting');

        if (this.config.protocol === 'http' || this.config.protocol === 'https' || [80, 443, 5785, 8080].includes(this.config.port)) {
            // 1. Modern Login (Aggressive check)
            const token = await this.loginModern(baseUrl);
            if (token) {
                logger.info({ baseUrl }, 'HSGQ: testConnection SUCCESS via Modern API');
                return true;
            }

            // 2. Fallback to basic auth check (Legacy)
            const username = this.config.username || 'admin';
            const password = this.config.password || '';
            const auth = Buffer.from(`${username}:${password}`).toString('base64');

            logger.info({ baseUrl }, 'HSGQ: Attempting Legacy Auth check');
            const response = await fetch(`${baseUrl}/cgi-bin/v2/get_onu_info.cgi`, {
                method: 'GET',
                headers: { 'Authorization': `Basic ${auth}` },
                signal: AbortSignal.timeout(5000)
            }).catch(() => null);

            if (response && (response.ok || response.status === 401 || response.status === 403)) {
                logger.info({ baseUrl }, 'HSGQ: testConnection SUCCESS via Legacy API');
                return true;
            }

            // 3. Simple fetch without token as fallback
            try {
                const res = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(5000) });
                if (res.ok || res.status === 401 || res.status === 403) {
                    logger.info({ baseUrl }, 'HSGQ: testConnection SUCCESS via Simple Fetch');
                    return true;
                }
            } catch (e) {
                logger.warn({ err: e, baseUrl }, 'HSGQ: Simple fetch failed');
            }
        }

        logger.error({ baseUrl }, 'HSGQ: testConnection FINAL FAILURE');
        return false;
    }

    async getOnuList(): Promise<OnuInfo[]> {
        if (!this.connected) await this.connect();

        if (this.config.protocol === 'http' || this.config.protocol === 'https' || [80, 443, 5785, 8080].includes(this.config.port)) {
            return this.getOnuListHttp();
        }

        throw new Error('HSGQ Telnet/SSH access is disabled. Please use HTTP/HTTPS.');
    }

    private async loginModern(baseUrl: string): Promise<string | null> {
        try {
            const uname = this.config.username || 'admin';
            const password = this.config.password || '';

            const key = crypto.createHash('md5').update(`${uname}:${password}`).digest('hex');
            const value = Buffer.from(password).toString('base64');

            const payload = {
                method: "set",
                param: {
                    name: uname,
                    key: key,
                    value: value,
                    captcha_v: "",
                    captcha_f: ""
                }
            };

            const response = await fetch(`${baseUrl}/userlogin?form=login`, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                logger.warn({ baseUrl, status: response.status }, 'HSGQ Modern login failed');
                return null;
            }

            const data = await response.json() as any;
            if (data.code !== 1) {
                logger.warn({ baseUrl, code: data.code }, 'HSGQ Modern login rejected');
                return null;
            }

            const token = response.headers.get('x-token') || response.headers.get('token');
            if (token) logger.debug({ baseUrl }, 'HSGQ Modern: Login SUCCESS');
            return token;
        } catch (e) {
            return null;
        }
    }

    private async getOnuListHttp(): Promise<OnuInfo[]> {
        const protocol = this.config.protocol || (this.config.port === 443 ? 'https' : 'http');
        const baseUrl = `${protocol}://${this.config.host}:${this.config.port}`;

        try {
            const username = this.config.username || 'admin';
            const password = this.config.password || '';
            const auth = Buffer.from(`${username}:${password}`).toString('base64');

            // Attempt legacy CGI
            let response = await fetch(`${baseUrl}/cgi-bin/v2/get_onu_info.cgi`, {
                headers: { 'Authorization': `Basic ${auth}` },
                signal: AbortSignal.timeout(10000)
            }).catch(() => null);

            if (response && response.ok) {
                const data = await response.json();
                return this.parseOnuData(data);
            }

            // Attempt Modern API
            const token = await this.loginModern(baseUrl);
            if (token) {
                // Stateful Port Auth
                await fetch(`${baseUrl}/gponont_mgmt?form=auth&port_id=0`, {
                    headers: { 'x-token': token }
                }).catch(() => null);

                const endpoints = ['/ontinfo_table', '/onu_basic_info', '/ontinfo_config'];
                for (const endpoint of endpoints) {
                    try {
                        const res = await fetch(`${baseUrl}${endpoint}`, {
                            headers: { 'x-token': token },
                            signal: AbortSignal.timeout(10000)
                        });
                        if (res.ok) {
                            const data = await res.json();
                            return this.parseOnuData(data);
                        }
                    } catch (e) { }
                }
            }

            throw new Error('All HSGQ Web API attempts failed');
        } catch (error: any) {
            logger.error({ err: error }, 'HSGQ HTTP Fetch failed');
            throw error;
        }
    }

    private parseOnuData(data: any): OnuInfo[] {
        const items = data.data || data.info || data.onus || (Array.isArray(data) ? data : []);

        return items.map((item: any) => {
            const sn = item.ont_sn || item.sn || item.alias || item.mac || 'Unknown';
            const name = item.ont_name || item.name || item.onu_name || undefined;
            const ponId = String(item.pon_id || item.port_id || item.ponIndex || '0');
            const onuId = String(item.identifier || item.onu_id || item.onuIndex || item.id || '0');

            let status = 'offline';
            const operationalState = item.rstate !== undefined ? item.rstate : item.state;

            if (operationalState !== undefined) {
                status = operationalState === 1 ? 'online' : 'offline';
            } else if (item.status) {
                status = item.status.toLowerCase();
            }

            let lastDownReason = undefined;
            if (status !== 'online') {
                const rawReason = item.last_d_cause || item.last_offline_reason || item.state_reason || item.offline_reason;
                const reasonStr = String(rawReason || '').toLowerCase();

                if (rawReason === 1 || rawReason === '1' || reasonStr.includes('dying') || reasonStr.includes('power') || reasonStr.includes('gasp') || reasonStr.includes('dg')) {
                    lastDownReason = 'Power Down';
                } else if (rawReason === 2 || rawReason === '2' || reasonStr.includes('los') || reasonStr.includes('loss') || reasonStr.includes('signal')) {
                    lastDownReason = 'Optical Loss';
                } else if (rawReason === 3 || rawReason === '3') {
                    lastDownReason = 'Offline/Deactive';
                } else {
                    const powerStr = item.receive_power || item.rx_power || item.rxPower || '0';
                    const power = parseFloat(powerStr);
                    if (power <= -30 || power >= 10) {
                        lastDownReason = 'Optical Loss';
                    } else {
                        lastDownReason = 'Connection Lost';
                    }
                }
            }

            return {
                ponId,
                onuId,
                sn,
                status,
                signal: item.receive_power || item.rx_power || item.rxPower || item.signals || item.optical_power || undefined,
                name,
                description: item.ont_description || item.description || undefined,
                lastDownReason,
                lastDownTime: item.last_d_time || undefined,
                lastUpTime: item.last_u_time || undefined
            };
        });
    }

    async getOnuDetails(ponId: string, onuId: string): Promise<OnuInfo | null> {
        return null;
    }

    async rebootOnu(ponId: string, onuId: string): Promise<boolean> {
        throw new Error('HSGQ ONU Reboot via Telnet is disabled.');
    }
}
