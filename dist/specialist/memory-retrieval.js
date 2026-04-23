import { execSync } from 'node:child_process';
import { createObservabilitySqliteClient, } from './observability-sqlite.js';
const DEFAULT_STOP_WORDS = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'i', 'if', 'in', 'is', 'it',
    'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'we', 'with', 'you', 'your', 'replace',
    'implement', 'task', 'run', 'add', 'new', 'use', 'using', 'into', 'when', 'what', 'not', 'only',
]);
const MAX_KEYWORDS = 6;
const MAX_MEMORIES = 10;
const MAX_MEMORY_TOKENS = 600;
const CACHE_MAX_AGE_MS = 60 * 60 * 1000;
export const STATIC_WORKFLOW_RULES_BLOCK = `
## Beads Workflow Quick Rules
- Claim work: \`bd update <id> --claim\`
- Append progress notes: \`bd update <id> --notes "..."\`
- Store reusable insight: \`bd remember "insight"\`
- Close completed issue: \`bd close <id> --reason "done"\`

## Session close checklist
1. \`git add <files>\`
2. \`git commit -m "..."\`
3. \`git push\`
`.trim();
function estimateTokens(text) {
    return Math.ceil(text.length / 4);
}
function normalizeToken(raw) {
    return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').trim();
}
function extractTokens(input) {
    return input
        .split(/\s+/g)
        .map(normalizeToken)
        .filter(token => token.length >= 3 && !DEFAULT_STOP_WORDS.has(token));
}
export function extractMemoryKeywords(title, description) {
    const tokens = [
        ...extractTokens(title),
        ...extractTokens(description ?? ''),
    ];
    const unique = [];
    const seen = new Set();
    for (const token of tokens) {
        if (seen.has(token))
            continue;
        seen.add(token);
        unique.push(token);
        if (unique.length >= MAX_KEYWORDS)
            break;
    }
    return unique;
}
export function parseMemoriesPayload(jsonText) {
    if (!jsonText.trim())
        return [];
    const parsed = JSON.parse(jsonText);
    if (Array.isArray(parsed)) {
        return parsed
            .map((entry) => {
            if (!entry || typeof entry !== 'object')
                return null;
            const maybeRecord = entry;
            const key = typeof maybeRecord.key === 'string' ? maybeRecord.key : null;
            const value = typeof maybeRecord.value === 'string' ? maybeRecord.value : null;
            if (!key || value === null)
                return null;
            return { key, value };
        })
            .filter((entry) => Boolean(entry));
    }
    if (parsed && typeof parsed === 'object') {
        return Object.entries(parsed)
            .filter((entry) => typeof entry[0] === 'string' && typeof entry[1] === 'string')
            .map(([key, value]) => ({ key, value }));
    }
    return [];
}
function readBdMemories(cwd) {
    try {
        const stdout = execSync('bd memories --json', {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            timeout: 5000,
        });
        return parseMemoriesPayload(stdout);
    }
    catch (error) {
        const commandError = error;
        const stderr = typeof commandError.stderr === 'string'
            ? commandError.stderr
            : commandError.stderr?.toString('utf8') ?? '';
        if (/no beads database found/i.test(stderr)) {
            return [];
        }
        throw error;
    }
}
export function shouldRefreshCache(args) {
    if (args.cacheCount === null || args.cacheLastSyncAtMs === null)
        return true;
    if (args.cacheCount !== args.sourceCount)
        return true;
    return args.nowMs - args.cacheLastSyncAtMs > CACHE_MAX_AGE_MS;
}
function toMemoryRecord(memory) {
    return { key: memory.key, value: memory.value };
}
export function syncMemoriesCacheFromBd(cwd, nowMs = Date.now(), forceFullSync = false) {
    const sqliteClient = createObservabilitySqliteClient(cwd);
    if (!sqliteClient) {
        return { synced: false, memoryCount: 0 };
    }
    try {
        const sourceMemories = readBdMemories(cwd);
        const cacheState = sqliteClient.getMemoriesCacheState();
        const needsRefresh = forceFullSync || shouldRefreshCache({
            nowMs,
            cacheCount: cacheState?.memoryCount ?? null,
            cacheLastSyncAtMs: cacheState?.lastSyncAtMs ?? null,
            sourceCount: sourceMemories.length,
        });
        if (!needsRefresh) {
            return { synced: false, memoryCount: sourceMemories.length };
        }
        sqliteClient.syncMemoriesCache(sourceMemories, nowMs);
        return { synced: true, memoryCount: sourceMemories.length };
    }
    finally {
        sqliteClient.close();
    }
}
export function invalidateAndRefreshMemoriesCache(cwd, nowMs = Date.now()) {
    const sqliteClient = createObservabilitySqliteClient(cwd);
    if (!sqliteClient) {
        return { synced: false, memoryCount: 0 };
    }
    try {
        sqliteClient.invalidateMemoriesCache();
    }
    finally {
        sqliteClient.close();
    }
    return syncMemoriesCacheFromBd(cwd, nowMs, true);
}
export function buildFilteredMemoryInjection(args) {
    const keywords = extractMemoryKeywords(args.beadTitle, args.beadDescription);
    if (keywords.length === 0) {
        return { block: '', memories: [], estimatedTokens: 0 };
    }
    const nowMs = Date.now();
    try {
        syncMemoriesCacheFromBd(args.cwd, nowMs, false);
    }
    catch {
        // Non-fatal cache refresh failure.
    }
    const sqliteClient = createObservabilitySqliteClient(args.cwd);
    if (!sqliteClient) {
        return { block: '', memories: [], estimatedTokens: 0 };
    }
    try {
        const ranked = sqliteClient.queryRelevantMemories(keywords, MAX_MEMORIES, nowMs);
        if (ranked.length === 0) {
            return { block: '', memories: [], estimatedTokens: 0 };
        }
        const selected = [];
        let tokenBudget = 0;
        for (const memory of ranked) {
            const line = `- ${memory.key}: ${memory.value}`;
            const lineTokens = estimateTokens(line);
            if (selected.length > 0 && tokenBudget + lineTokens > MAX_MEMORY_TOKENS)
                break;
            selected.push(toMemoryRecord(memory));
            tokenBudget += lineTokens;
        }
        if (selected.length === 0) {
            return { block: '', memories: [], estimatedTokens: 0 };
        }
        const lines = selected.map(memory => `- ${memory.key}: ${memory.value}`);
        const block = [
            '## Filtered Beads Memories',
            `_Keyword matched from bead context: ${keywords.join(', ')}_`,
            ...lines,
        ].join('\n');
        return {
            block,
            memories: selected,
            estimatedTokens: estimateTokens(block),
        };
    }
    catch {
        return { block: '', memories: [], estimatedTokens: 0 };
    }
    finally {
        sqliteClient.close();
    }
}
export function estimateInjectedTokens(text) {
    return estimateTokens(text);
}
//# sourceMappingURL=memory-retrieval.js.map