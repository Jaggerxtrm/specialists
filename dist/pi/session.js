// src/pi/session.ts
export class SessionKilledError extends Error {
    constructor() {
        super('Session was killed');
        this.name = 'SessionKilledError';
    }
}
export class StallTimeoutError extends Error {
    constructor(timeoutMs) {
        super(`Session stalled: no activity for ${timeoutMs}ms`);
        this.name = 'StallTimeoutError';
    }
}
//
// PiAgentSession wraps the `pi` CLI (global binary) in --mode rpc.
// Events are emitted per the pi RPC protocol over stdout (NDJSON).
//
// Pi RPC event layers (per docs/pi-rpc.md):
//
// Top-level events:
//   response              — ack that prompt command was received
//   agent_start           — agent begins processing
//   turn_start/end        — conversation turn boundaries
//   message_start/end     — message boundaries
//   message_update        — streaming update; carries .assistantMessageEvent
//   tool_execution_start  — tool begins executing (top-level)
//   tool_execution_update — tool execution progress (top-level)
//   tool_execution_end    — tool execution complete (top-level)
//   agent_end             — run complete, contains all generated messages
//
// Nested under message_update.assistantMessageEvent:
//   text_start/delta/end    — text token streaming
//   thinking_start/delta/end — thinking token streaming
//   toolcall_start/delta/end — LLM tool-call construction
//   done                    — message-level completion
//   error                   — message-level error
//
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { isAbsolute, resolve, sep, join, dirname } from 'node:path';
import { mapSpecialistBackend, getProviderArgs } from './backendMap.js';
const TEST_COMMAND_STALL_TIMEOUT_MS = 300_000;
const TEST_COMMAND_PATTERNS = [
    /(?:^|\s)(?:bun\s+--bun\s+)?vitest(?:\s|$)/i,
    /(?:^|\s)bun\s+test(?:\s|$)/i,
    /(?:^|\s)npm\s+test(?:\s|$)/i,
    /(?:^|\s)(?:pnpm|yarn)\s+test(?:\s|$)/i,
    /(?:^|\s)(?:node\s+)?jest(?:\s|$)/i,
    /(?:^|\s)pytest(?:\s|$)/i,
];
/** Maps specialist permission_required to pi --tools argument.
 *
 *  READ_ONLY : read, grep, find, ls           — no bash, no writes
 *  LOW       : + bash                          — inspect/run commands, no file edits
 *  MEDIUM    : + edit                          — can edit existing files
 *  HIGH      : + write                         — full access, can create new files
 */
