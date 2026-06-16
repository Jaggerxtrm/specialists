import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as z from 'zod';
import { loadBenchmarkSnapshot, BENCHMARK_TTL_MS, type BenchmarkRow, type BenchmarkSnapshot } from '../specialist/benchmarks.js';
import { getGlobalUserConfigPath } from '../specialist/global-config.js';
import { SpecialistLoader } from '../specialist/loader.js';
import { runAgenticFollowthroughProbe } from '../specialist/model-probes.js';

const EX_TEMPFAIL = 75;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;

const SetupInputSchema = z.object({
  specialists: z.array(z.string().min(1)).optional(),
  preferred_providers: z.array(z.string().min(1)).optional(),
  disallowed_models: z.array(z.string().min(1)).optional(),
}).strict().catch({});

const SetupWriteSchema = z.object({
  specialist: z.string().min(1),
  path: z.literal('execution.model'),
  value: z.string().min(1),
  reason: z.string().min(1),
}).strict();

const SetupPlanSchema = z.object({
  version: z.literal('3.0'),
  generated_at: z.string().min(1),
  preset: z.string().min(1),
  inputs: SetupInputSchema,
  writes: z.array(SetupWriteSchema),
  benchmark: z.object({
    source: z.string().min(1),
    source_url: z.string().min(1),
    fetched_at: z.string().min(1),
  }).strict(),
}).strict();

type SetupInput = z.infer<typeof SetupInputSchema>;
type SetupPlan = z.infer<typeof SetupPlanSchema>;
type SetupWrite = z.infer<typeof SetupWriteSchema>;

interface ParsedArgs {
  mode: 'discovery' | 'fetch-benchmarks' | 'plan' | 'apply' | 'probe-only' | 'interactive';
  json: boolean;
  offline: boolean;
  dryRun: boolean;
  planPreset?: string;
  planPath?: string;
  probeModel?: string;
  probeSpec?: string;
}

interface PiModel {
  provider: string;
  model: string;
  id: string;
  context_window: string;
  max_output: string;
  thinking: boolean;
  images: boolean;
}

interface DiscoveryState {
  models: PiModel[];
  missing_configs: {
    global_user_config: boolean;
  };
  registry: Array<{
    name: string;
    model: string;
    permission_required: string;
    source: string;
  }>;
  blocked_field_warnings: Array<{
    specialist: string;
    field: string;
    source: string;
    severity: string;
  }>;
  global_config_path: string;
}

interface BenchmarkFetchResult {
  snapshot: null | {
    source: string;
    source_url: string;
    fetched_at: string;
    model_count: number;
  };
  warnings: string[];
  offline: boolean;
  cache_status: 'fresh' | 'stale' | 'missing';
}

interface ApplyResult {
  dry_run: boolean;
  path: string;
  writes: SetupWrite[];
  changed: boolean;
}

function usage(): string {
  return [
    'Usage: specialists setup <mode> [options]',
    '  specialists setup --discovery [--json]',
    '  specialists setup --fetch-benchmarks [--offline] [--json]',
    '  specialists setup --plan <model-budget-preset> [--json]',
    '  specialists setup --apply <plan-json-path> [--dry-run] [--json]',
    '  specialists setup --probe-only <model> <spec> [--json]',
    '  specialists setup --interactive',
  ].join('\n');
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let mode: ParsedArgs['mode'] | undefined;
  let json = false;
  let offline = false;
  let dryRun = false;
  let planPreset: string | undefined;
  let planPath: string | undefined;
  let probeModel: string | undefined;
  let probeSpec: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--json') {
      json = true;
      continue;
    }
    if (token === '--offline') {
      offline = true;
      continue;
    }
    if (token === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (token === '--discovery') {
      mode = pickMode(mode, 'discovery');
      continue;
    }
    if (token === '--fetch-benchmarks') {
      mode = pickMode(mode, 'fetch-benchmarks');
      continue;
    }
    if (token === '--plan') {
      mode = pickMode(mode, 'plan');
      planPreset = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--apply') {
      mode = pickMode(mode, 'apply');
      planPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === '--probe-only') {
      mode = pickMode(mode, 'probe-only');
      probeModel = argv[index + 1];
      probeSpec = argv[index + 2];
      index += 2;
      continue;
    }
    if (token === '--interactive') {
      mode = pickMode(mode, 'interactive');
      continue;
    }
    throw new Error(`Unknown option: ${token}`);
  }

  if (!mode) throw new Error(usage());
  if (mode === 'plan' && !planPreset) throw new Error('Missing <model-budget-preset> for --plan');
  if (mode === 'apply' && !planPath) throw new Error('Missing <plan-json-path> for --apply');
  if (mode === 'probe-only' && (!probeModel || !probeSpec)) throw new Error('Missing <model> <spec> for --probe-only');

  return { mode, json, offline, dryRun, planPreset, planPath, probeModel, probeSpec };
}

