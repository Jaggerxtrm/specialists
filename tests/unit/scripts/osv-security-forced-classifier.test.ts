import { describe, expect, it } from 'vitest';

import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const require = createRequire(import.meta.url);
const {
  classifyReport,
  collectFindings,
  extractMaxCvssScore,
  V0_APPROXIMATION_NOTE,
} = require('../../../scripts/osv-security-forced-classifier.cjs');

function buildReport(vulnerability: Record<string, unknown>) {
  return {
    results: [
      {
        packages: [
          {
            package: {
              ecosystem: 'npm',
              name: 'vite',
              version: '8.0.13',
            },
            vulnerabilities: [vulnerability],
          },
        ],
      },
    ],
  };
}

function protectedScanScript(): string {
  const workflow = parseYaml(readFileSync('.github/workflows/osv-scanner.yml', 'utf8')) as {
    jobs: { 'protected-scan': { steps: Array<{ name: string; run?: string }> } };
  };
  const script = workflow.jobs['protected-scan'].steps
    .find((step) => step.name === 'Scan protected branches / schedule')?.run;
  if (!script) throw new Error('protected OSV scan script not found');
  return script;
}

function runProtectedScan(report: string, options: { scannerStatus?: number; classifierFailure?: boolean } = {}) {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'osv-workflow-gate-'));
  const binDir = join(fixtureDir, 'bin');
  const fixture = join(fixtureDir, 'report.json');
  const scanner = join(binDir, 'osv-scanner');
  const node = join(binDir, 'node');

  try {
    mkdirSync(binDir);
    writeFileSync(fixture, report);
    writeFileSync(scanner, '#!/bin/sh\ncat "$OSV_FIXTURE"\nexit "${OSV_STATUS:-0}"\n');
    writeFileSync(node, `#!/bin/sh\nif [ "\${FORCE_CLASSIFIER_FAILURE:-0}" = 1 ]; then exit 42; fi\nexec ${JSON.stringify(process.execPath)} "$@"\n`);
    chmodSync(scanner, 0o755);
    chmodSync(node, 0o755);

    return spawnSync('bash', ['-c', protectedScanScript()], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        FORCE_CLASSIFIER_FAILURE: options.classifierFailure ? '1' : '0',
        OSV_FIXTURE: fixture,
        OSV_STATUS: String(options.scannerStatus ?? 0),
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
      },
    });
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
}

describe('osv security forced classifier', () => {
  it('flags CVSS >= 9 findings as SECURITY_FORCED', () => {
    const report = buildReport({
      id: 'GHSA-critical',
      severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }],
    });

    const classified = classifyReport(report);

    expect(classified.verdict).toBe('SECURITY_FORCED');
    expect(classified.totalFindings).toBe(1);
    expect(classified.securityForcedCount).toBe(1);
    expect(classified.findings[0]?.reasons).toContain('cvss>=9');
  });


  it('computes standard CVSS v3 vectors before applying SECURITY_FORCED', () => {
    expect(extractMaxCvssScore({
      severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H' }],
    })).toBe(9.8);
    expect(extractMaxCvssScore({
      severity: [{ type: 'CVSS_V3', score: 'CVSS:3.1/AV:N/AC:H/PR:L/UI:R/S:U/C:L/I:L/A:N' }],
    })).toBe(3.7);
  });

  it('flags KEV findings as SECURITY_FORCED', () => {
    const report = buildReport({
      id: 'GHSA-kev',
      database_specific: {
        cisa_kev: true,
      },
      severity: [{ type: 'CVSS_V3', score: '5.4' }],
    });

    const classified = classifyReport(report);

    expect(classified.verdict).toBe('SECURITY_FORCED');
    expect(classified.securityForcedCount).toBe(1);
    expect(classified.findings[0]?.reasons).toContain('kev');
  });

  it('flags active exploit findings as SECURITY_FORCED', () => {
    const report = buildReport({
      id: 'GHSA-active',
      database_specific: {
        active_exploit: true,
      },
      severity: [{ type: 'CVSS_V3', score: '6.2' }],
    });

    const classified = classifyReport(report);

    expect(classified.verdict).toBe('SECURITY_FORCED');
    expect(classified.securityForcedCount).toBe(1);
    expect(classified.findings[0]?.reasons).toContain('active-exploit');
  });

  it('keeps non-critical non-flagged findings advisory', () => {
    const report = buildReport({
      id: 'GHSA-advisory',
      summary: 'stale nested transitive example',
      severity: [{ type: 'CVSS_V3', score: '7.2' }],
    });

    const classified = classifyReport(report);

    expect(classified.verdict).toBe('PASS_WITH_NOTES');
    expect(classified.securityForcedCount).toBe(0);
    expect(classified.findings[0]?.securityForced).toBe(false);
    expect(classified.approximation).toBe(V0_APPROXIMATION_NOTE);
  });

  it('preserves package context and supports alternate score shapes', () => {
    const report = buildReport({
      id: 'GHSA-db-score',
      database_specific: {
        cvss: {
          score: '9.1',
        },
      },
    });

    const findings = collectFindings(report);
    expect(findings[0]?.packageName).toBe('vite');
    expect(findings[0]?.ecosystem).toBe('npm');
    expect(extractMaxCvssScore(findings[0]!.vulnerability)).toBe(9.1);
  });
});

describe('protected OSV workflow gate', () => {
  it('does not let advisory scanner status override PASS_WITH_NOTES', () => {
    const result = runProtectedScan(JSON.stringify(buildReport({
      id: 'GHSA-advisory',
      severity: [{ type: 'CVSS_V3', score: '7.2' }],
    })), { scannerStatus: 1 });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"verdict":"PASS_WITH_NOTES"');
  });

  it('blocks SECURITY_FORCED findings', () => {
    const result = runProtectedScan(JSON.stringify(buildReport({
      id: 'GHSA-critical',
      severity: [{ type: 'CVSS_V3', score: '9.8' }],
    })), { scannerStatus: 1 });

    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('"verdict":"SECURITY_FORCED"');
  });

  it.each([
    ['malformed JSON', '{'],
    ['empty scanner output', ''],
  ])('blocks %s', (_case, report) => {
    expect(runProtectedScan(report).status).not.toBe(0);
  });

  it('blocks scanner operational errors even when the classifier would pass', () => {
    const result = runProtectedScan('{"results":[]}', { scannerStatus: 128 });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('non-scan status 128');
  });

  it('blocks classifier process failure', () => {
    expect(runProtectedScan('{"results":[]}', { classifierFailure: true }).status).not.toBe(0);
  });
});
