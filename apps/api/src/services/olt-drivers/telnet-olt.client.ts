import { Telnet } from 'telnet-client';
import { OltDriverConfig } from './olt-driver.interface.js';

/**
 * Wrapper tipis `telnet-client` untuk CLI OLT (C-Data dll). Prompt device
 * (OLT#/OLT>/(config)#) dideteksi via shellPrompt. Login user/pass ditangani
 * telnet-client. Dipakai driver provisioning (Slice B baca, Slice C tulis).
 *
 * Buat instance BARU per sesi (connect→exec→close); jangan pakai ulang setelah
 * close.
 */
export class TelnetOltClient {
    private conn = new Telnet();
    private connected = false;

    async connect(config: OltDriverConfig): Promise<void> {
        try {
            await this.conn.connect({
                host: config.host,
                port: config.port || 23,
                username: config.username,
                password: config.password,
                // Prompt device: baris berakhiran # (privileged) atau > (user).
                shellPrompt: /[#>]\s*$/,
                loginPrompt: /login[: ]*$/i,
                passwordPrompt: /assword[: ]*$/i,
                timeout: config.timeout ?? 8000,
                execTimeout: 10000,
                sendTimeout: 8000,
                // Device CLI sering tak menuntut negosiasi Telnet penuh.
                negotiationMandatory: false,
                ors: '\r\n',
                stripShellPrompt: true,
            });
            this.connected = true;
        } catch (err) {
            // telnet-client bisa reject SETELAH socket terbuka (mis. 'Failed login'
            // saat kredensial salah). Socket menggantung → banyak OLT hanya izinkan
            // 1 sesi telnet, bisa self-DoS. Tutup paksa sebelum melempar.
            try {
                await this.conn.destroy();
            } catch {
                /* abaikan */
            }
            throw err;
        }
    }

    async exec(command: string): Promise<string> {
        if (!this.connected) throw new Error('Telnet belum terkoneksi');
        return this.conn.exec(command, { execTimeout: 10000 });
    }

    async close(): Promise<void> {
        // JANGAN gate di `connected`: bila connect() gagal setelah socket terbuka,
        // `connected` masih false padahal socket perlu ditutup. Selalu coba tutup.
        this.connected = false;
        try {
            await this.conn.end();
        } catch {
            try {
                await this.conn.destroy();
            } catch {
                /* abaikan error saat menutup */
            }
        }
    }
}