function pickMode(current: ParsedArgs['mode'] | undefined, next: ParsedArgs['mode']): ParsedArgs['mode'] {
  if (current && current !== next) throw new Error('Choose exactly one setup mode');
  return next;
}

export async function run(argv = process.argv.slice(3)): Promise<void> {
  const args = parseArgs(argv);

  switch (args.mode) {
    case 'discovery':
      await runDiscovery(args);
      return;
    case 'fetch-benchmarks':
      await runFetchBenchmarks(args);
      return;
    case 'plan':
      await runPlan(args);
      return;
    case 'apply':
      await runApply(args);
      return;
    case 'probe-only':
      await runProbeOnly(args);
      return;
    case 'interactive':
      await runInteractive(args);
      return;
    default:
      return assertNever(args.mode);
  }
}

export async function runDiscovery(args: ParsedArgs): Promise<void> {
  const state = await collectDiscoveryState();
  printValue(state, args.json, formatDiscovery);
}

export async function runFetchBenchmarks(args: ParsedArgs): Promise<void> {
  const result = await fetchBenchmarks(args.offline);
  printValue(result, args.json, formatBenchmarkFetch);
}

export async function runPlan(args: ParsedArgs): Promise<void> {
  const plan = await buildPlan(args.planPreset!);
  console.log(JSON.stringify(plan, null, 2));
}

export async function runApply(args: ParsedArgs): Promise<void> {
  const result = applyPlan(args.planPath!, args.dryRun);
  printValue(result, args.json, formatApplyResult);
}

export async function runProbeOnly(args: ParsedArgs): Promise<void> {
  const result = await runAgenticFollowthroughProbe(args.probeModel!, args.probeSpec!);
  printValue(result, args.json, formatProbeResult);
}

export async function runInteractive(args: ParsedArgs): Promise<void> {
  const text = renderInteractiveWorkflow();
  if (args.json) {
    console.log(JSON.stringify({ workflow: text, skill_reference: 'setup-specialists' }, null, 2));
    return;
  }
  console.log(text);
}

function printValue<T>(value: T, json: boolean, render: (value: T) => string): void {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  console.log(render(value));
}

async function collectDiscoveryState(): Promise<DiscoveryState> {
  const loader = new SpecialistLoader();
  const registry = await loader.list();
  const location = getGlobalUserConfigPath();
  return {
    models: parsePiModels(),
    missing_configs: { global_user_config: !location.exists },
    registry: registry.map((entry) => ({
      name: entry.name,
      model: entry.model,
      permission_required: entry.permission_required,
      source: entry.source,
    })),
    blocked_field_warnings: loader.getBlockedFieldWarnings().map((warning) => ({
      specialist: warning.specialist,
      field: warning.field,
      source: warning.source,
      severity: warning.severity,
    })),
    global_config_path: location.path,
  };
}

function parsePiModels(): PiModel[] {
  const result = spawnSync('pi', ['--list-models'], { encoding: 'utf8', stdio: 'pipe', timeout: 8_000 });
  if (result.status !== 0 || result.error) return [];
  return result.stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/))
    .map((columns) => ({
      provider: columns[0] ?? '',
      model: columns[1] ?? '',
      id: `${columns[0] ?? ''}/${columns[1] ?? ''}`,
      context_window: columns[2] ?? '',
      max_output: columns[3] ?? '',
      thinking: columns[4] === 'yes',
      images: columns[5] === 'yes',
    }))
    .filter((model) => model.provider.length > 0 && model.model.length > 0);
}

