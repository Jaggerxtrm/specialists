// tests/unit/cli/format-helpers.test.ts
import { describe, expect, it } from 'vitest';
import {
  dim,
  bold,
  cyan,
  yellow,
  red,
  green,
  blue,
  magenta,
  formatTime,
  formatDateTime,
  formatElapsed,
  getEventLabel,
  getStatusLabel,
  statusColorizer,
  JobColorMap,
  formatCompleteBanner,
  formatErrorBanner,
  formatDiscoveryBanner,
  formatEventInlineDebounced,
  formatEventLine,
} from '../../../src/cli/format-helpers.js';

describe('format-helpers', () => {
  describe('ANSI helpers', () => {
    it('applies dim style', () => {
      const result = dim('test');
      expect(result).toContain('\x1b[2m');
      expect(result).toContain('test');
    });

    it('applies bold style', () => {
      const result = bold('test');
      expect(result).toContain('\x1b[1m');
    });

    it('applies colors', () => {
      expect(cyan('x')).toContain('\x1b[36m');
      expect(yellow('x')).toContain('\x1b[33m');
      expect(red('x')).toContain('\x1b[31m');
      expect(green('x')).toContain('\x1b[32m');
      expect(blue('x')).toContain('\x1b[34m');
      expect(magenta('x')).toContain('\x1b[35m');
    });
  });

  describe('formatTime', () => {
    it('formats as HH:MM:SS', () => {
      const t = new Date('2024-01-15T14:30:45Z').getTime();
      expect(formatTime(t)).toBe('14:30:45');
    });
  });

  describe('formatDateTime', () => {
    it('formats as YYYY-MM-DD HH:MM:SS', () => {
      const t = new Date('2024-01-15T14:30:45Z').getTime();
      const result = formatDateTime(t);
      expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });
  });

  describe('formatElapsed', () => {
    it('formats seconds under 60', () => {
      expect(formatElapsed(42)).toBe('42s');
    });

    it('formats minutes and seconds', () => {
      expect(formatElapsed(90)).toBe('1m 30s');
    });

    it('formats whole minutes', () => {
      expect(formatElapsed(120)).toBe('2m');
    });
  });

  describe('getEventLabel', () => {
    it('returns known labels', () => {
      expect(getEventLabel('run_start')).toBe('START');
      expect(getEventLabel('meta')).toBe('META');
      expect(getEventLabel('tool')).toBe('TOOL');
      expect(getEventLabel('run_complete')).toBe('DONE');
    });

    it('returns auto-commit labels', () => {
      expect(getEventLabel('auto_commit_success')).toBe('AUTO+');
      expect(getEventLabel('auto_commit_skipped')).toBe('AUTO-');
      expect(getEventLabel('auto_commit_failed')).toBe('AUTO!');
    });

    it('truncates unknown types to 5 chars', () => {
      expect(getEventLabel('unknown_event')).toBe('UNKNO');
    });
  });

  describe('getStatusLabel', () => {
    it('returns human-readable status', () => {
      expect(getStatusLabel('done')).toBe('COMPLETE');
      expect(getStatusLabel('error')).toBe('ERROR');
      expect(getStatusLabel('starting')).toBe('STARTING');
      expect(getStatusLabel('running')).toBe('RUNNING');
    });
  });

  describe('statusColorizer', () => {
    it('returns green for done', () => {
      expect(statusColorizer('done')).toBe(green);
    });

    it('returns red for error', () => {
      expect(statusColorizer('error')).toBe(red);
    });

    it('returns yellow for starting', () => {
      expect(statusColorizer('starting')).toBe(yellow);
    });
  });

  describe('JobColorMap', () => {
    it('assigns stable colors to jobs', () => {
      const map = new JobColorMap();
      const c1 = map.get('job1');
      const c2 = map.get('job2');
      expect(c1).not.toBe(c2);
    });

    it('returns same color for same job ID', () => {
      const map = new JobColorMap();
      const c1 = map.get('job1');
      const c2 = map.get('job1');
      expect(c1).toBe(c2);
    });

    it('cycles through colors', () => {
      const map = new JobColorMap();
      const colors = new Set();
      for (let i = 0; i < 10; i++) {
        colors.add(map.get(`job${i}`));
      }
      // Should have at least 3 different colors
      expect(colors.size).toBeGreaterThanOrEqual(3);
    });

    it('tracks size', () => {
      const map = new JobColorMap();
      expect(map.size).toBe(0);
      map.get('job1');
      expect(map.size).toBe(1);
      map.get('job2');
      expect(map.size).toBe(2);
    });
  });

  describe('formatCompleteBanner', () => {
    it('formats completion banner with green label', () => {
      const banner = formatCompleteBanner('job1', 'code-review', 42, cyan);
      expect(banner).toContain('job1');
      expect(banner).toContain('code-review');
      expect(banner).toContain('COMPLETE');
      expect(banner).toContain('42s');
    });
  });

  describe('formatErrorBanner', () => {
    it('formats error banner with red label', () => {
      const banner = formatErrorBanner('job1', 'bug-hunt', 'Something failed', cyan);
      expect(banner).toContain('job1');
      expect(banner).toContain('bug-hunt');
      expect(banner).toContain('ERROR');
      expect(banner).toContain('Something failed');
    });
  });

  describe('formatDiscoveryBanner', () => {
    it('formats discovery banner', () => {
      const banner = formatDiscoveryBanner('job1');
      expect(banner).toContain('discovered');
      expect(banner).toContain('job1');
    });
  });

  describe('formatEventLine', () => {
    it('renders run_complete token split metrics summary including turns/tools/exit', () => {
      const line = formatEventLine({
        t: Date.now(),
        type: 'run_complete',
        status: 'COMPLETE',
        elapsed_s: 5,
        token_usage: { total_tokens: 111, input_tokens: 70, output_tokens: 41, cache_read_tokens: 9, reasoning_tokens: 5, tool_tokens: 2 },
        finish_reason: 'stop',
        exit_reason: 'agent_end',
        tool_calls: ['read', 'bash'],
        metrics: { turns: 3 },
      }, {
        jobId: 'job1',
        specialist: 'explorer',
        beadId: 'unitAI-1',
        colorize: (value: string) => value,
      });

      expect(line).toContain('status=COMPLETE');
      expect(line).toContain('tokens=111');
      expect(line).toContain('cache_read=9');
      expect(line).toContain('reasoning=5');
      expect(line).toContain('tool=2');
      expect(line).not.toContain('cost=');
      expect(line).toContain('turns=3');
      expect(line).toContain('tools=2');
      expect(line).toContain('finish=stop');
      expect(line).toContain('exit=agent_end');
    });

    it('renders assistant text content with multiline body', () => {
      const line = formatEventLine({
        t: Date.now(),
        type: 'text',
        char_count: 27,
        content: 'First line\nSecond line',
      }, {
        jobId: 'job1',
        specialist: 'explorer',
        beadId: 'unitAI-1',
        colorize: (value: string) => value,
      });

      const clean = line.replace(/\x1b\[[0-9;]*m/g, '');
      expect(clean).toContain('kind=assistant chars=27');
      expect(clean).toContain('First line\nSecond line');
      expect(clean).not.toContain('kind=model');
    });

    it('marks long assistant text as truncated in rendered feed lines', () => {
      const content = 'x'.repeat(4100);
      const line = formatEventLine({
        t: Date.now(),
        type: 'text',
        char_count: content.length,
        content,
      }, {
        jobId: 'job1',
        specialist: 'explorer',
        beadId: 'unitAI-1',
        colorize: (value: string) => value,
      });

      const clean = line.replace(/\x1b\[[0-9;]*m/g, '');
      expect(clean).toContain('truncated=true');
      expect(clean).toContain('assistant message truncated: 100 chars hidden');
    });

    it('renders api error event', () => {
      const line = formatEventLine({
        t: Date.now(),
        type: 'error',
        source: 'stderr',
        error_message: 'You have hit your ChatGPT usage limit',
      }, {
        jobId: 'job1',
        specialist: 'explorer',
        beadId: 'unitAI-1',
        colorize: (value: string) => value,
      });

      expect(line).toContain('ERROR');
      expect(line).toContain('source=stderr');
      expect(line).toContain('error=You have hit your ChatGPT usage limit');
    });

    it('renders auto-commit success evidence with commit and file count', () => {
      const line = formatEventLine({
        t: Date.now(),
        type: 'auto_commit_success',
        commit_sha: '54e2fa6c83323b8c50cf203ce59e13af0d922e10',
        committed_files: ['src/cli/feed.ts', 'tests/unit/cli/feed.test.ts'],
      }, {
        jobId: 'job1',
        specialist: 'executor',
        beadId: 'unitAI-1',
        colorize: (value: string) => value,
      });

      expect(line).toContain('AUTO+');
      expect(line).toContain('status=success');
      expect(line).toContain('commit=54e2fa6c8332');
      expect(line).toContain('files=2');
      expect(line).toContain('paths=src/cli/feed.ts,tests/unit/cli/feed.test.ts');
    });

    it('renders auto-commit skipped and failed reasons', () => {
      const skipped = formatEventLine({
        t: Date.now(),
        type: 'auto_commit_skipped',
        reason: 'policy_never',
      }, {
        jobId: 'job1',
        specialist: 'reviewer',
        beadId: 'unitAI-1',
        colorize: (value: string) => value,
      });

      const failed = formatEventLine({
        t: Date.now(),
        type: 'auto_commit_failed',
        reason: 'git commit failed',
      }, {
        jobId: 'job1',
        specialist: 'executor',
        beadId: 'unitAI-1',
        colorize: (value: string) => value,
      });

      expect(skipped).toContain('AUTO-');
      expect(skipped).toContain('status=skipped');
      expect(skipped).toContain('reason=policy_never');
      expect(failed).toContain('AUTO!');
      expect(failed).toContain('status=failed');
      expect(failed).toContain('reason=git commit failed');
    });

    it('renders GitNexus analyze meta events as explicit evidence', () => {
      const started = formatEventLine({
        t: Date.now(),
        type: 'meta',
        model: 'gitnexus_analyze_started',
        backend: 'checkpoint',
      }, {
        jobId: 'job1',
        specialist: 'executor',
        beadId: 'unitAI-1',
        colorize: (value: string) => value,
      });

      const failed = formatEventLine({
        t: Date.now(),
        type: 'meta',
        model: 'gitnexus_analyze_start_failed',
        backend: 'terminal: hook missing',
      }, {
        jobId: 'job1',
        specialist: 'executor',
        beadId: 'unitAI-1',
        colorize: (value: string) => value,
      });

      expect(started).toContain('gitnexus=analyze_started');
      expect(started).toContain('source=checkpoint');
      expect(failed).toContain('gitnexus=analyze_start_failed');
      expect(failed).toContain('reason=terminal: hook missing');
    });
  });

  describe('formatEventInlineDebounced', () => {
    it('suppresses duplicate thinking indicators until phase changes', () => {
      const thinking = { t: 1, type: 'thinking' } as const;
      const tool = { t: 2, type: 'tool', tool: 'read', phase: 'start' } as const;

      const first = formatEventInlineDebounced(thinking, null);
      expect(first.line).toContain('[thinking...]');
      expect(first.nextPhase).toBe('thinking');

      const duplicate = formatEventInlineDebounced(thinking, first.nextPhase);
      expect(duplicate.line).toBeNull();
      expect(duplicate.nextPhase).toBe('thinking');

      const phaseChange = formatEventInlineDebounced(tool, duplicate.nextPhase);
      expect(phaseChange.line).toContain('[tool]');
      expect(phaseChange.nextPhase).toBeNull();

      const afterChange = formatEventInlineDebounced(thinking, phaseChange.nextPhase);
      expect(afterChange.line).toContain('[thinking...]');
      expect(afterChange.nextPhase).toBe('thinking');
    });

    it('suppresses duplicate response indicators until a non-text event', () => {
      const text = { t: 1, type: 'text' } as const;
      const turn = { t: 2, type: 'turn', phase: 'end' } as const;

      const first = formatEventInlineDebounced(text, null);
      expect(first.line).toContain('[response]');
      expect(first.nextPhase).toBe('text');

      const duplicate = formatEventInlineDebounced(text, first.nextPhase);
      expect(duplicate.line).toBeNull();
      expect(duplicate.nextPhase).toBe('text');

      const reset = formatEventInlineDebounced(turn, duplicate.nextPhase);
      expect(reset.nextPhase).toBeNull();

      const afterReset = formatEventInlineDebounced(text, reset.nextPhase);
      expect(afterReset.line).toContain('[response]');
      expect(afterReset.nextPhase).toBe('text');
    });
  });
});