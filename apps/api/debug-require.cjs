const mod = require('node-routeros');
console.log('Type:', typeof mod);
console.log('Keys:', Object.keys(mod));
console.log('Is Constructor?', typeof mod === 'function');
if (mod.RouterOSClient) console.log('Has RouterOSClient');
