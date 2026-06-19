// Prometheus scrape projection. Aggregation model: label-keyed groupBy over
// (repo, specialist, status, worktree, role, …) tuples → one Prometheus
// sample per distinct tuple, plus histograms for durations.
//
// Decision per unitAI-ctb4u.16: this projection deliberately does NOT
// consume src/specialist/live-aggregates.ts. live-aggregates is a scalar
// counter core for the sp console StatsLine (one row of output per call);
// the math overlap with Prometheus's label-keyed groupBy is minimal once
// labels and histograms are accounted for, and routing through a shared
// scalar core would force shoehorning two structurally different
// aggregation models into one shape while risking byte-equivalence
// regressions for the existing scrape format. Byte-format invariants
// already guarded by validatePrometheusProjectionText below.
//
// If a future consumer needs label-keyed scalars, extract a shared
// label-keyed core then — not preemptively.

import { resolveObservabilityDbLocation } from './observability-db.js';
import { createObservabilitySqliteClient, type JobMetricsRecord, type ObservabilitySqliteClient } from './observability-sqlite.js';
import { assertNoForbiddenLabels, pickAllowedLabels } from './forensic-events.js';
import type { ForensicEvent } from './forensic-events.js';
import type { SupervisorStatus } from './supervisor.js';

const JOB_DURATION_BUCKETS = [1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600, 7200, 14400];
const JOB_WAIT_BUCKETS = [1, 5, 30, 60, 300, 900, 1800, 3600, 7200, 21600];
const CHAIN_DURATION_BUCKETS = [1, 5, 10, 30, 60, 120, 300, 600, 1800, 3600, 7200, 14400];
const DEFAULT_SERVICE_LABELS = {
  service_name: 'specialists',
  participant_kind: 'specialist',
};

export interface PrometheusProjectionOptions {
  repo?: string;
  sinceMs?: number;
  nowMs?: number;
}

export interface PrometheusProjectionInput {
  statuses: SupervisorStatus[];
  jobMetrics: JobMetricsRecord[];
  repo: string;
  nowMs?: number;
  forensicEvents?: ForensicEvent[];
}

type Labels = Record<string, string>;

interface NumericSample {
  name: string;
  help: string;
  type: 'counter' | 'gauge';
  labels: Labels;
  value: number;
}

interface HistogramSample {
  name: string;
  help: string;
  labels: Labels;
  buckets: readonly number[];
  values: number[];
}

interface ChainSummary {
  labels: Labels;
  durationSeconds: number | null;
}

interface ForensicMetricSample {
  metricName: string;
  labels: Labels;
  value: number;
}

export function collectPrometheusProjection(options: PrometheusProjectionOptions = {}): string {
  const client = createObservabilitySqliteClient();
  if (!client) {
    throw new Error('Observability SQLite is unavailable; run under Bun with an initialized specialists database.');
  }

  return collectPrometheusProjectionFromClient(client, options);
}

export function collectPrometheusProjectionFromClient(
  client: Pick<ObservabilitySqliteClient, 'listStatuses' | 'listJobMetrics'>,
  options: PrometheusProjectionOptions = {},
): string {
  const location = resolveObservabilityDbLocation();
  const repo = options.repo ?? basename(location.gitRoot);
  return renderPrometheusProjection({
    statuses: client.listStatuses(),
    jobMetrics: client.listJobMetrics({ sinceMs: options.sinceMs }),
    repo,
    nowMs: options.nowMs,
  });
}

