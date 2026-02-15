import { BaseOltDriver, OnuInfo } from './olt-driver.interface.js';
import { Telnet } from 'telnet-client';
import crypto from 'crypto';

export class HsgqDriver extends BaseOltDriver {
    private connection: any;

    constructor(config: any) {
        super(config);
        this.connection = new Telnet();
    }

    async connect(): Promise<void> {
        if (this.config.protocol === 'http' || this.config.protocol === 'https' || [80, 443, 5785, 8080].includes(this.config.port)) {
            // HTTP is stateless or handled with token headers
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
            shellPrompt: />|#|HSGQ/i,
            initialLFCR: true
        };

        try {
            await this.connection.connect(params);
            this.connected = true;
        } catch (error) {
            console.error('HSGQ Connection failed:', error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.connected && this.config.protocol !== 'http' && this.config.protocol !== 'https' && ![80, 443, 5785, 8080].includes(this.config.port)) {
            await this.connection.end();
        }
        this.connected = false;
    }

    async testConnection(): Promise<boolean> {
        const protocol = this.config.protocol || (this.config.port === 443 ? 'https' : 'http');
        const baseUrl = `${protocol}://${this.config.host}:${this.config.port}`;

        if (this.config.protocol === 'http' || this.config.protocol === 'https' || [80, 443, 5785, 8080].includes(this.config.port)) {
            // 1. Fallback to basic auth check (Legacy)
            const username = this.config.username || 'admin';
            const password = this.config.password || '';
            const auth = Buffer.from(`${username}:${password}`).toString('base64');

            let response = await fetch(`${baseUrl}/cgi-bin/v2/get_onu_info.cgi`, {
                method: 'GET',
                headers: { 'Authorization': `Basic ${auth}` },
                signal: AbortSignal.timeout(3000)
            }).catch(() => null);

            if (response && (response.ok || response.status === 401 || response.status === 403)) return true;

            // 2. Alternative Standard API
            response = await fetch(`${baseUrl}/api/onu/list`, {
                method: 'GET',
                headers: { 'Authorization': `Basic ${auth}` },
                signal: AbortSignal.timeout(3000)
            }).catch(() => null);

            if (response && (response.ok || response.status === 401 || response.status === 403)) return true;

            // 3. Modern Login
            console.log(`HSGQ: Attempting Modern Login in testConnection for ${baseUrl}`);
            const token = await this.loginModern(baseUrl);
            if (token) return true;

            // 4. Simple fetch without token as fallback for older firmware
            try {
                const res = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(3000) });
                return res.ok || res.status === 401 || res.status === 403;
            } catch (e) {
                // proceed to telnet if web fails
            }
        }

        // 5. Final attempt: actually try to connect via Telnet/SSH
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

        if (this.config.protocol === 'http' || this.config.protocol === 'https' || [80, 443, 5785, 8080].includes(this.config.port)) {
            return this.getOnuListHttp();
        }

        try {
            const output = await this.connection.exec('show onu all');
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
                signal: AbortSignal.timeout(5000)
            });

            if (!response.ok) return null;

            const data = await response.json() as any;
            if (data.code !== 1) return null;

            return response.headers.get('x-token') || response.headers.get('token');
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
            console.error('HSGQ HTTP Fetch failed:', error.message);
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

                if (rawReason === 1 || rawReason === '1' || reasonStr.includes('dying') || reasonStr.includes('power')) {
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
        if (!this.connected) await this.connect();
        try {
            await this.connection.exec(`reboot onu ${ponId} ${onuId}`);
            return true;
        } catch (error) {
            console.error('Failed to reboot ONU:', error);
            return false;
        }
    }
}
