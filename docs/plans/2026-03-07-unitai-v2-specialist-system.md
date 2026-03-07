# unitAI v2 — Specialist System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor unitAI from a monolithic MCP server with hardcoded workflows into a lean 4-tool orchestration layer powered by the Specialist System, using `@mariozechner/pi` as the unified execution substrate.

**Architecture:** The Specialist Loader discovers `.specialist.yaml` files across 3 scopes (project/user/system), validates them with a shared Zod schema, and executes them via pi RpcClient. The MCP surface shrinks from 15+ tools to 4 generic coordination tools. All workflow logic moves to YAML files. Pi replaces direct CLI invocation — `agent_end` event replaces AF_STATUS for completion detection, `agents.md` replaces system prompt injection.

**Tech Stack:** Bun/TypeScript, `@mariozechner/pi` (RpcClient), Zod, `bun:sqlite`, `@modelcontextprotocol/sdk`, Vitest, `yaml`

**Spec Reference:** `omni-specialist.md` (in-repo), `pi-engine.md` (in-repo)

---

## Pre-work: Update the Spec

### Task 0: Update omni-specialist.md to reflect confirmed decisions

**Files:**
- Modify: `omni-specialist.md`

**Changes (surgical — do NOT rewrite the whole document):**

1. **§4.1 Schema:** Remove `execution.temperature` and `execution.max_tokens` fields
2. **§4.4 AgentSession:** Update `getLastOutput()` → `getLastAssistantText()` via `pi.send({type:'get_last_assistant_text'})`. Add `agents.md` as the context injection mechanism (written to temp `cwd` dir, pi loads it automatically).
3. **§5.4 AF_STATUS:** Reclassify — unitAI uses `agent_end` event (not AF_STATUS) for completion. AF_STATUS remains an optional specialist output convention for cross-system compatibility with Mercury/darth_feedor only. unitAI no longer appends AF_STATUS instructions to prompts.
4. **§6 Hooks:** Remove `af_status_parsed` and `af_status_fields` from `post_execute` schema.
5. **§2.1 Layer 1:** Note pi as execution substrate. Backend list = pi providers: `anthropic`, `google-gemini-cli`, `openai` (native + DashScope for Qwen). GLM/Droid: deferred pending pi provider verification.
6. **§12.1 Technology Alignment:** Add pi to the stack row.

**Step 1: Make the edits**

**Step 2: Commit**
```bash
git add omni-specialist.md
git commit -m "docs: update specialist spec — pi execution, drop temperature, agent_end replaces AF_STATUS"
```

---

## Phase 1: Foundation

### Task 1: Migrate build system to Bun

**Files:**
- Create: `bunfig.toml`
- Modify: `package.json`
- Modify: `src/repositories/base.ts`
- Modify: `src/repositories/activity.ts`

**Step 1: Verify Bun is available**
```bash
which bun || curl -fsSL https://bun.sh/install | bash
bun --version
```
Expected: version printed (≥1.1.0)

**Step 2: Create bunfig.toml**
```toml
[install]
exact = true
```

**Step 3: Update package.json scripts**
```json
{
  "scripts": {
    "build": "bun build src/index.ts --target=node --outfile=dist/index.js",
    "dev": "bun run src/index.ts",
    "start": "node dist/index.js",
    "lint": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage"
  }
}
```

**Step 4: Replace better-sqlite3 with bun:sqlite**

In `src/repositories/base.ts` and `src/repositories/activity.ts`, replace:
```typescript
import Database from 'better-sqlite3';
```
with:
```typescript
import { Database } from 'bun:sqlite';
```

API differences from better-sqlite3:
- `.prepare(sql).run(params)` → `.query(sql).run(params)`
- `.prepare(sql).get(params)` → `.query(sql).get(params)`
- `.prepare(sql).all(params)` → `.query(sql).all(params)`

**Step 5: Remove old sqlite dep, install via bun**
```bash
bun remove better-sqlite3 @types/better-sqlite3
bun install
```

**Step 6: Verify build**
```bash
bun run build
```
Expected: `dist/index.js` created, no errors

**Step 7: Run tests**
```bash
bun run test
```
Expected: all existing tests pass (fix any bun:sqlite API mismatches found)

**Step 8: Commit**
```bash
git add bunfig.toml package.json src/repositories/
git commit -m "build: migrate to Bun — bun:sqlite, bun build --target=node"
```

---

### Task 2: Add pi and implement PiAgentSession

**Files:**
- Create: `src/pi/backendMap.ts`
- Create: `src/pi/session.ts`
- Create: `tests/unit/pi/session.test.ts`

**Step 1: Install pi**
```bash
bun add @mariozechner/pi yaml
```

**Step 2: Write failing tests**
```typescript
// tests/unit/pi/session.test.ts
import { describe, it, expect } from 'vitest';
import { mapSpecialistBackend, getProviderArgs } from '../../../src/pi/backendMap.js';

describe('backendMap', () => {
  it('maps gemini to google-gemini-cli', () => {
    expect(mapSpecialistBackend('gemini')).toBe('google-gemini-cli');
  });
  it('maps qwen to openai', () => {
    expect(mapSpecialistBackend('qwen')).toBe('openai');
  });
  it('maps claude/anthropic to anthropic', () => {
    expect(mapSpecialistBackend('claude')).toBe('anthropic');
    expect(mapSpecialistBackend('anthropic')).toBe('anthropic');
  });
  it('throws for unsupported backend', () => {
    expect(() => mapSpecialistBackend('droid')).toThrow('Unsupported backend');
  });
  it('returns DashScope args for qwen', () => {
    const args = getProviderArgs('qwen');
    expect(args).toContain('--baseURL');
  });
  it('returns empty args for gemini', () => {
    expect(getProviderArgs('gemini')).toHaveLength(0);
  });
});
```

**Step 3: Run test to verify it fails**
```bash
vitest run tests/unit/pi/session.test.ts
```
Expected: FAIL — module not found

**Step 4: Implement backendMap.ts**
```typescript
// src/pi/backendMap.ts
const BACKEND_MAP: Record<string, string> = {
  gemini: 'google-gemini-cli',
  qwen: 'openai',
  claude: 'anthropic',
  anthropic: 'anthropic',
  openai: 'openai',
};

export function mapSpecialistBackend(model: string): string {
  const provider = BACKEND_MAP[model.toLowerCase()];
  if (!provider) {
    throw new Error(
      `Unsupported backend: ${model}. Supported: ${Object.keys(BACKEND_MAP).join(', ')}`
    );
  }
  return provider;
}

// Qwen requires pointing the openai provider at DashScope
export function getProviderArgs(model: string): string[] {
  if (model.toLowerCase() === 'qwen') {
    return ['--baseURL', 'https://dashscope.aliyuncs.com/compatible-mode/v1'];
  }
  return [];
}
```

