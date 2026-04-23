// src/cli/result.ts
// Print result.txt for a given job ID. Exit 1 if still running.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Supervisor } from '../specialist/supervisor.js';
import { createObservabilitySqliteClient } from '../specialist/observability-sqlite.js';
import { parseTimelineEvent } from '../specialist/timeline-events.js';
import { resolveNodeRefWithClient, resolveSingleActiveNodeRef } from '../specialist/node-resolve.js';
import { formatCostUsd, formatTokenUsageSummary } from './format-helpers.js';
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
function parseArgs(argv) {
    let jobId;
    let nodeId;
    let memberKey;
    let wait = false;
    let json = false;
    let timeout;
    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];
        if (token === '--wait') {
            wait = true;
            continue;
        }
        if (token === '--json') {
            json = true;
            continue;
        }
        if (token === '--node' && argv[i + 1]) {
            nodeId = argv[++i];
            continue;
        }
        if ((token === '--member' || token === '--member-key') && argv[i + 1]) {
            memberKey = argv[++i];
            continue;
        }
        if (token === '--timeout' && argv[i + 1]) {
            const parsed = parseInt(argv[++i], 10);
            if (isNaN(parsed) || parsed <= 0) {
                console.error('Error: --timeout must be a positive integer (seconds)');
                process.exit(1);
            }
            timeout = parsed;
            continue;
        }
        if (!token.startsWith('--') && !jobId) {
            jobId = token;
            continue;
        }
    }
    if (!jobId && !(nodeId && memberKey) && !memberKey) {
        console.error('Usage: specialists|sp result <node-ref>:<member> [--wait] [--timeout <seconds>] [--json]\n       specialists|sp result <job-id> [--wait] [--timeout <seconds>] [--json]\n       specialists|sp result --node <node-ref> --member <member-key> [--wait] [--timeout <seconds>] [--json]\n       specialists|sp result --member <member-key> [--wait] [--timeout <seconds>] [--json]');
        process.exit(1);
    }
    if (jobId && jobId.includes(':') && !nodeId && !memberKey) {
        const separatorIndex = jobId.indexOf(':');
        nodeId = jobId.slice(0, separatorIndex);
        memberKey = jobId.slice(separatorIndex + 1);
        jobId = undefined;
    }
    if (nodeId !== undefined && nodeId.length === 0) {
        console.error('Error: node ref cannot be empty');
        process.exit(1);
    }
    if (memberKey !== undefined && memberKey.length === 0) {
        console.error('Error: member key cannot be empty');
        process.exit(1);
    }
    if (!jobId && !memberKey) {
        console.error('Usage: specialists|sp result <node-ref>:<member> [--wait] [--timeout <seconds>] [--json]\n       specialists|sp result <job-id> [--wait] [--timeout <seconds>] [--json]\n       specialists|sp result --node <node-ref> --member <member-key> [--wait] [--timeout <seconds>] [--json]\n       specialists|sp result --member <member-key> [--wait] [--timeout <seconds>] [--json]');
        process.exit(1);
    }
    return { jobId, nodeId, memberKey, wait, json, timeout };
}
function resolveJobIdFromNodeMember(sqliteClient, nodeId, memberKey) {
    const nodeRun = sqliteClient.readNodeRun(nodeId);
    if (!nodeRun) {
        throw new Error(`Node run not found: ${nodeId}`);
    }
    const member = sqliteClient.readNodeMembers(nodeId).find((entry) => entry.member_id === memberKey);
    if (!member) {
        throw new Error(`Member '${memberKey}' not found in node '${nodeId}'`);
    }
    if (!member.job_id) {
        throw new Error(`Member '${memberKey}' in node '${nodeId}' has no job id yet`);
    }
    return member.job_id;
}
function readTimelineEventsForResult(sqliteClient, jobsDir, jobId) {
    if (sqliteClient) {
        try {
            return sqliteClient.readEvents(jobId);
        }
        catch {
            // fallback to file
        }
    }
    const eventsPath = join(jobsDir, jobId, 'events.jsonl');
    if (!existsSync(eventsPath))
        return [];
    return readFileSync(eventsPath, 'utf-8')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => parseTimelineEvent(line))
        .filter((event) => event !== null);
}
function deriveStartupSnapshot(status, events) {
    const runStartEvent = events.find((event) => event.type === 'run_start');
    const startupFromEvent = runStartEvent?.type === 'run_start' ? (runStartEvent.startup_snapshot ?? null) : null;
    const memoryMeta = events.find((event) => event.type === 'meta' && !!event.memory_injection);
    const memoryInjection = memoryMeta?.type === 'meta' ? memoryMeta.memory_injection : undefined;
    const merged = {
        ...(startupFromEvent ?? {}),
        ...(status.startup_context ?? {}),
        ...(memoryInjection ? { memory_injection: memoryInjection } : {}),
    };
    if (!merged.job_id)
        merged.job_id = status.id;
    if (!merged.specialist_name)
        merged.specialist_name = status.specialist;
    if (!merged.bead_id && status.bead_id)
        merged.bead_id = status.bead_id;
    if (!merged.reused_from_job_id && status.reused_from_job_id)
        merged.reused_from_job_id = status.reused_from_job_id;
    if (!merged.worktree_owner_job_id && status.worktree_owner_job_id)
        merged.worktree_owner_job_id = status.worktree_owner_job_id;
    if (!merged.chain_id && status.chain_id)
        merged.chain_id = status.chain_id;
    if (!merged.chain_root_job_id && status.chain_root_job_id)
        merged.chain_root_job_id = status.chain_root_job_id;
    if (!merged.chain_root_bead_id && status.chain_root_bead_id)
        merged.chain_root_bead_id = status.chain_root_bead_id;
    if (!merged.worktree_path && status.worktree_path)
        merged.worktree_path = status.worktree_path;
    if (!merged.branch && status.branch)
        merged.branch = status.branch;
    return Object.keys(merged).length > 0 ? merged : null;
}
function deriveApiError(events) {
    const errorEvent = [...events].reverse().find((event) => event.type === 'error');
    return errorEvent?.error_message ?? null;
}
function formatStartupSnapshot(snapshot) {
    if (!snapshot)
        return null;
    const lines = ['\n--- startup context ---'];
    const push = (key, value) => {
        if (value === undefined || value === null)
            return;
        lines.push(`${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`);
    };
    push('job_id', snapshot.job_id);
    push('specialist_name', snapshot.specialist_name);
    push('bead_id', snapshot.bead_id);
    push('reused_from_job_id', snapshot.reused_from_job_id);
    push('worktree_owner_job_id', snapshot.worktree_owner_job_id);
    push('chain_id', snapshot.chain_id);
    push('chain_root_job_id', snapshot.chain_root_job_id);
    push('chain_root_bead_id', snapshot.chain_root_bead_id);
    push('worktree_path', snapshot.worktree_path);
    push('branch', snapshot.branch);
    push('variables_keys', snapshot.variables_keys);
    push('reviewed_job_id_present', snapshot.reviewed_job_id_present);
    push('reused_worktree_awareness_present', snapshot.reused_worktree_awareness_present);
    push('bead_context_present', snapshot.bead_context_present);
    if (snapshot.memory_injection) {
        push('memory.static_tokens', snapshot.memory_injection.static_tokens);
        push('memory.memory_tokens', snapshot.memory_injection.memory_tokens);
        push('memory.gitnexus_tokens', snapshot.memory_injection.gitnexus_tokens);
        push('memory.total_tokens', snapshot.memory_injection.total_tokens);
    }
    if (snapshot.skills) {
        push('skills.count', snapshot.skills.count);
        push('skills.activated', snapshot.skills.activated);
    }
    lines.push('---');
    return `${lines.join('\n')}\n`;
}
export async function run() {
    const args = parseArgs(process.argv.slice(3));
    const emitJson = (status, output, error, startupContext = null) => {
        console.log(JSON.stringify({
            job: status ? {
                id: status.id,
                specialist: status.specialist,
                status: status.status,
                model: status.model ?? null,
                backend: status.backend ?? null,
                bead_id: status.bead_id ?? null,
                metrics: status.metrics ?? null,
                startup_context: startupContext,
                error: status.error ?? null,
            } : null,
            output,
            startup_context: startupContext,
            error,
        }, null, 2));
    };
    const jobsDir = join(process.cwd(), '.specialists', 'jobs');
    const supervisor = new Supervisor({ runner: null, runOptions: null, jobsDir });
    const sqliteClient = createObservabilitySqliteClient();
    const emitHumanResult = (output, status, startupContext, trailingFooter) => {
        const startupBlock = formatStartupSnapshot(startupContext);
        process.stdout.write(startupBlock ? `${startupBlock}${output}` : output);
        const tokenSummaryParts = formatTokenUsageSummary(status.metrics?.token_usage).filter((part) => !part.startsWith('cost='));
        const formattedCost = formatCostUsd(status.metrics?.token_usage?.cost_usd);
        if (tokenSummaryParts.length === 0 && !formattedCost) {
            if (trailingFooter)
                process.stderr.write(dim(trailingFooter));
            return;
        }
        const footerParts = [];
        if (tokenSummaryParts.length > 0)
            footerParts.push(tokenSummaryParts.join(' · '));
        if (formattedCost)
            footerParts.push(`cost_usd=${formattedCost}`);
        process.stderr.write(dim(`\n--- metrics: ${footerParts.join(' · ')} ---\n`));
        if (trailingFooter)
            process.stderr.write(dim(trailingFooter));
    };
    try {
        const jobId = (() => {
            if (args.jobId)
                return args.jobId;
            if (!sqliteClient || !args.memberKey) {
                throw new Error('Observability SQLite DB is unavailable. Run: specialists db setup');
            }
            const resolvedNodeId = args.nodeId
                ? resolveNodeRefWithClient(args.nodeId, sqliteClient)
                : resolveSingleActiveNodeRef(sqliteClient);
            return resolveJobIdFromNodeMember(sqliteClient, resolvedNodeId, args.memberKey);
        })();
        const resultPath = join(jobsDir, jobId, 'result.txt');
        const readResultOutput = () => {
            try {
                const sqliteResult = sqliteClient?.readResult(jobId) ?? null;
                if (sqliteResult)
                    return sqliteResult;
            }
            catch (error) {
                console.warn(`SQLite result read failed for job ${jobId}; falling back to result.txt`, error);
            }
            if (!existsSync(resultPath)) {
                return null;
            }
            return readFileSync(resultPath, 'utf-8');
        };
        if (args.wait) {
            const startMs = Date.now();
            while (true) {
                const status = supervisor.readStatus(jobId);
                if (!status) {
                    if (args.json) {
                        emitJson(null, null, `No job found: ${jobId}`);
                    }
                    else {
                        console.error(`No job found: ${jobId}`);
                    }
                    process.exit(1);
                }
                if (status.status === 'done') {
                    const events = readTimelineEventsForResult(sqliteClient, jobsDir, jobId);
                    const startupContext = deriveStartupSnapshot(status, events);
                    const apiError = status.error ?? deriveApiError(events);
                    const output = readResultOutput();
                    if (!output) {
                        const message = apiError
                            ? `Job ${jobId} failed: ${apiError}`
                            : `Result not found for job ${jobId}`;
                        if (args.json) {
                            emitJson(status, null, message, startupContext);
                        }
                        else {
                            process.stderr.write(`${red(message)}\n`);
                        }
                        process.exit(1);
                    }
                    const enrichedStatus = apiError && !status.error ? { ...status, error: apiError } : status;
                    if (args.json) {
                        emitJson(enrichedStatus, output, null, startupContext);
                    }
                    else {
                        emitHumanResult(output, enrichedStatus, startupContext);
                    }
                    return;
                }
                if (status.status === 'error') {
                    const startupContext = deriveStartupSnapshot(status, readTimelineEventsForResult(sqliteClient, jobsDir, jobId));
                    const message = `Job ${jobId} failed: ${status.error ?? 'unknown error'}`;
                    if (args.json) {
                        emitJson(status, null, message, startupContext);
                    }
                    else {
                        process.stderr.write(`${red(`Job ${jobId} failed:`)} ${status.error ?? 'unknown error'}\n`);
                    }
                    process.exit(1);
                }
                // Check timeout before sleeping
                if (args.timeout !== undefined) {
                    const elapsedSecs = (Date.now() - startMs) / 1000;
                    if (elapsedSecs >= args.timeout) {
                        const timeoutMessage = `Timeout: job ${jobId} did not complete within ${args.timeout}s`;
                        if (args.json) {
                            const startupContext = deriveStartupSnapshot(status, readTimelineEventsForResult(sqliteClient, jobsDir, jobId));
                            emitJson(status, null, timeoutMessage, startupContext);
                        }
                        else {
                            process.stderr.write(`${timeoutMessage}\n`);
                        }
                        process.exit(1);
                    }
                }
                // Still starting/running/waiting — poll at 1s intervals
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        // ── Original non-wait behavior ─────────────────────────────────────────────
        const status = supervisor.readStatus(jobId);
        if (!status) {
            if (args.json) {
                emitJson(null, null, `No job found: ${jobId}`);
            }
            else {
                console.error(`No job found: ${jobId}`);
            }
            process.exit(1);
        }
        if (status.status === 'running' || status.status === 'starting') {
            const startupContext = deriveStartupSnapshot(status, readTimelineEventsForResult(sqliteClient, jobsDir, jobId));
            const output = readResultOutput();
            if (!output) {
                const message = `Job ${jobId} is still ${status.status}. Use 'specialists feed --job ${jobId}' to follow.`;
                if (args.json) {
                    emitJson(status, null, message, startupContext);
                }
                else {
                    process.stderr.write(`${dim(message)}\n`);
                }
                process.exit(1);
            }
            if (args.json) {
                emitJson(status, output, null, startupContext);
            }
            else {
                process.stderr.write(`${dim(`Job ${jobId} is currently ${status.status}. Showing last completed output while it continues.`)}\n`);
                emitHumanResult(output, status, startupContext);
            }
            return;
        }
        if (status.status === 'waiting') {
            const startupContext = deriveStartupSnapshot(status, readTimelineEventsForResult(sqliteClient, jobsDir, jobId));
            const output = readResultOutput();
            if (!output) {
                const message = `Job ${jobId} is waiting for input. Use: specialists resume ${jobId} "..."`;
                if (args.json) {
                    emitJson(status, null, message, startupContext);
                }
                else {
                    process.stderr.write(`${dim(message)}\n`);
                }
                process.exit(1);
            }
            const waitingFooter = `\n--- Session is waiting for your input. Use: specialists resume ${jobId} "..." ---\n`;
            if (args.json) {
                emitJson(status, `${output}${waitingFooter}`, null, startupContext);
            }
            else {
                emitHumanResult(output, status, startupContext, waitingFooter);
            }
            return;
        }
        if (status.status === 'error') {
            const events = readTimelineEventsForResult(sqliteClient, jobsDir, jobId);
            const startupContext = deriveStartupSnapshot(status, events);
            const message = `Job ${jobId} failed: ${status.error ?? deriveApiError(events) ?? 'unknown error'}`;
            if (args.json) {
                emitJson(status, null, message, startupContext);
            }
            else {
                process.stderr.write(`${red(`Job ${jobId} failed:`)} ${status.error ?? deriveApiError(events) ?? 'unknown error'}\n`);
            }
            process.exit(1);
        }
        const events = readTimelineEventsForResult(sqliteClient, jobsDir, jobId);
        const apiError = status.error ?? deriveApiError(events);
        const output = readResultOutput();
        if (!output) {
            const message = apiError ? `Job ${jobId} failed: ${apiError}` : `Result not found for job ${jobId}`;
            if (args.json) {
                emitJson(status, null, message);
            }
            else {
                process.stderr.write(`${red(message)}\n`);
            }
            process.exit(1);
        }
        const startupContext = deriveStartupSnapshot(status, events);
        const enrichedStatus = apiError && !status.error ? { ...status, error: apiError } : status;
        if (args.json) {
            emitJson(enrichedStatus, output, null, startupContext);
            return;
        }
        emitHumanResult(output, enrichedStatus, startupContext);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (args.json) {
            emitJson(null, null, message);
        }
        else {
            console.error(message);
        }
        process.exit(1);
    }
    finally {
        sqliteClient?.close();
        await supervisor.dispose();
    }
}
//# sourceMappingURL=result.js.map