
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const logPath = path.resolve('cleanup_debug.log');
const filesToRemove = [
    'apps/api/alert_check_log.txt',
    'apps/api/alert_check_result.txt',
    'apps/api/migration_log.txt',
    'apps/api/reproduction_log.txt',
    'apps/api/src/scripts/check_alerts.ts',
    'apps/api/src/scripts/reproduce_issue.ts',
    'branch_info.txt',
    'debug_git.js',
    'fetch_log.txt',
    'final_status.txt',
    'git_debug.log',
    'git_log.txt',
    'push_check.txt',
    'push_log.txt',
    'remote_info.txt',
    'remote_info_debug.txt',
    'status_log.txt',
    'status_utf8.txt'
];

const cmd = `git rm -f ${filesToRemove.join(' ')} && git commit -m "chore: remove temporary debug logs" && git push origin main`;

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
