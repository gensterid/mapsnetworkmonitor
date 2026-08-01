import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock transport telnet — parser diuji tanpa koneksi nyata.
vi.mock('./telnet-olt.client.js', () => ({
    TelnetOltClient: class {},
    probeTelnetExec: vi.fn(),
}));

import { probeTelnetExec } from './telnet-olt.client.js';
import { CDataProvisioningDriver } from './cdata-provisioning.driver.js';

const mockExec = probeTelnetExec as unknown as ReturnType<typeof vi.fn>;

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
