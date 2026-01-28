
const { execSync } = require('child_process');
const fs = require('fs');

try {
    const status = execSync('git status').toString();
    fs.writeFileSync('status_final_safe.txt', status, 'utf8');
} catch (e) {
    fs.writeFileSync('status_final_safe.txt', 'Error: ' + e.message, 'utf8');
}
