
const { execSync } = require('child_process');
const fs = require('fs');

const potentialJunk = [
    'branch_check.txt',
    'check_pppoe_db.ts',
    'check_push.ts',
    'check_push_result.txt',
    'check_status.js',
    'check_status_js.txt',
    'commit_debug.js',
    'commit_debug.txt',
    'db_check_log.txt',
    'db_check_log_2.txt',
    'db_check_result.txt',
    'debug-git.ts',
    'deploy.ts',
    'deploy_log.txt',
    'force_push.js',
    'force_push_log.txt',
    'git_branch_output.txt',
    'git_commit_retry.txt',
    'git_debug_log_local.txt',
    'git_diff.txt',
    'git_file_log.txt',
    'git_final_log.txt',
    'git_log_utf8.txt',
    'git_push_log.txt',
    'git_push_retry.txt',
    'git_staged_diff.txt',
    'git_status.txt',
    'git_status_capture.txt',
    'git_status_check.txt',
    'git_status_debug.txt',
    'git_status_output.txt',
    'git_status_utf8.txt',
    'git_sync_check.txt',
    'log_check.txt',
    'push_log.txt',
    'remote_head.txt',
    'status_check.txt',
    'sync_debug.js',
    'sync_debug_result.txt',
    'sync_git.ts',
    'tracked_files_list.txt',
    'DEBUG_TIMESTAMP.txt',
    'VERIFY_FIX.txt',
    'apps/api/api_start.log',
    'apps/api/error.log',
    'apps/api/verif.log',
    'apps/api/verif2.log',
    'apps/api/verif3.log',
    'apps/api/verif4.log',
    'apps/api/syntax_error.txt',
    'apps/web/web_start.log',
];

// Add wildcard-like matching for debug-*.ts in api
const extraApiFiles = [
    'check_db.ts',
    'debug-check-down-hosts.ts',
    'debug-compare.ts',
    'debug-hash.ts',
    'debug-http-request.ts',
    'debug-mikrotik-raw.ts',
    'debug-netwatch-data.ts',
    'debug-netwatch.ts',
    'debug-require.cjs',
    'debug-thought.ts',
    'debug-update-netwatch.ts',
    'inspect-auth.ts',
    'simulate-frontend-update.ts',
    'test-netwatch-sync.ts',
    'test-router-permissions.ts',
    'test-update-scenarios.ts',
];

const allJunk = [...potentialJunk, ...extraApiFiles.map(f => 'apps/api/' + f)];

let trackedJunk = [];
let untrackedJunk = [];

console.log('Checking files...');

allJunk.forEach(file => {
    if (fs.existsSync(file)) {
        try {
            // Check if tracked
            execSync(`git ls-files --error-unmatch "${file}"`, { stdio: 'ignore' });
            trackedJunk.push(file);
        } catch (e) {
            untrackedJunk.push(file);
        }
    }
});

console.log('TRACKED JUNK (To be git removed):');
trackedJunk.forEach(f => console.log(f));

console.log('\nUNTRACKED JUNK (To be locally deleted):');
untrackedJunk.forEach(f => console.log(f));

fs.writeFileSync('cleanup_plan.txt', JSON.stringify({ tracked: trackedJunk, untracked: untrackedJunk }, null, 2));