export function renderPrometheusProjection(input: PrometheusProjectionInput): string {
  const nowMs = input.nowMs ?? Date.now();
  const samples: NumericSample[] = [];
  const histograms: HistogramSample[] = [];

  for (const [key, count] of countBy(input.statuses, (status) => labelsKey(jobStateLabels(status, input.repo)))) {
    samples.push({
      name: 'xtrm_job_state',
      help: 'Current specialist job count by bounded state.',
      type: 'gauge',
      labels: parseLabelsKey(key),
      value: count,
    });
  }

  for (const [key, count] of countBy(input.statuses.filter(isQueuedStatus), (status) => labelsKey(jobQueueLabels(status, input.repo)))) {
    samples.push({
      name: 'xtrm_job_queue_depth',
      help: 'Current queued or waiting-to-start specialist jobs.',
      type: 'gauge',
      labels: parseLabelsKey(key),
      value: count,
    });
  }

  for (const [key, count] of countBy(input.statuses, (status) => labelsKey(processLabels(status, input.repo)))) {
    samples.push({
      name: 'xtrm_processes',
      help: 'Current specialist process rows by bounded process state.',
      type: 'gauge',
      labels: parseLabelsKey(key),
      value: count,
    });
  }

  for (const [key, count] of countBy(input.statuses.filter(hasWorktree), (status) => labelsKey(worktreeLabels(status, input.repo)))) {
    samples.push({
      name: 'xtrm_worktrees',
      help: 'Current specialist worktrees by bounded state.',
      type: 'gauge',
      labels: parseLabelsKey(key),
      value: count,
    });
  }

  const terminalMetrics = input.jobMetrics.filter((record) => isTerminalStatus(record.status));
  for (const [key, records] of groupBy(terminalMetrics, (record) => labelsKey(jobResultLabels(record, input.repo)))) {
    samples.push({
      name: 'xtrm_jobs_total',
      help: 'Terminal specialist job activations by bounded participant role and result.',
      type: 'counter',
      labels: parseLabelsKey(key),
      value: records.length,
    });

    const durations = records.map((record) => msToSeconds(record.elapsed_ms)).filter(isNumber);
    if (durations.length > 0) {
      histograms.push({
        name: 'xtrm_job_duration_seconds',
        help: 'End-to-end specialist job activation duration.',
        labels: parseLabelsKey(key),
        buckets: JOB_DURATION_BUCKETS,
        values: durations,
      });
    }

    const activeDurations = records.map((record) => msToSeconds(record.active_runtime_ms)).filter(isNumber);
    if (activeDurations.length > 0) {
      histograms.push({
        name: 'xtrm_job_active_runtime_seconds',
        help: 'Specialist job active runtime excluding waiting time where measurable.',
        labels: parseLabelsKey(key),
        buckets: JOB_DURATION_BUCKETS,
        values: activeDurations,
      });
    }
  }

  const chainSummaries = summarizeChains(terminalMetrics, input.repo);
  for (const [key, chains] of groupBy(chainSummaries, (chain) => labelsKey(chain.labels))) {
    const labels = parseLabelsKey(key);
    samples.push({
      name: 'xtrm_chains_total',
      help: 'Terminal specialist chains by bounded template and result.',
      type: 'counter',
      labels,
      value: chains.length,
    });
    const durations = chains.map((chain) => chain.durationSeconds).filter(isNumber);
    if (durations.length > 0) {
      histograms.push({
        name: 'xtrm_chain_duration_seconds',
        help: 'End-to-end specialist chain duration by bounded template and result.',
        labels,
        buckets: CHAIN_DURATION_BUCKETS,
        values: durations,
      });
    }
  }

  for (const [key, records] of groupBy(input.jobMetrics, (record) => labelsKey(jobParticipantLabels(record, input.repo)))) {
    const waits = records.map((record) => msToSeconds(record.waiting_ms)).filter(isNumber);
    if (waits.length > 0) {
      histograms.push({
        name: 'xtrm_job_wait_seconds',
        help: 'Specialist job waiting duration before active runtime.',
        labels: parseLabelsKey(key),
        buckets: JOB_WAIT_BUCKETS,
        values: waits,
      });
    }

    const turns = records.reduce((sum, record) => sum + Math.max(0, Number(record.total_turns) || 0), 0);
    if (turns > 0) {
      samples.push({
        name: 'xtrm_turns_total',
        help: 'Completed specialist turns projected from job metrics.',
        type: 'counter',
        labels: { ...parseLabelsKey(key), result: 'success' },
        value: turns,
      });
    }

    const latestContext = latestContextRatio(records);
    if (latestContext !== null) {
      samples.push({
        name: 'xtrm_context_usage_ratio',
        help: 'Latest observed context usage ratio by participant role.',
        type: 'gauge',
        labels: parseLabelsKey(key),
        value: latestContext,
      });
    }
  }

  for (const sample of toolCallSamples(input.jobMetrics, input.repo)) samples.push(sample);
  for (const sample of tokenSamples(input.jobMetrics, input.repo)) samples.push(sample);
  for (const sample of forensicEventSamples(input.forensicEvents ?? [], input.repo)) samples.push(sample);

  samples.push({
    name: 'xtrm_prometheus_projection_timestamp_seconds',
    help: 'Unix timestamp when the xtrm Prometheus projection was rendered.',
    type: 'gauge',
    labels: { service_name: 'specialists', repo: input.repo },
    value: nowMs / 1000,
  });

  return renderMetrics(samples, histograms);
}