**Step 5: Implement session.ts**
```typescript
// src/pi/session.ts
import { RpcClient } from '@mariozechner/pi/rpc';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mapSpecialistBackend, getProviderArgs } from './backendMap.js';

export interface AgentSessionMeta {
  backend: string;
  model: string;
  sessionId: string;
  startedAt: Date;
}

export interface PiSessionOptions {
  model: string;          // specialist execution.model ('gemini', 'qwen', etc.)
  systemPrompt?: string;  // written to agents.md in temp dir
  timeoutMs?: number;
}

export class PiAgentSession {
  private client: RpcClient;
  private tempDir?: string;
  readonly meta: AgentSessionMeta;

  private constructor(client: RpcClient, meta: AgentSessionMeta, tempDir?: string) {
    this.client = client;
    this.meta = meta;
    this.tempDir = tempDir;
  }

  static async create(options: PiSessionOptions): Promise<PiAgentSession> {
    const provider = mapSpecialistBackend(options.model);
    const args = getProviderArgs(options.model);

    const tempDir = await mkdtemp(join(tmpdir(), 'unitai-'));

    if (options.systemPrompt) {
      await writeFile(join(tempDir, 'agents.md'), options.systemPrompt, 'utf-8');
    }

    const client = new RpcClient({ provider, cwd: tempDir, args });
    const meta: AgentSessionMeta = {
      backend: provider,
      model: options.model,
      sessionId: crypto.randomUUID(),
      startedAt: new Date(),
    };

    return new PiAgentSession(client, meta, tempDir);
  }

  async start(): Promise<void> {
    await this.client.start();
  }

  async prompt(task: string): Promise<void> {
    await this.client.prompt(task);
  }

  async waitForIdle(timeoutMs = 120_000): Promise<void> {
    await this.client.waitForIdle(timeoutMs);
  }

  async getLastOutput(): Promise<string> {
    const resp = await this.client.send({ type: 'get_last_assistant_text' });
    return (resp as any).data?.text ?? '';
  }

  kill(): void {
    this.client.stop();
    if (this.tempDir) {
      rm(this.tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
```

**Step 6: Run tests**
```bash
vitest run tests/unit/pi/
```
Expected: PASS (backendMap tests pass; PiAgentSession has no unit test yet — integration only)

**Step 7: Commit**
```bash
git add src/pi/ tests/unit/pi/
git commit -m "feat(pi): PiAgentSession — RpcClient wrapper with agents.md injection and provider mapping"
```

---

### Task 3: Specialist YAML Zod Schema

**Files:**
- Create: `src/specialist/schema.ts`
- Create: `tests/unit/specialist/schema.test.ts`

**Step 1: Write failing tests**
```typescript
// tests/unit/specialist/schema.test.ts
import { describe, it, expect } from 'vitest';
import { parseSpecialist } from '../../../src/specialist/schema.js';

const VALID_YAML = `
specialist:
  metadata:
    name: codebase-explorer
    version: 1.0.0
    description: Analyzes project structure
    category: analysis/code
    author: jagger
    tags: [analysis]
  execution:
    mode: auto
    model: gemini
    fallback_model: qwen
    timeout_ms: 120000
    response_format: json
    permission_required: READ_ONLY
  prompt:
    system: You are a senior architect.
    task_template: Analyze $project_name. Request: $prompt
`;

describe('parseSpecialist', () => {
  it('parses a valid specialist YAML', async () => {
    const result = await parseSpecialist(VALID_YAML);
    expect(result.specialist.metadata.name).toBe('codebase-explorer');
    expect(result.specialist.execution.model).toBe('gemini');
  });

  it('applies defaults for optional execution fields', async () => {
    const minimal = `
specialist:
  metadata:
    name: minimal-spec
    version: 1.0.0
    description: Minimal
    category: test
  execution:
    model: gemini
  prompt:
    task_template: $prompt`;
    const result = await parseSpecialist(minimal);
    expect(result.specialist.execution.timeout_ms).toBe(120_000);
    expect(result.specialist.execution.mode).toBe('auto');
  });

  it('rejects invalid name (not kebab-case)', async () => {
    const bad = VALID_YAML.replace('codebase-explorer', 'CodebaseExplorer');
    await expect(parseSpecialist(bad)).rejects.toThrow();
  });

  it('rejects invalid version (not semver)', async () => {
    const bad = VALID_YAML.replace('1.0.0', 'v1');
    await expect(parseSpecialist(bad)).rejects.toThrow();
  });

  it('accepts unknown fields (superset tolerance — Agent Forge / Mercury fields)', async () => {
    const withExtra = VALID_YAML + `
  heartbeat:
    enabled: true
    interval: 15m`;
    await expect(parseSpecialist(withExtra)).resolves.toBeDefined();
  });

  it('rejects missing required task_template', async () => {
    const bad = VALID_YAML.replace('task_template: Analyze $project_name. Request: $prompt', '');
    await expect(parseSpecialist(bad)).rejects.toThrow();
  });
});
```

**Step 2: Run to verify fail**
```bash
vitest run tests/unit/specialist/schema.test.ts
```
Expected: FAIL — module not found

