
try {
    console.log('Starting diagnostic...');
    const { routerNetwatchService } = await import('./src/services/router-netwatch.service.js');
    console.log('Import successful');
    console.log('Service methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(routerNetwatchService)));
} catch (err) {
    console.error('DIAGNOSTIC CRASHED:', err);
}
process.exit(0);
