// ISSUE: xtrm-wiy5n.4.11 — quarantined from the default test baseline.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { ForensicEvent } from '../../src/specialist/forensic-events.js';
import { renderPrometheusProjection, validatePrometheusProjectionText } from '../../src/specialist/prometheus-projection.js';
import type { JobMetricsRecord } from '../../src/specialist/observability-sqlite.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/telemetry-readiness');

function readJsonFixture<T>(name: string): T {
  return JSON.parse(readFileSync(join(fixtureDir, name), 'utf8')) as T;
}

describe('telemetry readiness smoke', () => {
  it('matches shipped runtime telemetry shape for gitboard handoff', () => {
    const forensicEvents = readJsonFixture<ForensicEvent[]>(
      'forensic-events.json',
    );
    const jobMetrics = readJsonFixture<JobMetricsRecord[]>('job-metrics.json');
    expect(jobMetrics).toHaveLength(1);
    expect(jobMetrics[0]?.token_trajectory_json).toContain('"usage_source":"provider_usage"');

    expect(forensicEvents).toHaveLength(4);
    expect(forensicEvents.map((event) => event.schema_version)).toEqual([
      'xtrm.forensic.v1',
      'xtrm.forensic.v1',
      'xtrm.forensic.v1',
      'xtrm.forensic.v1',
    ]);
    expect(forensicEvents[0]?.body).toMatchObject({ command_kind: 'git' });
    expect(forensicEvents[0]?.redaction).toEqual({ status: 'redacted', fields: ['body.command'], rules: ['sensitive-field-name'] });
    expect(forensicEvents[1]?.resource).toMatchObject({ model: 'openai/gpt-5.4-mini' });
    expect(forensicEvents[1]?.body).toMatchObject({ turns_total: 3, tools_total: 5 });
    expect(forensicEvents[1]?.body).toMatchObject({ input_tokens: 120, output_tokens: 80, usage_source: 'provider_usage' });
    expect(forensicEvents[2]?.body).toMatchObject({ verdict: 'pass', result: 'pass' });
    expect(forensicEvents[3]?.body).toMatchObject({ changed_files: 2, diff_ref: 'diff:abc123', commit_sha: 'abc123' });

    const projection = renderPrometheusProjection({
      repo: 'specialists',
      statuses: [],
      jobMetrics,
      forensicEvents,
      nowMs: 1_780_000_000_000,
    });

    expect(validatePrometheusProjectionText(projection)).toEqual({ ok: true });
    expect(projection).toContain('xtrm_turns_total');
    expect(projection).toContain('xtrm_tool_calls_total');
    expect(projection).toContain('xtrm_llm_tokens_total');
    expect(projection).toContain('direction="input"');
    expect(projection).toContain('direction="output"');
    expect(projection).toContain('model="openai/gpt-5.4-mini"');
    expect(projection).not.toMatch(/cost_usd|job_id=|bead_id=|chain_id=|trace_id=|span_id=/);
  });

  it('keeps shipped-status docs aligned with implementation', () => {
    const forensicDocs = readFileSync('docs/telemetry/forensic-event-contract.md', 'utf8');
    const prometheusDocs = readFileSync('docs/telemetry/prometheus-projection-contract.md', 'utf8');

    expect(forensicDocs).toContain('Specialists now ships the pre-substrate forensic bridge');
    expect(forensicDocs).toContain('sp feed --json');
    expect(prometheusDocs).toContain('Current pre-substrate bridge status');
    expect(prometheusDocs).toContain('exemplars still use `trace_id` only');
    expect(prometheusDocs).toContain('no USD cost metric is exported');
  });
});
