
import { execSync } from 'child_process';
import * as fs from 'fs';

const logFile = 'sync_git_result.txt';

function log(message: string) {
    fs.appendFileSync(logFile, message + '\n');
    console.log(message);
}

try {
    fs.writeFileSync(logFile, 'Starting sync...\n');

    log('Adding files...');
    execSync('git add apps/api/src/services/pppoe.service.ts apps/web/src/components/NetworkMap.jsx');

    log('Committing...');
    try {
        execSync('git commit -m "fix: update pppoe service and network map"');
    } catch (e: any) {
        log('Commit failed or nothing to commit: ' + e.message);
    }

    log('Pushing...');
    const result = execSync('git push origin main').toString();
    log('Push result:');
    log(result);

} catch (e: any) {
    log('Error: ' + e.message);
    if (e.stderr) {
        log('Stderr: ' + e.stderr.toString());
    }
    if (e.stdout) {
        log('Stdout: ' + e.stdout.toString());
    }
}
