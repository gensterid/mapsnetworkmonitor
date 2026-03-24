import snmp from 'net-snmp';
import { logger } from '../lib/logger.js';

export interface SnmpConfig {
    host: string;
    port?: number;
    community?: string;
    version?: number;
    // SNMP v3 specific settings
    username?: string;
    securityLevel?: number;
    authProtocol?: number;
    authKey?: string;
    privProtocol?: number;
    privKey?: string;
}

export interface SnmpOidResult {
    oid: string;
    value: any;
    type: number;
}

export class SnmpService {
    private static instance: SnmpService;

    // SNMP Protocol Constants (matching net-snmp)
    public static readonly Version1 = 0;
    public static readonly Version2c = 1;
    public static readonly Version3 = 3;

    public static readonly SecurityLevel = {
        noAuthNoPriv: 1,
        authNoPriv: 2,
        authPriv: 3
    };

    public static readonly AuthProtocols = {
        none: 1,
        md5: 2,
        sha: 3
    };

    public static readonly PrivProtocols = {
        none: 1,
        des: 2,
        aes: 3,
        aes256b: 4,
        aes256r: 5
    };

    private constructor() { }

    public static getInstance(): SnmpService {
        if (!SnmpService.instance) {
            SnmpService.instance = new SnmpService();
        }
        return SnmpService.instance;
    }

    /**
     * Sanitize target host and extract port if present
     */
    private sanitizeTarget(host: string, defaultPort: number = 161): { host: string; port: number } {
        if (!host) return { host: '', port: defaultPort };
        
        let targetHost = host.trim();
        let targetPort = defaultPort;

        // Handle case where host contains port (e.g. "id.genster.net:3030")
        if (targetHost.includes(':')) {
            const parts = targetHost.split(':');
            targetHost = parts[0].trim();
            const parsedPort = parseInt(parts[1], 10);
            if (!isNaN(parsedPort)) {
                targetPort = parsedPort;
            }
        }

        return { host: targetHost, port: targetPort };
    }

    /**
     * Create a new SNMP session
     */
    private createSession(config: SnmpConfig) {
        const { host, port } = this.sanitizeTarget(config.host, config.port || 161);
        const version = config.version ?? snmp.Version2c;

        const options = {
            port: port,
            timeout: 10000,
            retries: 3
        };

        if (version === 3) {
            const user = {
                name: config.username || 'admin',
                level: config.securityLevel || SnmpService.SecurityLevel.authNoPriv,
                authProtocol: config.authProtocol || SnmpService.AuthProtocols.sha,
                authKey: config.authKey || '',
                privProtocol: config.privProtocol || SnmpService.PrivProtocols.none,
                privKey: config.privKey || ''
            };
            return snmp.createV3Session(host, user, { ...options, version: 3 } as any);
        } else {
            return snmp.createSession(host, config.community || 'public', { ...options, version: version } as any);
        }
    }

    /**
     * Get a single OID value
     */
    public async get(config: SnmpConfig, oid: string): Promise<SnmpOidResult> {
        return new Promise((resolve, reject) => {
            let session: any;
            try {
                session = this.createSession(config);
                session.get([oid], (error: any, varbinds: any) => {
                    session.close();
                    if (error) {
                        reject(error);
                    } else {
                        if (!varbinds || varbinds.length === 0) {
                            reject(new Error('No varbinds returned'));
                            return;
                        }
                        if (snmp.isVarbindError(varbinds[0])) {
                            reject(snmp.varbindError(varbinds[0]));
                        } else {
                            resolve({
                                oid: varbinds[0].oid,
                                value: varbinds[0].value,
                                type: varbinds[0].type || snmp.ObjectType.Null
                            });
                        }
                    }
                });
            } catch (err) {
                if (session) session.close();
                reject(err);
            }
        });
    }

    /**
     * Get multiple OID values
     */
    public async getMultiple(config: SnmpConfig, oids: string[]): Promise<SnmpOidResult[]> {
        return new Promise((resolve, reject) => {
            let session: any;
            try {
                session = this.createSession(config);
                session.get(oids, (error: any, varbinds: any) => {
                    session.close();
                    if (error) {
                        reject(error);
                    } else {
                        if (!varbinds) {
                            resolve([]);
                            return;
                        }
                        const results: SnmpOidResult[] = [];
                        for (const vb of varbinds) {
                            if (snmp.isVarbindError(vb)) {
                                logger.warn({ oid: vb.oid, err: snmp.varbindError(vb) }, 'SNMP Error for OID');
                            } else {
                                results.push({
                                    oid: vb.oid,
                                    value: vb.value,
                                    type: vb.type || snmp.ObjectType.Null
                                });
                            }
                        }
                        resolve(results);
                    }
                });
            } catch (err) {
                if (session) session.close();
                reject(err);
            }
        });
    }

    /**
     * Walk a subtree
     */
    public async walk(config: SnmpConfig, oid: string): Promise<SnmpOidResult[]> {
        return new Promise((resolve, reject) => {
            let session: any;
            try {
                session = this.createSession(config);
                const results: SnmpOidResult[] = [];

                session.subtree(oid, (varbinds: any) => {
                    if (!varbinds) return;
                    for (const vb of varbinds) {
                        if (!snmp.isVarbindError(vb)) {
                            results.push({
                                oid: vb.oid,
                                value: vb.value,
                                type: vb.type || snmp.ObjectType.Null
                            });
                        }
                    }
                }, (error: any) => {
                    try {
                        session.close();
                    } catch (e) {
                        // Ignore already closed socket errors
                    }
                    
                    if (error) {
                        reject(error);
                    } else {
                        resolve(results);
                    }
                });
            } catch (err) {
                if (session) session.close();
                reject(err);
            }
        });
    }
}

export const snmpService = SnmpService.getInstance();

