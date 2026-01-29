
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const logPath = path.resolve('push_fix.log');

const cmd = `git status && git add apps/api/src/services/analytics.service.ts && git commit -m "fix: add routerId to analytics service for interactivity" && git push origin main`;

exec(cmd, { cwd: 'f:/Antigrafity/new-monitoring-mikrotik' }, (error, stdout, stderr) => {
    const output = `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}\n\nERROR:\n${error ? error.message : 'None'}`;
    fs.writeFileSync(logPath, output);
    console.log('Done');
});
