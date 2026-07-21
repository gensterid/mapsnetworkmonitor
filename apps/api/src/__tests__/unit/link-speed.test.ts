import { describe, it, expect } from 'vitest';
import { parseSpeedMbps, formatSpeedMbps } from '../../lib/link-speed.js';

describe('parseSpeedMbps', () => {
    it.each([
        ['1Gbps', 1000],
        ['10Gbps', 10000],
        ['2.5Gbps', 2500],
        ['100Mbps', 100],
        ['10Mbps', 10],
        ['1G', 1000],
        ['100M', 100],
        // Tanpa satuan diasumsikan Mbps.
        ['100', 100],
        // Regex tak ter-anchor: keterangan tambahan diabaikan.
        ['1Gbps full-duplex', 1000],
        ['  1Gbps  ', 1000],
    ])('mengurai %s menjadi %i Mbps', (raw, expected) => {
        expect(parseSpeedMbps(raw)).toBe(expected);
    });

    // Ini inti keamanan check: nilai tak dikenal HARUS null, bukan 0. Kalau
    // dikembalikan 0, port yang mati akan terlihat seperti penurunan drastis
    // dari 1Gbps -> 0 dan memicu alert palsu tiap siklus poll.
    it.each<[unknown, string]>([
        ['auto', 'string non-numerik'],
        ['', 'string kosong'],
        ['   ', 'hanya spasi'],
        [null, 'null'],
        [undefined, 'undefined'],
        ['0Mbps', 'nol'],
        ['-1Gbps', 'negatif'],
    ])('mengembalikan null untuk %s (%s)', (raw) => {
        expect(parseSpeedMbps(raw)).toBeNull();
    });
});

describe('formatSpeedMbps', () => {
    it.each([
        [1000, '1Gbps'],
        [10000, '10Gbps'],
        [2500, '2.5Gbps'],
        [100, '100Mbps'],
        [10, '10Mbps'],
    ])('memformat %i Mbps menjadi %s', (mbps, expected) => {
        expect(formatSpeedMbps(mbps)).toBe(expected);
    });
});
