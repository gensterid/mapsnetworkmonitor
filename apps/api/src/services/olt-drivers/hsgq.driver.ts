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
        if (this.config.protocol === 'http' || this.config.protocol === 'https' || this.config.port === 80 || this.config.port === 443) {
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
        if (this.connected && this.config.protocol !== 'http' && this.config.protocol !== 'https') {
            await this.connection.end();
        }
        this.connected = false;
    }

    async testConnection(): Promise<boolean> {
        if (this.config.protocol === 'http' || this.config.protocol === 'https' || this.config.port === 80 || this.config.port === 443) {
            const protocol = this.config.protocol || (this.config.port === 443 ? 'https' : 'http');
            const baseUrl = `${protocol}://${this.config.host}:${this.config.port}`;

            // 1. Fallback to basic auth check (Legacy)
            const username = this.config.username || 'admin';
            const password = this.config.password || '';
            const auth = Buffer.from(`${username}:${password}`).toString('base64');
            let response = await fetch(`${baseUrl}/cgi-bin/v2/get_onu_info.cgi`, {
                method: 'GET',
                headers: { 'Authorization': `Basic ${auth}` }
            }).catch(() => null);

            if (response && (response.ok || response.status === 401 || response.status === 403)) return true;

            // 2. Alternative Standard API
            response = await fetch(`${baseUrl}/api/onu/list`, {
                method: 'GET',
                headers: { 'Authorization': `Basic ${auth}` }
            }).catch(() => null);

            if (response && (response.ok || response.status === 401 || response.status === 403)) return true;

            // 3. Modern Login - check if it responds at all
            response = await fetch(`${baseUrl}/userlogin?form=login`, {
                method: 'GET' // Just check if the login page/endpoint exists
            }).catch(() => null);

            if (response && (response.ok || response.status === 401 || response.status === 403)) return true;

            // 4. Final attempt: actually try to login but be very forgiving
            const token = await this.loginModern(baseUrl);
            if (token) return true;

            // If we are here, we consider it offline.
            return false;
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
            const output = await this.connection.exec('show onu all');
            console.log('HSGQ ONU List Output:', output);
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

            console.log(`HSGQ Modern: Attempting login at ${baseUrl}/userlogin?form=login`);
            const response = await fetch(`${baseUrl}/userlogin?form=login`, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                console.warn(`HSGQ Modern login failed with status ${response.status}`);
                return null;
            }

            const data = await response.json() as any;
            if (data.code !== 1) {
                console.warn(`HSGQ Modern login rejected: ${data.message}`);
                return null;
            }

            const token = response.headers.get('x-token');
            if (token) console.log('HSGQ Modern: Login successful (Token obtained)');
            return token;
        } catch (e: any) {
            console.error('HSGQ Modern login error:', e.message);
            return null;
        }
    }

    private async getOnuListHttp(): Promise<OnuInfo[]> {
        const protocol = this.config.protocol || (this.config.port === 443 ? 'https' : 'http');
        const baseUrl = `${protocol}://${this.config.host}:${this.config.port}`;

        try {
            // Attempt 1: Standard Legacy CGI
            const url = `${baseUrl}/cgi-bin/v2/get_onu_info.cgi`;
            const username = this.config.username || 'admin';
            const password = this.config.password || '';
            const auth = Buffer.from(`${username}:${password}`).toString('base64');

            console.log(`HSGQ: Attempting Standard API at ${url}`);
            let response = await fetch(url, {
                headers: {
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/json'
                }
            });

            // Attempt 2: Standard Alternative API
            if (!response.ok && response.status === 404) {
                const altUrl = `${baseUrl}/api/onu/list`;
                console.log(`HSGQ: Attempting Alternative API at ${altUrl}`);
                response = await fetch(altUrl, {
                    headers: { 'Authorization': `Basic ${auth}` }
                });
            }

            // Attempt 3: Modern GPON WEB API (Token-based & Stateful)
            if (!response.ok && response.status === 404) {
                console.log('HSGQ: Standard APIs failed with 404. Attempting Modern GPON WEB login...');
                const token = await this.loginModern(baseUrl);
                if (token) {
                    // CRITICAL: HSGQ Modern API is stateful. We must "auth" to a port (0 for global) 
                    // before tables like /ontinfo_table become available (otherwise 404).
                    console.log('HSGQ: Performing stateful port auth (Port 0)...');
                    await fetch(`${baseUrl}/gponont_mgmt?form=auth&port_id=0`, {
                        headers: { 'x-token': token }
                    }).catch(() => null);

                    const endpoints = ['/ontinfo_table', '/onu_basic_info', '/ontinfo_config', '/api/onu/list'];
                    for (const endpoint of endpoints) {
                        const modernUrl = `${baseUrl}${endpoint}`;
                        console.log(`HSGQ: Trying Modern API at ${modernUrl}...`);
                        try {
                            const modernResponse = await fetch(modernUrl, {
                                headers: { 'x-token': token }
                            });

                            if (modernResponse.ok) {
                                const data = await modernResponse.json();
                                return this.parseOnuData(data);
                            }
                            console.warn(`HSGQ: Modern endpoint ${endpoint} failed with status ${modernResponse.status}`);
                        } catch (e) {
                            console.warn(`HSGQ: Modern endpoint ${endpoint} fetch error`);
                        }
                    }
                    throw new Error('All modern OLT API endpoints failed');
                } else {
                    throw new Error('Modern login failed (No token returned)');
                }
            }

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'No detail');
                throw new Error(`OLT API responded with ${response.status}: ${errorText.substring(0, 100)}`);
            }

            const text = await response.text();
            try {
                const data = JSON.parse(text) as any;
                return this.parseOnuData(data);
            } catch (e) {
                throw new Error(`OLT API returned invalid JSON: ${text.substring(0, 100)}`);
            }
        } catch (error: any) {
            console.error('HSGQ HTTP Fetch failed:', error.message);
            throw error;
        }
    }

    private parseOnuData(data: any): OnuInfo[] {
        // HSGQ API often returns { code: 1, data: [...] } for modern, or older variants
        const items = data.data || data.info || data.onus || (Array.isArray(data) ? data : []);

        return items.map((item: any) => {
            // Modern HSGQ field names: ont_sn, ont_name, identifier, state
            // Legacy HSGQ field names: pon_id, onu_id, sn, status
            const sn = item.ont_sn || item.sn || item.alias || item.mac || 'Unknown';
            const name = item.ont_name || item.name || item.onu_name || undefined;
            const ponId = String(item.pon_id || item.port_id || item.ponIndex || '0');
            const onuId = String(item.identifier || item.onu_id || item.onuIndex || item.id || '0');

            // Modern state: 1 = Online, others might vary
            // User feedback: state=1 but rstate=2 means offline.
            // rstate is usually the operational running state.
            let status = 'offline';
            const operationalState = item.rstate !== undefined ? item.rstate : item.state;

            if (operationalState !== undefined) {
                status = operationalState === 1 ? 'online' : 'offline';
            } else if (item.status) {
                status = item.status.toLowerCase();
            }

            // Map Offline Reason
            let lastDownReason = undefined;
            if (status !== 'online') {
                const rawReason = item.last_d_cause || item.last_offline_reason || item.state_reason || item.offline_reason;
                const reasonStr = String(rawReason || '').toLowerCase();

                // Map numeric codes
                if (rawReason === 1 || rawReason === '1' || reasonStr.includes('dying') || reasonStr.includes('power')) {
                    lastDownReason = 'Power Down';
                } else if (rawReason === 2 || rawReason === '2' || reasonStr.includes('los') || reasonStr.includes('loss') || reasonStr.includes('signal')) {
                    lastDownReason = 'Optical Loss';
                } else if (rawReason === 3 || rawReason === '3') {
                    lastDownReason = 'Offline/Deactive';
                } else if (!rawReason || rawReason === '0' || reasonStr === '' || reasonStr === 'null') {
                    // Fallback based on state or power inference
                    const powerStr = item.receive_power || item.rx_power || item.rxPower || '0';
                    const power = parseFloat(powerStr);
                    if (power <= -30 || power >= 10) { // Some OLTs report +10 or -30/40 for LOS
                        lastDownReason = 'Optical Loss';
                    } else {
                        lastDownReason = 'Connection Lost';
                    }
                } else if (reasonStr && reasonStr !== '0') {
                    lastDownReason = reasonStr.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
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
