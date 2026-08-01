import { OltDriverConfig } from './olt-driver.interface.js';

/**
 * Provisioning ("Fase-1") contract — config awal ONU LANGSUNG di OLT,
 * sebelum ONU terbaca di GenieACS.
 *
 * SENGAJA terpisah dari `IOltDriver` (read + reboot). Alasan hasil riset
 * lintas-merk: transport read dan write bisa berbeda. Read = web API (dipakai
 * driver yang ada). Provisioning yang terdokumentasi justru lewat CLI untuk
 * ZTE/Huawei/BDCOM/C-Data; hanya HSGQ yang condong web. Satu OLT boleh punya
 * dua driver: driver baca (web) + driver provisioning (cli/web).
 *
 * Prinsip keamanan yang WAJIB dipegang implementasi:
 *  - IDEMPOTEN: cek state (uncfg / sudah ter-authorize) sebelum menulis.
 *  - PREVIEW DULU: `planAuthorize()` menghasilkan perintah persis TANPA apply,
 *    supaya bisa dikonfirmasi operator sebelum `authorizeOnu()`.
 *  - Provisioning itu DESTRUKTIF bila salah (VLAN/profile keliru → pelanggan
 *    offline). Preset berisi nilai yang sudah divalidasi, bukan input mentah.
 */

/** Transport yang dipakai driver provisioning untuk menulis ke OLT. */
export type OltTransport = 'cli' | 'web';

/** Mode WAN yang di-provision. `bridge` = router pelanggan yang PPPoE. */
export type WanMode = 'bridge' | 'pppoe' | 'dhcp';

/**
 * Guard anti command-injection untuk nilai yang diinterpolasi ke perintah CLI.
 * Menolak control char (0x00-0x1F termasuk TAB/CR/LF, plus DEL) + metakarakter
 * separator (; | & backtick $ backslash). Driver WAJIB memakainya sebelum
 * menyusun perintah — Telnet itu line-delimited, satu newline = perintah baru,
 * jadi nilai kotor bisa menyuntik perintah sewenang-wenang.
 */
