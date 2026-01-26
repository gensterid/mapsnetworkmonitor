
import { execSync } from 'child_process';
import * as fs from 'fs';

try {
    const status = execSync('git status').toString();
    const log = execSync('git log -1').toString();
    const result = `STATUS:\n${status}\n\nLOG:\n${log}`;
    fs.writeFileSync('check_push_result.txt', result, 'utf8');
} catch (e: any) {
    fs.writeFileSync('check_push_result.txt', 'Error: ' + e.message, 'utf8');
}
