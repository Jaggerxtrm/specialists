import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const digestFiles = (files) => createHash('sha256').update(files.map((file) => `${file}:${sha256(path.join(root, file))}`).join('\n')).digest('hex');
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const expectedTarball = `jaggerxtrm-specialists-${packageJson.version}.tgz`;
const fingerprints = {
  catalog_sha256: digestFiles(['config/catalog/index.json', 'config/catalog/native.json', 'config/catalog/gitnexus.json']),
  mandatory_rules_sha256: digestFiles(['config/mandatory-rules/index.json', 'config/mandatory-rules/executor-delivery.md']),
  resolved_tool_contract_fixture_sha256: digestFiles(['config/catalog/index.json', 'config/specialists/explorer.specialist.json', 'config/specialists/overthinker.specialist.json', 'config/specialists/obligations-scanner.specialist.json']),
};
const waiver = {
  release: '3.21.6',
  status: 'approved_bounded_waiver',
  tracking_issue: 'unitAI-641h0',
  approved: true,
  approved_by: 'operator',
  approved_at: '2026-09-03T00:56:00Z',
  limitation: 'Specialists does not provide filesystem or host-read isolation. Model-driven runs and allowed tools, extensions, MCP processes, and child processes can read paths visible to the operating-system identity that runs Specialists.',
  affected_surfaces: ['tracked_runs', 'sp_script', 'sp_serve', 'mcp_use_specialist', 'pipelines', 'pi_extensions', 'child_processes'],
  excluded_uses: ['untrusted_callers', 'public_unauthenticated_ingress', 'cross_tenant_execution', 'multi_tenant_execution', 'confidential_host_data_visible_to_the_runtime_identity'],
  compensating_controls: ['trusted_single_tenant_callers_only', 'private_or_loopback_authenticated_ingress', 'dedicated_container_or_os_account', 'minimal_readable_mounts', 'least_privilege_credentials', 'trusted_specialist_definitions', 'exact_reviewed_extension_sources', 'requested_permission_tiers_fail_closed_when_the_runtime_tool_catalog_is_unavailable_or_invalid'],
  non_controls: ['allow_skills_roots', 'worktree_boundaries', 'permission_tier_names', 'extension_tool_allowlists', 'absolute_path_write_guards'],
  prohibited_claims: ['sandboxed', 'filesystem_isolated', 'read_isolated', 'confidential', 'safe_for_untrusted_callers', 'public_service_ready', 'multi_tenant_safe'],
  tool_contract_resolution: 'fail_closed',
  write_boundary: 'absolute_paths_only',
  sandbox: 'none',
  read_isolation: 'not_provided',
  expires_at: '2026-10-03T00:00:00Z',
  expires_on_release: '3.21.7',
  expires_on_condition: 'first_release_that_provides_enforced_host_read_isolation',
  expiry_rule: 'whichever_occurs_first',
  reopen_conditions: ['unauthorized_host_read', 'public_or_cross_tenant_deployment', 'requested_tier_launch_without_explicit_tools', 'readable_mount_expansion', 'misleading_isolation_documentation', 'waiver_expiry'],
  publication_authorized: false,
};
const CANONICAL_SCOPE = 'Specialists-local; does not certify Pi compatibility or provide filesystem or host-read isolation.';
const CANONICAL_VALIDATION_COMMANDS = [
  'bun install --frozen-lockfile',
  'NODE_ENV=test bun run build',
  'git diff --exit-code -- dist/',
  'npm pack --dry-run --json',
  'npm pack --json',
  'tar -tzf <tarball> | grep -i serena (must return no matches)',
  'npm install --global --prefix="$prefix" <tarball>',
  'sp --version && sp doctor --check-drift && sp list --compact',
];
const CANONICAL_ROLLBACK = 'No publication is authorized by this receipt. If an operator later publishes and detects compromise, unpublish only within npm policy when permitted; otherwise deprecate the affected version and publish a corrected patch. Restore the prior known-good tag.';

function fail(message) {
  throw new Error(`release attestation validation failed: ${message}`);
}

