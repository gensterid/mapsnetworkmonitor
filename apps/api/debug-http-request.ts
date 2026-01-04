import 'dotenv/config';
import { db } from './src/db';

// Function to perform HTTP request
async function debugHttpRequest() {
    const API_URL = 'http://localhost:3001/api';
    const TEST_ROUTER_ID = '0d2538f3-d276-49ec-b3f8-667af8dd1f46';
    const TEST_NETWATCH_ID = '6522a180-a128-4843-b642-a54544ba5312';

    try {
        console.log('1. Getting admin user details from DB...');
        // Actually get a user
        const { users, sessions } = await import('./src/db/schema');
        const [user] = await db.select().from(users).limit(1);

        if (!user) {
            console.log('No users found in DB');
            return;
        }
        console.log(`Found user: ${user.email}`);

        console.log('2. Generating session directly in DB...');
        const token = 'debug-session-' + Date.now();
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1);

        await db.insert(sessions).values({
            userId: user.id,
            expiresAt: expiresAt,
            token: token,
            createdAt: new Date(),
            updatedAt: new Date(),
            ipAddress: '127.0.0.1',
            userAgent: 'Debug Script'
        });

        console.log('Session created. Token:', token);

        console.log('3. Sending PUT request to update netwatch...');
        const payload = {
            host: '172.16.34.1',
            name: 'Debug HTTP Update ' + Date.now(),
            interval: 30
        };

        const res = await fetch(`${API_URL}/routers/${TEST_ROUTER_ID}/netwatch/${TEST_NETWATCH_ID}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });

        console.log(`Response Status: ${res.status}`);
        const data = await res.text();
        console.log('Response Body:', data);

    } catch (error) {
        console.error('Request failed:', error);
    } finally {
        process.exit(0);
    }
}

debugHttpRequest();
