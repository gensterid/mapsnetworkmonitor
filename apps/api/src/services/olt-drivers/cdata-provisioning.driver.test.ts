import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock transport telnet — parser & logika diuji tanpa koneksi nyata.
vi.mock('./telnet-olt.client.js', () => ({
    TelnetOltClient: class {},
    probeTelnetExec: vi.fn(),
    runTelnetCommands: vi.fn(),
}));

import { probeTelnetExec, runTelnetCommands } from './telnet-olt.client.js';
import { CDataProvisioningDriver } from './cdata-provisioning.driver.js';
import type { ProvisioningPreset } from './olt-provisioning.interface.js';

const mockExec = probeTelnetExec as unknown as ReturnType<typeof vi.fn>;
const mockRun = runTelnetCommands as unknown as ReturnType<typeof vi.fn>;

const preset = (): ProvisioningPreset => ({
    id: 'p1',
    name: 'Home-100M',
    lineProfile: '1',
    serviceProfile: '1',
    serviceVlan: 100,
    wanMode: 'bridge',
});

// Contoh output PERSIS dari manual FD16xx (14.1.21 show ont autofind).
const SAMPLE_ONE = `show ont autofind all

Aging time of the automatically found ONTs : 300sec
--------------------------------------------------------------------------------
Number: 1
Frame/Slot : 0/0
Port : 2
Logic ID: 1
Ont SN: DD16B3551CD3
Password: 12345678
Loid: e067b3551cd3
Loid Password: e067b3551cd3
OMCC Ver: 0xA0
Vendor ID : xPON
Ont Version: HZ660.1A
Ont Software Version: V2.1.2
Equipment ID : ONT1
Last autofind time: Sat Jan 1 10:15:36 2000
--------------------------------------------------------------------------------
Total: 1
GPON OLT#`;

const SAMPLE_NONE = `show ont autofind all

Aging time of the automatically found ONTs : 300sec
There is no ONT available.
GPON OLT#`;

function driver() {
    return new CDataProvisioningDriver({ host: 'olt.test', port: 23, username: 'u', password: 'p' });
}

describe('CDataProvisioningDriver.getUnconfiguredOnus (parseAutofind)', () => {
    beforeEach(() => mockExec.mockReset());

    it('parses one block-format ONT with label fields', async () => {
        mockExec.mockResolvedValue(SAMPLE_ONE);
        const onus = await driver().getUnconfiguredOnus();
        expect(onus).toHaveLength(1);
        expect(onus[0]).toMatchObject({
            sn: 'DD16B3551CD3',
            ponId: '0/0/2', // Frame/Slot (0/0) + Port (2)
            vendorModel: 'xPON',
            suggestedOnuId: '1', // Logic ID
            password: '12345678',
        });
        // Loid (e067b3551cd3) TIDAK boleh salah tertangkap sebagai SN.
        expect(onus[0].sn).not.toBe('e067b3551cd3');
    });

    it('returns empty list on "There is no ONT available."', async () => {
        mockExec.mockResolvedValue(SAMPLE_NONE);
        expect(await driver().getUnconfiguredOnus()).toEqual([]);
    });

    it('parses multiple ONT blocks separated by Number:', async () => {
        const two = SAMPLE_ONE.replace(
            'Total: 1',
            `Number: 2
Frame/Slot : 0/0
Port : 1
Logic ID: 5
Ont SN: XPON12345678
Vendor ID : xPON
--------------------------------------------------------------------------------
Total: 2`,
        );
        mockExec.mockResolvedValue(two);
        const onus = await driver().getUnconfiguredOnus();
        expect(onus.map((o) => o.sn)).toEqual(['DD16B3551CD3', 'XPON12345678']);
        expect(onus[1].ponId).toBe('0/0/1');
    });
});

