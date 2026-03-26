import { describe, it, expect } from 'vitest';

describe('Traffic Calculation Logic', () => {
    const MAX_EXPECTED_BPS = 100_000_000_000; // 100 Gbps

    const calculateRate = (current: string | number, prev: string | number, seconds: number) => {
        try {
            const c = BigInt(current);
            const p = BigInt(prev);
            const s = BigInt(Math.max(1, Math.round(seconds)));
            
            if (p > 0n && c >= p) {
                const diff = c - p;
                const rate = Number((diff * 8n) / s);
                if (rate > MAX_EXPECTED_BPS) return 0;
                return rate;
            }
        } catch (e) {
            return 0;
        }
        return 0;
    };

    it('calculates rate correctly with standard counters', () => {
        const rate = calculateRate('1000000', '500000', 10);
        // (500,000 * 8) / 10 = 400,000 bps
        expect(rate).toBe(400000);
    });

    it('returns 0 if previous value was 0 (spike guard for new interfaces)', () => {
        const rate = calculateRate('1000000', '0', 10);
        expect(rate).toBe(0);
    });

    it('handles precision for massive counters (above Number.MAX_SAFE_INTEGER)', () => {
        // Number.MAX_SAFE_INTEGER is 9,007,199,254,740,991
        // Let's use 11 PB approx
        const prev = '11258999068426240';
        const current = '11258999069684531'; // + 1,258,291 bytes
        const seconds = 1;
        
        const rate = calculateRate(current, prev, seconds);
        expect(rate).toBe(10066328); // 1,258,291 * 8
    });

    it('caps spikes at 100 Gbps', () => {
        // Suppose a jump of 200 GB in 1 second = 1.6 Tbps
        const prev = '1000000';
        const current = '201000000000'; 
        const seconds = 1;
        
        const rate = calculateRate(current, prev, seconds);
        expect(rate).toBe(0); // Should be capped to 0
    });

    it('handles counter resets/wraps (current < prev)', () => {
        const prev = '1000000';
        const current = '500000';
        const seconds = 10;
        
        const rate = calculateRate(current, prev, seconds);
        expect(rate).toBe(0);
    });

    it('handles fractional seconds by rounding', () => {
        const rate = calculateRate('1000000', '0', 5.6);
        // Rounds to 6s, but prev is 0, so 0
        expect(rate).toBe(0);

        const rate2 = calculateRate('2000000', '1000000', 9.8);
        // Rounds to 10s. (1,000,000 * 8) / 10 = 800,000
        expect(rate2).toBe(800000);
    });
});
