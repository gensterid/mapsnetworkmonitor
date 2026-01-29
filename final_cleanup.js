
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const logPath = path.resolve('final_cleanup.log');
const filesToRemove = [
    'apps/api/resolve_log.txt',
    'apps/api/src/scripts/resolve_stale_alerts.ts',
    'cleanup_debug.log',
    'cleanup_git.js',
    'debug_git.js',
    'git_debug.log'
];

const cmd = `git rm -f ${filesToRemove.join(' ')} && git commit -m "chore: final cleanup of debug scripts" && git push origin main`;

exec(cmd, { cwd: 'f:/Antigrafity/new-monitoring-mikrotik' }, (error, stdout, stderr) => {
    if (error) {
        fs.appendFileSync(logPath, `ERROR: ${error.message}\n`);
    }
    if (stdout) {
        fs.appendFileSync(logPath, `STDOUT:\n${stdout}\n`);
    }
    if (stderr) {
        fs.appendFileSync(logPath, `STDERR:\n${stderr}\n`);
    }
});
