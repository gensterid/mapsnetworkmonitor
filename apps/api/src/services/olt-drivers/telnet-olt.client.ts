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

/**
 * Tolak semua negosiasi opsi Telnet (WILL/WONT→DONT, DO/DONT→WONT) agar device
 * lanjut ke prompt login. Buang byte IAC dari data, balas penolakan via socket.
 */
function refuseTelnetOptions(data: Buffer, socket: net.Socket): Buffer {
    const clean: number[] = [];
    let i = 0;
    while (i < data.length) {
        if (data[i] === 0xff && i + 1 < data.length) {
            const cmd = data[i + 1];
            if (cmd >= 251 && cmd <= 254 && i + 2 < data.length) {
                const opt = data[i + 2];
                const reply = cmd === 251 || cmd === 252 ? 254 /* DONT */ : 252 /* WONT */;
                try {
                    socket.write(Buffer.from([0xff, reply, opt]));
                } catch {
                    /* abaikan */
                }
                i += 3;
                continue;
            }
            i += 2; // IAC + perintah 1-byte lain
            continue;
        }
        clean.push(data[i]);
        i += 1;
    }
    return Buffer.from(clean);
}

/**
 * DIAGNOSTIK: sesi Telnet mentah penuh — login manual (Username:/Password:),
 * kirim satu perintah, lalu dump SEMUA byte output apa adanya (auto-advance
 * pager dgn spasi). Reset buffer setelah perintah dikirim → dump hanya output
 * perintah (buang noise login). Untuk melihat pager/prompt/validitas perintah
 * persis saat `exec()` telnet-client gagal "response not received".
 */
export function probeTelnetExec(params: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    command: string;
    /** Masuk mode privileged (`enable`) sebelum menjalankan `command`. */
    enable?: boolean;
    /** Password enable (bila diminta). Sering sama dengan password login. */
    enablePassword?: string;
    timeoutMs?: number;
}): Promise<string> {
    const {
        host,
        port,
        username = '',
        password = '',
        command,
        enable = false,
        enablePassword = '',
        timeoutMs = 15000,
    } = params;
    const PAGER = /(?:-{2,}\s*more)|(?:more\s*-{2,})|(?:press any key)/i;
    const LOGIN = /(?:user\s?name|login)[: ]*$/i;
    const PASS = /assword[: ]*$/i;
    return new Promise((resolve) => {
        let buf = Buffer.alloc(0);
        let done = false;
        let sentUser = false;
        let sentPass = false;
        let enableSent = false;
        let enablePassSent = false;
        let sentCmd = false;
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
        const write = (s: string) => {
            try {
                socket.write(s);
            } catch {
                /* abaikan */
            }
        };
        socket.setTimeout(2500, finish); // 2.5s hening → dump dianggap selesai
        socket.on('connect', () => write('\r\n'));
        socket.on('data', (raw) => {
            const chunk = refuseTelnetOptions(raw, socket);
            if (chunk.length === 0) return;
            buf = Buffer.concat([buf, chunk]);
            const tail = buf.toString('latin1').slice(-160);

            if (PAGER.test(tail)) {
                write(' '); // lanjut halaman pager
                return;
            }
            if (!sentUser && LOGIN.test(tail)) {
                sentUser = true;
                write(username + '\r\n');
                return;
            }
            if (sentUser && !sentPass && PASS.test(tail)) {
                sentPass = true;
                write(password + '\r\n');
                return;
            }
            if (sentPass && !sentCmd) {
                // Masuk privileged bila diminta: '>' → enable → (Password:) → '#'.
                if (enable && !enableSent && />\s*$/.test(tail)) {
                    enableSent = true;
                    write('enable\r\n');
                    return;
                }
                if (enable && enableSent && !enablePassSent && PASS.test(tail)) {
                    enablePassSent = true;
                    write(enablePassword + '\r\n');
                    return;
                }
                // Siap kirim perintah: mode enable tunggu '#', selain itu '>'/'#'.
                const ready = enable ? /#\s*$/.test(tail) : /[#>]\s*$/.test(tail);
                if (ready) {
                    sentCmd = true;
                    write(command + '\r\n');
                    buf = Buffer.alloc(0); // buang noise login; dump = output perintah saja
                    return;
                }
            }
            if (buf.length > 65536) finish();
        });
        socket.on('error', finish);
        socket.on('close', finish);
        setTimeout(finish, timeoutMs).unref(); // cap absolut
    });
}

/** Hasil satu perintah dalam sesi multi-perintah. */
export interface TelnetCommandOutput {
    command: string;
    output: string;
}

export interface TelnetSessionResult {
    /** Transkrip mentah seluruh sesi (login→enable→perintah→save). */
    transcript: string;
    /** Output per perintah (urut). */
    outputs: TelnetCommandOutput[];
    /** true bila berhasil login + sampai prompt shell. */
    reachedShell: boolean;
    /** true bila `commands` semua terkirim (tidak putus di tengah). */
    completed: boolean;
}

