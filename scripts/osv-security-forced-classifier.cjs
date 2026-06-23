#!/usr/bin/env node
const { readFileSync, writeFileSync } = require('fs');

const V0_APPROXIMATION_NOTE = 'v0 approximation: SECURITY_FORCED = CVSS>=9 from OSV severity or KEV/active-exploit flag. EPSS, runtime reachability, and maintainer active-attack signals will be added when dependency_update_case.json is available.';

const KEV_KEYS = new Set([
  'cisa_kev',
  'cisaKev',
  'is_kev',
  'isKev',
  'kev',
  'known_exploited',
  'knownExploited',
]);

const ACTIVE_EXPLOIT_KEYS = new Set([
  'active_exploit',
  'activeExploit',
  'actively_exploited',
  'activelyExploited',
  'known_ransomware_campaign_use',
  'knownRansomwareCampaignUse',
]);

function parseArgs(argv) {
  const args = { input: '', detailsJson: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') {
      args.input = argv[i + 1] || '';
      i += 1;
    } else if (arg === '--details-json') {
      args.detailsJson = argv[i + 1] || '';
      i += 1;
    }
  }
  if (!args.input) {
    throw new Error('usage: node scripts/osv-security-forced-classifier.cjs --input <osv-json> [--details-json <path>]');
  }
  return args;
}

function cvssMetric(vector, key) {
  const parts = String(vector).split('/');
  for (const part of parts) {
    if (part.indexOf(key + ':') === 0) return part.slice(key.length + 1);
  }
  return null;
}

function cvssRoundUp(value) {
  return Math.ceil((value - 1e-10) * 10) / 10;
}

function cvss3BaseScore(vector) {
  const scope = cvssMetric(vector, 'S');
  const av = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 }[cvssMetric(vector, 'AV')];
  const ac = { L: 0.77, H: 0.44 }[cvssMetric(vector, 'AC')];
  const prValue = cvssMetric(vector, 'PR');
  const pr = scope === 'C'
    ? { N: 0.85, L: 0.68, H: 0.5 }[prValue]
    : { N: 0.85, L: 0.62, H: 0.27 }[prValue];
  const ui = { N: 0.85, R: 0.62 }[cvssMetric(vector, 'UI')];
  const c = { H: 0.56, L: 0.22, N: 0 }[cvssMetric(vector, 'C')];
  const i = { H: 0.56, L: 0.22, N: 0 }[cvssMetric(vector, 'I')];
  const a = { H: 0.56, L: 0.22, N: 0 }[cvssMetric(vector, 'A')];
  if ([av, ac, pr, ui, c, i, a].some((entry) => entry == null) || (scope !== 'U' && scope !== 'C')) return null;

  const iscBase = 1 - ((1 - c) * (1 - i) * (1 - a));
  const impact = scope === 'U'
    ? 6.42 * iscBase
    : 7.52 * (iscBase - 0.029) - 3.25 * Math.pow(iscBase - 0.02, 15);
  if (impact <= 0) return 0;
  const exploitability = 8.22 * av * ac * pr * ui;
  const score = scope === 'U'
    ? Math.min(impact + exploitability, 10)
    : Math.min(1.08 * (impact + exploitability), 10);
  return cvssRoundUp(score);
}

function parseNumericScore(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return Number.parseFloat(trimmed);
  }
  if (trimmed.indexOf('CVSS:3.') === 0) return cvss3BaseScore(trimmed);
  return null;
}

function pushCvssCandidate(target, value) {
  const numeric = parseNumericScore(value);
  if (numeric !== null) target.push(numeric);
}

function extractMaxCvssScore(vulnerability) {
  const candidates = [];
  const severity = vulnerability && vulnerability.severity;
  const severityEntries = Array.isArray(severity) ? severity : (severity ? [severity] : []);

  for (const entry of severityEntries) {
    if (!entry || typeof entry !== 'object') continue;
    pushCvssCandidate(candidates, entry.score);
    pushCvssCandidate(candidates, entry.baseScore);
    pushCvssCandidate(candidates, entry.base_score);
    pushCvssCandidate(candidates, entry.numericScore);
    pushCvssCandidate(candidates, entry.numeric_score);
  }

  const directCandidates = vulnerability ? [
    vulnerability.cvss,
    vulnerability.cvssScore,
    vulnerability.cvss_score,
    vulnerability.score,
    vulnerability.baseScore,
    vulnerability.base_score,
  ] : [];
  for (const candidate of directCandidates) {
    if (candidate && typeof candidate === 'object') {
      pushCvssCandidate(candidates, candidate.score);
      pushCvssCandidate(candidates, candidate.baseScore);
      pushCvssCandidate(candidates, candidate.base_score);
    } else {
      pushCvssCandidate(candidates, candidate);
    }
  }

  const databaseSpecific = vulnerability && (vulnerability.database_specific || vulnerability.databaseSpecific);
  if (databaseSpecific && typeof databaseSpecific === 'object') {
    for (const key of ['cvss', 'cvss_v3', 'cvss_v4', 'cvssV3', 'cvssV4']) {
      const candidate = databaseSpecific[key];
      if (candidate && typeof candidate === 'object') {
        pushCvssCandidate(candidates, candidate.score);
        pushCvssCandidate(candidates, candidate.baseScore);
        pushCvssCandidate(candidates, candidate.base_score);
      } else {
        pushCvssCandidate(candidates, candidate);
      }
    }
  }

  if (candidates.length === 0) return null;
  return Math.max.apply(Math, candidates);
}

