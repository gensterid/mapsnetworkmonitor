
const { execSync } = require('child_process');
const fs = require('fs');

const logFile = 'sync_debug_result.txt';

function log(message) {
    fs.appendFileSync(logFile, message + '\n');
    console.log(message);
}

try {
    fs.writeFileSync(logFile, 'Starting debug sync...\n');

    log('Checking node version: ' + process.version);

    log('Adding files...');
    execSync('git add apps/api/src/services/pppoe.service.ts apps/web/src/components/NetworkMap.jsx');

    log('Committing...');
    try {
        execSync('git commit -m "fix: update pppoe service and network map"');
    } catch (e) {
        log('Commit info: ' + e.message);
    }

    log('Pushing...');
    const result = execSync('git push origin main').toString();
    log('Push result:');
    log(result);

} catch (e) {
    log('Error: ' + e.message);
    if (e.stdout) log('Stdout: ' + e.stdout.toString());
    if (e.stderr) log('Stderr: ' + e.stderr.toString());
}
