// Regression for unitAI-ctb4u.27 — operator walkthrough §5 crash:
// 16 of 1389 specialist_jobs rows on a production DB had id: null in their
// status_json. enrichJob preserved the null id, and theme.ts:jobRowFieldValues
// threw TypeError on `job.id.slice(...)`. The src/index.ts uncaughtException
// handler then killed the whole TUI process.
//
// Three layers of defense:
//   1. theme.ts:jobRowFieldValues coerces missing strings to placeholders.
//   2. runtime.ts:isWellFormedJob filters malformed jobs upstream.
//   3. components.ts:renderProcessRows wraps renderJobRow in per-row try/catch.

import { describe, expect, it } from 'vitest';
import { jobRowFieldValues, renderJobRow } from '../../../src/cli/console/theme.js';
import type { ConsoleJob } from '../../../src/cli/console/types.js';

describe('jobRowFieldValues — defensive against malformed jobs', () => {
  it('renders placeholder when job.id is undefined (does not throw)', () => {
    const job = {
      id: undefined as unknown as string,
      specialist: 'executor',
      status: 'error',
      started_at_ms: 0,
    } as ConsoleJob;
    expect(() => jobRowFieldValues(job)).not.toThrow();
    const values = jobRowFieldValues(job);
    expect(values.id.trim().startsWith('?')).toBe(true);
  });

  it('renders placeholder when job.specialist is null', () => {
    const job = {
      id: 'abc12345',
      specialist: null as unknown as string,
      status: 'error',
      started_at_ms: 0,
    } as ConsoleJob;
    expect(() => jobRowFieldValues(job)).not.toThrow();
    expect(jobRowFieldValues(job).spec.trim()).toBe('?');
  });

  it('renders placeholder when job.status is empty string', () => {
    const job = {
      id: 'abc12345',
      specialist: 'executor',
      status: '' as unknown as string,
      started_at_ms: 0,
    } as ConsoleJob;
    expect(() => jobRowFieldValues(job)).not.toThrow();
    expect(jobRowFieldValues(job).status.trim()).toBe('?');
  });

  it('renderJobRow does not throw when all three required strings are undefined', () => {
    const job = {
      id: undefined as unknown as string,
      specialist: undefined as unknown as string,
      status: undefined as unknown as string,
      started_at_ms: 0,
    } as ConsoleJob;
    expect(() => renderJobRow(job, 120, 0, false)).not.toThrow();
  });

  it('renderJobRow output is non-empty for a malformed job', () => {
    const job = {
      id: undefined as unknown as string,
      specialist: undefined as unknown as string,
      status: undefined as unknown as string,
      started_at_ms: 0,
    } as ConsoleJob;
    const out = renderJobRow(job, 120, 0, false);
    expect(out.length).toBeGreaterThan(0);
  });
});
