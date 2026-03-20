
// Self-contained logic from analytics-utils.ts for verification
export function formatAnalyticsTimestamp(ts) {
    if (!ts) return '';
    if (ts instanceof Date) return ts.toISOString();
    
    let str = String(ts);
    // Replace space with T
    str = str.replace(' ', 'T');
    
    if (str.endsWith('Z')) return str;

    // Check for timezone offset (+HH or +HH:mm)
    const offsetMatch = str.match(/([+-]\d{2}):?(\d{2})?$/);
    if (offsetMatch) {
        const [full, hours, minutes] = offsetMatch;
        if (!minutes) {
            // Convert +08 to +08:00
            return str.replace(full, `${hours}:00`);
        }
        if (full.indexOf(':') === -1) {
            // Convert +0800 to +08:00
            return str.replace(full, `${hours}:${minutes}`);
        }
        return str;
    }

    // If no offset and no Z, append Z
    if (!str.includes('Z')) {
        return str + 'Z';
    }

    return str;
}

const testCases = [
    { input: "2026-03-19 06:11:10.849+08", expected: "2026-03-19T06:11:10.849+08:00" },
    { input: "2026-03-19 06:11:10.849Z", expected: "2026-03-19T06:11:10.849Z" },
    { input: "2026-03-19 06:11:10.849+05:30", expected: "2026-03-19T06:11:10.849+05:30" },
    { input: new Date("2026-03-19T06:11:10.849Z"), expected: "2026-03-19T06:11:10.849Z" },
    { input: "2026-03-19 06:11:10.849", expected: "2026-03-19T06:11:10.849Z" }
];

console.log('--- Date Fix Verification (Logic) ---');
let allPassed = true;
testCases.forEach((tc, i) => {
    const result = formatAnalyticsTimestamp(tc.input);
    const passed = result === tc.expected;
    console.log(`Test ${i + 1}: ${passed ? 'PASSED' : 'FAILED'}`);
    console.log(`  Input:    ${tc.input instanceof Date ? tc.input.toISOString() : tc.input}`);
    console.log(`  Output:   ${result}`);
    console.log(`  Expected: ${tc.expected}`);
    if (!passed) allPassed = false;
    
    if (result) {
        const d = new Date(result);
        console.log(`  Valid date object: ${!isNaN(d.getTime())}`);
    }
});

if (allPassed) {
    console.log('\nSUCCESS: All date normalization logic tests passed!');
} else {
    console.log('\nFAILURE: Some tests failed.');
    process.exit(1);
}
