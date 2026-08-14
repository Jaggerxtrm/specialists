import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const digestFiles = (files) => createHash('sha256').update(files.map((file) => `${file}:${sha256(path.join(root, file))}`).join('\n')).digest('hex');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const fingerprints = {
  catalog_sha256: digestFiles(['config/catalog/index.json', 'config/catalog/native.json', 'config/catalog/gitnexus.json']),
  mandatory_rules_sha256: digestFiles(['config/mandatory-rules/index.json', 'config/mandatory-rules/executor-delivery.md']),
  resolved_tool_contract_fixture_sha256: digestFiles(['config/catalog/index.json', 'config/specialists/explorer.specialist.json', 'config/specialists/overthinker.specialist.json', 'config/specialists/obligations-scanner.specialist.json'])
};

function fail(message) { throw new Error(`release attestation validation failed: ${message}`); }
function validate(tarball, attestationPath) {
  const attestation = JSON.parse(readFileSync(attestationPath, 'utf8'));
  const expectedCommit = process.env.EXPECTED_SOURCE_COMMIT ?? sourceCommit;
  const expectedPiVersion = process.env.PI_VERSION;
  if (!attestation || attestation.schema_version !== '1.0.0') fail('unsupported schema');
  if (attestation.package?.name !== packageJson.name || attestation.package?.version !== packageJson.version) fail('package name/version mismatch');
  if (attestation.package.source_commit !== expectedCommit || attestation.package.git_head !== expectedCommit) fail('source commit mismatch');
  if (attestation.package.tarball !== path.basename(tarball)) fail('tarball name mismatch');
  if (attestation.package.sha256 !== sha256(tarball)) fail('tarball SHA-256 mismatch');
  if (JSON.stringify(attestation.fingerprints) !== JSON.stringify(fingerprints)) fail('fingerprint mismatch');
  if (!expectedPiVersion || expectedPiVersion === 'unavailable') fail('PI_VERSION unavailable');
  if (attestation.pi_runtime?.version_or_range !== expectedPiVersion) fail('Pi identity mismatch');
  console.log(`validated ${attestationPath}`);
}

const args = process.argv.slice(2);
if (args[0] === '--validate') {
  if (!args[1] || !args[2]) fail('usage: --validate <tarball> <attestation>');
  validate(args[1], args[2]);
} else {
  const tarball = args[0];
  if (!tarball) fail('usage: node scripts/generate-release-attestation.mjs <tarball> [output]');
  const output = args[1] ?? 'release-attestation.json';
  const piVersion = process.env.PI_VERSION;
  const attestation = {
    schema_version: '1.0.0',
    scope: 'Specialists-local; does not certify Pi v0.84.1 compatibility.',
    package: { name: packageJson.name, version: packageJson.version, source_commit: sourceCommit, git_head: sourceCommit, tarball: path.basename(tarball), sha256: sha256(tarball) },
    pi_runtime: { version_or_range: piVersion ?? 'not-supplied (Pi smoke not certified)' },
    fingerprints,
    validation_commands: ['bun install --frozen-lockfile', 'bun run build', 'npm pack --dry-run --json', 'npm pack --json', 'tar -tzf <tarball> | grep -i serena (must return no matches)', 'npm install --global --prefix="$prefix" <tarball>', 'sp --version && sp doctor --check-drift && sp list --compact'],
    rollback: 'Unpublish only within npm 72-hour policy when permitted; otherwise deprecate compromised version and publish corrected patch. Restore prior known-good tag.'
  };
  const outputPath = path.isAbsolute(output) ? output : path.join(root, output);
  writeFileSync(outputPath, `${JSON.stringify(attestation, null, 2)}\n`);
  console.log(outputPath);
}