describe('CDataProvisioningDriver.planAuthorize', () => {
    it('builds the correct FD16xx command sequence', async () => {
        const plan = await driver().planAuthorize({ ponId: '0/0/2', sn: 'DD16B3551CD3', onuId: '5' }, preset());
        const cmds = plan.steps.map((s) => s.command);
        expect(cmds).toEqual([
            'config',
            'interface gpon 0/0',
            'ont add 2 5 sn-auth DD16B3551CD3 ont-lineprofile-id 1 ont-srvprofile-id 1',
            'exit',
            'service-port autoindex vlan 100 gpon 0/0 port 2 ont 5 gemport 1 multi-service user-vlan 100 tag-action transparent',
            'end',
            'save',
        ]);
    });
});

const ONT_INFO_HEADER = `show ont info 2 all
--------------------------------------------------------------------------------
F/S P ONT SN Control Run Config Match
`;

describe('CDataProvisioningDriver.authorizeOnu (idempotent + collision-safe)', () => {
    beforeEach(() => {
        mockExec.mockReset();
        mockRun.mockReset();
    });

    it('returns alreadyProvisioned when SN already authorized (no write)', async () => {
        mockExec.mockResolvedValue(`${ONT_INFO_HEADER}0/0 2 3 DD16B3551CD3 Active Online success match\nTotal: 1`);
        const r = await driver().authorizeOnu({ ponId: '0/0/2', sn: 'DD16B3551CD3', onuId: '5' }, preset());
        expect(r.success).toBe(true);
        expect(r.alreadyProvisioned).toBe(true);
        expect(r.onu.onuId).toBe('3'); // dilaporkan pakai ont-id existing
        expect(mockRun).not.toHaveBeenCalled();
    });

    it('rejects ont-id collision with a different SN (no write)', async () => {
        mockExec.mockResolvedValue(`${ONT_INFO_HEADER}0/0 2 5 XPON99999999 Active Online success match\nTotal: 1`);
        const r = await driver().authorizeOnu({ ponId: '0/0/2', sn: 'DD16B3551CD3', onuId: '5' }, preset());
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/sudah dipakai/i);
        expect(mockRun).not.toHaveBeenCalled();
    });

    it('runs the write session and reports success on "ONT online"', async () => {
        mockExec.mockResolvedValue(`${ONT_INFO_HEADER}Total: 0, online: 0`); // tak ada ONT existing
        mockRun.mockResolvedValue({
            transcript: '...',
            reachedShell: true,
            completed: true,
            outputs: [
                { command: 'config', output: '' },
                { command: 'interface gpon 0/0', output: '' },
                {
                    command: 'ont add 2 5 sn-auth DD16B3551CD3 ont-lineprofile-id 1 ont-srvprofile-id 1',
                    output: '\r\n2022-05-15 13:57:16 PON 0/0/2 ONU 5: The ONT online\r\nOLT(config-gpon-0/0)#',
                },
                { command: 'save', output: 'Current configuration saved.' },
            ],
        });
        const r = await driver().authorizeOnu({ ponId: '0/0/2', sn: 'DD16B3551CD3', onuId: '5' }, preset());
        expect(r.success).toBe(true);
        expect(r.onu.onuId).toBe('5');
        expect(mockRun).toHaveBeenCalledTimes(1);
    });

    it('reports failure when "ont add" output shows an error', async () => {
        mockExec.mockResolvedValue(`${ONT_INFO_HEADER}Total: 0`);
        mockRun.mockResolvedValue({
            transcript: '...',
            reachedShell: true,
            completed: true,
            outputs: [
                {
                    command: 'ont add 2 5 sn-auth DD16B3551CD3 ont-lineprofile-id 1 ont-srvprofile-id 1',
                    output: '% Ont-id already exist.\nOLT(config-gpon-0/0)#',
                },
            ],
        });
        const r = await driver().authorizeOnu({ ponId: '0/0/2', sn: 'DD16B3551CD3', onuId: '5' }, preset());
        expect(r.success).toBe(false);
        expect(r.error).toMatch(/gagal|tak pasti/i);
    });
});
