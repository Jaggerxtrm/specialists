// Audit every .specialist.json under config/specialists/ and .specialists/default/
// for: (1) schema parse failures, (2) unknown keys that survive .passthrough() silently.
//
// Usage (from repo root): bun config/skills/specialists-creator/scripts/audit-spec-uniformity.mjs
//
// Keep KNOWN sets in sync with src/specialist/schema.ts. If a sub-schema gains
// or drops a field, update this file in the same commit.

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const repoRoot = resolve(here, '../../../../..');
const { validateSpecialist } = await import(resolve(repoRoot, 'src/specialist/schema.ts'));

// Walk known schema keys to detect "unknown" passthrough survivors
const KNOWN = {
  root: new Set(['specialist']),
  specialist: new Set(['metadata','execution','prompt','skills','capabilities','communication','validation','beads_integration','beads_write_notes','stall_detection','heartbeat','mandatory_rules','output_file']),
  metadata: new Set(['name','version','description','category','author','created','updated','tags']),
  execution: new Set(['mode','model','fallback_model','timeout_ms','stall_timeout_ms','max_retries','interactive','response_format','output_type','permission_required','requires_worktree','thinking_level','auto_commit','extensions','preferred_profile','approval_mode']),
  'execution.extensions': new Set(['serena','gitnexus']),
  prompt: new Set(['system','task_template','normalize_template','output_schema','examples','skill_inherit']),
  skills: new Set(['paths','scripts']),
  'skills.scripts.item': new Set(['run','path','phase','inject_output']),
  capabilities: new Set(['required_tools','external_commands','diagnostic_scripts']),
  communication: new Set(['next_specialists','publishes']),
  validation: new Set(['files_to_watch','stale_threshold_days']),
  stall_detection: new Set(['running_idle_warn_ms','running_idle_kill_ms','waiting_stale_ms','tool_duration_warn_ms']),
};

function unknownKeys(obj, knownSet, path) {
  const out = [];
  for (const k of Object.keys(obj || {})) if (!knownSet.has(k)) out.push(`${path}.${k}`);
  return out;
}

function audit(file) {
  const raw = JSON.parse(readFileSync(file,'utf8'));
  const findings = [];
  // raw key check (before parse strips/preserves)
  findings.push(...unknownKeys(raw, KNOWN.root, ''));
  const s = raw.specialist ?? {};
  findings.push(...unknownKeys(s, KNOWN.specialist, 'specialist'));
  if (s.metadata) findings.push(...unknownKeys(s.metadata, KNOWN.metadata, 'specialist.metadata'));
  if (s.execution) findings.push(...unknownKeys(s.execution, KNOWN.execution, 'specialist.execution'));
  if (s.execution?.extensions) findings.push(...unknownKeys(s.execution.extensions, KNOWN['execution.extensions'], 'specialist.execution.extensions'));
  if (s.prompt) findings.push(...unknownKeys(s.prompt, KNOWN.prompt, 'specialist.prompt'));
  if (s.skills) findings.push(...unknownKeys(s.skills, KNOWN.skills, 'specialist.skills'));
  if (Array.isArray(s.skills?.scripts)) for (const [i, sc] of s.skills.scripts.entries()) findings.push(...unknownKeys(sc, KNOWN['skills.scripts.item'], `specialist.skills.scripts[${i}]`));
  if (s.capabilities) findings.push(...unknownKeys(s.capabilities, KNOWN.capabilities, 'specialist.capabilities'));
  if (s.communication) findings.push(...unknownKeys(s.communication, KNOWN.communication, 'specialist.communication'));
  if (s.validation) findings.push(...unknownKeys(s.validation, KNOWN.validation, 'specialist.validation'));
  if (s.stall_detection) findings.push(...unknownKeys(s.stall_detection, KNOWN.stall_detection, 'specialist.stall_detection'));
  return findings;
}

const files = [
  ...readdirSync(resolve(repoRoot,'config/specialists')).filter(f=>f.endsWith('.specialist.json')).map(f=>join(repoRoot,'config/specialists',f)),
  ...readdirSync(resolve(repoRoot,'.specialists/default')).filter(f=>f.endsWith('.specialist.json')).map(f=>join(repoRoot,'.specialists/default',f)),
];

let totalUnknown = 0;
let parseErrors = 0;
for (const file of files) {
  try {
    const v = await validateSpecialist(readFileSync(file,'utf8'));
    if (!v.valid) {
      parseErrors++;
      console.log(`\n✗ PARSE FAIL ${file}`);
      for (const e of v.errors) console.log(`    ${e.path}: ${e.message}`);
      continue;
    }
    const unk = audit(file);
    if (unk.length) {
      totalUnknown += unk.length;
      console.log(`\n⚠ ${file}`);
      for (const k of unk) console.log(`    unknown key: ${k}`);
    }
  } catch (e) {
    parseErrors++;
    console.log(`\n✗ ERROR ${file}: ${e.message}`);
  }
}
console.log(`\n=== ${files.length} specs · ${parseErrors} parse errors · ${totalUnknown} unknown keys ===`);