function mapPermissionToTools(level) {
    switch (level?.toUpperCase()) {
        case 'READ_ONLY': return 'read,grep,find,ls';
        case 'LOW': return 'read,bash,grep,find,ls';
        case 'MEDIUM': return 'read,bash,edit,grep,find,ls';
        case 'HIGH': return 'read,bash,edit,write,grep,find,ls';
        default: return undefined;
    }
}
function resolveGlobalNodeModulesDir() {
    const candidates = [
        process.env.PI_NPM_GLOBAL_DIR,
        process.env.NPM_CONFIG_PREFIX ? join(process.env.NPM_CONFIG_PREFIX, 'lib', 'node_modules') : undefined,
        process.env.npm_config_prefix ? join(process.env.npm_config_prefix, 'lib', 'node_modules') : undefined,
        process.env.NVM_BIN ? join(dirname(process.env.NVM_BIN), 'lib', 'node_modules') : undefined,
        join(homedir(), '.nvm/versions/node', process.version, 'lib', 'node_modules'),
    ].filter((candidate) => Boolean(candidate));
    return candidates.find(candidate => existsSync(candidate));
}
function asNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value))
        return value;
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}
function pickFirstNumber(record, keys) {
    for (const key of keys) {
        const value = asNumber(record[key]);
        if (value !== undefined)
            return value;
    }
    return undefined;
}
function normalizeTokenUsage(candidate) {
    if (!candidate || typeof candidate !== 'object')
        return undefined;
    const usage = candidate;
    const cost = usage.cost;
    const normalized = {
        input_tokens: pickFirstNumber(usage, ['input_tokens', 'inputTokens', 'prompt_tokens', 'promptTokens', 'input']),
        output_tokens: pickFirstNumber(usage, ['output_tokens', 'outputTokens', 'completion_tokens', 'completionTokens', 'output']),
        cache_creation_tokens: pickFirstNumber(usage, ['cache_creation_tokens', 'cacheCreationTokens', 'cache_write_tokens', 'cacheWrite']),
        cache_read_tokens: pickFirstNumber(usage, ['cache_read_tokens', 'cacheReadTokens', 'cache_hit_tokens', 'cacheRead']),
        total_tokens: pickFirstNumber(usage, ['total_tokens', 'totalTokens']),
        cost_usd: pickFirstNumber(usage, ['cost_usd', 'costUsd', 'usd_cost', 'cost'])
            ?? (typeof cost === 'object' && cost !== null
                ? pickFirstNumber(cost, ['total', 'usd', 'cost_usd'])
                : undefined),
    };
    const hasAny = Object.values(normalized).some(value => value !== undefined);
    if (!hasAny)
        return undefined;
    if (normalized.total_tokens === undefined) {
        const components = [
            normalized.input_tokens,
            normalized.output_tokens,
            normalized.cache_creation_tokens,
            normalized.cache_read_tokens,
        ].filter((value) => value !== undefined);
        if (components.length > 0) {
            normalized.total_tokens = components.reduce((sum, value) => sum + value, 0);
        }
    }
    return Object.fromEntries(Object.entries(normalized).filter(([, value]) => value !== undefined));
}
function findFinishReason(payload) {
    if (!payload || typeof payload !== 'object')
        return undefined;
    const record = payload;
    const direct = record.stopReason ?? record.finishReason ?? record.finish_reason ?? record.reason;
    if (typeof direct === 'string' && direct.trim().length > 0)
        return direct;
    return undefined;
}
function findTokenUsage(payload) {
    if (!payload || typeof payload !== 'object')
        return undefined;
    const record = payload;
    const message = (record.message && typeof record.message === 'object') ? record.message : undefined;
    const assistantMessage = Array.isArray(record.messages)
        ? [...record.messages]
            .reverse()
            .find((m) => !!m && typeof m === 'object' && m.role === 'assistant')
        : undefined;
    const candidates = [
        record.usage,
        record.tokenUsage,
        record.token_usage,
        message?.usage,
        message?.tokenUsage,
        message?.token_usage,
        assistantMessage?.usage,
        assistantMessage?.tokenUsage,
        assistantMessage?.token_usage,
        record.stats?.usage,
        record.stats?.tokenUsage,
        record.result?.usage,
        record.result?.tokenUsage,
        record.assistantMessageEvent?.usage,
        record.assistantMessageEvent?.tokenUsage,
    ];
    for (const candidate of candidates) {
        const normalized = normalizeTokenUsage(candidate);
        if (normalized)
            return normalized;
    }
    return normalizeTokenUsage(record);
}
function findApiErrorMessage(payload) {
    if (!payload || typeof payload !== 'object')
        return undefined;
    const record = payload;
    const direct = [record.errorMessage, record.error_message, record.error, record.message]
        .find((value) => typeof value === 'string' && value.trim().length > 0);
    if (typeof direct === 'string')
        return direct.trim();
    const nestedError = record.error;
    if (nestedError && typeof nestedError === 'object') {
        const nested = nestedError;
        const nestedMessage = [nested.message, nested.errorMessage, nested.error_message]
            .find((value) => typeof value === 'string' && value.trim().length > 0);
        if (typeof nestedMessage === 'string')
            return nestedMessage.trim();
    }
    const message = record.assistantMessageEvent;
    if (message && typeof message === 'object') {
        const nested = message;
        const nestedMessage = [nested.errorMessage, nested.error_message, nested.error, nested.message]
            .find((value) => typeof value === 'string' && value.trim().length > 0);
        if (typeof nestedMessage === 'string')
            return nestedMessage.trim();
    }
    return undefined;
}
function extractApiErrorFromStderr(stderr) {
    const compact = stderr.trim();
    if (!compact)
        return undefined;
    const patterns = [
        /You have hit your ChatGPT usage limit[^\n]*/i,
        /rate limit[^\n]*/i,
        /quota[^\n]*/i,
        /auth(?:entication)?[^\n]*/i,
        /unauthori[sz]ed[^\n]*/i,
        /forbidden[^\n]*/i,
        /overloaded[^\n]*/i,
    ];
    for (const pattern of patterns) {
        const match = compact.match(pattern);
        if (match)
            return match[0].trim();
    }
    return undefined;
}
function normalizeToolResultPart(contentPart) {
    if (!contentPart || typeof contentPart !== 'object')
        return undefined;
    const part = contentPart;
    const text = part.text;
    if (typeof text === 'string' && text.trim().length > 0)
        return text;
    const content = part.content;
    if (typeof content === 'string' && content.trim().length > 0)
        return content;
    const output = part.output;
    if (typeof output === 'string' && output.trim().length > 0)
        return output;
    return undefined;
}
function findToolResultContent(payload) {
    if (!payload || typeof payload !== 'object')
        return undefined;
    const record = payload;
    const result = record.result;
    if (!result || typeof result !== 'object')
        return undefined;
    const resultRecord = result;
    const content = resultRecord.content;
    if (Array.isArray(content)) {
        const parts = content
            .map(normalizeToolResultPart)
            .filter((value) => typeof value === 'string' && value.length > 0);
        if (parts.length > 0)
            return parts.join('\n');
    }
    if (typeof resultRecord.content === 'string' && resultRecord.content.trim().length > 0) {
        return resultRecord.content;
    }
    if (typeof resultRecord.output === 'string' && resultRecord.output.trim().length > 0) {
        return resultRecord.output;
    }
    return undefined;
}
function findToolResultRaw(payload) {
    if (!payload || typeof payload !== 'object')
        return undefined;
    const record = payload;
    const result = record.result;
    if (!result || typeof result !== 'object' || Array.isArray(result))
        return undefined;
    return result;
}
function findStringValue(payload, keys) {
    if (!payload || typeof payload !== 'object')
        return undefined;
    const record = payload;
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' && value.trim().length > 0)
            return value;
    }
    return undefined;
}
function extractBashCommand(args) {
    if (!args)
        return undefined;
    const command = args.command ?? args.cmd ?? args.script;
    if (typeof command !== 'string')
        return undefined;
    const normalizedCommand = command.trim();
    return normalizedCommand.length > 0 ? normalizedCommand : undefined;
}
function isTestCommand(command) {
    return TEST_COMMAND_PATTERNS.some((pattern) => pattern.test(command));
}
const WRITE_BOUNDARY_TOOL_NAMES = new Set(['edit', 'write', 'multiEdit', 'notebookEdit']);
const WORKTREE_BOUNDARY_ENV_KEY = 'SPECIALISTS_WORKTREE_BOUNDARY';
function isPathWithinBoundary(path, boundary) {
    const resolvedPath = resolve(path);
    const resolvedBoundary = resolve(boundary);
    if (resolvedPath === resolvedBoundary)
        return true;
    const boundaryPrefix = resolvedBoundary.endsWith(sep) ? resolvedBoundary : `${resolvedBoundary}${sep}`;
    return resolvedPath.startsWith(boundaryPrefix);
}
export function validateWriteToolPathAgainstBoundary(toolName, toolArgs, worktreeBoundary) {
    if (!worktreeBoundary)
        return undefined;
    if (!WRITE_BOUNDARY_TOOL_NAMES.has(toolName))
        return undefined;
    if (!toolArgs || typeof toolArgs !== 'object')
        return undefined;
    const candidatePath = typeof toolArgs.path === 'string'
        ? toolArgs.path
        : (typeof toolArgs.file_path === 'string' ? toolArgs.file_path : undefined);
    if (!candidatePath || !isAbsolute(candidatePath))
        return undefined;
    if (isPathWithinBoundary(candidatePath, worktreeBoundary))
        return undefined;
    const resolvedBoundary = resolve(worktreeBoundary);
    return `Path '${candidatePath}' is outside worktree boundary ('${resolvedBoundary}'). Use a relative path or a path within the worktree.`;
}
function getWorktreeBoundaryExtensionPath(worktreeBoundary) {
    const boundaryHash = createHash('sha256').update(resolve(worktreeBoundary)).digest('hex').slice(0, 16);
    const extensionsDir = join(tmpdir(), 'specialists-pi-extensions');
    try {
        mkdirSync(extensionsDir, { recursive: true });
    }
    catch (err) {
        process.stderr.write(`[worktree-boundary] WARN: could not create extensions directory at ${extensionsDir}: ${err.message}. ` +
            `Boundary enforcement will NOT apply for this session.\n`);
        return null;
    }
    const extensionPath = join(extensionsDir, `worktree-boundary-${boundaryHash}.mjs`);
    if (existsSync(extensionPath))
        return extensionPath;
    const extensionSource = `
import { isAbsolute, resolve } from 'node:path';

const WRITE_TOOLS = new Set(['edit', 'write', 'multiEdit', 'notebookEdit']);
const WORKTREE_BOUNDARY_ENV_KEY = '${WORKTREE_BOUNDARY_ENV_KEY}';

function isPathWithinBoundary(path, boundary) {
  const resolvedPath = resolve(path);
  const resolvedBoundary = resolve(boundary);
  if (resolvedPath === resolvedBoundary) return true;
  return resolvedPath.startsWith(resolvedBoundary.endsWith('/') ? resolvedBoundary : resolvedBoundary + '/');
}

export default function(pi) {
  const worktreeBoundary = process.env[WORKTREE_BOUNDARY_ENV_KEY];
  if (!worktreeBoundary) return;

  pi.on('tool_call', (event) => {
    if (!WRITE_TOOLS.has(event.toolName)) return undefined;

    const input = event.input && typeof event.input === 'object' ? event.input : {};
    const rawPath = typeof input.path === 'string'
      ? input.path
      : (typeof input.file_path === 'string' ? input.file_path : undefined);

    if (!rawPath || !isAbsolute(rawPath)) return undefined;

    if (isPathWithinBoundary(rawPath, worktreeBoundary)) return undefined;

    return {
      block: true,
      reason: \`Path '\${rawPath}' is outside worktree boundary ('\${resolve(worktreeBoundary)}'). Use a relative path or a path within the worktree.\`,
    };
  });
}
`.trimStart();
    try {
        writeFileSync(extensionPath, extensionSource, 'utf-8');
    }
    catch (err) {
        process.stderr.write(`[worktree-boundary] WARN: could not write extension file at ${extensionPath}: ${err.message}. ` +
            `Boundary enforcement will NOT apply for this session.\n`);
        return null;
    }
    return extensionPath;
}
export class PiAgentSession {
    options;
    proc;
    _lastOutput = '';
    _donePromise;
    _doneResolve;
    _doneReject;
    _agentEndReceived = false;
    _killed = false;
    _lineBuffer = ''; // accumulates partial lines split across stdout chunks
    _pendingRequests = new Map();
    _nextRequestId = 1;
    _stderrBuffer = '';
    _apiError;
    _stallTimer;
    _stallError;
    _testWindowToolCallIds = new Set();
    _testWindowWithoutIdCount = 0;
    _metrics = {
        turns: 0,
        tool_calls: 0,
        auto_compactions: 0,
        auto_retries: 0,
    };
    meta;
    constructor(options, meta) {
        this.options = options;
        this.meta = meta;
    }
    static async create(options) {
        const meta = {
            backend: options.model.includes('/')
                ? options.model.split('/')[0]
                : mapSpecialistBackend(options.model),
            model: options.model,
            sessionId: crypto.randomUUID(),
            startedAt: new Date(),
        };
        return new PiAgentSession(options, meta);
    }
    async start() {
        const model = this.options.model;
        const extraArgs = getProviderArgs(model);
        const providerArgs = model.includes('/')
            ? ['--model', model]
            : ['--provider', mapSpecialistBackend(model)];
        const args = [
            '--mode', 'rpc',
            '--no-extensions', // disable ALL auto-discovered xtrm Pi extensions (beads, session-flow, etc.)
            ...providerArgs,
            '--no-session',
            ...extraArgs,
        ];
        // Enforce permission level via --tools flag
        const toolsFlag = mapPermissionToTools(this.options.permissionLevel);
        if (toolsFlag)
            args.push('--tools', toolsFlag);
        // Thinking level (models that don't support it ignore the flag)
        if (this.options.thinkingLevel) {
            args.push('--thinking', this.options.thinkingLevel);
        }
        // Skill files injected natively via pi --skill
        for (const skillPath of this.options.skillPaths ?? []) {
            args.push('--skill', skillPath);
        }
        // Selectively re-enable useful Pi extensions if installed
        const piExtDir = join(homedir(), '.pi', 'agent', 'extensions');
        const permLevel = (this.options.permissionLevel ?? '').toUpperCase();
        if (permLevel !== 'READ_ONLY') {
            const qgPath = join(piExtDir, 'quality-gates');
            if (existsSync(qgPath))
                args.push('-e', qgPath);
        }
        const ssPath = join(piExtDir, 'service-skills');
        if (existsSync(ssPath))
            args.push('-e', ssPath);
        // Caveman extension — terse output for agent-to-agent communication
        const cavemanPath = join(piExtDir, 'caveman');
        if (existsSync(cavemanPath))
            args.push('-e', cavemanPath);
        // npm package extensions (gitnexus, serena) - resolve from global node_modules
        // These are installed via npm, not as directory extensions in ~/.pi/agent/extensions/
        const npmGlobalDir = resolveGlobalNodeModulesDir();
        const excludedExtensions = new Set(this.options.excludeExtensions ?? []);
        if (npmGlobalDir) {
            const gitnexusPackageName = 'pi-gitnexus';
            if (!excludedExtensions.has(gitnexusPackageName)) {
                const gitnexusPath = join(npmGlobalDir, gitnexusPackageName);
                if (existsSync(gitnexusPath))
                    args.push('-e', gitnexusPath);
            }
            const serenaPackageName = 'pi-serena-tools';
            if (!excludedExtensions.has(serenaPackageName)) {
                const serenaPath = join(npmGlobalDir, serenaPackageName);
                if (existsSync(serenaPath))
                    args.push('-e', serenaPath);
            }
        }
        if (this.options.systemPrompt) {
            args.push('--append-system-prompt', this.options.systemPrompt);
        }
        const worktreeBoundary = this.options.worktreeBoundary ? resolve(this.options.worktreeBoundary) : undefined;
        if (worktreeBoundary) {
            const boundaryExtPath = getWorktreeBoundaryExtensionPath(worktreeBoundary);
            if (boundaryExtPath) {
                args.push('-e', boundaryExtPath);
            }
        }
        const sessionCwd = resolve(this.options.cwd ?? process.cwd());
        const baseEnv = { ...process.env, ...(this.options.env ?? {}), CAVEMAN_LEVEL: 'full' };
        this.proc = spawn('pi', args, {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: sessionCwd,
            env: worktreeBoundary
                ? { ...baseEnv, [WORKTREE_BOUNDARY_ENV_KEY]: worktreeBoundary }
                : baseEnv,
        });
        const donePromise = new Promise((resolve, reject) => {
            this._doneResolve = resolve;
            this._doneReject = reject;
        });
        // Prevent unhandled rejection warnings when kill() is called before waitForDone() is awaited
        donePromise.catch(() => { });
        this._donePromise = donePromise;
        this.proc.stderr?.on('data', (chunk) => {
            const text = chunk.toString();
            this._stderrBuffer += text;
            this._apiError ??= extractApiErrorFromStderr(this._stderrBuffer) ?? extractApiErrorFromStderr(text);
        });
        this.proc.stdout?.on('data', (chunk) => {
            // Accumulate into the line buffer — agent_end JSON can be 100KB+,
            // larger than a single stdout chunk (~64KB), so we must reassemble.
            this._lineBuffer += chunk.toString();
            const lines = this._lineBuffer.split('\n');
            // All but the last element are complete lines (last may be partial)
            this._lineBuffer = lines.pop() ?? '';
            for (const line of lines) {
                if (line.trim())
                    this._handleEvent(line);
            }
        });
        this.proc.stdout?.on('end', () => {
            // Flush any remaining buffered content when stdout closes
            if (this._lineBuffer.trim()) {
                this._handleEvent(this._lineBuffer);
                this._lineBuffer = '';
            }
        });
        this.proc.on('close', (code) => {
            this._clearStallTimer();
            if (this._agentEndReceived || this._killed) {
                this._doneResolve?.();
            }
            else if (code === 0 || code === null) {
                this._doneResolve?.();
            }
            else {
                this._doneReject?.(new Error(`pi process exited with code ${code}`));
            }
        });
    }
    _clearStallTimer() {
        if (this._stallTimer) {
            clearTimeout(this._stallTimer);
            this._stallTimer = undefined;
        }
    }
    _isTestWindowActive() {
        return this._testWindowToolCallIds.size > 0 || this._testWindowWithoutIdCount > 0;
    }
    _resolveStallTimeoutMs() {
        const baseTimeoutMs = this.options.stallTimeoutMs;
        if (!baseTimeoutMs || baseTimeoutMs <= 0)
            return undefined;
        if (!this._isTestWindowActive())
            return baseTimeoutMs;
        const testCommandTimeoutMs = this.options.testCommandStallTimeoutMs ?? TEST_COMMAND_STALL_TIMEOUT_MS;
        return Math.max(baseTimeoutMs, testCommandTimeoutMs);
    }
    _activateTestWindow(toolCallId) {
        if (toolCallId) {
            this._testWindowToolCallIds.add(toolCallId);
            return;
        }
        this._testWindowWithoutIdCount += 1;
    }
    _deactivateTestWindow(toolCallId) {
        if (toolCallId) {
            this._testWindowToolCallIds.delete(toolCallId);
            return;
        }
        if (this._testWindowWithoutIdCount > 0) {
            this._testWindowWithoutIdCount -= 1;
        }
    }
    _markActivity() {
        const timeoutMs = this._resolveStallTimeoutMs();
        if (!timeoutMs || this._killed || this._agentEndReceived)
            return;
        this._clearStallTimer();
        this._stallTimer = setTimeout(() => {
            if (this._killed || this._agentEndReceived)
                return;
            const err = new StallTimeoutError(timeoutMs);
            this._stallError = err;
            this.kill(err);
        }, timeoutMs);
    }
    _updateTokenUsage(tokenUsage, source) {
        if (!tokenUsage)
            return;
        this._metrics.token_usage = {
            ...this._metrics.token_usage,
            ...tokenUsage,
        };
        this.options.onMetric?.({ type: 'token_usage', token_usage: tokenUsage, source });
    }
    _updateFinishReason(finishReason, source) {
        if (!finishReason)
            return;
        this._metrics.finish_reason = finishReason;
        this.options.onMetric?.({ type: 'finish_reason', finish_reason: finishReason, source });
    }
    _handleEvent(line) {
        let event;
        try {
            event = JSON.parse(line);
        }
        catch {
            return;
        }
        this._markActivity();
        const { type } = event;
        // ── RPC response (reply to a sendCommand call) ──────────────────────────
        if (type === 'response') {
            const id = event.id;
            if (id !== undefined) {
                const entry = this._pendingRequests.get(id);
                if (entry) {
                    clearTimeout(entry.timer);
                    this._pendingRequests.delete(id);
                    entry.resolve(event);
                }
            }
            return;
        }
        // ── Message boundaries (assistant/toolResult) + metadata ───────────────
        if (type === 'message_start') {
            const role = event.message?.role;
            if (role === 'assistant') {
                this.options.onEvent?.('message_start_assistant');
                const { provider, model } = event.message ?? {};
                if (provider || model) {
                    this.options.onMeta?.({ backend: provider ?? '', model: model ?? '' });
                }
            }
            else if (role === 'toolResult') {
                this.options.onEvent?.('message_start_tool_result');
            }
            return;
        }
        if (type === 'message_end') {
            const role = event.message?.role;
            if (role === 'assistant') {
                this.options.onEvent?.('message_end_assistant');
            }
            else if (role === 'toolResult') {
                this.options.onEvent?.('message_end_tool_result');
            }
            return;
        }
        // ── Turn boundaries ─────────────────────────────────────────────────────
        if (type === 'turn_start') {
            this._metrics.turns = (this._metrics.turns ?? 0) + 1;
            this.options.onEvent?.('turn_start');
            return;
        }
        if (type === 'turn_end') {
            const tokenUsage = findTokenUsage(event);
            const finishReason = findFinishReason(event);
            this._updateTokenUsage(tokenUsage, 'turn_end');
            this._updateFinishReason(finishReason, 'turn_end');
            this.options.onMetric?.({
                type: 'turn_summary',
                turn_index: this._metrics.turns ?? 0,
                ...(tokenUsage ? { token_usage: tokenUsage } : {}),
                ...(finishReason ? { finish_reason: finishReason } : {}),
            });
            this.options.onEvent?.('turn_end');
            return;
        }
        // ── Completion ─────────────────────────────────────────────────────────
        if (type === 'agent_end') {
            const messages = event.messages ?? [];
            const last = [...messages].reverse().find((m) => m.role === 'assistant');
            if (last) {
                this._lastOutput = last.content
                    .filter((c) => c.type === 'text')
                    .map((c) => c.text)
                    .join('');
            }
            this._updateTokenUsage(findTokenUsage(event), 'agent_end');
            this._updateFinishReason(findFinishReason(event), 'agent_end');
            const apiError = findApiErrorMessage(event) ?? this._apiError ?? extractApiErrorFromStderr(this._stderrBuffer);
            if (apiError) {
                this._apiError = apiError;
                this._metrics.api_error = apiError;
                this.options.onMetric?.({ type: 'api_error', source: 'stderr', errorMessage: apiError });
            }
            this._agentEndReceived = true;
            this._clearStallTimer();
            this.options.onEvent?.('agent_end');
            this._doneResolve?.();
            return;
        }
        // ── Tool execution (top-level per RPC docs) ────────────────────────────────
        if (type === 'tool_execution_start') {
            this._metrics.tool_calls = (this._metrics.tool_calls ?? 0) + 1;
            const toolName = event.toolName ?? event.name ?? 'tool';
            const toolArgs = event.args;
            const toolCallId = event.toolCallId;
            const command = toolName === 'bash' ? extractBashCommand(toolArgs) : undefined;
            if (command && isTestCommand(command)) {
                this._activateTestWindow(toolCallId);
                this._markActivity();
            }
            this.options.onToolStart?.(toolName, toolArgs, toolCallId);
            this.options.onEvent?.('tool_execution_start', { toolCallId });
            return;
        }
        if (type === 'tool_execution_update') {
            this.options.onEvent?.('tool_execution_update', { toolCallId: event.toolCallId });
            return;
        }
        if (type === 'tool_execution_end') {
            const toolName = event.toolName ?? event.name ?? 'tool';
            const toolCallId = event.toolCallId;
            this.options.onToolEnd?.(toolName, event.isError ?? false, toolCallId, findToolResultContent(event), findToolResultRaw(event));
            if (toolName === 'bash') {
                this._deactivateTestWindow(toolCallId);
                this._markActivity();
            }
            this.options.onEvent?.('tool_execution_end', { toolCallId });
            return;
        }
        // ── Auto-compaction / auto-retry lifecycle events ──────────────────────────
        if (type === 'auto_compaction_start' || type === 'auto_compaction_end') {
            if (type === 'auto_compaction_end') {
                this._metrics.auto_compactions = (this._metrics.auto_compactions ?? 0) + 1;
            }
            const compactionDetails = {
                tokensBefore: asNumber(event.tokensBefore ?? event.tokens_before),
                summary: findStringValue(event, ['summary']),
                firstKeptEntryId: findStringValue(event, ['firstKeptEntryId', 'first_kept_entry_id']),
            };
            this.options.onMetric?.({
                type: 'compaction',
                phase: type === 'auto_compaction_start' ? 'start' : 'end',
                ...compactionDetails,
            });
            this.options.onEvent?.(type, compactionDetails);
            return;
        }
        if (type === 'auto_retry_start' || type === 'auto_retry_end') {
            if (type === 'auto_retry_end') {
                this._metrics.auto_retries = (this._metrics.auto_retries ?? 0) + 1;
            }
            const retryDetails = {
                attempt: asNumber(event.attempt),
                maxAttempts: asNumber(event.maxAttempts ?? event.max_attempts),
                delayMs: asNumber(event.delayMs ?? event.delay_ms),
                errorMessage: findStringValue(event, ['errorMessage', 'error_message', 'error']),
            };
            this.options.onMetric?.({
                type: 'retry',
                phase: type === 'auto_retry_start' ? 'start' : 'end',
                ...retryDetails,
            });
            this.options.onEvent?.(type, retryDetails);
            return;
        }
        if (type === 'set_model' || type === 'cycle_model') {
            const modelChange = {
                action: type,
                model: findStringValue(event, ['model', 'newModel', 'new_model']),
                previousModel: findStringValue(event, ['previousModel', 'previous_model', 'oldModel', 'old_model']),
            };
            this.options.onMetric?.({ type: 'model_change', ...modelChange });
            this.options.onEvent?.(type, modelChange);
            return;
        }
        if (type === 'extension_error') {
            const extensionError = {
                extension: findStringValue(event, ['extension', 'extensionName', 'name']),
                errorMessage: findStringValue(event, ['errorMessage', 'error_message', 'error']),
            };
            this.options.onMetric?.({ type: 'extension_error', ...extensionError });
            this.options.onEvent?.('extension_error', extensionError);
            return;
        }
        // ── message_update — all streaming deltas are nested here ─────────────────
        if (type === 'message_update') {
            const ae = event.assistantMessageEvent;
            if (!ae)
                return;
            switch (ae.type) {
                case 'text_delta': {
                    const delta = typeof ae.delta === 'string' ? ae.delta : '';
                    if (delta)
                        this.options.onToken?.(delta);
                    this.options.onEvent?.('text', { charCount: delta.length });
                    break;
                }
                case 'thinking_start':
                    this.options.onEvent?.('thinking', { charCount: 0 });
                    break;
                case 'thinking_delta': {
                    const delta = typeof ae.delta === 'string' ? ae.delta : '';
                    if (delta)
                        this.options.onThinking?.(delta);
                    this.options.onEvent?.('thinking', { charCount: delta.length });
                    break;
                }
                case 'toolcall_start':
                    // Tool name known at LLM construction time — set before execution events fire
                    this.options.onToolStart?.(ae.name ?? ae.toolName ?? 'tool');
                    this.options.onEvent?.('toolcall');
                    break;
                case 'toolcall_end':
                    this.options.onEvent?.('toolcall');
                    break;
                case 'done': {
                    // Message-level completion (distinct from run-level agent_end)
                    const tokenUsage = findTokenUsage(ae);
                    const finishReason = findFinishReason(ae);
                    this._updateTokenUsage(tokenUsage, 'message_done');
                    this._updateFinishReason(finishReason, 'message_done');
                    this.options.onEvent?.('message_done');
                    break;
                }
                case 'error': {
                    const apiError = findApiErrorMessage(ae) ?? findApiErrorMessage(event);
                    if (apiError) {
                        this._apiError = apiError;
                        this._metrics.api_error = apiError;
                        this.options.onMetric?.({ type: 'api_error', source: 'rpc', errorMessage: apiError });
                    }
                    this.options.onEvent?.('message_error');
                    break;
                }
            }
        }
    }
    /**
     * Send a JSON command to pi's stdin and return a promise for the response.
     * Each call is assigned a unique ID; concurrent calls are supported.
     */
    sendCommand(cmd, timeoutMs = 30_000) {
        return new Promise((resolve, reject) => {
            if (!this.proc?.stdin) {
                reject(new Error('No stdin available'));
                return;
            }
            const id = this._nextRequestId++;
            const timer = setTimeout(() => {
                this._pendingRequests.delete(id);
                reject(new Error(`RPC timeout: no response for command id=${id} after ${timeoutMs}ms`));
            }, timeoutMs);
            this._pendingRequests.set(id, { resolve, reject, timer });
            this.proc.stdin.write(JSON.stringify({ ...cmd, id }) + '\n', (err) => {
                if (err) {
                    const entry = this._pendingRequests.get(id);
                    if (entry) {
                        clearTimeout(entry.timer);
                        this._pendingRequests.delete(id);
                    }
                    reject(err);
                }
            });
        });
    }
    /**
     * Write the prompt to pi's stdin and await the RPC ack.
     * Stdin is kept open for subsequent RPC commands.
     * Call waitForDone() to block until agent_end, then close() to terminate.
     */
    async prompt(task) {
        this._stallError = undefined;
        this._markActivity();
        const response = await this.sendCommand({ type: 'prompt', message: task });
        if (response?.success === false) {
            throw new Error(`Prompt rejected by pi: ${response.error ?? 'already streaming'}`);
        }
        // NOTE: stdin is intentionally NOT closed here. Call close() after waitForDone()
        // to allow sendCommand() RPC calls between prompt completion and teardown.
    }
    /**
     * Wait for the agent to finish. Optionally times out (throws Error on timeout).
     */
    async waitForDone(timeout) {
        const donePromise = this._donePromise ?? Promise.resolve();
        if (!timeout)
            return donePromise;
        return Promise.race([
            donePromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error(`Specialist timed out after ${timeout}ms`)), timeout)),
        ]);
    }
    /**
     * Get the last assistant output text. Tries RPC first, falls back to in-memory capture.
     */
    async getLastOutput() {
        if (!this.proc?.stdin || !this.proc.stdin.writable) {
            return this._lastOutput;
        }
        try {
            const response = await Promise.race([
                this.sendCommand({ type: 'get_last_assistant_text' }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
            ]);
            return response?.data?.text ?? this._lastOutput;
        }
        catch {
            return this._lastOutput;
        }
    }
    /**
     * Get current session state via RPC.
     */
    async getState() {
        try {
            const response = await Promise.race([
                this.sendCommand({ type: 'get_state' }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
            ]);
            return response?.data;
        }
        catch {
            return null;
        }
    }
    getMetrics() {
        return { ...this._metrics, ...(this._metrics.token_usage ? { token_usage: { ...this._metrics.token_usage } } : {}) };
    }
    /**
     * Close the pi process cleanly by ending stdin (EOF) and waiting for exit.
     */
    async close() {
        if (this._killed)
            return;
        this._clearStallTimer();
        // Send EOF to stdin - pi should exit after this
        this.proc?.stdin?.end();
        // Wait for the process to actually exit
        if (this.proc) {
            await new Promise((resolve) => {
                this.proc.on('close', () => resolve());
                // Fallback: force kill after 2s if process doesn't exit
                setTimeout(() => {
                    if (this.proc && !this._killed) {
                        this.proc.kill();
                    }
                    resolve();
                }, 2000);
            });
        }
    }
    // executeBash removed — pre/post scripts run locally in runner.ts via execSync,
    // not via pi RPC (pi has no bash command in its protocol).
    kill(reason) {
        if (this._killed)
            return; // idempotent – second call (e.g. from finally) is a no-op
        this._killed = true;
        this._clearStallTimer();
        // Best-effort abort signal before SIGKILL
        if (this.proc?.stdin?.writable) {
            try {
                this.proc.stdin.write(JSON.stringify({ type: 'abort' }) + '\n');
            }
            catch { /* ignore */ }
        }
        // Reject all pending RPC requests
        const killError = reason ?? this._stallError ?? new SessionKilledError();
        for (const [, entry] of this._pendingRequests) {
            clearTimeout(entry.timer);
            entry.reject(killError);
        }
        this._pendingRequests.clear();
        this.proc?.kill();
        this.proc = undefined;
        // Reject so waitForDone() can distinguish cancelled vs stalled vs backend failures
        this._doneReject?.(killError);
    }
    /** Returns accumulated stderr output from the pi process. */
    getStderr() {
        return this._stderrBuffer;
    }
    /**
     * Send a mid-run steering message to the Pi agent and await the RPC ack.
     * Pi delivers it after the current assistant turn finishes tool calls.
     */
    async steer(message) {
        if (this._killed || !this.proc?.stdin) {
            throw new Error('Session is not active');
        }
        const response = await this.sendCommand({ type: 'steer', message });
        if (response?.success === false) {
            throw new Error(`Steer rejected by pi: ${response.error ?? 'steer failed'}`);
        }
    }
    /**
     * Queue a follow_up on the Pi session using pi's native follow_up RPC command.
     * This is distinct from resume(): follow_up queues work during a still-running turn,
     * while resume() sends a next-turn prompt to a waiting (idle) session.
     *
     * Not yet implemented — reserved to prevent semantic drift with pi's native follow_up.
     */
    followUp(_task) {
        throw new Error('followUp() is not yet implemented. Use resume() to send a next-turn prompt to a waiting session.');
    }
    /**
     * Start a new turn on the same Pi session (keep-alive multi-turn).
     * Resets done state and sends a new prompt — Pi retains full conversation history.
     * Only valid after waitForDone() has resolved for the previous turn.
     */
    async resume(task, timeout) {
        if (this._killed || !this.proc?.stdin) {
            throw new Error('Session is not active');
        }
        // Reset done state for the new turn
        this._agentEndReceived = false;
        const donePromise = new Promise((resolve, reject) => {
            this._doneResolve = resolve;
            this._doneReject = reject;
        });
        donePromise.catch(() => { });
        this._donePromise = donePromise;
        await this.prompt(task);
        await this.waitForDone(timeout);
    }
}
//# sourceMappingURL=session.js.map