function hasTruthyFlag(node, keys) {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some((item) => hasTruthyFlag(item, keys));
  for (const [key, value] of Object.entries(node)) {
    if (keys.has(key)) {
      if (value === true) return true;
      if (typeof value === 'string' && ['true', 'yes', '1'].includes(value.trim().toLowerCase())) return true;
      if (typeof value === 'number' && value > 0) return true;
    }
    if (value && typeof value === 'object' && hasTruthyFlag(value, keys)) return true;
  }
  return false;
}

function packageContext(context, vulnerability) {
  const affectedPackage = vulnerability && Array.isArray(vulnerability.affected) && vulnerability.affected[0]
    ? vulnerability.affected[0].package
    : null;
  const packageNode = context.package || (vulnerability && vulnerability.package) || affectedPackage || {};
  const vulnerabilityPackage = vulnerability && vulnerability.package ? vulnerability.package : {};
  return {
    ecosystem: packageNode.ecosystem || (vulnerability ? vulnerability.ecosystem : null) || null,
    packageName: packageNode.name || vulnerabilityPackage.name || null,
    version: packageNode.version || vulnerabilityPackage.version || null,
  };
}

function collectFindings(report) {
  const findings = [];

  function visit(node, context = {}) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, context);
      return;
    }

    const nextContext = { ...context };
    if (node.package && typeof node.package === 'object') {
      nextContext.package = node.package;
    }

    if (Array.isArray(node.vulnerabilities)) {
      for (const vulnerability of node.vulnerabilities) {
        if (!vulnerability || typeof vulnerability !== 'object') continue;
        findings.push({
          vulnerability,
          ...packageContext(nextContext, vulnerability),
        });
      }
    }

    for (const [key, value] of Object.entries(node)) {
      if (key === 'vulnerabilities') continue;
      visit(value, nextContext);
    }
  }

  visit(report);
  return findings;
}

function classifyFinding(finding) {
  const maxCvssScore = extractMaxCvssScore(finding.vulnerability);
  const reasons = [];

  if (maxCvssScore !== null && maxCvssScore >= 9) {
    reasons.push('cvss>=9');
  }
  if (hasTruthyFlag(finding.vulnerability, KEV_KEYS)) {
    reasons.push('kev');
  }
  if (hasTruthyFlag(finding.vulnerability, ACTIVE_EXPLOIT_KEYS)) {
    reasons.push('active-exploit');
  }

  return {
    id: finding.vulnerability.id || null,
    aliases: Array.isArray(finding.vulnerability.aliases) ? finding.vulnerability.aliases : [],
    summary: finding.vulnerability.summary || null,
    packageName: finding.packageName,
    ecosystem: finding.ecosystem,
    version: finding.version,
    maxCvssScore,
    securityForced: reasons.length > 0,
    reasons,
  };
}

function classifyReport(report) {
  const classifiedFindings = collectFindings(report).map(classifyFinding);
  const securityForcedFindings = classifiedFindings.filter((finding) => finding.securityForced);
  const verdict = securityForcedFindings.length > 0
    ? 'SECURITY_FORCED'
    : classifiedFindings.length > 0
      ? 'PASS_WITH_NOTES'
      : 'PASS';

  return {
    verdict,
    totalFindings: classifiedFindings.length,
    securityForcedCount: securityForcedFindings.length,
    approximation: V0_APPROXIMATION_NOTE,
    findings: classifiedFindings,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = JSON.parse(readFileSync(args.input, 'utf8'));
  const classified = classifyReport(report);

  if (args.detailsJson) {
    writeFileSync(args.detailsJson, `${JSON.stringify(classified, null, 2)}\n`);
  }

  process.stdout.write(`${JSON.stringify({
    verdict: classified.verdict,
    total_findings: classified.totalFindings,
    security_forced_count: classified.securityForcedCount,
  })}\n`);
}

module.exports = {
  V0_APPROXIMATION_NOTE,
  extractMaxCvssScore,
  collectFindings,
  classifyFinding,
  classifyReport,
};

if (require.main === module) {
  main();
}
