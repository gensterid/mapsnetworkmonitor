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
import { TelnetOltClient } from './telnet-olt.client.js';
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
            await this.connect();
            // Perintah non-destruktif untuk memastikan login + CLI merespons.
            await this.telnet!.exec('show ont autofind all');
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
        try {
            await this.connect(); // di dalam try → disconnect tetap jalan bila connect gagal
            const raw = await this.telnet!.exec('show ont autofind all');
            const onus = this.parseAutofind(raw);
            logger.info({ host: this.config.host, count: onus.length }, 'C-Data provisioning: autofind list');
            return { onus, raw };
        } finally {
            await this.disconnect();
        }
    }

    /**
     * Parser best-effort output `show ont autofind all`. Mengekstrak SN + PON
     * dari tiap baris. TODO: kalibrasi dengan output unit sungguhan (kolom Index/
     * SN/Autofind-Time; MAC untuk EPON).
     */
    private parseAutofind(output: string): UnconfiguredOnu[] {
        const onus: UnconfiguredOnu[] = [];
        // SN GPON: 4 huruf vendor + 8 hex (mis. HWTC1234ABCD) atau 16 hex.
        const snRe = /\b([A-Z]{4}[0-9A-Fa-f]{8}|[0-9A-Fa-f]{16})\b/;
        const ponRe = /\b(\d+\/\d+(?:\/\d+)?)\b/;

        for (const line of output.split(/\r?\n/)) {
            const sn = line.match(snRe)?.[1];
            if (!sn) continue;
            onus.push({
                ponId: line.match(ponRe)?.[1] || '',
                sn,
                raw: line.trim(),
            });
        }
        return onus;
    }

    // ---- Slice C: tulis-live (belum diaktifkan) ----

    async authorizeOnu(_onu: OnuRef, _preset: ProvisioningPreset): Promise<ProvisionResult> {
        // Sengaja belum eksekusi: cegah tulis-live sebelum diuji.
        // Gunakan planAuthorize() untuk pratinjau perintah persisnya.
        throw new ProvisioningNotSupportedError('CDataProvisioningDriver', 'authorizeOnu — Slice C belum diaktifkan (pakai planAuthorize untuk preview)');
    }
}