**Step 3: Implement schema.ts**
```typescript
// src/specialist/schema.ts
import { z } from 'zod';
import { parse as parseYaml } from 'yaml';

const KebabCase = z.string().regex(/^[a-z][a-z0-9-]*$/, 'Must be kebab-case');
const Semver = z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be semver (e.g. 1.0.0)');

const MetadataSchema = z.object({
  name: KebabCase,
  version: Semver,
  description: z.string(),
  category: z.string(),
  author: z.string().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const ExecutionSchema = z.object({
  mode: z.enum(['tool', 'skill', 'auto']).default('auto'),
  model: z.string(),
  fallback_model: z.string().optional(),
  timeout_ms: z.number().default(120_000),
  response_format: z.enum(['text', 'json', 'markdown']).default('text'),
  permission_required: z.enum(['READ_ONLY', 'LOW', 'MEDIUM', 'HIGH']).default('READ_ONLY'),
  // Agent Forge fields — accepted but ignored by unitAI
  preferred_profile: z.string().optional(),
  approval_mode: z.string().optional(),
});

const PromptSchema = z.object({
  system: z.string().optional(),
  task_template: z.string(),
  normalize_template: z.string().optional(),  // Mercury — ignored by unitAI
  output_schema: z.record(z.unknown()).optional(),
  examples: z.array(z.unknown()).optional(),
  skill_inherit: z.string().optional(),        // Agent Forge — appended to agents.md
});

const SkillsSchema = z.object({
  scripts: z.array(z.object({
    path: z.string(),
    phase: z.enum(['pre', 'post']),
    inject_output: z.boolean().default(false),
  })).optional(),
  references: z.array(z.unknown()).optional(),
  tools: z.array(z.string()).optional(),
}).optional();

const CapabilitiesSchema = z.object({
  file_scope: z.array(z.string()).optional(),
  blocked_tools: z.array(z.string()).optional(),
  can_spawn: z.boolean().optional(),
  tools: z.array(z.object({ name: z.string(), purpose: z.string() })).optional(),
  diagnostic_scripts: z.array(z.string()).optional(), // appended to agents.md
}).optional();

const CommunicationSchema = z.object({
  publishes: z.array(z.string()).optional(),
  subscribes: z.array(z.string()).optional(),
  output_to: z.string().optional(),
}).optional();

const ValidationSchema = z.object({
  files_to_watch: z.array(z.string()).optional(),
  references: z.array(z.unknown()).optional(),
  stale_threshold_days: z.number().optional(),
}).optional();

export const SpecialistSchema = z.object({
  specialist: z.object({
    metadata: MetadataSchema,
    execution: ExecutionSchema,
    prompt: PromptSchema,
    skills: SkillsSchema,
    capabilities: CapabilitiesSchema,
    communication: CommunicationSchema,
    validation: ValidationSchema,
    heartbeat: z.unknown().optional(), // future — accepted, ignored
  }),
});

export type Specialist = z.infer<typeof SpecialistSchema>;

export async function parseSpecialist(yamlContent: string): Promise<Specialist> {
  const raw = parseYaml(yamlContent);
  return SpecialistSchema.parseAsync(raw);
}
```

**Step 4: Run tests**
```bash
vitest run tests/unit/specialist/schema.test.ts
```
Expected: PASS

**Step 5: Commit**
```bash
git add src/specialist/schema.ts tests/unit/specialist/
git commit -m "feat(specialist): Zod schema — .specialist.yaml superset (unitAI + Agent Forge + Mercury)"
```

---

### Task 4: Template Engine + Specialist Loader

**Files:**
- Create: `src/specialist/templateEngine.ts`
- Create: `src/specialist/loader.ts`
- Create: `tests/unit/specialist/templateEngine.test.ts`
- Create: `tests/unit/specialist/loader.test.ts`

**Step 1: Write failing template engine tests**
```typescript
// tests/unit/specialist/templateEngine.test.ts
import { describe, it, expect } from 'vitest';
import { renderTemplate } from '../../../src/specialist/templateEngine.js';

describe('renderTemplate', () => {
  it('substitutes $variables', () => {
    expect(renderTemplate('Hello $name!', { name: 'world' })).toBe('Hello world!');
  });
  it('substitutes multiple occurrences', () => {
    expect(renderTemplate('$a $a $b', { a: 'x', b: 'y' })).toBe('x x y');
  });
  it('leaves unknown $vars intact', () => {
    expect(renderTemplate('Hello $missing', {})).toBe('Hello $missing');
  });
  it('handles $prompt as standard variable', () => {
    expect(renderTemplate('Task: $prompt', { prompt: 'do the thing' })).toBe('Task: do the thing');
  });
});
```

**Step 2: Write failing loader tests**
```typescript
// tests/unit/specialist/loader.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm } from 'node:fs/promises';
import { SpecialistLoader } from '../../../src/specialist/loader.js';

const MINIMAL_YAML = (name: string) => `
specialist:
  metadata:
    name: ${name}
    version: 1.0.0
    description: Test specialist
    category: test
  execution:
    model: gemini
  prompt:
    task_template: Do $prompt`;

describe('SpecialistLoader', () => {
  let tempDir: string;
  let loader: SpecialistLoader;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'unitai-test-'));
    loader = new SpecialistLoader({ projectDir: tempDir });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('discovers specialists in project specialists/ dir', async () => {
    const dir = join(tempDir, 'specialists');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'my-spec.specialist.yaml'), MINIMAL_YAML('my-spec'));
    const list = await loader.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('my-spec');
    expect(list[0].scope).toBe('project');
  });

  it('returns empty list when no specialists', async () => {
    const list = await loader.list();
    expect(list).toHaveLength(0);
  });

  it('loads and caches a specialist by name', async () => {
    const dir = join(tempDir, 'specialists');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'my-spec.specialist.yaml'), MINIMAL_YAML('my-spec'));
    const spec = await loader.get('my-spec');
    expect(spec.specialist.metadata.name).toBe('my-spec');
    const spec2 = await loader.get('my-spec');
    expect(spec2).toBe(spec); // same reference — cache hit
  });

  it('throws when specialist not found', async () => {
    await expect(loader.get('nonexistent')).rejects.toThrow('Specialist not found: nonexistent');
  });

  it('project-level specialist overrides user-level (same name)', async () => {
    const projectDir = join(tempDir, 'specialists');
    const userDir = join(tempDir, 'user-specialists');
    await mkdir(projectDir, { recursive: true });
    await mkdir(userDir, { recursive: true });
    await writeFile(join(projectDir, 'shared.specialist.yaml'), MINIMAL_YAML('shared'));
    await writeFile(join(userDir, 'shared.specialist.yaml'), MINIMAL_YAML('shared'));
    loader = new SpecialistLoader({ projectDir: tempDir, userDir });
    const list = await loader.list();
    expect(list.filter(s => s.name === 'shared')).toHaveLength(1); // deduped
    expect(list.find(s => s.name === 'shared')!.scope).toBe('project'); // project wins
  });
});
```

**Step 3: Run to verify fail**
```bash
vitest run tests/unit/specialist/
```

**Step 4: Implement templateEngine.ts**
```typescript
// src/specialist/templateEngine.ts
export function renderTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, key) => {
    return variables[key] !== undefined ? variables[key] : match;
  });
}
```

