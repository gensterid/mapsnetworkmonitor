import {
    BaseOltProvisioningDriver,
    OltProvisioningCapabilities,
    UnconfiguredOnu,
    UnconfiguredDiscovery,
    RegisteredOnu,
    ModifyOptions,
    OnuRef,
    ProvisioningPreset,
    ProvisionPlan,
    ProvisionStep,
    ProvisionResult,
    assertCliSafe,
} from './olt-provisioning.interface.js';
import { TelnetOltClient, probeTelnetExec, runTelnetCommands } from './telnet-olt.client.js';
import { logger } from '../../lib/logger.js';

/**
 * Provisioning C-Data via Telnet CLI (dialek modern "V3.0" / gaya IOS: `OLT#`).
 *
 * STATUS:
 *  - `planAuthorize()` NYATA — perintah CLI persis dari preset, tanpa koneksi.
 *  - Slice B: `connect`/`testConnection`/`getUnconfiguredOnus` diwire ke Telnet
 *    (READ-ONLY — hanya `show ont autofind all`, tak mengubah config OLT).
 *  - Slice C: `authorizeOnu` masih stub (tulis-live) — belum diaktifkan.
 *
 * Catatan riset:
 *  - ACS URL TIDAK bisa via CLI C-Data (`canPushAcsUrl: false`) → DHCP opt43/ONT.
 *  - `ont-srvprofile … ont-port eth adaptive` → 1 profil melayani semua merk ONU.
 *  - GPON authorize by SN; EPON by MAC. Skeleton menargetkan GPON dulu.
 */
export class CDataProvisioningDriver extends BaseOltProvisioningDriver {
    readonly capabilities: OltProvisioningCapabilities = {
        transport: 'cli',
        canDiscoverUnconfigured: true,
        canAuthorize: true,
        canPushAcsUrl: false, // ACS URL via DHCP opt43 / manual ONT — bukan CLI
        canSetWan: true,
        canDeprovision: true,
        notes: 'Telnet V3.0 (GPON sn-auth). ont-port adaptive = 1 profil semua merk ONU. ACS di luar OLT.',
    };

    private telnet: TelnetOltClient | null = null;

    /**
     * DRY-RUN murni: bangun perintah persis tanpa koneksi/tulis. AMAN.
     * Wajib ditampilkan & dikonfirmasi operator sebelum authorizeOnu().
     */
    async planAuthorize(onu: OnuRef, preset: ProvisioningPreset): Promise<ProvisionPlan> {
        const warnings: string[] = [];

        if (!onu.sn) warnings.push('SN ONU kosong — GPON authorize butuh `sn-auth <SN>`.');
        if (onu.onuId === undefined) warnings.push('onuId (index target) kosong — isi dari getUnconfiguredOnus().');
        if (!preset.lineProfile || !preset.serviceProfile) {
            warnings.push('lineProfile/serviceProfile belum diisi — C-Data butuh id profil numerik yang sudah ada di OLT.');
        }
        if (preset.acsUrl) {
            warnings.push('acsUrl di preset TIDAK dipush via C-Data CLI (canPushAcsUrl=false). Suntik via DHCP option 43 atau web ONT.');
        }
        if (preset.wanMode === 'pppoe') {
            warnings.push('wanMode=pppoe: C-Data OLT umumnya bridge/VLAN; PPPoE di router pelanggan/TR-069. Verifikasi di unit.');
        }
        warnings.push('Sesi otomatis masuk privileged (`enable`) sebelum perintah di bawah. Idempoten: SN dicek dulu.');

        return {
            onu,
            presetName: preset.name,
            transport: 'cli',
            steps: this.buildAuthorizeCommands(onu, preset),
            warnings,
            requiresSave: true,
        };
    }

    /** Pecah ponId "0/0/2" → { fs:"0/0", port:"2" }. Autofind memberi F/S/P. */
    private splitPon(ponId: string): { fs: string; port: string } {
        const parts = (ponId || '').split('/').filter(Boolean);
        if (parts.length >= 3) return { fs: `${parts[0]}/${parts[1]}`, port: parts[2] as string };
        if (parts.length === 2) return { fs: `${parts[0]}/${parts[1]}`, port: '' };
        return { fs: ponId || '', port: '' };
    }

