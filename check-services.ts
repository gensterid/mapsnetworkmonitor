import axios from 'axios';
import fs from 'fs';

async function checkServices() {
    let report = '';
    try {
        const webResponse = await axios.get('http://127.0.0.1:5173', { timeout: 2000 });
        report += `Web (5173): UP (Status: ${webResponse.status})\n`;
    } catch (e) {
        report += `Web (5173): DOWN (${e.message})\n`;
    }

    try {
        const apiResponse = await axios.get('http://127.0.0.1:3002/api/auth/session', { timeout: 2000 });
        report += `API (3002): UP (Status: ${apiResponse.status})\n`;
    } catch (e) {
        report += `API (3002): DOWN (${e.message})\n`;
    }

    fs.writeFileSync('service_check.txt', report);
    console.log('Report written to service_check.txt');
}

checkServices();