**Step 5: Implement loader.ts**
```typescript
// src/specialist/loader.ts
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';
import { parseSpecialist, type Specialist } from './schema.js';

export interface SpecialistSummary {
  name: string;
  description: string;
  category: string;
  version: string;
  model: string;
  scope: 'project' | 'user' | 'system';
  filePath: string;
}

interface LoaderOptions {
  projectDir?: string;
  userDir?: string;   // override for testing
}

export class SpecialistLoader {
  private cache = new Map<string, Specialist>();
  private projectDir: string;
  private userDir: string;
  private systemDir: string;

  constructor(options: LoaderOptions = {}) {
    this.projectDir = options.projectDir ?? process.cwd();
    this.userDir = options.userDir ?? join(homedir(), '.claude', 'specialists');
    // System specialists: bundled in package next to compiled output
    this.systemDir = join(new URL(import.meta.url).pathname, '..', '..', '..', 'specialists');
  }

  private getScanDirs(): Array<{ path: string; scope: 'project' | 'user' | 'system' }> {
    return [
      { path: join(this.projectDir, 'specialists'), scope: 'project' },
      { path: join(this.projectDir, '.claude', 'specialists'), scope: 'project' },
      { path: join(this.projectDir, '.agent-forge', 'specialists'), scope: 'project' }, // cross-scan
      { path: this.userDir, scope: 'user' },
      { path: this.systemDir, scope: 'system' },
    ].filter(d => existsSync(d.path));
  }

  async list(category?: string): Promise<SpecialistSummary[]> {
    const results: SpecialistSummary[] = [];
    const seen = new Set<string>();

    for (const dir of this.getScanDirs()) {
      const files = await readdir(dir.path).catch(() => []);
      for (const file of files.filter(f => f.endsWith('.specialist.yaml'))) {
        const filePath = join(dir.path, file);
        try {
          const content = await readFile(filePath, 'utf-8');
          const spec = await parseSpecialist(content);
          const { name, description, category: cat, version } = spec.specialist.metadata;
          if (seen.has(name)) continue; // project overrides user/system (first wins)
          if (category && cat !== category) continue;
          seen.add(name);
          results.push({
            name, description, category: cat, version,
            model: spec.specialist.execution.model,
            scope: dir.scope,
            filePath,
          });
        } catch {
          // Skip invalid YAML files silently
        }
      }
    }
    return results;
  }

  async get(name: string): Promise<Specialist> {
    if (this.cache.has(name)) return this.cache.get(name)!;

    for (const dir of this.getScanDirs()) {
      const filePath = join(dir.path, `${name}.specialist.yaml`);
      if (existsSync(filePath)) {
        const content = await readFile(filePath, 'utf-8');
        const spec = await parseSpecialist(content);
        this.cache.set(name, spec);
        return spec;
      }
    }
    throw new Error(`Specialist not found: ${name}`);
  }

  invalidateCache(name?: string): void {
    if (name) this.cache.delete(name);
    else this.cache.clear();
  }
}
```

**Step 6: Run tests**
```bash
vitest run tests/unit/specialist/
```
Expected: PASS

**Step 7: Commit**
```bash
git add src/specialist/ tests/unit/specialist/
git commit -m "feat(specialist): Loader with 3-scope discovery, caching, template engine"
```

---

### Task 5: Lifecycle Hooks (JSONL sink)

**Files:**
- Create: `src/specialist/hooks.ts`
- Create: `tests/unit/specialist/hooks.test.ts`

**Step 1: Write failing tests**
```typescript
// tests/unit/specialist/hooks.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HookEmitter } from '../../../src/specialist/hooks.js';

describe('HookEmitter', () => {
  let tempDir: string;
  let emitter: HookEmitter;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'unitai-hooks-'));
    emitter = new HookEmitter({ tracePath: join(tempDir, 'trace.jsonl') });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('writes pre_render event to JSONL', async () => {
    await emitter.emit('pre_render', 'inv-1', 'my-spec', '1.0.0', {
      variables_keys: ['prompt'],
      backend_resolved: 'gemini',
      fallback_used: false,
      circuit_breaker_state: 'CLOSED',
      scope: 'project',
    });
    const lines = (await readFile(join(tempDir, 'trace.jsonl'), 'utf-8')).trim().split('\n');
    expect(lines).toHaveLength(1);
    const event = JSON.parse(lines[0]);
    expect(event.hook).toBe('pre_render');
    expect(event.invocation_id).toBe('inv-1');
    expect(event.specialist_name).toBe('my-spec');
  });

  it('appends multiple events with same invocation_id', async () => {
    const base = { variables_keys: [], backend_resolved: 'gemini', fallback_used: false, circuit_breaker_state: 'CLOSED' as const, scope: 'project' };
    await emitter.emit('pre_render', 'inv-1', 'my-spec', '1.0.0', base);
    await emitter.emit('post_execute', 'inv-1', 'my-spec', '1.0.0', { status: 'COMPLETE', duration_ms: 500, output_valid: true });
    const lines = (await readFile(join(tempDir, 'trace.jsonl'), 'utf-8')).trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]).hook).toBe('post_execute');
  });

  it('fires custom handler (fire-and-forget)', async () => {
    const received: unknown[] = [];
    emitter.onHook('post_execute', (e) => received.push(e));
    await emitter.emit('post_execute', 'inv-2', 'my-spec', '1.0.0', { status: 'COMPLETE', duration_ms: 100, output_valid: true });
    await new Promise(r => setTimeout(r, 10)); // let microtask flush
    expect(received).toHaveLength(1);
  });
});
```

**Step 2: Run to verify fail**
```bash
vitest run tests/unit/specialist/hooks.test.ts
```

**Step 3: Implement hooks.ts**
```typescript
// src/specialist/hooks.ts
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

type HookType = 'pre_render' | 'post_render' | 'pre_execute' | 'post_execute';
type CBState = 'CLOSED' | 'HALF_OPEN' | 'OPEN';

interface HookPayloads {
  pre_render: {
    variables_keys: string[];
    backend_resolved: string;
    fallback_used: boolean;
    circuit_breaker_state: CBState;
    scope: string;
  };
  post_render: {
    prompt_hash: string;
    prompt_length_chars: number;
    estimated_tokens: number;
    system_prompt_present: boolean;
  };
  pre_execute: {
    backend: string;
    model: string;
    timeout_ms: number;
    permission_level: string;
  };
  post_execute: {
    status: 'COMPLETE' | 'IN_PROGRESS' | 'BLOCKED' | 'ERROR';
    duration_ms: number;
    output_valid: boolean;
    error?: { type: string; message: string };
  };
}

export class HookEmitter {
  private tracePath: string;
  private customHandlers = new Map<HookType, Array<(event: unknown) => void>>();
  private ready: Promise<void>;

  constructor(options: { tracePath: string }) {
    this.tracePath = options.tracePath;
    this.ready = mkdir(dirname(options.tracePath), { recursive: true }).then(() => {});
  }

  async emit<T extends HookType>(
    hook: T,
    invocationId: string,
    specialistName: string,
    specialistVersion: string,
    payload: HookPayloads[T],
  ): Promise<void> {
    await this.ready;
    const event = {
      invocation_id: invocationId,
      hook,
      timestamp: new Date().toISOString(),
      specialist_name: specialistName,
      specialist_version: specialistVersion,
      ...payload,
    };
    await appendFile(this.tracePath, JSON.stringify(event) + '\n', 'utf-8');
    for (const handler of this.customHandlers.get(hook) ?? []) {
      Promise.resolve().then(() => handler(event)).catch(() => {});
    }
  }

  onHook(hook: HookType, handler: (event: unknown) => void): void {
    if (!this.customHandlers.has(hook)) this.customHandlers.set(hook, []);
    this.customHandlers.get(hook)!.push(handler);
  }
}
```

