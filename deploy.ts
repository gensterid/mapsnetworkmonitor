
import { execSync } from 'child_process';
import * as fs from 'fs';

const logFile = 'deploy_log.txt';
function log(msg: string) {
    fs.appendFileSync(logFile, msg + '\n');
    console.log(msg);
}

try {
    log('--- Starting Deployment ---');

    log('Adding files...');
    execSync('git add apps/web/src/components/NetworkMap.jsx');

    log('Committing...');
    try {
        execSync('git commit -m "fix: sanitize connectedToId payload in map update"');
    } catch (e: any) {
        if (e.message.includes('nothing to commit')) {
            log('Nothing to commit');
        } else {
            throw e;
        }
    }

    log('Pushing...');
    execSync('git push origin main');

    log('--- Deployment Success ---');
} catch (e: any) {
    log('ERROR: ' + e.message);
    if (e.stderr) log('STDERR: ' + e.stdout?.toString() + '\n' + e.stderr.toString());
}