export function validatePrometheusProjectionText(text: string): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const metricLineRe = /^[a-zA-Z_:][a-zA-Z0-9_:]*(\{[^}]*\})? [-+]?(?:\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?$/;
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (line.trim().length === 0 || line.startsWith('# HELP ') || line.startsWith('# TYPE ')) continue;
    if (!metricLineRe.test(line)) errors.push(`line ${index + 1}: invalid Prometheus sample syntax`);
    const labelsMatch = line.match(/\{([^}]*)\}/);
    if (!labelsMatch) continue;
    const labels = Object.fromEntries(
      labelsMatch[1]
        .split(',')
        .filter(Boolean)
        .map((pair) => {
          const [key, rawValue = ''] = pair.split('=');
          return [key, rawValue.replace(/^"|"$/g, '')];
        }),
    );
    try {
      assertNoForbiddenLabels(labels);
    } catch (error) {
      errors.push(`line ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function summarizeChains(records: JobMetricsRecord[], repo: string): ChainSummary[] {
  const chainRecords = records.filter((record) => record.chain_kind === 'chain' || Boolean(record.chain_id));
  const summaries: ChainSummary[] = [];
  for (const recordsForChain of groupBy(chainRecords, (record) => record.chain_id ?? record.job_id).values()) {
    const labels = safeLabels({
      service_name: 'specialists',
      repo,
      chain_template: chainTemplateFor(recordsForChain),
      result: resultForChain(recordsForChain),
    });
    summaries.push({ labels, durationSeconds: chainDurationSeconds(recordsForChain) });
  }
  return summaries;
}

function chainTemplateFor(records: JobMetricsRecord[]): string {
  for (const record of records) {
    const startupPayload = parseJson<Record<string, unknown>>(record.startup_payload_json, {});
    const raw = startupPayload.chain_template
      ?? startupPayload.chainTemplate
      ?? startupPayload.workflow_template
      ?? startupPayload.workflow
      ?? startupPayload.chain_kind
      ?? record.chain_kind;
    if (typeof raw === 'string' && raw.trim().length > 0) return normalizeChainTemplate(raw);
  }
  return 'chain';
}

function normalizeChainTemplate(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_.:-]+/g, '_');
  if (!normalized || normalized.length > 80) return 'unknown';
  return normalized;
}

function resultForChain(records: JobMetricsRecord[]): string {
  const results = records.map((record) => resultForStatus(record.status));
  if (results.includes('error')) return 'error';
  if (results.includes('cancelled')) return 'cancelled';
  if (results.every((result) => result === 'success')) return 'success';
  return 'unknown';
}

function chainDurationSeconds(records: JobMetricsRecord[]): number | null {
  const starts = records.map((record) => record.started_at_ms).filter(isNumber);
  const completions = records.map((record) => record.completed_at_ms).filter(isNumber);
  if (starts.length > 0 && completions.length > 0) {
    const durationMs = Math.max(...completions) - Math.min(...starts);
    return durationMs >= 0 ? durationMs / 1000 : null;
  }
  const elapsedSum = records
    .map((record) => record.elapsed_ms)
    .filter(isNumber)
    .reduce((sum, elapsedMs) => sum + elapsedMs, 0);
  return elapsedSum > 0 ? elapsedSum / 1000 : null;
}

function jobStateLabels(status: SupervisorStatus, repo: string): Labels {
  const rawStatus = status as unknown as Record<string, unknown>;
  return safeLabels({
    ...DEFAULT_SERVICE_LABELS,
    repo,
    participant_role: String(rawStatus.specialist ?? 'unknown'),
    state: normalizeState(String(rawStatus.status ?? 'unknown')),
  });
}

function jobQueueLabels(status: SupervisorStatus, repo: string): Labels {
  const rawStatus = status as unknown as Record<string, unknown>;
  return safeLabels({
    ...DEFAULT_SERVICE_LABELS,
    repo,
    participant_role: String(rawStatus.specialist ?? 'unknown'),
  });
}

function processLabels(status: SupervisorStatus, repo: string): Labels {
  const rawStatus = status as unknown as Record<string, unknown>;
  return safeLabels({
    service_name: 'specialists',
    repo,
    process_kind: 'specialist',
    state: normalizeState(String(rawStatus.status ?? 'unknown')),
  });
}

function worktreeLabels(status: SupervisorStatus, repo: string): Labels {
  const rawStatus = status as unknown as Record<string, unknown>;
  return safeLabels({
    service_name: 'specialists',
    repo,
    state: isTerminalStatus(String(rawStatus.status ?? 'unknown')) ? 'preserved_terminal' : 'active',
  });
}

function jobParticipantLabels(record: JobMetricsRecord, repo: string): Labels {
  return safeLabels({
    ...DEFAULT_SERVICE_LABELS,
    repo,
    participant_role: record.specialist,
    model: normalizeModel(record.model),
  });
}

function jobResultLabels(record: JobMetricsRecord, repo: string): Labels {
  return safeLabels({
    ...jobParticipantLabels(record, repo),
    result: resultForStatus(record.status),
  });
}

function toolCallSamples(records: JobMetricsRecord[], repo: string): NumericSample[] {
  const byKey = new Map<string, { labels: Labels; value: number }>();
  for (const record of records) {
    const counts = parseJson<Record<string, unknown>>(record.tool_call_counts_json, {});
    for (const [toolName, rawCount] of Object.entries(counts)) {
      const value = Number(rawCount);
      if (!Number.isFinite(value) || value <= 0) continue;
      const labels = safeLabels({
        ...jobParticipantLabels(record, repo),
        tool_name: normalizeToolName(toolName),
        result: resultForStatus(record.status),
      });
      increment(byKey, labels, value);
    }
  }

  return Array.from(byKey.values()).map(({ labels, value }) => ({
    name: 'xtrm_tool_calls_total',
    help: 'Tool calls projected from specialist job metrics.',
    type: 'counter' as const,
    labels,
    value,
  }));
}

function tokenSamples(records: JobMetricsRecord[], repo: string): NumericSample[] {
  const byKey = new Map<string, { labels: Labels; value: number }>();
  for (const record of records) {
    const last = latestTokenTrajectory(record);
    if (!last) continue;
    const base = safeLabels({
      ...jobParticipantLabels(record, repo),
      model_provider: modelProviderFor(record.model),
    });
    for (const [direction, value] of Object.entries(last)) {
      if (typeof value !== 'number' || value <= 0) continue;
      increment(byKey, safeLabels({ ...base, direction }), value);
    }
  }

  return Array.from(byKey.values()).map(({ labels, value }) => ({
    name: 'xtrm_llm_tokens_total',
    help: 'LLM token usage projected from specialist job metrics.',
    type: 'counter' as const,
    labels,
    value,
  }));
}

function latestTokenTrajectory(record: JobMetricsRecord): Record<string, number> | null {
  const trajectory = parseJson<Array<Record<string, unknown>>>(record.token_trajectory_json, []);
  const latest = trajectory.at(-1);
  if (!latest) return null;

  const split = {
    input: Number(latest.input_tokens ?? latest.input ?? 0),
    output: Number(latest.output_tokens ?? latest.output ?? 0),
    cache_read: Number(latest.cache_read_tokens ?? latest.cache_read ?? 0),
    cache_creation: Number(latest.cache_creation_tokens ?? latest.cache_creation ?? 0),
    reasoning: Number(latest.reasoning_tokens ?? latest.reasoning ?? latest.thinking_tokens ?? 0),
    tool: Number(latest.tool_tokens ?? latest.tool ?? latest.tool_use_tokens ?? 0),
  };

  const hasSplit = Object.values(split).some((value) => value > 0);
  if (hasSplit) return split;

  const total = Number(latest.total_tokens ?? latest.total ?? 0);
  return total > 0 ? { total } : null;
}


function forensicEventSamples(events: ForensicEvent[], repo: string): NumericSample[] {
  const byKey = new Map<string, { metricName: string; labels: Labels; value: number }>();
  for (const event of events) {
    for (const sample of samplesForForensicEvent(event, repo)) {
      const key = `${sample.metricName}:${labelsKey(sample.labels)}`;
      const existing = byKey.get(key);
      if (existing && sample.metricName !== 'xtrm_eval_score') {
        existing.value += sample.value;
      } else {
        byKey.set(key, { metricName: sample.metricName, labels: sample.labels, value: sample.value });
      }
    }
  }

  return Array.from(byKey.values()).map(({ metricName, labels, value }) => ({
    name: metricName,
    help: helpForForensicMetric(metricName),
    type: metricName === 'xtrm_eval_score' ? 'gauge' as const : 'counter' as const,
    labels: metricName === 'xtrm_eval_score' ? withoutLabel(labels, 'result') : labels,
    value,
  }));
}

function samplesForForensicEvent(event: ForensicEvent, repo: string): ForensicMetricSample[] {
  if (event.event_family === 'mcp') {
    const result = resultForMcpEvent(event.event_name);
    if (!result) return [];
    return [{
      metricName: 'xtrm_mcp_operations_total',
      labels: safeLabels({
        ...eventBaseLabels(event, repo),
        mcp_server: normalizeKind(bodyString(event, 'mcp_server') ?? 'unknown'),
        mcp_method: normalizeKind(bodyString(event, 'mcp_method') ?? bodyString(event, 'mcp_method_name') ?? 'unknown'),
        result,
      }),
      value: 1,
    }];
  }

  if (event.event_family === 'review' || event.event_name.startsWith('review.verdict.')) {
    const verdict = verdictForReviewEvent(event);
    if (!verdict) return [];
    return [{
      metricName: 'xtrm_gate_verdicts_total',
      labels: safeLabels({
        ...eventBaseLabels(event, repo),
        participant_role: event.resource.participant_role ?? 'unknown',
        gate_kind: normalizeKind(bodyString(event, 'gate_kind') ?? bodyString(event, 'gate') ?? event.resource.participant_role ?? 'review'),
        verdict,
      }),
      value: 1,
    }];
  }

  if (event.event_family === 'evidence' || event.event_name.startsWith('evidence.') || bodyString(event, 'evidence_kind')) {
    return [{
      metricName: 'xtrm_evidence_refs_total',
      labels: safeLabels({
        ...eventBaseLabels(event, repo),
        evidence_kind: normalizeKind(bodyString(event, 'evidence_kind') ?? evidenceKindForEventName(event.event_name)),
        result: normalizeKind(bodyString(event, 'result') ?? resultForEvidenceEvent(event.event_name)),
      }),
      value: 1,
    }];
  }

  if (event.event_family === 'identity') {
    const result = resultForIdentityEvent(event.event_name);
    if (!result) return [];
    return [{
      metricName: 'xtrm_identity_operations_total',
      labels: safeLabels({
        ...eventBaseLabels(event, repo),
        credential_kind: normalizeKind(bodyString(event, 'credential_kind') ?? 'unknown'),
        result,
      }),
      value: 1,
    }];
  }

  if (event.event_family === 'policy') {
    const result = resultForPolicyEvent(event.event_name);
    if (!result) return [];
    const labels = safeLabels({
      ...eventBaseLabels(event, repo),
      policy_kind: normalizeKind(bodyString(event, 'policy_kind') ?? 'unknown'),
      action_kind: normalizeKind(bodyString(event, 'action_kind') ?? 'unknown'),
      result,
    });
    const samples: ForensicMetricSample[] = [{ metricName: 'xtrm_policy_decisions_total', labels, value: 1 }];
    if (event.event_name === 'policy.mismatch.detected') {
      samples.push({
        metricName: 'xtrm_policy_mismatches_total',
        labels: safeLabels({
          ...eventBaseLabels(event, repo),
          policy_kind: normalizeKind(bodyString(event, 'policy_kind') ?? 'unknown'),
          severity: normalizeKind(bodyString(event, 'severity') ?? 'unknown'),
        }),
        value: 1,
      });
    }
    return samples;
  }

  if (event.event_family === 'eval') {
    if (event.event_name === 'eval.score.recorded') {
      const score = bodyNumber(event, 'score');
      if (score === null) return [];
      return [{
        metricName: 'xtrm_eval_score',
        labels: safeLabels({
          ...eventBaseLabels(event, repo),
          eval_kind: normalizeKind(bodyString(event, 'eval_kind') ?? 'unknown'),
          result: 'score',
        }),
        value: score,
      }];
    }
    const result = resultForEvalEvent(event);
    if (!result) return [];
    return [{
      metricName: 'xtrm_eval_runs_total',
      labels: safeLabels({
        ...eventBaseLabels(event, repo),
        eval_kind: normalizeKind(bodyString(event, 'eval_kind') ?? 'unknown'),
        result,
      }),
      value: 1,
    }];
  }

  return [];
}

function helpForForensicMetric(metricName: string): string {
  switch (metricName) {
    case 'xtrm_mcp_operations_total': return 'MCP operations by bounded server, method, and result.';
    case 'xtrm_gate_verdicts_total': return 'Gate verdicts by bounded gate kind, participant role, and verdict.';
    case 'xtrm_evidence_refs_total': return 'Evidence references by bounded evidence kind and result.';
    case 'xtrm_identity_operations_total': return 'Identity credential operations by bounded credential kind and result.';
    case 'xtrm_policy_decisions_total': return 'Policy decisions by bounded policy/action kind and result.';
    case 'xtrm_policy_mismatches_total': return 'Policy mismatches by bounded policy kind and severity.';
    case 'xtrm_eval_score': return 'Latest eval score by bounded eval kind.';
    case 'xtrm_eval_runs_total': return 'Evaluation runs by bounded eval kind and result.';
    default: return 'Forensic event projection.';
  }
}

function eventBaseLabels(event: ForensicEvent, repo: string): Record<string, unknown> {
  return {
    service_name: event.resource.service_name ?? 'specialists',
    repo: event.resource.repo ?? repo,
  };
}

function verdictForReviewEvent(event: ForensicEvent): string | null {
  const explicit = bodyString(event, 'verdict');
  if (explicit) return normalizeVerdict(explicit);
  const suffix = event.event_name.split('.').at(-1);
  return suffix ? normalizeVerdict(suffix) : null;
}

function normalizeVerdict(value: string): string | null {
  const normalized = value.toUpperCase().replace(/[^A-Z_:-]+/g, '_');
  if (normalized === 'PASS' || normalized === 'PARTIAL' || normalized === 'FAIL' || normalized === 'WAIVED') return normalized;
  return null;
}

function evidenceKindForEventName(eventName: string): string {
  const parts = eventName.split('.');
  const candidate = parts.length > 1 ? parts[1] : undefined;
  return candidate && candidate.length > 0 ? candidate : 'report';
}

function resultForEvidenceEvent(eventName: string): string {
  if (eventName.endsWith('.failed')) return 'error';
  if (eventName.endsWith('.skipped')) return 'skipped';
  return 'success';
}

function resultForMcpEvent(eventName: string): string | null {
  if (eventName === 'mcp.connected' || eventName === 'mcp.disconnected' || eventName === 'mcp.call.completed' || eventName === 'mcp.latency.observed') return 'success';
  if (eventName === 'mcp.call.failed' || eventName === 'mcp.auth.failed') return 'error';
  if (eventName === 'mcp.rate_limited') return 'rate_limited';
  return null;
}

function resultForIdentityEvent(eventName: string): string | null {
  if (eventName === 'identity.credential.issued') return 'success';
  if (eventName === 'identity.credential.failed') return 'error';
  if (eventName === 'identity.throttled') return 'throttled';
  return null;
}

function resultForPolicyEvent(eventName: string): string | null {
  if (eventName === 'policy.decision.allowed') return 'allowed';
  if (eventName === 'policy.decision.denied') return 'denied';
  if (eventName === 'policy.mismatch.detected') return 'mismatch';
  return null;
}

function resultForEvalEvent(event: ForensicEvent): string | null {
  if (event.event_name === 'eval.completed') return normalizeKind(bodyString(event, 'result') ?? 'success');
  if (event.event_name === 'eval.failed') return 'error';
  return null;
}

function bodyString(event: ForensicEvent, key: string): string | undefined {
  const value = event.body[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function bodyNumber(event: ForensicEvent, key: string): number | null {
  const value = Number(event.body[key]);
  return Number.isFinite(value) ? value : null;
}

function normalizeKind(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_.:-]+/g, '_');
  if (!normalized || normalized.length > 80) return 'unknown';
  return normalized;
}

function withoutLabel(labels: Labels, key: string): Labels {
  const copy = { ...labels };
  delete copy[key];
  return copy;
}

function latestContextRatio(records: JobMetricsRecord[]): number | null {
  const sorted = [...records].sort((a, b) => b.updated_at_ms - a.updated_at_ms);
  for (const record of sorted) {
    const trajectory = parseJson<Array<Record<string, unknown>>>(record.context_trajectory_json, []);
    const latest = trajectory.at(-1);
    if (!latest) continue;
    const raw = latest.pct ?? latest.percentage ?? latest.context_pct ?? latest.ratio;
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    return value > 1 ? value / 100 : value;
  }
  return null;
}

function renderMetrics(samples: NumericSample[], histograms: HistogramSample[]): string {
  const sections: string[] = [];
  const rendered = new Set<string>();

  for (const sample of samples) {
    const headerKey = `${sample.name}:${sample.type}`;
    if (!rendered.has(headerKey)) {
      sections.push(`# HELP ${sample.name} ${sample.help}`);
      sections.push(`# TYPE ${sample.name} ${sample.type}`);
      rendered.add(headerKey);
    }
    sections.push(`${sample.name}${formatLabels(sample.labels)} ${formatNumber(sample.value)}`);
  }

  for (const histogram of histograms) {
    const headerKey = `${histogram.name}:histogram`;
    if (!rendered.has(headerKey)) {
      sections.push(`# HELP ${histogram.name} ${histogram.help}`);
      sections.push(`# TYPE ${histogram.name} histogram`);
      rendered.add(headerKey);
    }
    sections.push(...renderHistogram(histogram));
  }

  return `${sections.join('\n')}\n`;
}