**Step 4: Run tests**
```bash
vitest run tests/unit/specialist/hooks.test.ts
```
Expected: PASS

**Step 5: Commit**
```bash
git add src/specialist/hooks.ts tests/unit/specialist/hooks.test.ts
git commit -m "feat(specialist): HookEmitter — 4-point lifecycle hooks with JSONL sink at .unitai/trace.jsonl"
```

---

### Task 6: Upgrade CircuitBreaker to 3-state

**Files:**
- Modify: `src/utils/circuitBreaker.ts`
- Create/Modify: `tests/unit/circuitBreaker.test.ts`

**Step 1: Write failing tests for 3-state behavior**
```typescript
// tests/unit/circuitBreaker.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CircuitBreaker } from '../../../src/utils/circuitBreaker.js';

describe('CircuitBreaker (3-state)', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 });
  });

  it('starts CLOSED', () => {
    expect(cb.getState('gemini')).toBe('CLOSED');
    expect(cb.isAvailable('gemini')).toBe(true);
  });

  it('transitions CLOSED → OPEN after threshold failures', () => {
    cb.recordFailure('gemini');
    cb.recordFailure('gemini');
    expect(cb.getState('gemini')).toBe('CLOSED'); // not yet
    cb.recordFailure('gemini');
    expect(cb.getState('gemini')).toBe('OPEN');
    expect(cb.isAvailable('gemini')).toBe(false);
  });

  it('transitions OPEN → HALF_OPEN after cooldown', async () => {
    cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 50 });
    cb.recordFailure('gemini');
    expect(cb.getState('gemini')).toBe('OPEN');
    await new Promise(r => setTimeout(r, 60));
    expect(cb.getState('gemini')).toBe('HALF_OPEN');
    expect(cb.isAvailable('gemini')).toBe(true); // allow probe
  });

  it('transitions HALF_OPEN → CLOSED on success', async () => {
    cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 50 });
    cb.recordFailure('gemini');
    await new Promise(r => setTimeout(r, 60));
    cb.recordSuccess('gemini');
    expect(cb.getState('gemini')).toBe('CLOSED');
  });

  it('transitions HALF_OPEN → OPEN on failure', async () => {
    cb = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 50 });
    cb.recordFailure('gemini');
    await new Promise(r => setTimeout(r, 60));
    expect(cb.getState('gemini')).toBe('HALF_OPEN');
    cb.recordFailure('gemini');
    expect(cb.getState('gemini')).toBe('OPEN');
  });
});
```

**Step 2: Run to verify fail**
```bash
vitest run tests/unit/circuitBreaker.test.ts
```

**Step 3: Replace circuitBreaker.ts with 3-state implementation**
```typescript
// src/utils/circuitBreaker.ts
type State = 'CLOSED' | 'HALF_OPEN' | 'OPEN';

interface Entry {
  state: State;
  failures: number;
  openedAt?: number;
}

interface CircuitBreakerOptions {
  failureThreshold?: number;  // failures before OPEN (default: 3)
  cooldownMs?: number;         // OPEN → HALF_OPEN wait (default: 60_000)
}

export class CircuitBreaker {
  private states = new Map<string, Entry>();
  private threshold: number;
  private cooldownMs: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.threshold = options.failureThreshold ?? 3;
    this.cooldownMs = options.cooldownMs ?? 60_000;
  }

  getState(backend: string): State {
    const entry = this.states.get(backend);
    if (!entry) return 'CLOSED';
    if (entry.state === 'OPEN' && Date.now() - entry.openedAt! > this.cooldownMs) {
      entry.state = 'HALF_OPEN';
    }
    return entry.state;
  }

  isAvailable(backend: string): boolean {
    return this.getState(backend) !== 'OPEN';
  }

  recordSuccess(backend: string): void {
    this.states.set(backend, { state: 'CLOSED', failures: 0 });
  }

  recordFailure(backend: string): void {
    const entry = this.states.get(backend) ?? { state: 'CLOSED', failures: 0 };
    entry.failures++;
    if (entry.failures >= this.threshold) {
      entry.state = 'OPEN';
      entry.openedAt = Date.now();
    }
    this.states.set(backend, entry);
  }
}
```

**Step 4: Run tests**
```bash
vitest run tests/unit/circuitBreaker.test.ts
```
Expected: PASS

**Step 5: Commit**
```bash
git add src/utils/circuitBreaker.ts tests/unit/circuitBreaker.test.ts
git commit -m "feat(circuit-breaker): upgrade to 3-state CLOSED/HALF_OPEN/OPEN"
```

---

### Task 7: Specialist Runner

**Files:**
- Create: `src/specialist/runner.ts`
- Create: `tests/unit/specialist/runner.test.ts`

