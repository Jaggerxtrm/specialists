import { randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const PRIMARY_BENCHMARK_URL = 'https://artificialanalysis.ai/api/v2/data/llms/models';
export const SECONDARY_BENCHMARK_URL = 'https://lmarena.ai/leaderboard/json';
export const BENCHMARK_TTL_MS = 86_400_000;
export const DEFAULT_MAX_SNAPSHOT_AGE_MS = 14 * 86_400_000;

export type BenchmarkSource = 'artificialanalysis' | 'lmarena';

export interface BenchmarkRow {
  id: string;
  provider: string;
  quality_score?: number;
  elo?: number;
  cost_input?: number;
  cost_output?: number;
  context_window?: number;
  tools_supported?: boolean;
}

export interface BenchmarkSnapshot {
  source: BenchmarkSource;
  source_url: string;
  fetched_at: string;
  models: Map<string, BenchmarkRow>;
}

export interface BenchmarkWarning {
  source?: BenchmarkSource;
  message: string;
}

export interface LoadBenchmarkOptions {
  cacheDir?: string;
  now?: Date;
  ttlMs?: number;
  maxSnapshotAgeMs?: number;
  offline?: boolean;
  fetchImpl?: typeof fetch;
  warn?: (warning: BenchmarkWarning) => void;
}

interface CacheFile {
  source: BenchmarkSource;
  source_url: string;
  fetched_at: string;
  models: BenchmarkRow[];
}

interface SourceConfig {
  source: BenchmarkSource;
  url: string;
}

const SOURCES: readonly SourceConfig[] = [
  { source: 'artificialanalysis', url: PRIMARY_BENCHMARK_URL },
  { source: 'lmarena', url: SECONDARY_BENCHMARK_URL },
];

export async function loadBenchmarkSnapshot(options: LoadBenchmarkOptions = {}): Promise<BenchmarkSnapshot | null> {
  const warnings: BenchmarkWarning[] = [];
  const warn = (warning: BenchmarkWarning): void => {
    warnings.push(warning);
    options.warn?.(warning);
  };

  for (const source of SOURCES) {
    const snapshot = await loadSourceSnapshot(source, options, warn);
    if (snapshot) return snapshot;
  }

  if (warnings.length === 0) warn({ message: 'no benchmark sources configured' });
  return null;
}

async function loadSourceSnapshot(source: SourceConfig, options: LoadBenchmarkOptions, warn: (warning: BenchmarkWarning) => void): Promise<BenchmarkSnapshot | null> {
  const cachePath = getBenchmarkCachePath(source.source, options.cacheDir);
  const cached = readCache(cachePath, options, warn);
  if (cached && isCacheFresh(cached, options)) return toSnapshot(cached);

  if (isOffline(options)) {
    warn({ source: source.source, message: `offline mode forbids refresh for ${source.url}` });
    return cached ? toSnapshot(cached) : null;
  }

  const fetched = await fetchSource(source, options, warn);
  if (fetched) {
    writeCache(cachePath, fetched);
    return toSnapshot(fetched);
  }

  return cached ? toSnapshot(cached) : null;
}

function readCache(path: string, options: LoadBenchmarkOptions, warn: (warning: BenchmarkWarning) => void): CacheFile | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as CacheFile;
    assertSnapshotFresh(parsed, options);
    return parsed;
  } catch (error) {
    warn({ message: `benchmark cache rejected at ${path}: ${error instanceof Error ? error.message : String(error)}` });
    return null;
  }
}

