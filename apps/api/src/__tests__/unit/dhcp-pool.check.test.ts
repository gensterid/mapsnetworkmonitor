import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkDhcpPools, DHCP_POOL_CHECK } from '../../services/automation/checks/dhcp-pool.check.js';
import { emitFinding, resolveFinding } from '../../services/automation/emit.js';
import { settingsService } from '../../services/settings.service.js';
import type { IpPoolFull, DhcpLeaseFull } from '../../lib/mikrotik/ip-management.js';

vi.mock('../../services/automation/emit.js', () => ({
    emitFinding: vi.fn().mockResolvedValue(true),
    resolveFinding: vi.fn().mockResolvedValue(1),
}));

vi.mock('../../services/settings.service.js', () => ({
    settingsService: { getSettingValue: vi.fn() },
}));

vi.mock('../../lib/logger.js', () => ({
    logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const ROUTER_ID = 'router-1';
const TENANT_ID = 'tenant-1';

/** Pool 10 alamat: 10.0.0.1 .. 10.0.0.10 */
const pool = (over: Partial<IpPoolFull> = {}): IpPoolFull => ({
    id: '*1',
    name: 'dhcp-pool',
    ranges: '10.0.0.1-10.0.0.10',
    ...over,
});

const leases = (count: number, over: Partial<DhcpLeaseFull> = {}): DhcpLeaseFull[] =>
    Array.from({ length: count }, (_, i) => ({
        id: `*${i}`,
        address: `10.0.0.${i + 1}`,
        ...over,
    }));

const run = (pools: IpPoolFull[], ls: DhcpLeaseFull[]) =>
    checkDhcpPools({ routerId: ROUTER_ID, tenantId: TENANT_ID, routerName: 'RB-Pusat', pools, leases: ls });

/** Kembalikan nilai override per key setting; sisanya pakai default pemanggil. */
const mockSettings = (over: Record<string, unknown> = {}) => {
    vi.mocked(settingsService.getSettingValue).mockImplementation(
        (async (key: string, _tenantId: string, def: unknown) =>
            key in over ? over[key] : def) as never
    );
};

beforeEach(() => {
    vi.clearAllMocks();
    mockSettings();
});

describe('checkDhcpPools', () => {
    it('tidak melakukan apa-apa bila tak ada pool', async () => {
        await expect(run([], [])).resolves.toBe(0);
        expect(emitFinding).not.toHaveBeenCalled();
    });

    it('menutup alert lama saat okupansi kembali sehat', async () => {
        await run([pool()], leases(3)); // 30%
        expect(emitFinding).not.toHaveBeenCalled();
        expect(resolveFinding).toHaveBeenCalledWith(DHCP_POOL_CHECK, 'dhcp-pool', ROUTER_ID);
    });

    it('warning saat menembus ambang peringatan (80%)', async () => {
        const created = await run([pool()], leases(8));
        expect(created).toBe(1);
        expect(emitFinding).toHaveBeenCalledWith(expect.objectContaining({
            checkKey: DHCP_POOL_CHECK,
            entityKey: 'dhcp-pool',
            severity: 'warning',
        }));
    });

    it('critical saat menembus ambang kritis (95%)', async () => {
        await run([pool({ ranges: '10.0.0.1-10.0.0.100' })], leases(96));
        expect(emitFinding).toHaveBeenCalledWith(expect.objectContaining({ severity: 'critical' }));
    });

    it('critical dan menyebut HABIS saat pool penuh', async () => {
        await run([pool()], leases(10));
        expect(emitFinding).toHaveBeenCalledWith(expect.objectContaining({
            severity: 'critical',
            message: expect.stringContaining('HABIS'),
        }));
    });

    it('menghormati ambang kustom dari setting', async () => {
        mockSettings({ automation_dhcp_pool_warn_pct: 20 });
        await run([pool()], leases(3)); // 30% — sehat pada default, warning pada ambang 20
        expect(emitFinding).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warning' }));
    });

    it('tidak menghitung lease yang disabled', async () => {
        await run([pool()], leases(10, { disabled: true }));
        expect(emitFinding).not.toHaveBeenCalled();
        expect(resolveFinding).toHaveBeenCalled();
    });

    it('menghitung alamat duplikat sekali saja', async () => {
        // 10 entri lease tapi semuanya alamat yang sama → 1 alamat terpakai.
        const dup = Array.from({ length: 10 }, (_, i) => ({ id: `*${i}`, address: '10.0.0.1' }));
        await run([pool()], dup);
        expect(emitFinding).not.toHaveBeenCalled();
    });

    it('mengabaikan lease di luar rentang pool', async () => {
        const outside = [{ id: '*1', address: '192.168.9.9' }];
        await run([pool()], outside);
        expect(emitFinding).not.toHaveBeenCalled();
    });

    // Pool IPv6 tidak boleh dilaporkan "penuh" hanya karena tak terurai.
    it('melewati pool yang rentangnya tak bisa diurai', async () => {
        await run([pool({ ranges: '2001:db8::1-2001:db8::ff' })], []);
        expect(emitFinding).not.toHaveBeenCalled();
        expect(resolveFinding).not.toHaveBeenCalled();
    });

    it.each([
        ['master switch mati', 'automation_enabled'],
        ['switch check ini mati', 'automation_dhcp_pool_enabled'],
    ])('tidak membuat alert saat %s', async (_label, offKey) => {
        mockSettings({ [offKey]: false });
        await expect(run([pool()], leases(10))).resolves.toBe(0);
        expect(emitFinding).not.toHaveBeenCalled();
    });

    it('memakai activeAddress bila address kosong', async () => {
        const ls = Array.from({ length: 8 }, (_, i) => ({
            id: `*${i}`,
            activeAddress: `10.0.0.${i + 1}`,
        }));
        await run([pool()], ls);
        expect(emitFinding).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warning' }));
    });

    // RouterOS otomatis beralih ke pool lanjutan, jadi "habis" bukan gangguan.
    describe('pool dengan next-pool', () => {
        const chained = () => pool({ nextPool: 'pool-cadangan' });

        it('tidak dieskalasi ke critical saat penuh', async () => {
            await run([chained()], leases(10));
            expect(emitFinding).toHaveBeenCalledWith(expect.objectContaining({ severity: 'warning' }));
        });

        it('tidak memakai kata HABIS dan menyebut pool lanjutannya', async () => {
            await run([chained()], leases(10));
            const arg = vi.mocked(emitFinding).mock.calls[0][0];
            expect(arg.message).not.toContain('HABIS');
            expect(arg.message).toContain('pool-cadangan');
        });
    });

    // getSettingValue hanya melakukan cast atas jsonb — nilai rusak harus
    // jatuh ke default, bukan membanjiri alert (false→0) atau mematikannya (NaN).
    describe('ambang setting yang rusak', () => {
        it.each<[unknown, string]>([
            [false, 'boolean false (akan jadi 0 bila tak divalidasi)'],
            [{}, 'objek (akan jadi NaN)'],
            [[], 'array'],
            ['bukan-angka', 'string non-numerik'],
            [0, 'nol'],
            [-5, 'negatif'],
            [150, 'di luar 0-100'],
        ])('mengabaikan warn_pct = %s (%s) dan pakai default 80', async (bad) => {
            mockSettings({ automation_dhcp_pool_warn_pct: bad });
            // 3/10 = 30% → sehat pada default 80, tak boleh memicu alert.
            await run([pool()], leases(3));
            expect(emitFinding).not.toHaveBeenCalled();
        });
    });
});
