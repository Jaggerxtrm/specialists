import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const tarball = process.argv[2];
if (!tarball) throw new Error('usage: node scripts/generate-release-attestation.mjs <tarball> [output]');
const output = process.argv[3] ?? 'release-attestation.json';
const root = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const digestFiles = (files) => createHash('sha256').update(files.map((file) => `${file}:${sha256(path.join(root, file))}`).join('\n')).digest('hex');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const piVersion = process.env.PI_VERSION ?? 'not-run (set PI_VERSION to certify Pi smoke)';
const attestation = {
  schema_version: '1.0.0',
  scope: 'Specialists-local; does not certify Pi v0.84.1 compatibility.',
  package: { name: packageJson.name, version: packageJson.version, source_commit: sourceCommit, git_head: sourceCommit, tarball: path.basename(tarball), sha256: sha256(tarball) },
  pi_runtime: { version_or_range: piVersion },
  fingerprints: {
    catalog_sha256: digestFiles(['config/catalog/index.json', 'config/catalog/native.json', 'config/catalog/gitnexus.json']),
    mandatory_rules_sha256: digestFiles(['config/mandatory-rules/index.json', 'config/mandatory-rules/executor-delivery.md']),
    resolved_tool_contract_fixture_sha256: digestFiles(['config/catalog/index.json', 'config/specialists/explorer.specialist.json', 'config/specialists/overthinker.specialist.json', 'config/specialists/obligations-scanner.specialist.json'])
  },
  validation_commands: [
    'bun install --frozen-lockfile',
    'bun run build',
    'npm pack --dry-run --json',
    'npm pack --json',
    'tar -tzf <tarball> | grep -i serena (must return no matches)',
    'npm install --global --prefix="$prefix" <tarball>',
    'sp --version && sp doctor --check-drift && sp list --compact'
  ],
  rollback: 'Unpublish only within npm 72-hour policy when permitted; otherwise deprecate compromised version and publish corrected patch. Restore prior known-good tag.'
};
const outputPath = path.isAbsolute(output) ? output : path.join(root, output);
writeFileSync(outputPath, `${JSON.stringify(attestation, null, 2)}\n`);
console.log(outputPath);
