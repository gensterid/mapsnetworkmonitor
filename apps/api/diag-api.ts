import axios from 'axios';

async function diag() {
    const port = process.env.PORT || 3001;
    const baseUrl = `http://127.0.0.1:${port}/api`;

    console.log(`Checking API at ${baseUrl}...`);

    try {
        const health = await axios.get(`${baseUrl}/health`);
        console.log('✅ Health check:', health.data);

        console.log('Testing lookup-email with admin...');
        const lookup = await axios.post(`${baseUrl}/auth/lookup-email`, { identifier: 'admin' });
        console.log('✅ Lookup response:', lookup.data);

    } catch (err) {
        console.log('❌ Error:');
        if (err.response) {
            console.log(`Status: ${err.response.status}`);
            console.log('Data:', JSON.stringify(err.response.data, null, 2));
        } else {
            console.log(err.message);
        }
    }
    process.exit(0);
}

diag();
