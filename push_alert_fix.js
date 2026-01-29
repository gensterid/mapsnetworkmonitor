
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const logPath = path.resolve('push_alert_fix.log');

const cmd = `git add apps/api/src/services/alert.service.ts apps/api/src/scripts/cleanup_alerts.ts && git commit -m "fix: auto-resolve event alerts and add cleanup script" && git push origin main`;

exec(cmd, { cwd: 'f:/Antigrafity/new-monitoring-mikrotik' }, (error, stdout, stderr) => {
    const output = `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}\n\nERROR:\n${error ? error.message : 'None'}`;
    fs.writeFileSync(logPath, output);
    console.log('Done');
});
