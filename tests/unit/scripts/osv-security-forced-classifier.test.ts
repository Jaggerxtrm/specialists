import { describe, expect, it } from 'vitest';

import { createRequire } from 'node:module';

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
