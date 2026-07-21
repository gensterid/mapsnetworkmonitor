import { and, eq, gte, like } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { alerts } from '../../db/schema/index.js';
import { alertService } from '../alert.service.js';
import { logger } from '../../lib/logger.js';
import type { AutomationFinding } from './types.js';

/**
 * Semua automation check memakai tipe alert yang SUDAH ada (`threshold`) agar
 * menambah check baru tidak menuntut migrasi enum `alert_type`. Kategori
 * sebenarnya dibawa oleh marker di message + judul. Pola ini mengikuti
 * signal-alert.service.ts yang sudah terbukti jalan.
 */
const ALERT_TYPE = 'threshold' as const;

/** Jeda default sebelum temuan yang sama boleh memunculkan alert lagi. */
const DEFAULT_COOLDOWN_MIN = 60;

/**
 * Marker deterministik yang ditempel di akhir message — satu-satunya kunci
 * dedupe untuk seluruh automation check. Sengaja memakai delimiter tegas
 * supaya pencocokan LIKE tidak salah kena alert lain.
 */
export const findingMarker = (checkKey: string, entityKey: string): string =>
    `[auto:${checkKey}:${entityKey}]`;

/**
 * Escape metakarakter LIKE (`%`, `_`, `\`) sebelum marker dipakai sebagai pola.
 * Hari ini entityKey selalu UUID sehingga aman, tapi emitter ini adalah kontrak
 * bersama — check berikutnya bisa saja memakai kunci berupa nama interface atau
 * hostname yang mengandung `_`, dan tanpa escape polanya akan mencocoki alert
 * lain (dedupe jadi terlalu longgar).
 */
const escapeLike = (s: string): string => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Pola LIKE untuk seluruh alert milik satu (check, entity). */
const markerPattern = (checkKey: string, entityKey: string): string =>
    `%${escapeLike(findingMarker(checkKey, entityKey))}%`;

/**
 * Terbitkan satu temuan sebagai alert, dengan anti-banjir dua lapis:
 *   1. Skip bila masih ada alert BELUM di-resolve untuk objek yang sama —
 *      kondisi yang bertahan tidak perlu alert baru tiap siklus.
 *   2. Skip bila ada alert untuk objek yang sama dalam jendela cooldown —
 *      meredam kondisi yang flapping (naik-turun cepat).
 *
 * Best-effort: kegagalan apa pun hanya di-log dan mengembalikan false, tidak
 * pernah melempar — pemanggilnya adalah jalur sync yang tak boleh gagal hanya
 * karena alert gagal dibuat.
 *
 * @returns true bila alert benar-benar dibuat.
 */
export async function emitFinding(
    finding: AutomationFinding,
    cooldownMinutes: number = DEFAULT_COOLDOWN_MIN
): Promise<boolean> {
    try {
        const marker = findingMarker(finding.checkKey, finding.entityKey);
        const pattern = markerPattern(finding.checkKey, finding.entityKey);

        // 1. Masih ada alert terbuka untuk objek ini → jangan tumpuk.
        const [openAlert] = await db
            .select({ id: alerts.id })
            .from(alerts)
            .where(and(
                eq(alerts.routerId, finding.routerId),
                eq(alerts.type, ALERT_TYPE),
                eq(alerts.resolved, false),
                like(alerts.message, pattern)
            ))
            .limit(1);
        if (openAlert) return false;

        // 2. Baru saja dialerkan (flapping) → tahan sampai cooldown lewat.
        const since = new Date(Date.now() - cooldownMinutes * 60_000);
        const [recentAlert] = await db
            .select({ id: alerts.id })
            .from(alerts)
            .where(and(
                eq(alerts.routerId, finding.routerId),
                eq(alerts.type, ALERT_TYPE),
                like(alerts.message, pattern),
                gte(alerts.createdAt, since)
            ))
            .limit(1);
        if (recentAlert) return false;

        // Sengaja pakai `db`, bukan transaksi pemanggil: alert harus tetap
        // tercatat walau transaksi sync di-rollback (pola sama seperti
        // checkSignalChange pada sync OLT).
        await alertService.create({
            routerId: finding.routerId,
            tenantId: finding.tenantId,
            type: ALERT_TYPE,
            severity: finding.severity,
            title: finding.title,
            message: `${finding.message} ${marker}`,
        }, db);

        logger.info({
            checkKey: finding.checkKey,
            entityKey: finding.entityKey,
            routerId: finding.routerId,
            severity: finding.severity,
        }, '🤖 Automation: alert dibuat');
        return true;
    } catch (err) {
        logger.warn({
            err,
            checkKey: finding.checkKey,
            entityKey: finding.entityKey,
        }, 'Automation: gagal menerbitkan temuan (diabaikan)');
        return false;
    }
}

/**
 * Tutup (resolve) alert terbuka milik satu objek saat kondisinya kembali normal.
 *
 * WAJIB dipanggil oleh setiap check ketika kondisi pulih. Tanpa ini, lapis
 * dedupe pertama pada `emitFinding()` ("masih ada alert terbuka → skip") akan
 * membungkam kejadian BERIKUTNYA selamanya: interface yang pernah turun lalu
 * pulih, kemudian turun lagi berbulan-bulan setelahnya, tidak akan pernah
 * memunculkan alert baru karena alert lama masih menggantung terbuka.
 *
 * Best-effort — kegagalan hanya di-log.
 *
 * @returns jumlah alert yang ditutup.
 */
export async function resolveFinding(
    checkKey: string,
    entityKey: string,
    routerId: string
): Promise<number> {
    try {
        const resolvedRows = await db
            .update(alerts)
            .set({ resolved: true, resolvedAt: new Date() })
            .where(and(
                eq(alerts.routerId, routerId),
                eq(alerts.type, ALERT_TYPE),
                eq(alerts.resolved, false),
                like(alerts.message, markerPattern(checkKey, entityKey))
            ))
            .returning({ id: alerts.id });

        if (resolvedRows.length > 0) {
            logger.info({
                checkKey, entityKey, routerId, resolved: resolvedRows.length,
            }, '🤖 Automation: alert ditutup (kondisi kembali normal)');
        }
        return resolvedRows.length;
    } catch (err) {
        logger.warn({ err, checkKey, entityKey, routerId }, 'Automation: gagal menutup alert (diabaikan)');
        return 0;
    }
}
