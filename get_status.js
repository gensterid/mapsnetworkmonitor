
const { execSync } = require('child_process');
const fs = require('fs');

try {
    const status = execSync('git status').toString();
    fs.writeFileSync('status_log.txt', status, 'utf8');
} catch (e) {
    fs.writeFileSync('status_log.txt', 'Error: ' + e.message, 'utf8');
}
