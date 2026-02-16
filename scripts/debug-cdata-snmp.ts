import fs from 'fs';
import path from 'path';
import snmp from 'net-snmp';

// Load .env BEFORE importing db
const envPath = path.join(process.cwd(), 'apps', 'api', '.env');
if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf-8');
    envConfig.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
            process.env[key.trim()] = value.trim();
        }
    });
    console.log('Loaded env from:', envPath);
} else {
    console.error('Could not find .env at:', envPath);
}

async function debugSnmp() {
    console.log('--- Starting SNMP Debugging for C-Data OLTs ---');

    // Dynamic imports to ensure env is loaded first
    const { db } = await import('../apps/api/src/db/index.js');
    const { olts } = await import('../apps/api/src/db/schema/olts.js');
    const { snmpService } = await import('../apps/api/src/services/snmp.service.js');

    try {
        const allOlts = await db.select().from(olts);

        if (allOlts.length === 0) {
            console.log('No OLTs found in database.');
            process.exit(0);
        }

        for (const olt of allOlts) {
            console.log(`\nChecking OLT: ${olt.name} (${olt.host})`);
            console.log(`- Type: ${olt.type}`);
            console.log(`- SNMP Enabled: ${olt.useSnmp}`);
            console.log(`- SNMP Port: ${olt.snmpPort}`);
            console.log(`- SNMP Community: ${olt.snmpCommunity}`);

            if (!olt.useSnmp) {
                console.log('-> SNMP is DISABLED for this OLT in settings.');
                continue;
            }

            const config = {
                host: olt.host,
                port: olt.snmpPort || 161,
                community: olt.snmpCommunity || 'public',
                version: snmp.Version2c // Default to v2c as schema doesn't have version
            };

            console.log(`-> Attempting connection to ${config.host}:${config.port} (v2c)...`);

            try {
                // Test basic OIDs
                const oids = [
                    '1.3.6.1.2.1.1.1.0', // sysDescr
                    '1.3.6.1.2.1.1.3.0', // sysUpTime
                ];

                const start = Date.now();
                const results = await snmpService.getMultiple(config, oids);
                const duration = Date.now() - start;

                console.log(`-> SUCCESS! Connection took ${duration}ms`);

                results.forEach(res => {
                    if (res.oid === '1.3.6.1.2.1.1.1.0') console.log(`   sysDescr: ${res.value}`);
                    if (res.oid === '1.3.6.1.2.1.1.3.0') console.log(`   sysUpTime: ${res.value}`);
                });

            } catch (error: any) {
                console.error(`-> FAILED: ${error.message}`);

                // Fallback suggestions
                if (error.message.includes('Timeout')) {
                    console.log('   Suggestion: Check firewall, routing, or if SNMP service is enabled on OLT.');
                    console.log('   Suggestion: Verify the correct IP address.');
                } else if (error.message.includes('Community')) {
                    console.log('   Suggestion: Verify SNMP Community string (public/private).');
                }

                // Try fallback community if configured one failed
                if (config.community !== 'public') {
                    console.log(`   -> Retrying with community 'public'...`);
                    try {
                        const fallbackConfig = { ...config, community: 'public' };
                        const results = await snmpService.getMultiple(fallbackConfig, ['1.3.6.1.2.1.1.1.0']);
                        console.log(`   -> SUCCESS with 'public'! Please update your settings.`);
                        console.log(`      sysDescr: ${results[0].value}`);
                    } catch (e) {
                        console.log(`   -> Failed with 'public' as well.`);
                    }
                }
            }
        }

    } catch (error) {
        console.error('Script Error:', error);
    }
    process.exit(0);
}

debugSnmp();
