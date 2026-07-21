/**
 * Kontrak bersama untuk semua "automation check".
 *
 * Sebuah check adalah fungsi kecil yang membandingkan kondisi jaringan dengan
 * ambang, lalu mengembalikan temuan lewat `emitFinding()`. Semua check WAJIB
 * lewat emitter itu supaya perilaku dedupe/cooldown seragam — inilah pertahanan
 * utama terhadap banjir alert saat jumlah check bertambah.
 */

export type AutomationSeverity = 'info' | 'warning' | 'critical';

export interface AutomationFinding {
    /** Identitas check, mis. 'interface-speed'. Bagian dari kunci dedupe. */
    checkKey: string;
    /**
     * Identitas objek yang dipantau — WAJIB stabil & unik (mis. id interface).
     * Bersama `checkKey` membentuk kunci dedupe, sehingga satu objek yang terus
     * bermasalah tidak menghasilkan alert berulang tiap siklus poll.
     */
    entityKey: string;
    routerId: string;
    tenantId: string;
    severity: AutomationSeverity;
    /**
     * Judul alert. Sertakan identitas objek (mis. nama interface) — selain
     * memudahkan operator, `alertService.create()` memakai kombinasi
     * routerId:type:title sebagai kunci debounce notifikasi, jadi judul yang
     * terlalu umum akan membuat objek berbeda saling menekan notifikasinya.
     */
    title: string;
    message: string;
}