**Step 1: Write failing tests (mock pi)**
```typescript
// tests/unit/specialist/runner.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SpecialistRunner } from '../../../src/specialist/runner.js';
import { HookEmitter } from '../../../src/specialist/hooks.js';
import { CircuitBreaker } from '../../../src/utils/circuitBreaker.js';

const mockSession = {
  start: vi.fn().mockResolvedValue(undefined),
  prompt: vi.fn().mockResolvedValue(undefined),
  waitForIdle: vi.fn().mockResolvedValue(undefined),
  getLastOutput: vi.fn().mockResolvedValue('{"result": "ok"}'),
  kill: vi.fn(),
  meta: { backend: 'google-gemini-cli', model: 'gemini', sessionId: 'test-id', startedAt: new Date() },
};

vi.mock('../../../src/pi/session.js', () => ({
  PiAgentSession: { create: vi.fn().mockResolvedValue(mockSession) },
}));

describe('SpecialistRunner', () => {
  let runner: SpecialistRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    const mockLoader = {
      get: vi.fn().mockResolvedValue({
        specialist: {
          metadata: { name: 'test-spec', version: '1.0.0' },
          execution: { model: 'gemini', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
          prompt: { task_template: 'Do $prompt', system: 'You are helpful.' },
          communication: undefined,
        },
      }),
    } as any;

    runner = new SpecialistRunner({
      loader: mockLoader,
      hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace.jsonl' }),
      circuitBreaker: new CircuitBreaker(),
    });
  });

  it('executes specialist and returns output', async () => {
    const result = await runner.run({ name: 'test-spec', prompt: 'analyze this' });
    expect(result.output).toBe('{"result": "ok"}');
    expect(result.backend).toBe('google-gemini-cli');
    expect(result.specialistVersion).toBe('1.0.0');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('calls pi session lifecycle in order', async () => {
    await runner.run({ name: 'test-spec', prompt: 'do thing' });
    expect(mockSession.start).toHaveBeenCalledOnce();
    expect(mockSession.prompt).toHaveBeenCalledWith('Do do thing');
    expect(mockSession.waitForIdle).toHaveBeenCalledWith(5000);
    expect(mockSession.getLastOutput).toHaveBeenCalledOnce();
    expect(mockSession.kill).toHaveBeenCalledOnce();
  });

  it('kills session even on error', async () => {
    mockSession.prompt.mockRejectedValueOnce(new Error('backend down'));
    await expect(runner.run({ name: 'test-spec', prompt: 'fail' })).rejects.toThrow('backend down');
    expect(mockSession.kill).toHaveBeenCalledOnce();
  });

  it('uses fallback backend when primary circuit is OPEN', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });
    cb.recordFailure('gemini'); // open gemini circuit
    const mockLoader = {
      get: vi.fn().mockResolvedValue({
        specialist: {
          metadata: { name: 'test-spec', version: '1.0.0' },
          execution: { model: 'gemini', fallback_model: 'qwen', timeout_ms: 5000, mode: 'tool', permission_required: 'READ_ONLY' },
          prompt: { task_template: '$prompt', system: undefined },
          communication: undefined,
        },
      }),
    } as any;
    const r = new SpecialistRunner({
      loader: mockLoader,
      hooks: new HookEmitter({ tracePath: '/tmp/test-hooks-trace2.jsonl' }),
      circuitBreaker: cb,
    });
    const result = await r.run({ name: 'test-spec', prompt: 'test' });
    expect(result.model).toBe('qwen');
  });
});
```

**Step 2: Run to verify fail**
```bash
vitest run tests/unit/specialist/runner.test.ts
```

**Step 3: Implement runner.ts**
```typescript
// src/specialist/runner.ts
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { renderTemplate } from './templateEngine.js';
import { PiAgentSession } from '../pi/session.js';
import type { SpecialistLoader } from './loader.js';
import type { HookEmitter } from './hooks.js';
import type { CircuitBreaker } from '../utils/circuitBreaker.js';

export interface RunOptions {
  name: string;
  prompt: string;
  variables?: Record<string, string>;
  backendOverride?: string;
  autonomyLevel?: string;
}

export interface RunResult {
  output: string;
  backend: string;
  model: string;
  durationMs: number;
  specialistVersion: string;
}

interface RunnerDeps {
  loader: SpecialistLoader;
  hooks: HookEmitter;
  circuitBreaker: CircuitBreaker;
}

export class SpecialistRunner {
  constructor(private deps: RunnerDeps) {}

  async run(options: RunOptions): Promise<RunResult> {
    const { loader, hooks, circuitBreaker } = this.deps;
    const invocationId = crypto.randomUUID();
    const start = Date.now();

    const spec = await loader.get(options.name);
    const { metadata, execution, prompt, communication } = spec.specialist;

    // Backend resolution: override → primary → fallback
    const primaryModel = options.backendOverride ?? execution.model;
    const model = circuitBreaker.isAvailable(primaryModel)
      ? primaryModel
      : (execution.fallback_model ?? primaryModel);
    const fallbackUsed = model !== primaryModel;

    await hooks.emit('pre_render', invocationId, metadata.name, metadata.version, {
      variables_keys: Object.keys(options.variables ?? {}),
      backend_resolved: model,
      fallback_used: fallbackUsed,
      circuit_breaker_state: circuitBreaker.getState(model),
      scope: 'project',
    });

    // Render task template
    const variables = { prompt: options.prompt, ...options.variables };
    const renderedTask = renderTemplate(prompt.task_template, variables);
    const promptHash = createHash('sha256').update(renderedTask).digest('hex').slice(0, 16);

    await hooks.emit('post_render', invocationId, metadata.name, metadata.version, {
      prompt_hash: promptHash,
      prompt_length_chars: renderedTask.length,
      estimated_tokens: Math.ceil(renderedTask.length / 4),
      system_prompt_present: !!prompt.system,
    });

    // Build agents.md content: system + skill_inherit + diagnostic_scripts
    let agentsMd = prompt.system ?? '';
    if (prompt.skill_inherit) {
      const { readFile } = await import('node:fs/promises');
      const skillContent = await readFile(prompt.skill_inherit, 'utf-8').catch(() => '');
      if (skillContent) agentsMd += `\n\n---\n# Service Knowledge\n\n${skillContent}`;
    }
    if (spec.specialist.capabilities?.diagnostic_scripts?.length) {
      agentsMd += '\n\n---\n# Diagnostic Scripts\nYou have access via Bash:\n';
      for (const s of spec.specialist.capabilities.diagnostic_scripts) {
        agentsMd += `- \`${s}\`\n`;
      }
    }

    await hooks.emit('pre_execute', invocationId, metadata.name, metadata.version, {
      backend: model,
      model,
      timeout_ms: execution.timeout_ms,
      permission_level: options.autonomyLevel ?? execution.permission_required,
    });

    let output: string;
    let session: PiAgentSession | undefined;
    try {
      session = await PiAgentSession.create({ model, systemPrompt: agentsMd || undefined });
      await session.start();
      await session.prompt(renderedTask);
      await session.waitForIdle(execution.timeout_ms);
      output = await session.getLastOutput();
      circuitBreaker.recordSuccess(model);
    } catch (err: any) {
      circuitBreaker.recordFailure(model);
      await hooks.emit('post_execute', invocationId, metadata.name, metadata.version, {
        status: 'ERROR',
        duration_ms: Date.now() - start,
        output_valid: false,
        error: { type: 'backend_error', message: err.message },
      });
      throw err;
    } finally {
      session?.kill();
    }

    const durationMs = Date.now() - start;

    // Write to communication.output_to if defined
    if (communication?.output_to) {
      await writeFile(communication.output_to, output, 'utf-8').catch(() => {});
    }

    await hooks.emit('post_execute', invocationId, metadata.name, metadata.version, {
      status: 'COMPLETE',
      duration_ms: durationMs,
      output_valid: true,
    });

    return {
      output,
      backend: session!.meta.backend,
      model,
      durationMs,
      specialistVersion: metadata.version,
    };
  }
}
```

**Step 4: Run tests**
```bash
vitest run tests/unit/specialist/runner.test.ts
```
Expected: PASS

**Step 5: Run full test suite**
```bash
vitest run
```
Expected: all pass

**Step 6: Commit**
```bash
git add src/specialist/runner.ts tests/unit/specialist/runner.test.ts
git commit -m "feat(specialist): SpecialistRunner — pi execution, hooks, circuit breaker, agents.md injection"
```

---

### Task 8: 4 MCP Tools + Wire into server.ts

**Files:**
- Create: `src/tools/specialist/list_specialists.tool.ts`
- Create: `src/tools/specialist/use_specialist.tool.ts`
- Create: `src/tools/specialist/run_parallel.tool.ts`
- Create: `src/tools/specialist/specialist_status.tool.ts`
- Modify: `src/server.ts`

**Step 1: Implement list_specialists.tool.ts**
```typescript
// src/tools/specialist/list_specialists.tool.ts
import { z } from 'zod';
import type { SpecialistLoader } from '../../specialist/loader.js';

