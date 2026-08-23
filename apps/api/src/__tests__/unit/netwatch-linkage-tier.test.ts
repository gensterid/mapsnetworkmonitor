import { describe, it, expect } from 'vitest';
import { pickByTier, shouldUpgradeWeakLink } from '../../services/netwatch/netwatch-linkage.service.js';

// Fixture ONU dengan default null di semua field yang dibaca pickByTier.
const onu = (over: Record<string, unknown> = {}) => ({
    sn: null, pppoeUser: null, pppoeIp: null, mgmtIp: null,
    host: null, name: null, description: null, ...over,
});

describe('pickByTier — prioritas linkage netwatch↔ONU', () => {
    it('desc_exact menang atas desc_fuzzy (bug ady27 box → ADY27)', () => {
        // Arrange: satu ONU berdeskripsi "ADY27" (substring dari "ady27 box"),
        // satu lagi berdeskripsi PERSIS "ady27 box".
        const onus = [
            onu({ sn: 'FHTT99B86058', name: 'HG6145F_0/0/2:11', description: 'ADY27', mgmtIp: '10.100.100.28' }),
            onu({ sn: 'FHTT95BE6930', name: 'HG6243C_0/0/1:8', description: 'ady27 box' }),
        ];
        const entry = { name: 'ady27 box', host: '10.100.100.35', comment: '' };

        // Act
        const result = pickByTier(entry, onus);

        // Assert: harus pilih ONU deskripsi-persis, bukan yang fuzzy.
        expect(result.source).toBe('desc_exact');
        expect(result.onu.sn).toBe('FHTT95BE6930');
    });

    it('desc_exact menang atas name_fuzzy (semua exact sebelum semua fuzzy)', () => {
        // Arrange: ONU A cocok fuzzy-name ("router" ⊂ "router-jkt"), ONU B cocok
        // exact-description.
        const onus = [
            onu({ sn: 'AAA', name: 'router', description: 'lain' }),
            onu({ sn: 'BBB', name: 'X', description: 'router-jkt' }),
        ];
        const entry = { name: 'router-jkt', host: '', comment: '' };

        // Act
        const result = pickByTier(entry, onus);

        // Assert
        expect(result.source).toBe('desc_exact');
        expect(result.onu.sn).toBe('BBB');
    });

    it('name_exact tetap paling tinggi di grup nama/deskripsi', () => {
        const onus = [
            onu({ sn: 'AAA', name: 'BOX A', description: 'lain' }),
            onu({ sn: 'BBB', name: 'X', description: 'box a' }),
        ];
        const entry = { name: 'box a', host: '', comment: '' };

        const result = pickByTier(entry, onus);

        expect(result.source).toBe('name_exact');
        expect(result.onu.sn).toBe('AAA');
    });

    it('jatuh ke desc_fuzzy hanya bila tak ada match exact', () => {
        const onus = [onu({ sn: 'AAA', name: 'HG_0/0/2:11', description: 'ADY27' })];
        const entry = { name: 'ady27 box', host: '', comment: '' };

        const result = pickByTier(entry, onus);

        expect(result.source).toBe('desc_fuzzy');
        expect(result.onu.sn).toBe('AAA');
    });

    it('mgmt_ip mencocokkan ADY KONTER ke ONU via IP manajemen (regresi)', () => {
        const onus = [onu({ sn: 'FHTT99B86058', mgmtIp: '10.100.100.28', name: 'HG', description: 'ADY27' })];
        const entry = { name: 'ady konter', host: '10.100.100.28', comment: '' };

        const result = pickByTier(entry, onus);

        expect(result.source).toBe('mgmt_ip');
        expect(result.onu.sn).toBe('FHTT99B86058');
    });

    it('SN di comment adalah tier tertinggi (regresi)', () => {
        const onus = [
            onu({ sn: 'ZZZ', name: 'ady27 box' }),                 // name_exact kandidat
            onu({ sn: 'FHTT95BE6930', description: 'lainnya' }),   // target via SN comment
        ];
        const entry = { name: 'ady27 box', host: '', comment: 'SN:FHTT95BE6930' };

        const result = pickByTier(entry, onus);

        expect(result.source).toBe('sn');
        expect(result.onu.sn).toBe('FHTT95BE6930');
    });

    it('strict mode menolak tier IP/host/nama (hanya SN/PPPoE-user lolos)', () => {
        const onus = [onu({ sn: 'AAA', mgmtIp: '10.100.100.28', name: 'ady27 box' })];
        const entry = { name: 'ady27 box', host: '10.100.100.28', comment: '' };

        const result = pickByTier(entry, onus, true);

        expect(result.source).toBeNull();
        expect(result.onu).toBeNull();
    });
});

describe('shouldUpgradeWeakLink — keputusan reassign link yang sudah ada', () => {
    it('upgrade: sumber lemah (desc_fuzzy) → tier lebih tinggi (desc_exact), ONU beda', () => {
        expect(shouldUpgradeWeakLink('desc_fuzzy', 'onu-A', 'desc_exact', 'onu-B')).toBe(true);
    });

    it('upgrade: name_fuzzy → desc_exact (semua exact di atas semua fuzzy)', () => {
        expect(shouldUpgradeWeakLink('name_fuzzy', 'onu-A', 'desc_exact', 'onu-B')).toBe(true);
    });

    it('no-op: ONU hasil sama dengan yang sekarang', () => {
        expect(shouldUpgradeWeakLink('desc_fuzzy', 'onu-A', 'desc_exact', 'onu-A')).toBe(false);
    });

    it('no-op: tier hasil sama/lebih rendah (desc_fuzzy → desc_fuzzy)', () => {
        expect(shouldUpgradeWeakLink('desc_fuzzy', 'onu-A', 'desc_fuzzy', 'onu-B')).toBe(false);
    });

    it('beku: sumber KUAT (desc_exact) tak pernah di-upgrade walau ada match lain', () => {
        expect(shouldUpgradeWeakLink('desc_exact', 'onu-A', 'sn', 'onu-B')).toBe(false);
    });

    it('beku: sumber MANUAL (pilihan operator) tak pernah ditimpa', () => {
        expect(shouldUpgradeWeakLink('manual', 'onu-A', 'sn', 'onu-B')).toBe(false);
    });

    it('beku: sumber kuat lain (mgmt_ip) tetap stabil', () => {
        expect(shouldUpgradeWeakLink('mgmt_ip', 'onu-A', 'desc_exact', 'onu-B')).toBe(false);
    });

    it('aman: currentSource null/undefined → bukan lemah → tak diubah', () => {
        expect(shouldUpgradeWeakLink(null, null, 'desc_exact', 'onu-B')).toBe(false);
        expect(shouldUpgradeWeakLink(undefined, undefined, 'desc_exact', 'onu-B')).toBe(false);
    });
});