async function fetchBenchmarks(offline: boolean): Promise<BenchmarkFetchResult> {
  const warnings: string[] = [];
  const snapshot = await loadBenchmarkSnapshot({ offline, warn: (warning) => warnings.push(warning.message) });
  if (!snapshot) {
    if (offline) process.exit(EX_TEMPFAIL);
    return { snapshot: null, warnings, offline, cache_status: 'missing' };
  }

  const cacheStatus = ageFrom(snapshot.fetched_at) > BENCHMARK_TTL_MS ? 'stale' : 'fresh';
  if (offline && cacheStatus === 'stale') process.exit(EX_TEMPFAIL);

  return {
    snapshot: {
      source: snapshot.source,
      source_url: snapshot.source_url,
      fetched_at: snapshot.fetched_at,
      model_count: snapshot.models.size,
    },
    warnings,
    offline,
    cache_status: cacheStatus,
  };
}

async function buildPlan(preset: string): Promise<SetupPlan> {
  const input = readSetupInput();
  const discovery = await collectDiscoveryState();
  const warnings: string[] = [];
  const benchmark = await loadBenchmarkSnapshot({ offline: true, warn: (warning) => warnings.push(warning.message) });
  if (!benchmark) throw new Error(`Benchmark cache missing. Run ${yellow('sp setup --fetch-benchmarks')} first.`);

  const budget = resolveBudgetPreset(preset);
  const availableModelIds = new Set(discovery.models.map((model) => model.id));
  const disallowedModels = new Set(input.disallowed_models ?? []);
  const preferredProviders = new Set(input.preferred_providers ?? []);
  const targetSpecialists = input.specialists ?? discovery.registry.map((entry) => entry.name);

  const writes = targetSpecialists.flatMap((name) => {
    const registryEntry = discovery.registry.find((entry) => entry.name === name);
    if (!registryEntry) return [];
    const selected = selectBenchmarkModel({ benchmark, availableModelIds, disallowedModels, preferredProviders, budget });
    if (!selected || registryEntry.model === selected.id) return [];
    return [{
      specialist: name,
      path: 'execution.model' as const,
      value: selected.id,
      reason: `preset=${preset}; benchmark=${benchmark.source}; quality=${selected.quality_score ?? selected.elo ?? 'n/a'}`,
    }];
  });

  return SetupPlanSchema.parse({
    version: '3.0',
    generated_at: new Date().toISOString(),
    preset,
    inputs: input,
    writes,
    benchmark: {
      source: benchmark.source,
      source_url: benchmark.source_url,
      fetched_at: benchmark.fetched_at,
    },
  });
}

function readSetupInput(): SetupInput {
  if (process.stdin.isTTY) return {};
  const raw = readFileSync(0, 'utf8').trim();
  if (raw.length === 0) return {};
  return SetupInputSchema.parse(JSON.parse(raw));
}

function resolveBudgetPreset(preset: string): { maxInputCost?: number } {
  switch (preset) {
    case 'cheap':
      return { maxInputCost: 3 };
    case 'balanced':
      return { maxInputCost: 10 };
    case 'premium':
      return {};
    default:
      throw new Error(`Unknown model budget preset: ${preset}`);
  }
}

function selectBenchmarkModel(options: {
  benchmark: BenchmarkSnapshot;
  availableModelIds: ReadonlySet<string>;
  disallowedModels: ReadonlySet<string>;
  preferredProviders: ReadonlySet<string>;
  budget: { maxInputCost?: number };
}): BenchmarkRow | null {
  const rows = [...options.benchmark.models.values()]
    .filter((row) => options.availableModelIds.has(row.id))
    .filter((row) => !options.disallowedModels.has(row.id))
    .filter((row) => options.budget.maxInputCost === undefined || (row.cost_input ?? Number.POSITIVE_INFINITY) <= options.budget.maxInputCost)
    .sort((left, right) => scoreRow(right, options.preferredProviders) - scoreRow(left, options.preferredProviders));
  return rows[0] ?? null;
}

function scoreRow(row: BenchmarkRow, preferredProviders: ReadonlySet<string>): number {
  const providerBonus = preferredProviders.size === 0 || preferredProviders.has(row.provider) ? 10_000 : 0;
  return providerBonus + (row.quality_score ?? row.elo ?? 0);
}

