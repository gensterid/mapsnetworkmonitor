
const { execSync } = require('child_process');
const fs = require('fs');

const logFile = 'force_push_log.txt';

function log(msg) {
    fs.appendFileSync(logFile, msg + '\n');
    console.log(msg);
}

try {
    fs.writeFileSync(logFile, 'Starting force push sequence...\n');

    // 1. Force Add
    log('Adding RouterDetails.jsx...');
    try {
        execSync('git add -f apps/web/src/pages/RouterDetails.jsx');
        log('Added.');
    } catch (e) { log('Add Error: ' + e.message); }

    // 2. Commit
    log('Committing...');
    try {
        const commitOut = execSync('git commit -m "feat: simplify pppoe map location coords input"');
        log('Committed: ' + commitOut.toString());
    } catch (e) {
        log('Commit Error (might use allow-empty?): ' + e.message);
    }

    // 3. Push
    log('Pushing...');
    try {
        const pushOut = execSync('git push origin main');
        log('Pushed: ' + pushOut.toString());
    } catch (e) {
        log('Push Error: ' + e.message);
    }

} catch (e) {
    log('Script Fatal Error: ' + e.message);
}