    /**
     * Susun perintah authorize FD16xx (dikonfirmasi dari manual + CLI live).
     * `enable` TIDAK di sini — executor (`runTelnetCommands`) yang masuk privileged.
     * `ont add <port> <ont-id> sn-auth <SN> ont-lineprofile-id <L> ont-srvprofile-id
     * <S>` di mode config-gpon; service-port di config; `save` persist.
     */
    private buildAuthorizeCommands(onu: OnuRef, preset: ProvisioningPreset): ProvisionStep[] {
        const { fs, port } = this.splitPon(onu.ponId || '');
        // Guard anti-injection: setiap nilai yang masuk baris perintah divalidasi.
        const fsSafe = assertCliSafe(fs || '<F/S>', 'ponId');
        const portSafe = assertCliSafe(port || '<port>', 'ponPort');
        const ontId = assertCliSafe(onu.onuId ?? '<ont-id>', 'onuId');
        const sn = assertCliSafe(onu.sn ?? '<SN>', 'sn');
        const line = assertCliSafe(preset.lineProfile ?? '<line-profile-id>', 'lineProfile');
        const srv = assertCliSafe(preset.serviceProfile ?? '<srv-profile-id>', 'serviceProfile');
        const vlan = preset.serviceVlan;

        return [
            { description: 'Masuk global config', command: 'config' },
            { description: `Masuk interface GPON ${fsSafe}`, command: `interface gpon ${fsSafe}` },
            {
                description: `Authorize ONT (port ${portSafe}, id ${ontId}) by SN + bind profil L${line}/S${srv}`,
                command: `ont add ${portSafe} ${ontId} sn-auth ${sn} ont-lineprofile-id ${line} ont-srvprofile-id ${srv}`,
            },
            { description: 'Kembali ke config', command: 'exit' },
            {
                description: `Map service-port VLAN ${vlan} (transparan) untuk ONT ${ontId}`,
                command: `service-port autoindex vlan ${vlan} gpon ${fsSafe} port ${portSafe} ont ${ontId} gemport 1 multi-service user-vlan ${vlan} tag-action transparent`,
            },
            { description: 'Kembali ke privileged', command: 'end' },
            { description: 'Simpan konfigurasi (persist lintas-reboot)', command: 'save' },
        ];
    }

    // ---- Slice B: transport Telnet (READ-ONLY) ----

    async connect(): Promise<void> {
        this.telnet = new TelnetOltClient();
        await this.telnet.connect(this.config);
    }

    async disconnect(): Promise<void> {
        if (this.telnet) {
            await this.telnet.close();
            this.telnet = null;
        }
    }

    async testConnection(): Promise<{ success: boolean; error?: string }> {
        try {
            // connect() resolve = login + shellPrompt cocok. Cukup itu; JANGAN
            // jalankan perintah berat (autofind bisa paginasi `--More--` →
            // "response not received" walau login sebetulnya sukses).
            await this.connect();
            return { success: true };
        } catch (e: any) {
            return { success: false, error: e?.message || 'Koneksi Telnet gagal' };
        } finally {
            await this.disconnect();
        }
    }

    /**
     * READ-ONLY: daftar ONU yang colok fisik tapi belum ter-authorize.
     * Hanya menjalankan `show ont autofind all` (tak mengubah config OLT).
     */
    async getUnconfiguredOnus(): Promise<UnconfiguredOnu[]> {
        return (await this.getUnconfiguredDetailed()).onus;
    }

    /**
     * READ-ONLY + diagnostik: hasil parse SERTA teks mentah `show ont autofind
     * all`. Satu sesi Telnet. Teks mentah dipakai laporan lapangan/kalibrasi
     * parser (bila `parseAutofind` belum tepat, `onus` bisa kosong tapi `raw`
     * tetap memperlihatkan output asli OLT).
     */
    async getUnconfiguredDetailed(): Promise<UnconfiguredDiscovery> {
        // FD1602S-B1: `show ont autofind all` HANYA ada di mode privileged (`#`).
        // Pakai raw-exec (login → enable → command) — telnet-client tak bisa masuk
        // privileged & kepentok pager di device ini. enable-password = password
        // login (terbukti live). Perintah dijalankan di config-level, read-only.
        const raw = await probeTelnetExec({
            host: this.config.host,
            port: this.config.port ?? 23,
            username: this.config.username,
            password: this.config.password,
            enable: true,
            enablePassword: this.config.password,
            command: 'show ont autofind all',
        });
        const onus = this.parseAutofind(raw);
        logger.info({ host: this.config.host, count: onus.length }, 'C-Data provisioning: autofind list');
        return { onus, raw };
    }

