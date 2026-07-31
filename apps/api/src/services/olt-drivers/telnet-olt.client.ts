import net from 'node:net';
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
                // C-Data/IOS-style pakai "Username:", bukan "login:". Cocokkan keduanya.
                loginPrompt: /(?:user\s?name|login)[: ]*$/i,
                passwordPrompt: /assword[: ]*$/i,
                timeout: config.timeout ?? 8000,
                execTimeout: 20000, // paginasi butuh beberapa putaran kirim-spasi
                sendTimeout: 8000,
                // Pager device (`--More--`, `Press any key`, dll). telnet-client
                // otomatis kirim spasi tiap kena pola ini → lanjut halaman.
                // Default lib hanya '---- More'; C-Data pakai bentuk lain.
                pageSeparator: /(?:-{2,}\s*more)|(?:more\s*-{2,})|(?:press any key)/i,
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
        return this.conn.exec(command, { execTimeout: 20000 });
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

/**
 * DIAGNOSTIK: buka socket TCP mentah, kirim CRLF untuk memancing prompt, lalu
 * kumpulkan byte awal yang dikirim device (banner + prompt login). Return string
 * 'latin1' apa adanya. Untuk kalibrasi prompt telnet tanpa menebak — mis. saat
 * `connect()` gagal "response not received" karena prompt tak cocok.
 */
export function probeTelnetBanner(host: string, port: number, timeoutMs = 4000): Promise<string> {
    return new Promise((resolve) => {
        let buf = Buffer.alloc(0);
        let done = false;
        const socket = net.createConnection({ host, port });
        const finish = () => {
            if (done) return;
            done = true;
            try {
                socket.destroy();
            } catch {
                /* abaikan */
            }
            resolve(buf.toString('latin1'));
        };
        socket.setTimeout(1500, finish); // 1.5s inaktivitas → banner dianggap selesai
        socket.on('connect', () => {
            try {
                socket.write('\r\n'); // pancing prompt bila device diam
            } catch {
                /* abaikan */
            }
        });
        socket.on('data', (d) => {
            buf = Buffer.concat([buf, d]);
            if (buf.length > 4096) finish();
        });
        socket.on('error', finish);
        socket.on('close', finish);
        setTimeout(finish, timeoutMs).unref(); // cap absolut, jangan tahan event loop
    });
}

/**
 * Ubah banner mentah jadi teks aman-tampil: pertahankan ASCII printable + CR/LF,
 * escape sisanya (termasuk byte negosiasi Telnet IAC 0xff) sebagai \xNN.
 */
export function sanitizeTelnetBanner(raw: string): string {
    // eslint-disable-next-line no-control-regex
    return raw.replace(/[^\x20-\x7e\r\n]/g, (c) => `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}