const CLI_UNSAFE_CHARS = /[\x00-\x1f\x7f;|&`$\\]/;
export function assertCliSafe(value: string, field: string): string {
    if (CLI_UNSAFE_CHARS.test(value)) {
        throw new Error(`Nilai '${field}' mengandung karakter tidak aman untuk CLI.`);
    }
    return value;
}

/**
 * ONU yang sudah tersambung fisik ke PON tapi BELUM di-authorize
 * (hasil `show gpon onu uncfg` / `display ont autofind` / autofind web).
 */
export interface UnconfiguredOnu {
    /** PON port dalam format vendor (mis. "1/3/3", "0/5", atau "2/16" untuk Fiberhome). */
    ponId: string;
    /** Serial number ONU. */
    sn: string;
    /** Index bebas berikutnya bila driver bisa menghitungnya. */
    suggestedOnuId?: string;
    /** Petunjuk model/equipment-id — membantu memilih `onuTypeProfile`. */
    vendorModel?: string;
    /** Password registrasi/LOID bila OLT melaporkannya. */
    password?: string;
    /** Waktu terdeteksi (ISO string; jangan pakai Date agar mudah diserialisasi). */
    discoveredAt?: string;
    /** Payload mentah vendor untuk debugging. */
    raw?: unknown;
}

/** Hasil discovery kaya: daftar ter-parse + teks mentah perintah (untuk kalibrasi/laporan). */
export interface UnconfiguredDiscovery {
    onus: UnconfiguredOnu[];
    /** Output mentah `show ont autofind all` (atau setara). Untuk kalibrasi parser. */
    raw: string;
}

/** ONU yang SUDAH ter-authorize/teregister di OLT (untuk fitur Modify). */
export interface RegisteredOnu {
    /** PON F/S/P, mis. "0/0/2". */
    ponId: string;
    /** Nomor ONT (ont-id) pada PON. */
    onuId: string;
    /** Serial number. */
    sn: string;
    /** Run-state (Online/Offline/…), bila terbaca. */
    runState?: string;
    /** Deskripsi/label, bila ada. */
    description?: string;
}

/** Opsi saat modify ONT teregister. */
export interface ModifyOptions {
    /** Ganti juga VLAN service-port (hapus lama + set baru dari preset). DESTRUKTIF sesaat. */
    updateVlan?: boolean;
    /** Set label/deskripsi ONT (mis. nama pelanggan). */
    description?: string;
}

/** Identitas satu ONU untuk aksi provisioning. */
export interface OnuRef {
    ponId: string;
    sn?: string;
    /** Index ONU pada PON (target yang diminta saat authorize; opsional → driver pilih yang bebas). */
    onuId?: string;
}

/**
 * Bundel konfigurasi tervalidasi per-OLT. Operator MEMILIH preset, bukan
 * mengetik VLAN/profile mentah — mempersempit blast-radius.
 *
 * Field rahasia (`acsPassword`, `pppoe.password`) HARUS disimpan terenkripsi
 * (ikuti pola *Encrypted di skema yang ada) dan TIDAK BOLEH masuk log.
 */
export interface ProvisioningPreset {
    id: string;
    /** Nama yang tampil ke operator, mis. "Home-100M". */
    name: string;
    /** Nama profil tipe ONU khas vendor (ZTE "HOME-1GE", Fiberhome "5506-01-a1", dst). */
    onuTypeProfile?: string;
    /** Nama profil line (TCONT/GEM/DBA). */
    lineProfile?: string;
    /** Nama profil service (pemetaan VLAN). */
    serviceProfile?: string;
    /** VLAN data/internet. */
    serviceVlan: number;
    /** VLAN manajemen (jalur TR-069). Wajib bila mendorong ACS via OLT. */
    mgmtVlan?: number;
    /** URL ACS/GenieACS, mis. "http://acs:7547/". Linchpin Fase-1 → Fase-2. */
    acsUrl?: string;
    acsUsername?: string;
    /** RAHASIA — simpan terenkripsi, jangan di-log. */
    acsPassword?: string;
    /** Interval inform TR-069 dalam detik (mis. 300). */
    informInterval?: number;
    wanMode: WanMode;
    /** Kredensial PPPoE bila `wanMode === 'pppoe'`. `password` = RAHASIA. */
    pppoe?: { username: string; password: string };
}

/** Satu langkah dalam rencana provisioning (untuk preview). */
export interface ProvisionStep {
    /** Deskripsi ringkas yang bisa dibaca operator. */
    description: string;
    /** Perintah persis yang akan dijalankan (baris CLI, atau "METHOD url" untuk web). */
    command?: string;
    /** Tandai true bila langkah ini berisiko memutus layanan. */
    destructive?: boolean;
}

/**
 * Hasil dry-run `planAuthorize()` — apa yang AKAN dilakukan, tanpa melakukannya.
 * Ditampilkan ke operator untuk dikonfirmasi.
 */
export interface ProvisionPlan {
    onu: OnuRef;
    presetName: string;
    transport: OltTransport;
    steps: ProvisionStep[];
    /** Peringatan non-fatal (mis. "VLAN manajemen tak cocok dengan uplink"). */
    warnings: string[];
    /** Perlu `write`/`save` di akhir agar persist lintas-reboot. */
    requiresSave: boolean;
}

/** Hasil aksi provisioning yang benar-benar dieksekusi. */
export interface ProvisionResult {
    success: boolean;
    onu: OnuRef;
    /** Berapa langkah yang benar-benar diterapkan. */
    appliedSteps: number;
    message?: string;
    error?: string;
    /** Idempotensi: true bila ONU ternyata sudah ter-authorize sebelumnya. */
    alreadyProvisioned?: boolean;
}

/** Kemampuan driver provisioning — dipakai UI untuk menampilkan/menyembunyikan aksi. */
export interface OltProvisioningCapabilities {
    transport: OltTransport;
    canDiscoverUnconfigured: boolean;
    canAuthorize: boolean;
    /** Bisa mendorong ACS URL dari OLT (BDCOM/ZTE/Huawei: ya; Fiberhome: tidak; HSGQ/C-Data: perlu HAR). */
    canPushAcsUrl: boolean;
    canSetWan: boolean;
    canDeprovision: boolean;
    notes?: string;
}

/** Dilempar saat operasi tak didukung driver merk tertentu. */
export class ProvisioningNotSupportedError extends Error {
    constructor(driver: string, operation: string) {
        super(`Provisioning operation '${operation}' tidak didukung driver '${driver}'.`);
        this.name = 'ProvisioningNotSupportedError';
    }
}

export interface IOltProvisioningDriver {
    /** Kemampuan driver ini (transport + flag fitur). */
    readonly capabilities: OltProvisioningCapabilities;

    connect(): Promise<void>;
    disconnect(): Promise<void>;
    testConnection(): Promise<{ success: boolean; error?: string }>;

    /**
     * FASE-1 baca (aman, read-only): daftar ONU yang colok fisik tapi belum
     * di-authorize. Ini batu loncatan pertama — teknisi lihat ONU baru tanpa
     * login OLT.
     */
    getUnconfiguredOnus(): Promise<UnconfiguredOnu[]>;

    /**
     * Diagnostik opsional: hasil parse + teks MENTAH dari perintah discovery.
     * Dipakai laporan lapangan/kalibrasi parser — parser bisa mengekstrak 0
     * ONU bila regex belum terkalibrasi, jadi teks mentah tetap wajib ada agar
     * operator (atau kita) bisa melihat output asli OLT. Driver yang tak
     * mengimplementasikan cukup mengandalkan `getUnconfiguredOnus()`.
     */
    getUnconfiguredDetailed?(): Promise<UnconfiguredDiscovery>;

    /**
     * DRY-RUN: hasilkan rencana (perintah persis) TANPA menerapkannya.
     * WAJIB dipanggil & ditampilkan sebelum `authorizeOnu()`.
     */
    planAuthorize(onu: OnuRef, preset: ProvisioningPreset): Promise<ProvisionPlan>;

    /**
     * Opsional (Modify): daftar ONU yang SUDAH teregister di OLT (untuk mode
     * auto-auth — ONU auto ter-config, lalu diubah profil/VLAN-nya by SN).
     */
    getRegisteredOnus?(): Promise<RegisteredOnu[]>;

    /** Opsional (Modify): DRY-RUN perintah modify (rebind profil/VLAN). */
    planModify?(target: OnuRef, preset: ProvisioningPreset, opts?: ModifyOptions): Promise<ProvisionPlan>;

    /**
     * Opsional (Modify): TULIS-LIVE — ubah profil (dan opsional VLAN/label) ONT
     * yang sudah teregister. WAJIB fail-closed: verifikasi SN↔ont-id target dulu.
     */
    modifyOnu?(target: OnuRef, preset: ProvisioningPreset, opts?: ModifyOptions): Promise<ProvisionResult>;

    /**
     * Terapkan authorize + service + (opsional) ACS via preset.
     * WAJIB idempoten: cek state dulu; kembalikan `alreadyProvisioned: true`
     * bila ONU sudah ter-authorize. Selalu `write`/`save` di akhir.
     */
    authorizeOnu(onu: OnuRef, preset: ProvisioningPreset): Promise<ProvisionResult>;

    /**
     * Kebalikan (DESTRUKTIF): lepas/hapus ONU ter-authorize. Implementasi yang
     * tak mendukung boleh melempar `ProvisioningNotSupportedError`.
     */
    deprovisionOnu(onu: OnuRef): Promise<ProvisionResult>;
}

/**
 * Base opsional — memegang config & default `deprovisionOnu` yang menolak.
 * Mirip `BaseOltDriver` agar konsisten. Subclass wajib set `capabilities`.
 */
export abstract class BaseOltProvisioningDriver implements IOltProvisioningDriver {
    protected config: OltDriverConfig;

    constructor(config: OltDriverConfig) {
        this.config = {
            timeout: 10000,
            ...config,
        };
    }

    abstract readonly capabilities: OltProvisioningCapabilities;

    abstract connect(): Promise<void>;
    abstract disconnect(): Promise<void>;
    abstract testConnection(): Promise<{ success: boolean; error?: string }>;
    abstract getUnconfiguredOnus(): Promise<UnconfiguredOnu[]>;
    abstract planAuthorize(onu: OnuRef, preset: ProvisioningPreset): Promise<ProvisionPlan>;
    abstract authorizeOnu(onu: OnuRef, preset: ProvisioningPreset): Promise<ProvisionResult>;

    async deprovisionOnu(_onu: OnuRef): Promise<ProvisionResult> {
        throw new ProvisioningNotSupportedError(this.constructor.name, 'deprovisionOnu');
    }
}