    /**
     * Parser output `show ont autofind all` (C-Data FD16xx) — format BLOK berlabel
     * (dikonfirmasi dari manual). Contoh satu blok:
     *   Number: 1
     *   Frame/Slot : 0/0
     *   Port : 2
     *   Logic ID: 1
     *   Ont SN: DD16B3551CD3
     *   Password: 12345678
     *   Vendor ID : xPON
     *   Last autofind time: Sat Jan 1 10:15:36 2000
     * Parse per-LABEL (bukan regex SN longgar) agar tak salah tangkap Loid/hex
     * lain, dan ponId = Frame/Slot + Port (mis. "0/0/2"). Blok dipisah "Number:".
     */
    private parseAutofind(output: string): UnconfiguredOnu[] {
        // Status eksplisit → daftar kosong (bukan gagal parse).
        if (/no\s+ont\s+available/i.test(output)) return [];

        const onus: UnconfiguredOnu[] = [];
        let cur: {
            frameSlot?: string;
            port?: string;
            sn?: string;
            suggestedOnuId?: string;
            vendorModel?: string;
            password?: string;
            discoveredAt?: string;
            raw: string[];
        } = { raw: [] };

        const flush = () => {
            if (cur.sn) {
                const ponId = cur.frameSlot
                    ? cur.port
                        ? `${cur.frameSlot}/${cur.port}`
                        : cur.frameSlot
                    : cur.port || '';
                onus.push({
                    ponId,
                    sn: cur.sn,
                    suggestedOnuId: cur.suggestedOnuId,
                    vendorModel: cur.vendorModel,
                    password: cur.password,
                    discoveredAt: cur.discoveredAt,
                    raw: cur.raw.join('\n').trim(),
                });
            }
            cur = { raw: [] };
        };

        const grab = (line: string, re: RegExp): string | undefined => line.match(re)?.[1]?.trim();

        for (const line of output.split(/\r?\n/)) {
            if (/^\s*Number\s*:/i.test(line)) flush(); // penanda blok baru
            cur.raw.push(line);

            const sn = grab(line, /Ont\s*SN\s*:\s*(\S+)/i);
            if (sn) cur.sn = sn; // token pertama = SN (hex/string), buang catatan
            const fs = grab(line, /Frame\/Slot\s*:\s*([\d/]+)/i);
            if (fs) cur.frameSlot = fs;
            const port = grab(line, /^\s*Port\s*:\s*(\d+)/i);
            if (port) cur.port = port;
            const logic = grab(line, /Logic\s*ID\s*:\s*(\d+)/i);
            if (logic) cur.suggestedOnuId = logic;
            const vendor = grab(line, /Vendor\s*ID\s*:\s*(\S+)/i);
            if (vendor) cur.vendorModel = vendor;
            const pw = grab(line, /^\s*Password\s*:\s*(\S+)/i);
            if (pw) cur.password = pw;
            const t = grab(line, /Last\s*autofind\s*time\s*:\s*(.+)/i);
            if (t) cur.discoveredAt = t;
        }
        flush(); // blok terakhir
        return onus;
    }

    // ---- Slice C: tulis-live (authorize) ----

    /**
     * Parse `show ont info <port> all` → daftar { ontId, sn } yang SUDAH
     * ter-authorize di port itu. Format data (dikonfirmasi manual):
     *   0/0 2 1 TPLGCAF02E40 Active Online failed mismatch
     *   <F>/<S> <port> <ont-id> <SN> <control> <run> ...
     * Dipakai cek idempotensi (SN sudah ada?) & tabrakan ont-id.
     */
    private parseOntInfo(output: string): { ontId: string; sn: string }[] {
        const rows: { ontId: string; sn: string }[] = [];
        for (const line of output.split(/\r?\n/)) {
            const m = line.match(/^\s*\d+\/\d+\s+\d+\s+(\d+)\s+([A-Za-z0-9-]{6,20})\b/);
            if (m) rows.push({ ontId: m[1] as string, sn: m[2] as string });
        }
        return rows;
    }

