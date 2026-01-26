
import { execSync } from 'child_process';
import * as fs from 'fs';

try {
    console.log('Running git commands...');
    const status = execSync('git status').toString();
    const log = execSync('git log -1').toString();
    // Fetch origin to be sure
    try {
        execSync('git fetch origin');
    } catch (e) {
        console.log('Fetch failed, continuing anyway');
    }
    const remote = execSync('git log origin/main -1').toString();

    const content = `STATUS:\n${status}\n\nLOCAL LOG:\n${log}\n\nREMOTE LOG:\n${remote}`;
    fs.writeFileSync('git_status_debug.txt', content, 'utf8');
    console.log('Done writing debug file');
} catch (e: any) {
    fs.writeFileSync('git_status_debug.txt', 'Error running git: ' + e.message, 'utf8');
    console.error(e);
}
