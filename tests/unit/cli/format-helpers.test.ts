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
});