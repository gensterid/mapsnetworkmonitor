
const { execSync } = require('child_process');
const fs = require('fs');

try {
    const log = execSync('git log -1').toString();
    fs.writeFileSync('log_final_safe.txt', log, 'utf8');
} catch (e) {
    fs.writeFileSync('log_final_safe.txt', 'Error: ' + e.message, 'utf8');
}
