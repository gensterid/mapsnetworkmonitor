import { describe, it, expect } from 'vitest';
import { pickRetentionDays, METRICS_RETENTION_DEFAULT_DAYS } from '../../lib/metrics-retention.js';

describe('pickRetentionDays — window retensi hypertable metrik', () => {
    it('pakai default saat tak ada tenant', () => {
        expect(pickRetentionDays([])).toBe(METRICS_RETENTION_DEFAULT_DAYS);
    });

    it('ambil nilai PALING LONGGAR di atas default (jaga data tenant lain)', () => {
        expect(pickRetentionDays([30, 90, 45])).toBe(90);
    });

    it('abaikan nilai di bawah default — tak boleh lebih pendek dari default', () => {
        expect(pickRetentionDays([30, 10, 59])).toBe(METRICS_RETENTION_DEFAULT_DAYS);
    });

    it('abaikan nilai non-finite (NaN/Infinity)', () => {
        expect(pickRetentionDays([Number.NaN, Number.POSITIVE_INFINITY, 70])).toBe(70);
    });

    it('bulatkan ke integer (make_interval butuh int)', () => {
        expect(pickRetentionDays([90.9])).toBe(90);
    });

    it('minimal 1 hari walau default sengaja kecil', () => {
        expect(pickRetentionDays([], 0.4)).toBe(1);
    });

    it('hormati default kustom saat semua tenant lebih rendah', () => {
        expect(pickRetentionDays([10, 20], 30)).toBe(30);
    });
});
