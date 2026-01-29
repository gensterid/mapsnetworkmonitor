
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const logPath = path.resolve('push_analysis.log');

const cmd = `git add apps/api/src/scripts/analyze_unresolved.ts && git commit -m "chore: add script to analyze unresolved alerts" && git push origin main`;

exec(cmd, { cwd: 'f:/Antigrafity/new-monitoring-mikrotik' }, (error, stdout, stderr) => {
    const output = `STDOUT:\n${stdout}\n\nSTDERR:\n${stderr}\n\nERROR:\n${error ? error.message : 'None'}`;
    fs.writeFileSync(logPath, output);
    console.log('Done');
});
