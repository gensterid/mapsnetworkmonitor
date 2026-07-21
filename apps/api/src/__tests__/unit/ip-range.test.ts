import { describe, it, expect } from 'vitest';
import { ipv4ToInt, parseIpv4Ranges, countAddresses, isIpInRanges } from '../../lib/ip-range.js';

describe('ipv4ToInt', () => {
    it('mengurai IPv4 valid', () => {
        expect(ipv4ToInt('0.0.0.0')).toBe(0);
        expect(ipv4ToInt('0.0.0.1')).toBe(1);
        expect(ipv4ToInt('0.0.1.0')).toBe(256);
        expect(ipv4ToInt('255.255.255.255')).toBe(4294967295);
    });

    it.each<[unknown, string]>([
        ['10.0.0', 'oktet kurang'],
        ['10.0.0.1.5', 'oktet lebih'],
        ['10.0.0.256', 'oktet > 255'],
        ['10.0.0.a', 'non-numerik'],
        ['2001:db8::1', 'IPv6'],
        ['', 'kosong'],
    ])('menolak %s (%s)', (raw) => {
        expect(ipv4ToInt(raw as string)).toBeNull();
    });
});

describe('parseIpv4Ranges', () => {
    it('mengurai rentang tunggal', () => {
        expect(parseIpv4Ranges('10.0.0.10-10.0.0.20')).toHaveLength(1);
    });

    it('memperlakukan IP tunggal sebagai rentang 1 alamat', () => {
        const r = parseIpv4Ranges('10.0.0.5');
        expect(countAddresses(r)).toBe(1);
    });

    it('mengurai beberapa rentang dipisah koma', () => {
        const r = parseIpv4Ranges('10.0.0.10-10.0.0.20, 10.0.1.1-10.0.1.5');
        expect(r).toHaveLength(2);
        expect(countAddresses(r)).toBe(11 + 5);
    });

    // Penting: pool IPv6 / tak terurai harus menghasilkan [] sehingga check
    // MELEWATINYA, bukan melaporkannya sebagai "kapasitas 0 / penuh".
    it.each<[unknown, string]>([
        ['2001:db8::1-2001:db8::ff', 'IPv6'],
        ['', 'kosong'],
        [null, 'null'],
        [undefined, 'undefined'],
        ['bukan-ip', 'sampah'],
    ])('mengembalikan array kosong untuk %s (%s)', (raw) => {
        expect(parseIpv4Ranges(raw as string)).toEqual([]);
    });

    it('melewati rentang terbalik (akhir < awal)', () => {
        expect(parseIpv4Ranges('10.0.0.20-10.0.0.10')).toEqual([]);
    });
});

describe('countAddresses', () => {
    it('menghitung inklusif kedua ujung', () => {
        expect(countAddresses(parseIpv4Ranges('10.0.0.1-10.0.0.10'))).toBe(10);
    });
});

describe('isIpInRanges', () => {
    const ranges = parseIpv4Ranges('10.0.0.10-10.0.0.20');

    it.each([
        ['10.0.0.10', true, 'batas bawah'],
        ['10.0.0.20', true, 'batas atas'],
        ['10.0.0.15', true, 'di tengah'],
        ['10.0.0.9', false, 'sebelum batas'],
        ['10.0.0.21', false, 'sesudah batas'],
        ['192.168.1.1', false, 'subnet lain'],
    ])('%s → %s (%s)', (ip, expected) => {
        expect(isIpInRanges(ip, ranges)).toBe(expected);
    });

    it('aman terhadap nilai kosong', () => {
        expect(isIpInRanges(null, ranges)).toBe(false);
        expect(isIpInRanges(undefined, ranges)).toBe(false);
        expect(isIpInRanges('', ranges)).toBe(false);
    });
});
