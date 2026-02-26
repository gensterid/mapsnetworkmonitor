import axios from 'axios';
import 'dotenv/config';

async function check() {
    const port = process.env.PORT || 3001;
    const baseUrl = `http://127.0.0.1:${port}/api`;

    // We need a tenant ID. Let's try to find one.
    // Or just check if the settings endpoint returns the global fallback.
    try {
        console.log('Fetching settings for a sample tenant...');
        // We'll use a dummy tenant ID, the service should fallback to global if not found in db.
        const res = await axios.get(`${baseUrl}/settings/googleMapsApiKey`, {
            headers: { 'x-tenant-id': '559d4954-45d5-490a-94be-04c517fd91ff' }
        });
        console.log('API Response for googleMapsApiKey:', res.data);
    } catch (err) {
        console.error('Error fetching setting:', err.response?.data || err.message);
    }
}

check();
