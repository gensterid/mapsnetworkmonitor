
import { auth } from './src/lib/auth';

async function inspect() {
    console.log('Auth keys:', Object.keys(auth));
    if ('api' in auth) {
        console.log('API keys:', Object.keys((auth as any).api));
    }
}

inspect().catch(console.error);
