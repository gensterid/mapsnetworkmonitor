import fetch from 'node-fetch';

async function testCdata(host, port, username, password) {
    console.log(`Testing C-Data OLT at ${host}:${port}...`);

    const baseUrl = `http://${host}:${port}`;
    console.log(`Base URL: ${baseUrl}`);

    try {
        console.log('1. Attempting Login...');
        // C-Data often uses a simple login or basic auth
        const loginRes = await fetch(`${baseUrl}/login`, {
            method: 'POST',
            body: new URLSearchParams({ username, password }),
            timeout: 5000
        }).catch(e => ({ ok: false, status: e.message }));

        console.log(`Login response status: ${loginRes.status}`);

        // Try getting ONU list from various known endpoints
        const endpoints = [
            '/system?form=onu_list',
            '/onu_list',
            '/get_onu_list',
            '/cgi-bin/get_onu_list.cgi',
            '/onu_info'
        ];

        for (const endpoint of endpoints) {
            console.log(`Trying endpoint: ${endpoint}`);
            try {
                const res = await fetch(`${baseUrl}${endpoint}`, { timeout: 10000 });
                if (res.ok) {
                    const data = await res.json();
                    console.log(`Success! Data from ${endpoint}:`);
                    console.log(JSON.stringify(data, null, 2).slice(0, 2000));
                    return;
                } else {
                    console.log(`Failed ${endpoint}: ${res.status}`);
                }
            } catch (e) {
                console.log(`Error at ${endpoint}: ${e.message}`);
            }
        }

        console.log('No standard endpoints worked. Trying specialized optical info endpoint...');
        const optEndpoints = ['/onu_optical_info', '/get_onu_optical_info', '/cgi-bin/get_onu_optical_info.cgi'];
        for (const endpoint of optEndpoints) {
            console.log(`Trying optical endpoint: ${endpoint}`);
            try {
                const res = await fetch(`${baseUrl}${endpoint}`, { timeout: 10000 });
                if (res.ok) {
                    const data = await res.json();
                    console.log(`Success! Optical Data from ${endpoint}:`);
                    console.log(JSON.stringify(data, null, 2).slice(0, 2000));
                    return;
                }
            } catch (e) { }
        }

    } catch (e) {
        console.error('Fatal error during test:', e);
    }
}

const [host, port, user, pass] = process.argv.slice(2);
if (!host) {
    console.log('Usage: node test-cdata.js <host> <port> <user> <pass>');
} else {
    testCdata(host, port || 80, user || 'admin', pass || 'admin');
}
