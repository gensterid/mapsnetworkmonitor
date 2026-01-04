
async function checkApi() {
    console.log('Checking API health...');
    try {
        const res = await fetch('http://localhost:3001/api/settings'); // Try a protected or public route
        console.log('GET /api/settings status:', res.status);
    } catch (e) {
        console.log('GET /api/settings failed:', e.message);
    }

    console.log('Checking /api/auth/lookup-email...');
    try {
        const res = await fetch('http://localhost:3001/api/auth/lookup-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier: 'admin' })
        });
        console.log('POST /api/auth/lookup-email status:', res.status);
        const text = await res.text();
        console.log('Response:', text);
    } catch (e) {
        console.log('POST /api/auth/lookup-email failed:', e.message);
    }
}

checkApi();