    /**
     * TULIS-LIVE: authorize satu ONU by SN + bind profil + service-port + save.
     * Idempoten & aman-tabrakan:
     *  1. Baca `show ont info <port> all` — bila SN sudah ada → alreadyProvisioned;
     *     bila ont-id target dipakai SN lain → tolak (jangan timpa ONT live).
     *  2. Jalankan deret perintah dalam SATU sesi (config→gpon→ont add→service-port
     *     →save) via executor (login+enable otomatis).
     *  3. Verifikasi dari transkrip perintah `ont add`.
     * WAJIB dipanggil hanya SETELAH operator mengonfirmasi preview (planAuthorize).
     */
    async authorizeOnu(onu: OnuRef, preset: ProvisioningPreset): Promise<ProvisionResult> {
        if (!onu.sn) throw new Error('SN wajib untuk authorize GPON.');
        if (onu.onuId === undefined) throw new Error('onuId (nomor ONT target) wajib diisi.');
        const { fs, port } = this.splitPon(onu.ponId || '');
        if (!fs || !port) throw new Error(`ponId tidak lengkap (butuh F/S/port, mis 0/0/2): "${onu.ponId}"`);
        if (!preset.lineProfile || !preset.serviceProfile) {
            throw new Error('Preset butuh lineProfile & serviceProfile (id numerik yang sudah ada di OLT).');
        }

        const conn = {
            host: this.config.host,
            port: this.config.port ?? 23,
            username: this.config.username,
            password: this.config.password,
            enable: true,
            enablePassword: this.config.password,
        };

        const fsSafe = assertCliSafe(fs, 'ponFS');
        const portSafe = assertCliSafe(port, 'ponPort');

        // 1. Idempotensi + cek tabrakan — FAIL-CLOSED. Baca `show ont info` via
        //    executor (punya `reachedShell`). Bila login/telnet gagal ATAU output
        //    tak dikenali (tak ada "Total:" / ada "%") → TOLAK, JANGAN menulis buta
        //    (mencegah menimpa ONT live saat baca gagal — CRITICAL).
        const readSession = await runTelnetCommands({
            ...conn,
            commands: ['config', `interface gpon ${fsSafe}`, `show ont info ${portSafe} all`, 'end'],
        });
        if (!readSession.reachedShell) {
            return { success: false, onu, appliedSteps: 0, error: 'Gagal login/telnet ke OLT saat verifikasi status port — dibatalkan (tidak menulis).' };
        }
        const infoOut = readSession.outputs.find((o) => o.command.startsWith('show ont info'))?.output ?? '';
        if (!/total\s*:/i.test(infoOut) || /%/.test(infoOut)) {
            return {
                success: false,
                onu,
                appliedSteps: 0,
                error: `Verifikasi status port gagal (output tak dikenali) — dibatalkan demi keamanan: ${infoOut.replace(/\s+/g, ' ').trim().slice(0, 200) || '(kosong)'}`,
            };
        }
        const existing = this.parseOntInfo(infoOut);
        const snUpper = onu.sn.toUpperCase();
        const sameSn = existing.find((e) => e.sn.toUpperCase() === snUpper);
        if (sameSn) {
            return {
                success: true,
                onu: { ...onu, onuId: sameSn.ontId },
                appliedSteps: 0,
                alreadyProvisioned: true,
                message: `SN ${onu.sn} sudah ter-authorize (ONT-ID ${sameSn.ontId}) di port ${port}. Tidak diubah.`,
            };
        }
        const idClash = existing.find((e) => Number(e.ontId) === Number(onu.onuId));
        if (idClash) {
            return {
                success: false,
                onu,
                appliedSteps: 0,
                error: `ONT-ID ${onu.onuId} di port ${port} sudah dipakai SN lain (${idClash.sn}). Pilih ont-id lain agar tak menimpa ONT live.`,
            };
        }

        // 2. Eksekusi deret perintah (satu sesi privileged).
        const commands = this.buildAuthorizeCommands(onu, preset).map((s) => s.command as string);
        const session = await runTelnetCommands({ ...conn, commands });

        if (!session.reachedShell) {
            return { success: false, onu, appliedSteps: 0, error: 'Gagal login/enable ke OLT saat authorize.' };
        }

        // 3. Verifikasi dari output perintah `ont add`.
        const addOut = session.outputs.find((o) => o.command.startsWith('ont add'))?.output ?? '';
        const failed = /%|error|fail|invalid|incomplete|already\s+exist/i.test(addOut);
        const succeeded = /successfully|ONT\s+online|\bonline\b/i.test(addOut);
        if (failed || !succeeded) {
            return {
                success: false,
                onu: { ...onu },
                appliedSteps: session.outputs.length,
                error: `Authorize gagal/tak pasti. Output "ont add": ${addOut.replace(/\s+/g, ' ').trim().slice(0, 300) || '(kosong)'}`,
            };
        }

        return {
            success: true,
            onu: { ...onu },
            appliedSteps: commands.length,
            message: `ONT ${onu.sn} ter-authorize (ONT-ID ${onu.onuId}) di port ${port}.${session.completed ? '' : ' (sesi terputus sebelum save — verifikasi manual.)'}`,
        };
    }

