import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    checkInterfaceSpeed,
    INTERFACE_SPEED_CHECK,
    type InterfaceSpeedSample,
} from '../../services/automation/checks/interface-speed.check.js';
import { emitFinding, resolveFinding } from '../../services/automation/emit.js';
import { settingsService } from '../../services/settings.service.js';

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

const sample = (over: Partial<InterfaceSpeedSample> = {}): InterfaceSpeedSample => ({
    interfaceId: 'iface-1',
    name: 'ether1',
    oldSpeed: '1Gbps',
    newSpeed: '100Mbps',
    ...over,
});

const run = (samples: InterfaceSpeedSample[]) =>
    checkInterfaceSpeed({ routerId: ROUTER_ID, tenantId: TENANT_ID, routerName: 'RB-Pusat', samples });

beforeEach(() => {
    vi.clearAllMocks();
    // Default: semua toggle aktif.
    vi.mocked(settingsService.getSettingValue).mockResolvedValue(true as never);
});

describe('checkInterfaceSpeed', () => {
    it('tidak melakukan apa-apa bila tak ada sample', async () => {
        await expect(run([])).resolves.toBe(0);
        expect(emitFinding).not.toHaveBeenCalled();
    });

    it.each([
        ['kecepatan lama tak dikenal', { oldSpeed: null }],
        ['kecepatan baru tak dikenal', { newSpeed: null }],
        ['port mati (speed kosong)', { newSpeed: '' }],
        ['nilai non-numerik', { oldSpeed: 'auto' }],
    ])('tidak membuat alert saat %s', async (_label, over) => {
        await run([sample(over)]);
        expect(emitFinding).not.toHaveBeenCalled();
        expect(resolveFinding).not.toHaveBeenCalled();
    });

    it('tidak membuat alert saat kecepatan hanya beda format (1Gbps vs 1000Mbps)', async () => {
        await run([sample({ oldSpeed: '1Gbps', newSpeed: '1000Mbps' })]);
        expect(emitFinding).not.toHaveBeenCalled();
        expect(resolveFinding).not.toHaveBeenCalled();
    });

    it('menutup alert lama saat link pulih — supaya penurunan berikutnya bisa memicu alert lagi', async () => {
        await run([sample({ oldSpeed: '100Mbps', newSpeed: '1Gbps' })]);
        expect(emitFinding).not.toHaveBeenCalled();
        expect(resolveFinding).toHaveBeenCalledWith(INTERFACE_SPEED_CHECK, 'iface-1', ROUTER_ID);
    });

    it.each([
        ['1Gbps', '100Mbps', 'critical'],   // turun 10x
        ['1Gbps', '10Mbps', 'critical'],    // jatuh ke kelas 10M
        ['100Mbps', '10Mbps', 'critical'],  // jatuh ke kelas 10M
        ['1Gbps', '500Mbps', 'warning'],    // turun 2x
    ])('alert %s -> %s dengan severity %s', async (oldSpeed, newSpeed, severity) => {
        const created = await run([sample({ oldSpeed, newSpeed })]);
        expect(created).toBe(1);
        expect(emitFinding).toHaveBeenCalledTimes(1);
        expect(emitFinding).toHaveBeenCalledWith(expect.objectContaining({
            checkKey: INTERFACE_SPEED_CHECK,
            entityKey: 'iface-1',
            routerId: ROUTER_ID,
            tenantId: TENANT_ID,
            severity,
        }));
    });

    it('menyertakan nama interface di judul agar debounce notifikasi tidak saling menekan', async () => {
        await run([sample({ name: 'sfp-plus1' })]);
        expect(emitFinding).toHaveBeenCalledWith(
            expect.objectContaining({ title: expect.stringContaining('sfp-plus1') })
        );
    });

    it.each([
        ['master switch mati', 'automation_enabled'],
        ['switch check ini mati', 'automation_interface_speed_enabled'],
    ])('tidak membuat alert saat %s', async (_label, offKey) => {
        vi.mocked(settingsService.getSettingValue).mockImplementation(
            (async (key: string) => key !== offKey) as never
        );
        await expect(run([sample()])).resolves.toBe(0);
        expect(emitFinding).not.toHaveBeenCalled();
    });

    it('tetap jalan dengan default aktif bila setting gagal dibaca', async () => {
        vi.mocked(settingsService.getSettingValue).mockRejectedValue(new Error('db down') as never);
        await run([sample()]);
        expect(emitFinding).toHaveBeenCalledTimes(1);
    });
});
