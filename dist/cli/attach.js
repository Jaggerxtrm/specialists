import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
function exitWithError(message) {
    console.error(message);
    process.exit(1);
}
function readStatus(statusPath, jobId) {
    try {
        return JSON.parse(readFileSync(statusPath, 'utf-8'));
    }
    catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            exitWithError(`Job \`${jobId}\` not found. Run \`specialists status\` to see active jobs.`);
        }
        const details = error instanceof Error ? error.message : String(error);
        exitWithError(`Failed to read status for job \`${jobId}\`: ${details}`);
    }
}
export async function run() {
    const [jobId] = process.argv.slice(3);
    if (!jobId) {
        exitWithError('Usage: specialists attach <job-id>');
    }
    const jobsDir = join(process.cwd(), '.specialists', 'jobs');
    const statusPath = join(jobsDir, jobId, 'status.json');
    const status = readStatus(statusPath, jobId);
    if (status.status === 'done' || status.status === 'error') {
        exitWithError(`Job \`${jobId}\` has already completed (status: ${status.status}). Use \`specialists result ${jobId}\` to read output.`);
    }
    const sessionName = status.tmux_session?.trim();
    if (!sessionName) {
        exitWithError('Job `' + jobId + '` has no tmux session. It may have been started without tmux or tmux was not installed.');
    }
    const whichTmux = spawnSync('which', ['tmux'], { stdio: 'ignore' });
    if (whichTmux.status !== 0) {
        exitWithError('tmux is not installed. Install tmux to use `specialists attach`.');
    }
    try {
        execFileSync('tmux', ['attach-session', '-t', sessionName], { stdio: 'inherit' });
    }
    catch {
        process.exit(1);
    }
}
//# sourceMappingURL=attach.js.map