function renderHistogram(histogram: HistogramSample): string[] {
  const sortedValues = histogram.values.filter(isNumber).sort((a, b) => a - b);
  const lines: string[] = [];
  let cumulative = 0;
  let index = 0;
  for (const bucket of histogram.buckets) {
    while (index < sortedValues.length && sortedValues[index] <= bucket) {
      cumulative += 1;
      index += 1;
    }
    lines.push(`${histogram.name}_bucket${formatLabels({ ...histogram.labels, le: String(bucket) })} ${cumulative}`);
  }
  lines.push(`${histogram.name}_bucket${formatLabels({ ...histogram.labels, le: '+Inf' })} ${sortedValues.length}`);
  lines.push(`${histogram.name}_sum${formatLabels(histogram.labels)} ${formatNumber(sortedValues.reduce((sum, value) => sum + value, 0))}`);
  lines.push(`${histogram.name}_count${formatLabels(histogram.labels)} ${sortedValues.length}`);
  return lines;
}

function safeLabels(source: Record<string, unknown>): Labels {
  const labels = pickAllowedLabels(source);
  assertNoForbiddenLabels(labels);
  return labels;
}

function formatLabels(labels: Labels): string {
  const entries = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return '';
  return `{${entries.map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(',')}}`;
}

function labelsKey(labels: Labels): string {
  return JSON.stringify(Object.entries(labels).sort(([a], [b]) => a.localeCompare(b)));
}