export function enforceWaiver(packageVersion, now = Date.now()) {
  if (packageVersion !== waiver.release) fail(`package version ${packageVersion} does not match waiver release ${waiver.release}`);
  if (now >= Date.parse(waiver.expires_at)) fail(`host-read isolation waiver expired at ${waiver.expires_at}`);
}

function requireCleanTree() {
  const status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], { encoding: 'utf8' }).trim();
  if (status) fail(`dirty or untracked repository state; generation requires a clean tree:\n${status}`);
}

function validate(tarball, attestationPath) {
  enforceWaiver(packageJson.version);
  const attestation = JSON.parse(readFileSync(attestationPath, 'utf8'));
  const expectedCommit = process.env.EXPECTED_SOURCE_COMMIT ?? sourceCommit;
  const expectedPiVersion = process.env.PI_VERSION;
  if (!attestation || attestation.schema_version !== '1.1.0') fail('unsupported schema');
  if (attestation.attestation_status !== 'final_detached') fail('attestation status mismatch');
  if (attestation.package?.name !== packageJson.name || attestation.package?.version !== packageJson.version) fail('package name/version mismatch');
  if (!/^[0-9a-f]{40}$/.test(expectedCommit) || attestation.package.source_commit !== expectedCommit || attestation.package.git_head !== expectedCommit) fail('source commit mismatch');
  if (attestation.package.tarball !== expectedTarball || attestation.package.tarball !== path.basename(tarball)) fail('tarball name mismatch');
  if (attestation.package.sha256 !== sha256(tarball)) fail('tarball SHA-256 mismatch');
  if (JSON.stringify(attestation.fingerprints) !== JSON.stringify(fingerprints)) fail('fingerprint mismatch');
  if (!expectedPiVersion || expectedPiVersion === 'unavailable') fail('PI_VERSION unavailable');
  if (attestation.pi_runtime?.version_or_range !== expectedPiVersion) fail('Pi identity mismatch');
  if (JSON.stringify(attestation.host_read_isolation) !== JSON.stringify({ provided: false, waiver })) fail('host-read isolation waiver mismatch');
  if (attestation.publication_authorized !== false) fail('publication authorization mismatch');
  if (attestation.scope !== CANONICAL_SCOPE) fail('scope mismatch');
  if (JSON.stringify(attestation.validation_commands) !== JSON.stringify(CANONICAL_VALIDATION_COMMANDS)) fail('validation commands mismatch');
  if (attestation.rollback !== CANONICAL_ROLLBACK) fail('rollback mismatch');
  console.log(`validated ${attestationPath}`);
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--validate') {
    if (!args[1] || !args[2] || args.length !== 3) fail('usage: --validate <tarball> <attestation>');
    validate(args[1], args[2]);
    return;
  }
  const tarball = args[0];
  if (!tarball || args.length !== 2) fail('usage: node scripts/generate-release-attestation.mjs <tarball> <output> — an explicit detached output path is required; bare generation without it is refused before any write');
  if (path.basename(tarball) !== expectedTarball) fail(`expected tarball ${expectedTarball}`);
  enforceWaiver(packageJson.version);
  requireCleanTree();
  const output = args[1];
  const piVersion = process.env.PI_VERSION;
  if (!piVersion || piVersion === 'unavailable') fail('PI_VERSION unavailable');
  const attestation = {
    schema_version: '1.1.0',
    attestation_status: 'final_detached',
    scope: CANONICAL_SCOPE,
    package: {
      name: packageJson.name,
      version: packageJson.version,
      source_commit: sourceCommit,
      git_head: sourceCommit,
      tarball: path.basename(tarball),
      sha256: sha256(tarball),
    },
    pi_runtime: { version_or_range: piVersion },
    fingerprints,
    host_read_isolation: { provided: false, waiver },
    publication_authorized: false,
    validation_commands: CANONICAL_VALIDATION_COMMANDS,
    rollback: CANONICAL_ROLLBACK,
  };
  const outputPath = path.isAbsolute(output) ? output : path.join(root, output);
  writeFileSync(outputPath, `${JSON.stringify(attestation, null, 2)}\n`);
  console.log(outputPath);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