    // ---- Modify (mode auto-auth): ubah profil/VLAN ONT teregister by SN ----

    /** Param koneksi telnet dari config driver (reuse read+write, selalu enable). */
    private conn() {
        return {
            host: this.config.host,
            port: this.config.port ?? 23,
            username: this.config.username,
            password: this.config.password,
            enable: true,
            enablePassword: this.config.password,
        };
    }

    /**
     * READ-ONLY: daftar ONT yang SUDAH teregister (semua port) via `show ont info
     * all`. Untuk mode auto-auth: ONU sudah auto-config, lalu diubah by SN.
     */
    async getRegisteredOnus(): Promise<RegisteredOnu[]> {
        const session = await runTelnetCommands({ ...this.conn(), commands: ['config', 'show ont info all', 'end'] });
        if (!session.reachedShell) throw new Error('Gagal login/telnet ke OLT.');
        const out = session.outputs.find((o) => o.command.startsWith('show ont info'))?.output ?? '';
        if (!/total\s*:/i.test(out)) {
            throw new Error(`Output "show ont info all" tak dikenali: ${out.replace(/\s+/g, ' ').trim().slice(0, 200) || '(kosong)'}`);
        }
        return this.parseRegistered(out);
    }

    /** Parse tabel `show ont info all`: `F/S P ONT-ID SN Control Run …`. */
    private parseRegistered(output: string): RegisteredOnu[] {
        const rows: RegisteredOnu[] = [];
        for (const line of output.split(/\r?\n/)) {
            const m = line.match(/^\s*(\d+\/\d+)\s+(\d+)\s+(\d+)\s+([A-Za-z0-9-]{6,20})(?:\s+\S+\s+(\S+))?/);
            if (m) rows.push({ ponId: `${m[1]}/${m[2]}`, onuId: m[3] as string, sn: m[4] as string, runState: m[5] });
        }
        return rows;
    }

    /** DRY-RUN: perintah modify (rebind profil, opsional VLAN/label). AMAN. */
    async planModify(target: OnuRef, preset: ProvisioningPreset, opts: ModifyOptions = {}): Promise<ProvisionPlan> {
        const warnings: string[] = [];
        if (target.onuId === undefined) warnings.push('onuId target kosong.');
        if (!preset.lineProfile || !preset.serviceProfile) warnings.push('lineProfile/serviceProfile preset kosong.');
        if (opts.updateVlan) warnings.push('updateVlan: service-port lama DIHAPUS lalu dibuat ulang — layanan ONT ini terputus sesaat.');
        warnings.push('Sesi otomatis masuk privileged (`enable`). SN↔ont-id diverifikasi dulu sebelum apply.');
        return {
            onu: target,
            presetName: preset.name,
            transport: 'cli',
            steps: this.buildModifyCommands(target, preset, opts),
            warnings,
            requiresSave: true,
        };
    }

    private buildModifyCommands(target: OnuRef, preset: ProvisioningPreset, opts: ModifyOptions): ProvisionStep[] {
        const { fs, port } = this.splitPon(target.ponId || '');
        const fsSafe = assertCliSafe(fs || '<F/S>', 'ponId');
        const portSafe = assertCliSafe(port || '<port>', 'ponPort');
        const ontId = assertCliSafe(target.onuId ?? '<ont-id>', 'onuId');
        const line = assertCliSafe(preset.lineProfile ?? '<line>', 'lineProfile');
        const srv = assertCliSafe(preset.serviceProfile ?? '<srv>', 'serviceProfile');
        const vlan = preset.serviceVlan;

        const steps: ProvisionStep[] = [
            { description: 'Masuk global config', command: 'config' },
            { description: `Masuk interface GPON ${fsSafe}`, command: `interface gpon ${fsSafe}` },
            {
                description: `Rebind ONT ${ontId} → line ${line} / srv ${srv}`,
                command: `ont modify ${portSafe} ${ontId} ont-lineprofile-id ${line} ont-srvprofile-id ${srv}`,
            },
        ];
        if (opts.description) {
            const desc = assertCliSafe(opts.description, 'description');
            steps.push({ description: 'Set label ONT', command: `ont description ${portSafe} ${ontId} ${desc}` });
        }
        steps.push({ description: 'Kembali ke config', command: 'exit' });
        if (opts.updateVlan) {
            steps.push({
                description: `Hapus service-port lama ONT ${ontId}`,
                command: `no service-port gpon ${fsSafe} port ${portSafe} ont ${ontId}`,
                destructive: true,
            });
            steps.push({
                description: `Set service-port VLAN ${vlan}`,
                command: `service-port autoindex vlan ${vlan} gpon ${fsSafe} port ${portSafe} ont ${ontId} gemport 1 multi-service user-vlan ${vlan} tag-action transparent`,
            });
        }
        steps.push({ description: 'Kembali ke privileged', command: 'end' });
        steps.push({ description: 'Simpan konfigurasi', command: 'save' });
        return steps;
    }

