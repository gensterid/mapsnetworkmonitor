import { BaseOltDriver, OnuInfo } from './olt-driver.interface.js';
import { Telnet } from 'telnet-client';

export class HsgqDriver extends BaseOltDriver {
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
            shellPrompt: />|#|HSGQ/i, // Adjust based on actual HSGQ prompt
            initialLFCR: true // Often needed for Telnet
        };

        try {
            await this.connection.connect(params);
            // Enable privileged mode if necessary (enable command)
            // await this.connection.exec('enable'); 
            this.connected = true;
        } catch (error) {
            console.error('HSGQ Connection failed:', error);
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
            // Placeholder command - replace with actual HSGQ command
            // e.g. "show onu all" or "show onu info"
            const output = await this.connection.exec('show onu all');

            // Parse output here
            // This is highly dependent on the output format of "show onu all"
            console.log('HSGQ ONU List Output:', output);

            // Returning raw output as the only element in the array for debugging
            return [output as any];
        } catch (error) {
            console.error('Failed to get ONU list:', error);
            throw error;
        }
    }

    async getOnuDetails(ponId: string, onuId: string): Promise<OnuInfo | null> {
        // Placeholder
        return null;
    }

    async rebootOnu(ponId: string, onuId: string): Promise<boolean> {
        if (!this.connected) await this.connect();
        try {
            // e.g. "reboot onu <ponId> <onuId>"
            await this.connection.exec(`reboot onu ${ponId} ${onuId}`);
            return true;
        } catch (error) {
            console.error('Failed to reboot ONU:', error);
            return false;
        }
    }
}
