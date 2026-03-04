import { BaseOltDriver, OnuInfo } from './olt-driver.interface.js';
import crypto from 'crypto';
import { logger } from '../../lib/logger.js';

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

        const MAX_RETRIES = 1; // Conservative retry to avoid overwhelming OLT
        let lastError: any = null;

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                if (attempt > 0) {
                    logger.info({ attempt, baseUrl }, 'C-Data: Retrying OLT connection...');
                    await new Promise(resolve => setTimeout(resolve, 2000)); // Short delay before retry
                }

                // 1. Try Modern API Path (/cgi-bin/h.cgi)
                try {
                    logger.info({ baseUrl, attempt }, 'C-Data: Attempting modern login');
                    const token = await this.loginModern(baseUrl);

                    if (token) {
                        logger.info('C-Data: Modern login successful, fetching ONU list');
                        const onuUrl = `${baseUrl}/cgi-bin/h.cgi?module=onu_list_get`;
                        const response = await fetch(onuUrl, {
                            headers: { 'token': token },
                            signal: AbortSignal.timeout(10000)
                        });

                        if (response.ok) {
                            const data = await response.json() as any;
                            if (data.code === 0) {
                                const items = data.data?.list || data.data || [];
                                if (items.length > 0) {
                                    logger.info({ keys: Object.keys(items[0]) }, 'C-Data: ONU list item keys');
                                    // Also log the first item raw to be sure
                                    logger.debug({ firstItem: items[0] }, 'C-Data: First ONU raw');
                                }
                                const onus = this.parseOnuData(data);
                                // Signal Enrichment
                                try {
                                    let optList: any[] = [];
                                    const endpoints = [
                                        'ont_optical_list_get',
                                        'ont_optical_get',
                                        'optical_power_list_get',
                                        'onu_optical_info_get',
                                        'onu_optical_list_get',
                                        'onu_optical_power_get',
                                        'onu_status_get',
                                        'onu_optical_power_list_get',
                                        'pon_optical_info_get',
                                        'diagnose_list_get',
                                        'port_optical_info_get',
                                        'onu_info_basic_rxpwr_get'
                                    ];

                                    for (const module of endpoints) {
                                        try {
                                            const optUrl = `${baseUrl}/cgi-bin/h.cgi?module=${module}`;
                                            const optResponse = await fetch(optUrl, { headers: { 'token': token }, signal: AbortSignal.timeout(4000) });
                                            if (optResponse.ok) {
                                                const optData = await optResponse.json() as any;
                                                logger.info({ module, code: optData.code, hasData: !!optData.data }, 'C-Data: Probing optical module');

                                                const list = optData.data?.list || optData.data || optData.info || optData.onus || (Array.isArray(optData) ? optData : []);
                                                if (Array.isArray(list) && list.length > 0) {
                                                    optList = list;
                                                    logger.info({ module, count: optList.length }, 'C-Data: Successful enrichment source found');
                                                    break;
                                                }
                                            }
                                        } catch (e) {
                                            logger.debug({ module, err: (e as any).message }, 'C-Data: Probe error');
                                        }
                                    }

                                    if (optList.length > 0) {
                                        logger.debug({ firstItemKeys: Object.keys(optList[0]) }, 'C-Data: Optical item keys');

                                        for (const onu of onus) {
                                            if (onu.status === 'online' && !onu.signal) {
                                                const opt = optList.find((it: any) => {
                                                    const itPonId = String(it.PonId ?? it.pon_id ?? it.PonID ?? it.pon_no ?? '');
                                                    const itOnuId = String(it.OnuId ?? it.onu_id ?? it.OnuID ?? it.onu_no ?? '');

                                                    return itOnuId === onu.onuId && (
                                                        itPonId === onu.ponId ||
                                                        onu.ponId.endsWith('/' + itPonId) ||
                                                        itPonId === onu.ponId.split('/').pop()
                                                    );
                                                });
                                                if (opt) {
                                                    onu.signal = this.formatSignal(opt.RxPower || opt.rx_power || opt.rx_optical_power || opt.Rx_Power || opt.OnuRxPwr || opt.OpticalPower || opt.OntRxPower);
                                                    if (onu.signal) {
                                                        logger.debug({ sn: onu.sn, signal: onu.signal }, 'C-Data: Signal enriched');
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    // [FALLBACK] If signal still missing, try legacy status endpoints even if modern login worked
                                    const missingSignal = onus.some(o => o.status === 'online' && !o.signal);
                                    if (missingSignal) {
                                        logger.info('C-Data: Signal missing after modern probes, trying legacy fallbacks');
                                        const legacyPaths = [
                                            '/cgi-bin/onu_status.cgi',
                                            '/api/onu/list',
                                            '/cgi-bin/system.cgi?module=onu_list'
                                        ];
                                        for (const path of legacyPaths) {
                                            try {
                                                const legacyRes = await fetch(`${baseUrl}${path}`, {
                                                    headers: { 'Authorization': `Basic ${auth}`, 'User-Agent': 'Mozilla/5.0' },
                                                    signal: AbortSignal.timeout(5000)
                                                });
                                                if (legacyRes.ok) {
                                                    const text = await legacyRes.text();
                                                    if (text.includes('{')) {
                                                        const legacyOnus = this.parseOnuData(JSON.parse(text));
                                                        for (const onu of onus) {
                                                            if (!onu.signal) {
                                                                const match = legacyOnus.find(lo => lo.sn === onu.sn || (lo.ponId === onu.ponId && lo.onuId === onu.onuId));
                                                                if (match?.signal) {
                                                                    onu.signal = match.signal;
                                                                    logger.debug({ sn: onu.sn, signal: onu.signal, source: path }, 'C-Data: Signal enriched via legacy');
                                                                }
                                                            }
                                                        }
                                                        if (onus.some(o => o.status === 'online' && o.signal)) break;
                                                    }
                                                }
                                            } catch (e) { }
                                        }
                                    }
                                } catch (e) {
                                    logger.error({ err: e }, 'C-Data: Optical power enrichment error');
                                }
                                return onus;
                            }
                        }
                    }
                } catch (e) {
                    lastError = e;
                }

                // 2. Comprehensive Legacy Probing
                const legacyEndpoints = [
                    '/api/onu/list',
                    '/cgi-bin/system.cgi?module=onu_list',
                    '/cgi-bin/onu_status.cgi',
                    '/cgi-bin/onu_mgmt.cgi',
                    '/cgi-bin/system.cgi',
                    '/onu_list.cgi',
                    '/api/v1/onu/status',
                    '/cgi-bin/h.cgi?module=onu_status_get'
                ];

                for (const path of legacyEndpoints) {
                    try {
                        const url = `${baseUrl}${path}`;
                        const response = await fetch(url, {
                            headers: { 'Authorization': `Basic ${auth}`, 'User-Agent': 'Mozilla/5.0' },
                            signal: AbortSignal.timeout(8000)
                        });

                        if (response.ok) {
                            const text = await response.text();
                            if (text.includes('redirect') || text.includes('login.cgi') || text.includes('<html')) continue;

                            try {
                                const data = JSON.parse(text);
                                const onus = this.parseOnuData(data);
                                if (onus && onus.length > 0) return onus;
                            } catch (e) { }
                        }
                    } catch (e: any) {
                        lastError = e;
                        continue;
                    }
                }
            } catch (e) {
                lastError = e;
            }
        }

        throw lastError || new Error(`C-Data OLT: All Web API endpoints failed after retries. Please check OLT model and Web Port.`);
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
            const signal = this.formatSignal(
                item.RxPower || item.rx_power || item.rxPower || item.rx_power_val ||
                item.optical_power || item.OpticalPower || item.ont_rx_power ||
                item.InputPower || item.receive_power || item.ReceivePower || item.rx_pwr || item.rx_optical_power ||
                item.OnuRxPwr || item.OnuRxPower || item.Rx_Power || item.OnuOpticalPower || item.OnuInputPower
            );

            return {
                ponId: String(item.PonId || item.pon_id || item.ponIndex || '0'),
                onuId: String(item.OnuId || item.onu_id || item.onuIndex || '0'),
                sn: item.PonSn || item.sn || item.mac || item.onu_sn || 'Unknown',
                macAddress: item.OnuMac || item.mac_addr || item.mac || undefined,
                status: status,
                signal: signal,
                name: item.OnuName || item.Name || item.name || item.onu_name || undefined,
                description: item.Description || item.OnuDesc || item.description || item.remark || item.onu_desc || undefined,
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