function applyPlan(planPath: string, dryRun: boolean): ApplyResult {
  const plan = SetupPlanSchema.parse(JSON.parse(readFileSync(planPath, 'utf8')));
  const path = getGlobalUserConfigPath().path;
  if (dryRun) return { dry_run: true, path, writes: plan.writes, changed: false };

  let changed = false;
  for (const write of plan.writes) {
    if (isWriteAlreadyApplied(write)) continue;
    applyWriteWithGlobalEdit(write);
    changed = true;
  }

  return { dry_run: false, path, writes: plan.writes, changed };
}

function isWriteAlreadyApplied(write: SetupWrite): boolean {
  const getResult = spawnSync('sp', ['edit', '--global', '--get', `${write.specialist}.${write.path}`], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (getResult.status !== 0 || getResult.error) return false;
  return getResult.stdout.trim() === write.value;
}

function applyWriteWithGlobalEdit(write: SetupWrite): void {
  const setResult = spawnSync('sp', ['edit', '--global', '--set', `${write.specialist}.${write.path}`, write.value], {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (setResult.status === 0 && !setResult.error) return;

  const stderr = setResult.stderr?.trim();
  const stdout = setResult.stdout?.trim();
  throw new Error([
    `Failed to apply ${write.specialist}.${write.path}=${write.value} via sp edit --global`,
    stderr || stdout || setResult.error?.message || 'unknown subprocess failure',
  ].filter(Boolean).join(': '));
}

function ageFrom(timestamp: string): number {
  return Date.now() - Date.parse(timestamp);
}

function formatBenchmarkFetch(result: BenchmarkFetchResult): string {
  const lines = ['', bold('sp setup --fetch-benchmarks')];
  lines.push(`  offline: ${result.offline ? 'yes' : 'no'}`);
  lines.push(`  cache_status: ${result.cache_status}`);
  if (result.snapshot) lines.push(`  snapshot: ${result.snapshot.source} ${dim(result.snapshot.fetched_at)}`);
  for (const warning of result.warnings) lines.push(`  warning: ${warning}`);
  lines.push('');
  return lines.join('\n');
}

function formatDiscovery(state: DiscoveryState): string {
  const lines = ['', bold('sp setup --discovery')];
  lines.push(`  models: ${state.models.length}`);
  lines.push(`  registry: ${state.registry.length}`);
  lines.push(`  global_user_config: ${state.missing_configs.global_user_config ? yellow('missing') : green('present')}`);
  if (state.blocked_field_warnings.length > 0) lines.push(`  blocked_field_warnings: ${state.blocked_field_warnings.length}`);
  lines.push(`  path: ${dim(state.global_config_path)}`);
  lines.push('');
  return lines.join('\n');
}

function formatApplyResult(result: ApplyResult): string {
  const lines = ['', bold('sp setup --apply')];
  lines.push(`  path: ${result.path}`);
  lines.push(`  dry_run: ${result.dry_run ? 'yes' : 'no'}`);
  lines.push(`  changed: ${result.changed ? 'yes' : 'no'}`);
  for (const write of result.writes) lines.push(`  - ${write.specialist}.${write.path} = ${write.value}`);
  lines.push('');
  return lines.join('\n');
}

function formatProbeResult(result: Awaited<ReturnType<typeof runAgenticFollowthroughProbe>>): string {
  return [
    '',
    bold('sp setup --probe-only'),
    `  verdict: ${result.verdict}`,
    `  turns: ${result.metrics.turns_used}`,
    `  tools: ${result.metrics.tools_used}`,
    `  output_length: ${result.metrics.output_length}`,
    `  files_outside_scope_touched: ${result.metrics.files_outside_scope_touched}`,
    `  transcript: ${result.transcript_path}`,
    '',
  ].join('\n');
}

function renderInteractiveWorkflow(): string {
  return [
    '',
    bold('sp setup --interactive'),
    '  1. Run sp setup --discovery --json',
    '  2. Run sp setup --fetch-benchmarks --json',
    '  3. Pipe operator JSON into sp setup --plan <preset>',
    '  4. Review plan JSON',
    '  5. Run sp setup --apply <plan.json> [--dry-run]',
    '  6. Optional: sp setup --probe-only <model> <spec>',
    '',
    `  Skill reference: ${dim('setup-specialists')}`,
    '',
  ].join('\n');
}

function assertNever(value: never): never {
  throw new Error(`Unhandled setup mode: ${String(value)}`);
}
