import {
    BaseOltProvisioningDriver,
    OltProvisioningCapabilities,
    UnconfiguredOnu,
    UnconfiguredDiscovery,
    OnuRef,
    ProvisioningPreset,
    ProvisionPlan,
    ProvisionStep,
    ProvisionResult,
    ProvisioningNotSupportedError,
    assertCliSafe,
} from './olt-provisioning.interface.js';
import { TelnetOltClient, probeTelnetExec } from './telnet-olt.client.js';
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
        warnings.push('Arg `ont add`: urutan port/ont-id bisa beda per firmware — konfirmasi perintah sebelum apply.');

        return {
            onu,
            presetName: preset.name,
            transport: 'cli',
            steps: this.buildAuthorizeCommands(onu, preset),
            warnings,
            requiresSave: true,
        };
    }

    private buildAuthorizeCommands(onu: OnuRef, preset: ProvisioningPreset): ProvisionStep[] {
        // Guard anti-injection: setiap nilai yang masuk baris perintah divalidasi.
        const pon = assertCliSafe(onu.ponId || '<pon>', 'ponId');
        const ontId = assertCliSafe(onu.onuId ?? '<ont-id>', 'onuId');
        const sn = assertCliSafe(onu.sn ?? '<SN>', 'sn');
        const line = assertCliSafe(preset.lineProfile ?? '<line-profile-id>', 'lineProfile');
        const srv = assertCliSafe(preset.serviceProfile ?? '<srv-profile-id>', 'serviceProfile');
        const vlan = preset.serviceVlan;

        return [
            { description: 'Masuk privileged mode', command: 'enable' },
            { description: 'Masuk config', command: 'config' },
            { description: `Masuk interface PON ${pon}`, command: `interface gpon ${pon}` },
            {
                description: 'Authorize ONU by SN + bind profil (adaptive = semua merk)',
                command: `ont add ${ontId} sn-auth ${sn} ont-lineprofile-id ${line} ont-srvprofile-id ${srv}`,
            },
            {
                description: `Set native VLAN ${vlan} di UNI eth1`,
                command: `ont port native-vlan ${ontId} eth 1 vlan ${vlan}`,
            },
            { description: 'Keluar interface', command: 'exit' },
            {
                description: `Map service-port VLAN ${vlan} (bridge transparan)`,
                command: `service-port autoindex vlan ${vlan} gpon ${pon} port ${ontId} ont ${ontId} gemport 1 multi-service user-vlan ${vlan} tag-action transparent`,
            },
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

    // ---- Slice C: tulis-live (belum diaktifkan) ----

    async authorizeOnu(_onu: OnuRef, _preset: ProvisioningPreset): Promise<ProvisionResult> {
        // Sengaja belum eksekusi: cegah tulis-live sebelum diuji.
        // Gunakan planAuthorize() untuk pratinjau perintah persisnya.
        throw new ProvisioningNotSupportedError('CDataProvisioningDriver', 'authorizeOnu — Slice C belum diaktifkan (pakai planAuthorize untuk preview)');
    }
}
