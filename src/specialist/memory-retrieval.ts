import { execSync } from 'node:child_process';

const DEFAULT_STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'i', 'if', 'in', 'is', 'it',
  'of', 'on', 'or', 'that', 'the', 'this', 'to', 'was', 'we', 'with', 'you', 'your', 'replace',
  'implement', 'task', 'run', 'add', 'new', 'use', 'using', 'into', 'when', 'what', 'not', 'only',
]);

const MAX_KEYWORDS = 6;
const MAX_MEMORIES = 10;
const MAX_MEMORY_TOKENS = 600;

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

export interface MemoryRecord {
  key: string;
  value: string;
  keyword: string;
}

export interface MemoryInjectionResult {
  block: string;
  memories: MemoryRecord[];
  estimatedTokens: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function normalizeToken(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, '').trim();
}

function extractTokens(input: string): string[] {
  return input
    .split(/\s+/g)
    .map(normalizeToken)
    .filter(token => token.length >= 3 && !DEFAULT_STOP_WORDS.has(token));
}

export function extractMemoryKeywords(title: string, description?: string): string[] {
  const tokens = [
    ...extractTokens(title),
    ...extractTokens(description ?? ''),
  ];

  const unique: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    unique.push(token);
    if (unique.length >= MAX_KEYWORDS) break;
  }

  return unique;
}

function parseMemoriesPayload(jsonText: string, keyword: string): MemoryRecord[] {
  const parsed = JSON.parse(jsonText) as Record<string, string>;
  return Object.entries(parsed)
    .filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
    .map(([key, value]) => ({ key, value, keyword }));
}

function runMemoriesQuery(keyword: string, cwd: string): MemoryRecord[] {
  const stdout = execSync(`bd memories ${JSON.stringify(keyword)} --json`, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 5000,
  });

  if (!stdout.trim()) return [];
  return parseMemoriesPayload(stdout, keyword);
}

function scoreMemory(memory: MemoryRecord, keywordOrder: Map<string, number>): number {
  const keywordWeight = MAX_KEYWORDS - (keywordOrder.get(memory.keyword) ?? MAX_KEYWORDS);
  const text = `${memory.key} ${memory.value}`.toLowerCase();
  const exactMatch = text.includes(memory.keyword.toLowerCase()) ? 5 : 0;
  return keywordWeight * 10 + exactMatch;
}

export function buildFilteredMemoryInjection(args: {
  cwd: string;
  beadTitle: string;
  beadDescription?: string;
}): MemoryInjectionResult {
  const keywords = extractMemoryKeywords(args.beadTitle, args.beadDescription);
  if (keywords.length === 0) {
    return { block: '', memories: [], estimatedTokens: 0 };
  }

  const keywordOrder = new Map<string, number>();
  keywords.forEach((keyword, index) => keywordOrder.set(keyword, index));

  const deduped = new Map<string, MemoryRecord>();
  for (const keyword of keywords) {
    if (deduped.size >= MAX_MEMORIES * 2) break;
    try {
      const memories = runMemoriesQuery(keyword, args.cwd);
      for (const memory of memories) {
        if (!deduped.has(memory.key)) deduped.set(memory.key, memory);
      }
    } catch {
      // Non-fatal: one failed query should not block specialist run.
    }
  }

  const ranked = [...deduped.values()]
    .sort((left, right) => scoreMemory(right, keywordOrder) - scoreMemory(left, keywordOrder))
    .slice(0, MAX_MEMORIES);

  if (ranked.length === 0) {
    return { block: '', memories: [], estimatedTokens: 0 };
  }

  const selected: MemoryRecord[] = [];
  let tokenBudget = 0;
  for (const memory of ranked) {
    const line = `- ${memory.key}: ${memory.value}`;
    const lineTokens = estimateTokens(line);
    if (selected.length > 0 && tokenBudget + lineTokens > MAX_MEMORY_TOKENS) break;
    selected.push(memory);
    tokenBudget += lineTokens;
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

export function estimateInjectedTokens(text: string): number {
  return estimateTokens(text);
}
