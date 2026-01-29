
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const logPath = path.resolve('git_debug.log');
// Command to check status, add all (in case user modified anything else), commit and push
const cmd = 'git status && git add . && git commit -m "chore: cleanup and sync" && git push origin main';

try {
    fs.writeFileSync(logPath, `Running: ${cmd}\n`);
} catch (e) {
    console.error('Failed to write log start:', e);
    process.exit(1);
}

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