/**
 * Jalankan DERETAN perintah dalam SATU sesi telnet (login → enable → cmd1 →
 * cmd2 → …), menjaga konteks mode (config/config-gpon) antar perintah. Dipakai
 * jalur TULIS (authorize): telnet-client tak bisa privileged & sulit multi-mode.
 *
 * Prompt config/privileged (`OLT(config)#`, `OLT(config-gpon-0/0)#`, `OLT#`)
 * dideteksi via akhir `#`/`>`. Menangkap output tiap perintah untuk cek
 * sukses/gagal (mis. "successfully", "% ...", "already exist"). Auto-advance
 * pager. Tak menjalankan perintah destruktif — pemanggil yang menyusun daftar.
 */
export function runTelnetCommands(params: {
    host: string;
    port: number;
    username?: string;
    password?: string;
    enable?: boolean;
    enablePassword?: string;
    commands: string[];
    timeoutMs?: number;
}): Promise<TelnetSessionResult> {
    const {
        host,
        port,
        username = '',
        password = '',
        enable = false,
        enablePassword = '',
        commands,
        timeoutMs = 30000,
    } = params;
    const PAGER = /(?:-{2,}\s*more)|(?:more\s*-{2,})|(?:press any key)/i;
    const LOGIN = /(?:user\s?name|login)[: ]*$/i;
    const PASS = /assword[: ]*$/i;
    // Prompt shell/config: berakhiran # atau > (opsional diawali "(config…)").
    const PROMPT = /[)\w./-]*[#>]\s*$/;

    return new Promise((resolve) => {
        let full = '';
        let done = false;
        let stage: 'login' | 'enable' | 'run' = 'login';
        let sentUser = false;
        let sentPass = false;
        let enableSent = false;
        let enablePassSent = false;
        let reachedShell = false;
        let cmdIndex = -1; // perintah yang sedang ditunggu output-nya
        let cmdStart = 0; // offset `full` saat perintah dikirim
        const outputs: TelnetCommandOutput[] = [];
        const socket = net.createConnection({ host, port });

        const finish = () => {
            if (done) return;
            done = true;
            try {
                socket.destroy();
            } catch {
                /* abaikan */
            }
            resolve({
                transcript: full,
                outputs,
                reachedShell,
                completed: cmdIndex >= commands.length,
            });
        };
        const write = (s: string) => {
            try {
                socket.write(s);
            } catch {
                /* abaikan */
            }
        };
        const sendNext = () => {
            // Rekam output perintah sebelumnya (bila ada).
            if (cmdIndex >= 0 && cmdIndex < commands.length) {
                outputs[cmdIndex] = { command: commands[cmdIndex] as string, output: full.slice(cmdStart) };
            }
            cmdIndex += 1;
            if (cmdIndex >= commands.length) {
                write('exit\r\n'); // logout bersih
                setTimeout(finish, 800).unref();
                return;
            }
            cmdStart = full.length;
            write((commands[cmdIndex] as string) + '\r\n');
        };

        socket.setTimeout(4000, finish); // 4s hening → anggap selesai/macet
        socket.on('connect', () => write('\r\n'));
        socket.on('data', (raw) => {
            const chunk = refuseTelnetOptions(raw, socket);
            if (chunk.length === 0) return;
            full += chunk.toString('latin1');
            const tail = full.slice(-160);

            if (PAGER.test(tail)) {
                write(' ');
                return;
            }
            if (stage === 'login') {
                if (!sentUser && LOGIN.test(tail)) {
                    sentUser = true;
                    write(username + '\r\n');
                    return;
                }
                if (sentUser && !sentPass && PASS.test(tail)) {
                    sentPass = true;
                    write(password + '\r\n');
                    return;
                }
                if (sentPass && PROMPT.test(tail)) {
                    reachedShell = true;
                    if (enable && />\s*$/.test(tail)) {
                        stage = 'enable';
                        enableSent = true;
                        write('enable\r\n');
                        return;
                    }
                    stage = 'run';
                    full = ''; // buang jejak login/password dari transkrip (keamanan)
                    sendNext();
                    return;
                }
                return;
            }
            if (stage === 'enable') {
                if (!enablePassSent && PASS.test(tail)) {
                    enablePassSent = true;
                    write(enablePassword + '\r\n');
                    return;
                }
                if (/#\s*$/.test(tail)) {
                    stage = 'run';
                    full = ''; // buang jejak login/enable-password dari transkrip
                    sendNext();
                }
                return;
            }
            // stage === 'run': tunggu prompt kembali setelah tiap perintah.
            if (cmdIndex >= 0 && PROMPT.test(tail)) {
                sendNext();
            }
        });
        socket.on('error', finish);
        socket.on('close', finish);
        setTimeout(finish, timeoutMs).unref(); // cap absolut
    });
}
