
const { execSync } = require('child_process');
const fs = require('fs');

const logFile = 'push_change_log.txt';

function log(msg) {
    fs.appendFileSync(logFile, msg + '\n');
    console.log(msg);
}

try {
    fs.writeFileSync(logFile, 'Starting push...\n');

    // 1. Add specific file
    log('Adding RouterDetails.jsx...');
    execSync('git add apps/web/src/pages/RouterDetails.jsx');

    // 2. Commit
    log('Committing...');
    try {
        execSync('git commit -m "fix: prevent pppoe list flickering on refresh"');
        log('Committed.');
    } catch (e) {
        log('Commit info: ' + e.message);
    }

    // 3. Push
    log('Pushing...');
    try {
        const out = execSync('git push origin main');
        log('Pushed: ' + out.toString());
    } catch (e) {
        log('Push failed: ' + e.message);
    }

} catch (e) {
    log('Script Error: ' + e.message);
}
