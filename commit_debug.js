
const { execSync } = require('child_process');
const fs = require('fs');

const logFile = 'commit_debug.txt';

try {
    try {
        execSync('git add .'); // Try adding everything just in case paths were wrong
        const out = execSync('git commit -m "fix: sync all changes"');
        fs.writeFileSync(logFile, 'Success:\n' + out.toString());
    } catch (e) {
        fs.writeFileSync(logFile, 'Error:\n' + e.message + '\nSTDERR:\n' + (e.stderr ? e.stderr.toString() : 'NONE') + '\nSTDOUT:\n' + (e.stdout ? e.stdout.toString() : 'NONE'));
    }
} catch (err) {
    fs.writeFileSync(logFile, 'Script Error: ' + err.message);
}