    /**
     * TULIS-LIVE: modify ONT teregister. FAIL-CLOSED: verifikasi SN↔ont-id target
     * benar-benar ada di port sebelum menulis (cegah salah-ONT).
     */
    async modifyOnu(target: OnuRef, preset: ProvisioningPreset, opts: ModifyOptions = {}): Promise<ProvisionResult> {
        if (!target.sn) throw new Error('SN target wajib.');
        if (target.onuId === undefined) throw new Error('onuId target wajib.');
        const { fs, port } = this.splitPon(target.ponId || '');
        if (!fs || !port) throw new Error(`ponId tidak lengkap (F/S/port): "${target.ponId}"`);
        if (!preset.lineProfile || !preset.serviceProfile) throw new Error('Preset butuh lineProfile & serviceProfile.');

        const conn = this.conn();
        const fsSafe = assertCliSafe(fs, 'ponFS');
        const portSafe = assertCliSafe(port, 'ponPort');

        // 1. FAIL-CLOSED: verifikasi SN↔ont-id target ada di port ini.
        const readSession = await runTelnetCommands({
            ...conn,
            commands: ['config', `interface gpon ${fsSafe}`, `show ont info ${portSafe} all`, 'end'],
        });
        if (!readSession.reachedShell) {
            return { success: false, onu: target, appliedSteps: 0, error: 'Gagal login/telnet ke OLT saat verifikasi — dibatalkan.' };
        }
        const infoOut = readSession.outputs.find((o) => o.command.startsWith('show ont info'))?.output ?? '';
        if (!/total\s*:/i.test(infoOut) || /%/.test(infoOut)) {
            return { success: false, onu: target, appliedSteps: 0, error: 'Verifikasi status port gagal (output tak dikenali) — dibatalkan.' };
        }
        const existing = this.parseOntInfo(infoOut);
        const match = existing.find((e) => Number(e.ontId) === Number(target.onuId) && e.sn.toUpperCase() === target.sn!.toUpperCase());
        if (!match) {
            return {
                success: false,
                onu: target,
                appliedSteps: 0,
                error: `ONT-ID ${target.onuId} dengan SN ${target.sn} tak ditemukan di port ${port}. Refresh daftar (mungkin sudah berubah).`,
            };
        }

        // 2. Eksekusi modify.
        const commands = this.buildModifyCommands(target, preset, opts).map((s) => s.command as string);
        const session = await runTelnetCommands({ ...conn, commands });
        if (!session.reachedShell) {
            return { success: false, onu: target, appliedSteps: 0, error: 'Gagal login saat modify.' };
        }

        // 3. Verifikasi: perintah `ont modify` terkirim & tanpa error (sukses = senyap).
        const modEntry = session.outputs.find((o) => o.command.startsWith('ont modify'));
        const modOut = modEntry?.output ?? '';
        if (!modEntry || /%|error|fail|invalid|not\s+exist/i.test(modOut)) {
            return {
                success: false,
                onu: target,
                appliedSteps: session.outputs.length,
                error: `Modify gagal/tak terkirim. Output "ont modify": ${modOut.replace(/\s+/g, ' ').trim().slice(0, 300) || '(kosong)'}`,
            };
        }

        return {
            success: true,
            onu: target,
            appliedSteps: commands.length,
            message: `ONT ${target.sn} (ID ${target.onuId}) di-rebind ke line ${preset.lineProfile}/srv ${preset.serviceProfile}${opts.updateVlan ? ` + VLAN ${preset.serviceVlan}` : ''}${opts.description ? ` (label "${opts.description}")` : ''}.${session.completed ? '' : ' (sesi terputus sebelum save — verifikasi.)'}`,
        };
    }
}
