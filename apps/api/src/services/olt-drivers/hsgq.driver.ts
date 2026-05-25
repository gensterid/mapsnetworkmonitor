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

    async testConnection(): Promise<{ success: boolean; error?: string }> {
        const protocol = this.config.protocol || (this.config.port === 443 ? 'https' : 'http');
        const baseUrl = `${protocol}://${this.config.host}:${this.config.port}`;

        logger.info({ baseUrl }, 'HSGQ: testConnection starting');

        if (this.config.protocol === 'http' || this.config.protocol === 'https' || [80, 443, 5785, 8080].includes(this.config.port)) {
            // 1. Modern Login (Aggressive check)
            try {
                const { token, error } = await this.loginModern(baseUrl);
                if (token) {
                    logger.info({ baseUrl }, 'HSGQ: testConnection SUCCESS via Modern API');
                    return { success: true };
                }
                if (error) {
                    logger.warn({ baseUrl, error }, 'HSGQ: Modern login rejected with specific error');
                    return { success: false, error };
                }
            } catch (loginErr: any) {
                logger.warn({ err: loginErr.message, baseUrl }, 'HSGQ: Modern login check threw error');
                // Don't return yet, try fallback
            }

            // 2. Fallback to basic auth check (Legacy)
            const username = this.config.username || 'admin';
            const password = this.config.password || '';
            const auth = Buffer.from(`${username}:${password}`).toString('base64');

            logger.info({ baseUrl }, 'HSGQ: Attempting Legacy Auth check');
            try {
                const response = await fetch(`${baseUrl}/cgi-bin/v2/get_onu_info.cgi`, {
                    method: 'GET',
                    headers: { 'Authorization': `Basic ${auth}` },
                    signal: AbortSignal.timeout(25000) // Increased to 25s
                });

                if (response.ok) {
                    logger.info({ baseUrl }, 'HSGQ: testConnection SUCCESS via Legacy API');
                    return { success: true };
                }
                
                if (response.status === 401 || response.status === 403) {
                    return { success: false, error: 'Auth Failed: Invalid Web Username/Password' };
                }
            } catch (e: any) {
                logger.warn({ err: e.message, baseUrl }, 'HSGQ: Legacy Auth check failed');
            }

            // 3. Simple fetch without token as fallback (Check if IP is reachable)
            try {
                const res = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(15000) });
                if (res.ok) {
                    return { success: false, error: 'Login required but reachable (Web GUI responding)' };
                }
                if (res.status === 401 || res.status === 403) {
                    return { success: false, error: 'Auth Required: Invalid Web Username/Password' };
                }
            } catch (e: any) {
                if (e.name === 'TimeoutError') return { success: false, error: 'Connection Timeout (25s)' };
                return { success: false, error: `Connection Refused: ${e.message}` };
            }
        }

        logger.error({ baseUrl }, 'HSGQ: testConnection FINAL FAILURE');
        return { success: false, error: 'Device Unreachable or Unsupported API response' };
    }

    async getOnuList(): Promise<OnuInfo[]> {
        if (!this.connected) await this.connect();

        if (this.config.protocol === 'http' || this.config.protocol === 'https' || [80, 443, 5785, 8080].includes(this.config.port)) {
            return this.getOnuListHttp();
        }

        throw new Error('HSGQ Telnet/SSH access is disabled. Please use HTTP/HTTPS.');
    }

    private async loginModern(baseUrl: string): Promise<{ token: string | null; error?: string }> {
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
                signal: AbortSignal.timeout(20000)
            });

            if (!response.ok) {
                logger.warn({ baseUrl, status: response.status }, 'HSGQ Modern login failed');
                return { token: null, error: `HTTP ${response.status}: Login Failed` };
            }

            const data = await response.json() as any;
            if (data.code !== 1) {
                logger.warn({ baseUrl, code: data.code }, 'HSGQ Modern login rejected');
                if (data.code === 4039) {
                    return { token: null, error: 'Account Locked (Error 4039). Please wait 30 minutes or reboot OLT.' };
                }
                if (data.code === 4033) {
                    return { token: null, error: 'Invalid Password (Error 4033)' };
                }
                return { token: null, error: `Login Rejected (Code ${data.code})` };
            }

            const token = response.headers.get('x-token') || response.headers.get('token');
            if (token) {
                logger.debug({ baseUrl }, 'HSGQ Modern: Login SUCCESS');
                return { token };
            }
            return { token: null, error: 'Login successful but no token received' };
        } catch (e: any) {
            return { token: null, error: e.message };
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
            logger.info({ baseUrl, authLen: auth.length }, 'HSGQ: Attempting Legacy CGI ONUs Fetch');
            let response = await fetch(`${baseUrl}/cgi-bin/v2/get_onu_info.cgi`, {
                headers: { 'Authorization': `Basic ${auth}` },
                signal: AbortSignal.timeout(20000)
            }).catch(e => {
                logger.warn({ err: e.message, baseUrl }, 'HSGQ: Legacy CGI fetch threw error');
                return null;
            });

            if (response && response.ok) {
                logger.info({ baseUrl, status: response.status }, 'HSGQ: Legacy CGI SUCCESS');
                const data = await response.json();
                return this.parseOnuData(data);
            } else if (response) {
                 logger.warn({ baseUrl, status: response.status, text: await response.text().catch(()=>'') }, 'HSGQ: Legacy CGI rejected/failed');
            }

            // Attempt Modern API
            logger.info({ baseUrl }, 'HSGQ: Attempting Modern API Login for ONUs Fetch');
            const { token, error } = await this.loginModern(baseUrl);
            if (token) {
                logger.info({ baseUrl }, 'HSGQ: Modern Login Success, proceeding to endpoints');
                // Stateful Port Auth
                await fetch(`${baseUrl}/gponont_mgmt?form=auth&port_id=0`, {
                    headers: { 'x-token': token }
                }).catch(e => logger.warn({ err: e.message }, 'HSGQ: Auth port 0 failed (ignoring)'));

                const endpoints = ['/ontinfo_table', '/onu_basic_info', '/ontinfo_config'];
                for (const endpoint of endpoints) {
                    try {
                        logger.debug({ baseUrl, endpoint }, 'HSGQ: Trying fetch endpoint');
                        const res = await fetch(`${baseUrl}${endpoint}`, {
                            headers: { 'x-token': token },
                            signal: AbortSignal.timeout(20000)
                        });
                        if (res.ok) {
                            logger.info({ baseUrl, endpoint }, 'HSGQ: Endpoint SUCCESS');
                            const data = await res.json();
                            return this.parseOnuData(data);
                        } else {
                            logger.warn({ baseUrl, endpoint, status: res.status }, 'HSGQ: Endpoint returned non-OK');
                        }
                    } catch (e: any) { 
                        logger.warn({ baseUrl, endpoint, err: e.message }, 'HSGQ: Endpoint threw error');
                    }
                }
            } else {
                 logger.warn({ baseUrl, error }, 'HSGQ: Modern API Login failed to get token');
            }

            logger.error({ baseUrl }, 'HSGQ: Exhausted all fetch attempts without success');
            throw new Error('All HSGQ Web API attempts failed');
        } catch (error: any) {
            logger.error({ err: error }, 'HSGQ HTTP Fetch failed');
            throw error;
        }
    }

    private parseOnuData(data: any): OnuInfo[] {
        const items = data.data || data.info || data.onus || (Array.isArray(data) ? data : []);

        // One-shot debug: dump the JSON keys of the first item so we can see
        // which field HSGQ exposes the operator-set name in. Helps diagnose
        // vendor-specific field names without spamming the log.
        if (items.length > 0 && process.env.HSGQ_DEBUG_FIELDS === 'true') {
            logger.info({
                totalItems: items.length,
                firstItemKeys: Object.keys(items[0]),
                firstItemSample: items[0],
                allSns: items.slice(0, 50).map((i: any) => ({ sn: i.ont_sn || i.sn, name: i.ont_name || i.name })),
            }, '[HSGQ Debug] Raw ONU item structure (HSGQ_DEBUG_FIELDS=true)');
        }

        // SN-targeted debug: when HSGQ_DEBUG_SN is set, log the full raw item
        // for any ONU whose serial contains that substring. Useful when the
        // app shows a stale name and we need to confirm what the OLT API
        // currently returns for a specific device. Also logs whether the SN
        // was found at all (to distinguish OLT-side missing-SN bug vs other).
        const debugSn = process.env.HSGQ_DEBUG_SN;
        if (debugSn) {
            const matching = items.filter((i: any) =>
                String(i.ont_sn || i.sn || '').toLowerCase().includes(debugSn.toLowerCase())
            );
            logger.info({
                searchSn: debugSn,
                totalItems: items.length,
                matchCount: matching.length,
                matchingItems: matching,
            }, `[HSGQ Debug] SN search result for ${debugSn}`);
        }

        return items.map((item: any) => {
            const sn = item.ont_sn || item.sn || item.alias || item.mac || 'Unknown';
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

            // Description Logic: fallback to alias or remark if description is empty or default
            const rawDesc = item.ont_description || item.Description || item.description || item.remark || item.alias || undefined;
            const description = (rawDesc === 'No-description' || rawDesc === 'None') ? undefined : rawDesc;

            return {
                ponId,
                onuId,
                sn,
                macAddress: item.ont_mac || item.onu_mac || item.mac_addr || item.mac || undefined,
                status,
                signal: item.receive_power || item.rx_power || item.rxPower || item.signals || item.optical_power || undefined,
                name: item.ont_name || item.Name || item.name || item.onu_name || item.alias || undefined,
                description,
                lastDownReason,
                lastDownTime: item.last_d_time || undefined,
                lastUpTime: item.last_u_time || undefined
            };
        });
    }

    async getOnuDetails(ponId: string, onuId: string): Promise<OnuInfo | null> {
        const list = await this.getOnuList();
        return list.find(o => o.ponId === ponId && o.onuId === onuId) || null;
    }

    async rebootOnu(ponId: string, onuId: string): Promise<boolean> {
        const protocol = this.config.protocol || (this.config.port === 443 ? 'https' : 'http');
        const baseUrl = `${protocol}://${this.config.host}:${this.config.port}`;

        try {
            const { token } = await this.loginModern(baseUrl);
            if (!token) {
                // Try legacy reboot if modern fails
                const username = this.config.username || 'admin';
                const password = this.config.password || '';
                const auth = Buffer.from(`${username}:${password}`).toString('base64');
                
                const res = await fetch(`${baseUrl}/cgi-bin/v2/onu_reboot.cgi?pon_id=${ponId}&onu_id=${onuId}`, {
                    method: 'GET',
                    headers: { 'Authorization': `Basic ${auth}` },
                    signal: AbortSignal.timeout(20000)
                }).catch(() => null);

                return !!(res && res.ok);
            }

            // Modern API Reboot
            const payload = {
                method: "set",
                param: {
                    pon_id: parseInt(ponId),
                    onu_id: parseInt(onuId)
                }
            };

            const response = await fetch(`${baseUrl}/gponont_mgmt?form=reboot`, {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: { 
                    'Content-Type': 'application/json',
                    'x-token': token
                },
                signal: AbortSignal.timeout(20000)
            });

            if (response.ok) {
                const data = await response.json() as any;
                return data.code === 1;
            }

            return false;
        } catch (error) {
            logger.error({ err: error, ponId, onuId }, 'HSGQ Reboot failed');
            return false;
        }
    }
}
