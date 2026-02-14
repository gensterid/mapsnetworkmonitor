import { BaseOltDriver, OnuInfo } from './olt-driver.interface.js';
import { Telnet } from 'telnet-client';

export class CDataDriver extends BaseOltDriver {
    private connection: any;

    constructor(config: any) {
        super(config);
        this.connection = new Telnet();
    }

    async connect(): Promise<void> {
        const params = {
            host: this.config.host,
            port: this.config.port || 23,
            username: this.config.username,
            password: this.config.password,
            timeout: this.config.timeout || 10000,
            loginPrompt: /Login:|User Name:/i,
            passwordPrompt: /Password:/i,
            shellPrompt: />|#|OLT/i, // Adjust based on actual C-Data prompt
            initialLFCR: true
        };

        try {
            await this.connection.connect(params);
            // Enable privileged mode if necessary
            // await this.connection.exec('enable'); 
            this.connected = true;
        } catch (error) {
            console.error('C-Data Connection failed:', error);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        if (this.connected) {
            await this.connection.end();
            this.connected = false;
        }
    }

    async getOnuList(): Promise<OnuInfo[]> {
        if (!this.connected) await this.connect();

        try {
            // Placeholder command for C-Data
            // e.g. "show onu info all"
            const output = await this.connection.exec('show onu info all');

            console.log('C-Data ONU List Output:', output);

            // Returning raw output as the only element in the array for debugging
            return [output as any];
        } catch (error) {
            console.error('Failed to get ONU list:', error);
            throw error;
        }
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