async function fetchSource(source: SourceConfig, options: LoadBenchmarkOptions, warn: (warning: BenchmarkWarning) => void): Promise<CacheFile | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetchImpl(source.url, { signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const rows = normalizeRows(source.source, payload);
    return { source: source.source, source_url: source.url, fetched_at: (options.now ?? new Date()).toISOString(), models: rows };
  } catch (error) {
    warn({ source: source.source, message: `benchmark fetch failed from ${source.url}: ${error instanceof Error ? error.message : String(error)}` });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeRows(source: BenchmarkSource, payload: unknown): BenchmarkRow[] {
  const candidates = Array.isArray(payload)
    ? payload
    : typeof payload === 'object' && payload !== null
      ? Object.values(payload).find(Array.isArray) ?? []
      : [];
  return candidates.flatMap((value) => normalizeRow(source, value));
}

function normalizeRow(source: BenchmarkSource, value: unknown): BenchmarkRow[] {
  if (typeof value !== 'object' || value === null) return [];
  const record = value as Record<string, unknown>;
  const id = firstString(record.id, record.slug, record.model_id, record.modelId, record.name, record.model);
  if (!id) return [];
  return [{
    id,
    provider: firstString(record.provider, record.organization, record.creator, record.company) ?? providerFromId(id),
    quality_score: firstNumber(record.quality_score, record.qualityScore, record.intelligence_index, record.score),
    elo: firstNumber(record.elo, record.arena_elo, record.rating, source === 'lmarena' ? record.score : undefined),
    cost_input: firstNumber(record.cost_input, record.input_cost, record.price_1m_input_tokens, record.inputPrice),
    cost_output: firstNumber(record.cost_output, record.output_cost, record.price_1m_output_tokens, record.outputPrice),
    context_window: firstNumber(record.context_window, record.contextWindow, record.context, record.max_tokens),
    tools_supported: firstBoolean(record.tools_supported, record.supports_tools, record.tool_use, record.tools),
  }];
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === 'string' && value.length > 0);
}

function firstNumber(...values: unknown[]): number | undefined {
  return values.find((value): value is number => typeof value === 'number' && Number.isFinite(value));
}

function firstBoolean(...values: unknown[]): boolean | undefined {
  return values.find((value): value is boolean => typeof value === 'boolean');
}

function providerFromId(id: string): string {
  return id.includes('/') ? id.split('/')[0] ?? 'unknown' : 'unknown';
}

function assertSnapshotFresh(snapshot: CacheFile, options: LoadBenchmarkOptions): void {
  const fetchedAt = Date.parse(snapshot.fetched_at);
  if (!Number.isFinite(fetchedAt)) throw new Error('invalid fetched_at timestamp');
  const ageMs = (options.now ?? new Date()).getTime() - fetchedAt;
  const maxAgeMs = options.maxSnapshotAgeMs ?? DEFAULT_MAX_SNAPSHOT_AGE_MS;
  if (ageMs > maxAgeMs) throw new Error(`snapshot older than ${Math.floor(maxAgeMs / 86_400_000)} days`);
}

function isCacheFresh(snapshot: CacheFile, options: LoadBenchmarkOptions): boolean {
  const fetchedAt = Date.parse(snapshot.fetched_at);
  const ageMs = (options.now ?? new Date()).getTime() - fetchedAt;
  return ageMs <= (options.ttlMs ?? BENCHMARK_TTL_MS);
}

function toSnapshot(cache: CacheFile): BenchmarkSnapshot {
  return { source: cache.source, source_url: cache.source_url, fetched_at: cache.fetched_at, models: new Map(cache.models.map((row) => [row.id, row])) };
}

function isOffline(options: LoadBenchmarkOptions): boolean {
  return options.offline === true || process.env.SPECIALISTS_OFFLINE === '1';
}

export function getBenchmarkCachePath(source: BenchmarkSource, cacheDir = join(homedir(), '.cache', 'specialists', 'benchmarks')): string {
  return join(cacheDir, `${source}.json`);
}

function writeCache(path: string, snapshot: CacheFile): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmpPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(tmpPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  const fd = openSync(tmpPath, 'r');
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmpPath, path);
  fsyncDirectory(dirname(path));
}

function fsyncDirectory(path: string): void {
  try {
    const fd = openSync(path, 'r');
    try {
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  } catch {
    // Directory fsync unsupported on some platforms; file fsync plus rename still preserves atomic replace semantics.
  }
}
