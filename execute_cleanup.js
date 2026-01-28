
const { execSync } = require('child_process');
const fs = require('fs');

const plan = JSON.parse(fs.readFileSync('cleanup_plan.txt', 'utf8'));
const logFile = 'cleanup_log.txt';

function log(msg) {
    fs.appendFileSync(logFile, msg + '\n');
    console.log(msg);
}

try {
    fs.writeFileSync(logFile, 'Starting cleanup...\n');

    // 1. Git remove tracked files
    log('Removing tracked files...');
    const trackedFiles = plan.tracked.map(f => `"${f}"`).join(' ');
    if (trackedFiles) {
        try {
            execSync(`git rm -f ${trackedFiles}`);
            log('Git removed files successfully.');
        } catch (e) {
            log('Error git removing files: ' + e.message);
        }
    }

    // 2. Commit changes
    log('Committing deletions...');
    try {
        execSync('git commit -m "chore: cleanup unused debug and temporary files"');
        log('Committed.');
    } catch (e) {
        log('Commit failed (maybe nothing to commit): ' + e.message);
    }

    // 3. Push changes
    log('Pushing...');
    try {
        execSync('git push origin main');
        log('Pushed successfully.');
    } catch (e) {
        log('Push failed: ' + e.message);
    }

    // 4. Delete untracked files locally
    log('Deleting local untracked files...');
    plan.untracked.forEach(f => {
        try {
            if (fs.existsSync(f)) {
                fs.unlinkSync(f);
                log(`Deleted ${f}`);
            }
        } catch (e) {
            log(`Failed to delete ${f}: ${e.message}`);
        }
    });

    log('Cleanup complete.');

} catch (e) {
    log('Script Error: ' + e.message);
}
