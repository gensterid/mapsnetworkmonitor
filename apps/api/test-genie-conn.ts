import axios from 'axios';

async function testConnection(url: string) {
    console.log(`Testing connection to ${url}/devices ...`);
    try {
        const start = Date.now();
        const response = await axios.get(`${url}/devices`, {
            params: { limit: 1 },
            timeout: 5000
        });
        const duration = Date.now() - start;
        console.log(`SUCCESS! Status: ${response.status}`);
        console.log(`Response time: ${duration}ms`);
        console.log(`Device count returned: ${Array.isArray(response.data) ? response.data.length : 'N/A'}`);
        process.exit(0);
    } catch (err: any) {
        console.error('FAILED to connect to GenieACS API:');
        if (err.response) {
            console.error(`Status: ${err.response.status}`);
            console.error('Data:', err.response.data);
        } else if (err.code === 'ECONNREFUSED') {
            console.error('Connection Refused. Is GenieACS running and listening on this port?');
        } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNABORTED') {
            console.error('Connection Timed Out. Check firewall or network connectivity.');
        } else {
            console.error('Error:', err.message);
        }
        process.exit(1);
    }
}

const targetUrl = 'http://192.168.8.89:7557';
testConnection(targetUrl);
