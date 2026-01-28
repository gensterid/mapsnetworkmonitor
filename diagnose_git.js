
const { execSync } = require('child_process');
const fs = require('fs');

const logFile = 'git_diagnosis.txt';

function log(header, cmd) {
    try {
        const output = execSync(cmd).toString();
        fs.appendFileSync(logFile, `\n=== ${header} ===\n${output}\n`);
    } catch (e) {
        fs.appendFileSync(logFile, `\n=== ${header} ===\nERROR: ${e.message}\nSTDOUT: ${e.stdout?.toString()}\nSTDERR: ${e.stderr?.toString()}\n`);
    }
}

fs.writeFileSync(logFile, 'Git Diagnosis\n');

log('STATUS', 'git status');
log('REMOTE', 'git remote -v');
log('LAST COMMIT', 'git log -1 --stat');
log('DIFF WITH REMOTE HEAD', 'git diff HEAD origin/main --name-only');
log('UNPUSHED COMMITS', 'git log origin/main..HEAD --oneline');