export const listSpecialistsSchema = z.object({
  category: z.string().optional().describe('Filter by category (e.g. analysis/code)'),
  scope: z.enum(['project', 'user', 'system', 'all']).optional().describe('Filter by scope'),
});

export function createListSpecialistsTool(loader: SpecialistLoader) {
  return {
    name: 'list_specialists' as const,
    description: 'List available specialists. Returns lightweight catalog — no prompts or full config.',
    inputSchema: listSpecialistsSchema,
    async execute(input: z.infer<typeof listSpecialistsSchema>) {
      const list = await loader.list(input.category);
      return input.scope && input.scope !== 'all'
        ? list.filter(s => s.scope === input.scope)
        : list;
    },
  };
}
```

**Step 2: Implement use_specialist.tool.ts**
```typescript
// src/tools/specialist/use_specialist.tool.ts
import { z } from 'zod';
import type { SpecialistRunner } from '../../specialist/runner.js';

export const useSpecialistSchema = z.object({
  name: z.string().describe('Specialist identifier (e.g. codebase-explorer)'),
  prompt: z.string().describe('The task or question for the specialist'),
  variables: z.record(z.string()).optional().describe('Additional $variable substitutions'),
  backend_override: z.string().optional().describe('Force a specific backend (gemini, qwen, anthropic)'),
  autonomy_level: z.string().optional().describe('Override permission level for this invocation'),
});

export function createUseSpecialistTool(runner: SpecialistRunner) {
  return {
    name: 'use_specialist' as const,
    description: 'Execute a specialist. Full lifecycle: load → agents.md → pi → validate → output.',
    inputSchema: useSpecialistSchema,
    async execute(input: z.infer<typeof useSpecialistSchema>) {
      return runner.run({
        name: input.name,
        prompt: input.prompt,
        variables: input.variables,
        backendOverride: input.backend_override,
        autonomyLevel: input.autonomy_level,
      });
    },
  };
}
```

**Step 3: Implement run_parallel.tool.ts**
```typescript
// src/tools/specialist/run_parallel.tool.ts
import { z } from 'zod';
import type { SpecialistRunner } from '../../specialist/runner.js';

const InvocationSchema = z.object({
  name: z.string(),
  prompt: z.string(),
  variables: z.record(z.string()).optional(),
  backend_override: z.string().optional(),
});

export const runParallelSchema = z.object({
  specialists: z.array(InvocationSchema).min(1),
  merge_strategy: z.enum(['collect', 'synthesize', 'vote']).default('collect'),
  timeout_ms: z.number().default(120_000),
});

export function createRunParallelTool(runner: SpecialistRunner) {
  return {
    name: 'run_parallel' as const,
    description: 'Execute multiple specialists concurrently. Returns aggregated results.',
    inputSchema: runParallelSchema,
    async execute(input: z.infer<typeof runParallelSchema>) {
      if (input.merge_strategy !== 'collect') {
        throw new Error(`Merge strategy '${input.merge_strategy}' not yet implemented (v2.1)`);
      }
      const results = await Promise.allSettled(
        input.specialists.map(s => runner.run({
          name: s.name, prompt: s.prompt,
          variables: s.variables, backendOverride: s.backend_override,
        }))
      );
      return results.map((r, i) => ({
        specialist: input.specialists[i].name,
        status: r.status,
        output: r.status === 'fulfilled' ? r.value.output : null,
        durationMs: r.status === 'fulfilled' ? r.value.durationMs : null,
        error: r.status === 'rejected' ? String(r.reason?.message) : null,
      }));
    },
  };
}
```

**Step 4: Implement specialist_status.tool.ts**
```typescript
// src/tools/specialist/specialist_status.tool.ts
import { z } from 'zod';
import type { SpecialistLoader } from '../../specialist/loader.js';
import type { CircuitBreaker } from '../../utils/circuitBreaker.js';

const BACKENDS = ['gemini', 'qwen', 'anthropic', 'openai'];

export function createSpecialistStatusTool(loader: SpecialistLoader, circuitBreaker: CircuitBreaker) {
  return {
    name: 'specialist_status' as const,
    description: 'System health: backend circuit breaker states, loaded specialists, staleness.',
    inputSchema: z.object({}),
    async execute(_: object) {
      const list = await loader.list();
      return {
        loaded_count: list.length,
        backends_health: Object.fromEntries(BACKENDS.map(b => [b, circuitBreaker.getState(b)])),
        specialists: list.map(s => ({
          name: s.name, scope: s.scope, category: s.category, version: s.version,
        })),
      };
    },
  };
}
```

**Step 5: Update server.ts**

Replace existing tool registrations with the 4 specialist tools. Wire `SpecialistLoader`, `SpecialistRunner`, `HookEmitter`, and `CircuitBreaker` as singletons created at server startup. Keep MCP transport setup unchanged.

Key wiring:
```typescript
const circuitBreaker = new CircuitBreaker();
const loader = new SpecialistLoader();
const hooks = new HookEmitter({ tracePath: join(process.cwd(), '.unitai', 'trace.jsonl') });
const runner = new SpecialistRunner({ loader, hooks, circuitBreaker });