function parseLabelsKey(key: string): Labels {
  return Object.fromEntries(JSON.parse(key) as Array<[string, string]>);
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    const group = grouped.get(key) ?? [];
    group.push(item);
    grouped.set(key, group);
  }
  return grouped;
}

function countBy<T>(items: T[], getKey: (item: T) => string): Map<string, number> {
  const counted = new Map<string, number>();
  for (const item of items) counted.set(getKey(item), (counted.get(getKey(item)) ?? 0) + 1);
  return counted;
}

function increment(map: Map<string, { labels: Labels; value: number }>, labels: Labels, value: number): void {
  const key = labelsKey(labels);
  const existing = map.get(key);
  if (existing) {
    existing.value += value;
    return;
  }
  map.set(key, { labels, value });
}

function isQueuedStatus(status: SupervisorStatus): boolean {
  const rawStatus = status as unknown as Record<string, unknown>;
  const state = String(rawStatus.status ?? 'unknown').toLowerCase();
  return state === 'starting' || state === 'waiting' || state === 'queued';
}

function hasWorktree(status: SupervisorStatus): boolean {
  const rawStatus = status as unknown as Record<string, unknown>;
  return typeof rawStatus.worktree_path === 'string' && rawStatus.worktree_path.length > 0;
}

function isTerminalStatus(status: string): boolean {
  return ['done', 'completed', 'complete', 'error', 'cancelled', 'failed'].includes(status.toLowerCase());
}

function resultForStatus(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === 'error' || normalized === 'failed') return 'error';
  if (normalized === 'cancelled') return 'cancelled';
  if (normalized === 'skipped') return 'skipped';
  if (normalized === 'done' || normalized === 'completed' || normalized === 'complete') return 'success';
  return 'unknown';
}

function normalizeState(status: string): string {
  return status.toLowerCase().replace(/[^a-z0-9_:-]+/g, '_') || 'unknown';
}

function normalizeModel(model: string | null | undefined): string | undefined {
  if (!model) return undefined;
  const normalized = model.toLowerCase().replace(/[^a-z0-9_.:/-]+/g, '_');
  return normalized.length > 80 ? 'other' : normalized;
}

function modelProviderFor(model: string | null | undefined): string | undefined {
  if (!model) return undefined;
  const prefix = model.split('/')[0];
  if (!prefix || prefix === model) return undefined;
  return prefix.toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
}

function normalizeToolName(toolName: string): string {
  const normalized = toolName.toLowerCase().replace(/[^a-z0-9_.:-]+/g, '_');
  if (normalized.length === 0 || normalized.length > 60) return 'other';
  return normalized;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function msToSeconds(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  return value / 1000;
}

function isNumber(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)));
}

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}