// Register 4 tools (replacing old 15+)
const tools = [
  createListSpecialistsTool(loader),
  createUseSpecialistTool(runner),
  createRunParallelTool(runner),
  createSpecialistStatusTool(loader, circuitBreaker),
];
```

**Step 6: Build and verify 4 tools are registered**
```bash
bun run build
node dist/index.js 2>&1 | head -20
```
Expected: server starts, logs 4 tools

**Step 7: Run full test suite**
```bash
vitest run
```

**Step 8: Commit**
```bash
git add src/tools/specialist/ src/server.ts
git commit -m "feat(tools): 4 MCP tools — list_specialists, use_specialist, run_parallel, specialist_status"
```

---

## Phase 2: Built-in Specialists + Communication

### Task 9: Create built-in specialist YAMLs

**Files:**
- Create: `specialists/codebase-explorer.specialist.yaml`
- Create: `specialists/test-runner.specialist.yaml`
- Create: `specialists/report-generator.specialist.yaml`

Create per §7 and §14.1 of `omni-specialist.md`. Reference pi's `bash` command for test-runner pre-scripts.

**Step 1: Create codebase-explorer.specialist.yaml** (use example from §14.1 verbatim as starting point)

**Step 2: Create test-runner.specialist.yaml** with `skills.scripts` for pre/post bash execution

**Step 3: Create report-generator.specialist.yaml** targeting gemini, READ_ONLY, `response_format: markdown`

**Step 4: Validate all parse cleanly**
```bash
bun -e "
import { parseSpecialist } from './src/specialist/schema.js';
import { readFile } from 'node:fs/promises';
for (const f of ['codebase-explorer','test-runner','report-generator']) {
  const yaml = await readFile(\`specialists/\${f}.specialist.yaml\`, 'utf-8');
  await parseSpecialist(yaml);
  console.log('ok:', f);
}
"
```
Expected: `ok: codebase-explorer`, `ok: test-runner`, `ok: report-generator`

**Step 5: Commit**
```bash
git add specialists/
git commit -m "feat(specialists): built-in YAMLs — codebase-explorer, test-runner, report-generator"
```

---

### Task 10: Pre/Post Script Execution via pi bash

**Files:**
- Modify: `src/specialist/runner.ts`
- Create: `tests/unit/specialist/runner-scripts.test.ts`

Extend runner to execute `skills.scripts` using `pi.send({ type: 'bash', command })`. Pre-script output is injected as `$pre_script_output` variable. Post-script runs after output is received.

---

### Task 11: Pipeline Communication ($previous_result)

**Files:**
- Create: `src/specialist/pipeline.ts`

Implement Message Queue pipeline pattern from §5.3 Pattern 1: sequential specialist execution where `$previous_result` is passed as a template variable to each step. Expose via `run_parallel` with `merge_strategy: 'pipeline'` (new strategy).

---

## Phase 3: Deprecation

### Task 12: Convert workflows to specialists

For each workflow, in order:

| Workflow file | New specialist YAML |
|---|---|
| `src/workflows/init-session.workflow.ts` | `specialists/init-session.specialist.yaml` |
| `src/workflows/triangulated-review.workflow.ts` | `specialists/triangulated-review.specialist.yaml` |
| `src/workflows/bug-hunt.workflow.ts` | `specialists/bug-hunt.specialist.yaml` |
| `src/workflows/feature-design.workflow.ts` | `specialists/feature-design.specialist.yaml` |
| `src/workflows/overthinker.workflow.ts` | `specialists/overthinker.specialist.yaml` |
| `src/workflows/auto-remediation.workflow.ts` | `specialists/auto-remediation.specialist.yaml` |

For each:
1. Create the `.specialist.yaml` capturing the workflow's prompt and execution config
2. Test manually: `use_specialist` returns equivalent quality output
3. Add deprecation notice to old tool (if still wired)

### Task 13: Staleness detection in specialist_status

Extend `specialist_status` tool: for each specialist with `validation.files_to_watch`, check if any watched file has `mtime > metadata.updated`. Flag as `STALE` or `AGED` (if beyond `stale_threshold_days`).

---

## Phase 4: Cleanup

### Task 14: Remove deprecated code

**Delete:**
- `src/agents/` (ArchitectAgent, ImplementerAgent, TesterAgent, BaseAgent)
- `src/workflows/` (all — replaced by YAML specialists)
- `src/tools/` old tools (keep only `src/tools/specialist/`)
- `src/utils/aiExecutor.ts` (replaced by pi/session.ts)
- `src/utils/commandExecutor.ts` (replaced by pi)

**Keep:**
- `src/utils/circuitBreaker.ts` (upgraded)
- `src/utils/permissionManager.ts`
- `src/utils/logger.ts`
- `src/utils/tokenEstimator.ts`
- `src/repositories/` (activity analytics)
- `src/services/activityAnalytics.ts`

**Step: Run full test suite after deletion**
```bash
vitest run
bun run build
```
Expected: all pass, no references to deleted files

**Step: Commit**
```bash
git add -A
git commit -m "refactor: remove deprecated agents, workflows, old tools — specialist system is now sole orchestration layer"
```

### Task 15: Update documentation

- `CLAUDE.md`: update architecture section to reflect v2
- `omni-specialist.md`: mark as implemented (add `status: implemented` to frontmatter)
- `README.md`: new user guide for v2 (installation, list_specialists, use_specialist examples)
- `CHANGELOG.md`: v2.0.0 entry with full feature list

### Task 16: Publish v2.0.0

```bash
# Bump version
npm version major  # 0.4.0 → 2.0.0 (or use bun equivalent)

# Final test run
vitest run
bun run build

# Tag and publish
git commit -m "chore: release v2.0.0 — Specialist System"
git tag -a v2.0.0 -m "Release 2.0.0: Specialist System with pi execution substrate"
git push && git push --tags
npm publish
```

---

## Summary

| Phase | Tasks | Deliverable |
|---|---|---|
| Pre-work | Task 0 | Spec updated |
| Phase 1 | Tasks 1-8 | Working 4-tool MCP server with pi execution |
| Phase 2 | Tasks 9-11 | Built-in specialists + communication patterns |
| Phase 3 | Tasks 12-13 | All workflows migrated, staleness detection |
| Phase 4 | Tasks 14-16 | Cleaned up, documented, published v2.0.0 |
