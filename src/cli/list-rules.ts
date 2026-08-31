// src/cli/list-rules.ts
// `sp list-rules` — operator-facing introspection of the mandatory-rules
// library and which specialists pull each rule set in.
//
// Read-only. Walks cwd tiers first, then package-canonical fallback
// (.specialists/user/ → .specialists/mandatory-rules/ → .specialists/default/ → config/ → package-canonical)
// so the output reflects what specialists can receive at spawn.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { loadMandatoryRulesIndex } from '../specialist/mandatory-rules.js';
import { resolveCanonicalAssetDir } from '../specialist/canonical-asset-resolver.js';
import { getGlobalUserConfigPath, readValidatedGlobalUserConfig } from '../specialist/global-config.js';
import { SpecialistLoader } from '../specialist/loader.js';
import type { SpecialistMandatoryRulesConfig } from '../specialist/mandatory-rules.js';

interface RuleSetEntry {
  id: string;
  source_path: string;
  source_tier: 'user' | 'default' | 'overlay' | 'config' | 'package-canonical';
}

type RuleScope = 'required' | 'default' | 'role-specific' | 'inline';

interface AppliedRule {
  id: string;
  scope: RuleScope;
}

interface SpecialistEntry {
  name: string;
  source_tier: 'default' | 'user' | 'config' | 'package-canonical';
  source_path: string;
  applied_rules: AppliedRule[];
  inline_rule_count: number;
  globals_disabled: boolean;
  effective_template_sets: string[];
}

interface ListRulesOptions {
  json: boolean;
  filterRule?: string;
  filterSpecialist?: string;
}

const RULE_TIERS: Array<{ rel: string; tier: RuleSetEntry['source_tier'] }> = [
  { rel: '.specialists/user/mandatory-rules', tier: 'user' },
  { rel: '.specialists/mandatory-rules', tier: 'overlay' },
  { rel: '.specialists/default/mandatory-rules', tier: 'default' },
  { rel: 'config/mandatory-rules', tier: 'config' },
  { rel: '__package__/mandatory-rules', tier: 'package-canonical' },
];

const SPEC_TIERS: Array<{ rel: string; tier: SpecialistEntry['source_tier'] }> = [
  { rel: '.specialists/user', tier: 'user' },
  { rel: '.specialists/default', tier: 'default' },
  { rel: 'config/specialists', tier: 'config' },
  { rel: '__package__/specialists', tier: 'package-canonical' },
];

function resolvePackageDir(asset: 'mandatory-rules' | 'specialists'): string | null {
  return resolveCanonicalAssetDir(asset) ?? null;
}

function discoverRuleSets(cwd: string): RuleSetEntry[] {
  const seen = new Map<string, RuleSetEntry>();
  for (const { rel, tier } of RULE_TIERS) {
    const dir = rel === '__package__/mandatory-rules' ? resolvePackageDir('mandatory-rules') : resolve(cwd, rel);
    if (!dir || !existsSync(dir)) continue;
    let files: string[];
    try { files = readdirSync(dir); } catch { continue; }
    for (const file of files) {
      if (!file.endsWith('.md') || file === 'README.md') continue;
      const id = file.replace(/\.md$/, '');
      if (!seen.has(id)) seen.set(id, { id, source_path: join(dir, file), source_tier: tier });
    }
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function discoverSpecialists(cwd: string): SpecialistEntry[] {
  const seen = new Map<string, SpecialistEntry>();
  for (const { rel, tier } of SPEC_TIERS) {
    const dir = rel === '__package__/specialists' ? resolvePackageDir('specialists') : resolve(cwd, rel);
    if (!dir || !existsSync(dir)) continue;
    let files: string[];
    try { files = readdirSync(dir); } catch { continue; }
    for (const file of files) {
      if (!file.endsWith('.specialist.json')) continue;
      const name = file.replace(/\.specialist\.json$/, '');
      if (seen.has(name)) continue;
      const path = join(dir, file);
      try {
        const parsed = JSON.parse(readFileSync(path, 'utf-8'));
        const spec = parsed?.specialist;
        if (!spec) continue;
        const config: SpecialistMandatoryRulesConfig | undefined = spec?.mandatory_rules;
        seen.set(name, {
          name,
          source_tier: tier,
          source_path: path,
          applied_rules: [],
          inline_rule_count: Array.isArray(config?.inline_rules) ? config.inline_rules.length : 0,
          globals_disabled: Boolean(config?.disable_default_globals),
          effective_template_sets: [],
        });
      } catch {
        // Skip unreadable specialists silently.
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function appliedRulesForSpec(
  spec: SpecialistEntry,
  spec_template_sets: string[],
  required: string[],
  defaults: string[],
): AppliedRule[] {
  const out = new Map<string, AppliedRule>();
  for (const id of required) out.set(id, { id, scope: 'required' });
  // Index `default_template_sets` ALWAYS load at runtime (unitAI-klo6k):
  // `disable_default_globals` only suppresses the inline workflow-quick-rules
  // block in buildMandatoryRulesInjection, never index-driven sets.
  for (const id of defaults) if (!out.has(id)) out.set(id, { id, scope: 'default' });
  for (const id of spec_template_sets) if (!out.has(id)) out.set(id, { id, scope: 'role-specific' });
  if (spec.inline_rule_count > 0) out.set(`__inline__${spec.name}`, { id: '(inline)', scope: 'inline' });
  return [...out.values()];
}

function renderMatrix(rules: RuleSetEntry[], specs: SpecialistEntry[]): string {
  const ruleIds = rules.map(r => r.id);
  const nameWidth = Math.max(15, ...specs.map(s => s.name.length));
  const colWidth = Math.max(4, ...ruleIds.map(id => Math.min(id.length, 18)));

  const lines: string[] = [];
  const header = ['specialist'.padEnd(nameWidth), ...ruleIds.map(id => id.slice(0, colWidth).padEnd(colWidth))];
  lines.push(header.join(' '));
  lines.push('-'.repeat(header.join(' ').length));

  for (const spec of specs) {
    const cells = [spec.name.padEnd(nameWidth)];
    for (const id of ruleIds) {
      const applied = spec.applied_rules.find(r => r.id === id);
      let mark = ' . ';
      if (applied) {
        mark = applied.scope === 'required' ? ' R '
          : applied.scope === 'default' ? ' D '
          : ' x ';
      }
      cells.push(mark.padEnd(colWidth));
    }
    lines.push(cells.join(' '));
  }
  lines.push('');
  lines.push('  R = required (always)   D = default (index policy, always loaded)   x = role-specific   . = not applied');
  return lines.join('\n');
}

function parseArgs(argv: readonly string[]): ListRulesOptions {
  const opts: ListRulesOptions = { json: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--json') opts.json = true;
    else if (t === '--rule' && argv[i + 1]) opts.filterRule = argv[++i];
    else if (t === '--specialist' && argv[i + 1]) opts.filterSpecialist = argv[++i];
    else if (t === '--help' || t === '-h') {
      printUsage();
      process.exit(0);
    } else {
      process.stderr.write(`Unknown option: ${t}\n`);
      printUsage();
      process.exit(1);
    }
  }
  return opts;
}

function printUsage(): void {
  console.log([
    '',
    'Usage: specialists list-rules [--rule <id>] [--specialist <name>] [--json]',
    '',
    'Show which mandatory rules are loaded by which specialists.',
    'Walks cwd tiers first, then package-canonical fallback.',
    'Priority: .specialists/ → .specialists/default/ → config/ → package-canonical.',
    '',
    'Options:',
    '  --rule <id>          Filter to one rule, list every spec that loads it',
    '  --specialist <name>  Filter to one specialist, list every rule applied',
    '  --json               Structured output (rules[], specialists[])',
    '',
    'Examples:',
    '  specialists list-rules',
    '  specialists list-rules --rule gitnexus-required',
    '  specialists list-rules --specialist reviewer',
    '  specialists list-rules --json | jq .',
    '',
  ].join('\n'));
}

export async function run(): Promise<void> {
  const opts = parseArgs(process.argv.slice(3));
  const cwd = process.cwd();

  const index = loadMandatoryRulesIndex(cwd);
  const required = index?.required_template_sets ?? [];
  const defaults = index?.default_template_sets ?? [];

  const rules = discoverRuleSets(cwd);
  const specs = discoverSpecialists(cwd);

  // Pre-flight validation of the global user layer (seconder, unitAI-klo6k):
  // an invalid user.json is surfaced with an actionable warning before any
  // merge. Effective values themselves are NOT read from the raw file — they
  // come from the loader merge below, which type-guards and kebab-hardens
  // every template_sets element (unitAI-klo6k security). Shared fail-safe with
  // sp doctor via readValidatedGlobalUserConfig.
  const globalLocation = getGlobalUserConfigPath();
  if (globalLocation.exists) {
    const { invalidReason } = readValidatedGlobalUserConfig(globalLocation);
    if (invalidReason !== null) {
      process.stderr.write(
        `[specialists] global user config ${invalidReason}; mandatory-rules overlay hardened/fallback applies instead\n`,
      );
    }
  }

  // Effective per-specialist state comes from the REAL layered merge
  // (package canonical → ~/.config/specialists/user.json → repo
  // .specialists/user/<name>), exactly as the loader composes it at runtime
  // (unitAI-klo6k F4). The template_sets value therefore reflects true
  // precedence — repo overlay beats global beats package — and has already
  // passed the merge's kebab hardening. The raw tier walk above is kept only
  // for the rule library + source-path display.
  const loader = new SpecialistLoader();
  for (const spec of specs) {
    let fileSets: string[] = [];
    try {
      const parsed = JSON.parse(readFileSync(spec.source_path, 'utf-8'));
      fileSets = (parsed?.specialist?.mandatory_rules?.template_sets ?? []) as string[];
    } catch {
      // Unreadable manifest: fall back to the empty selection below.
    }
    // The loader merge can throw when the global user.json is unparseable or a
    // layer manifest is schema-invalid; degrade to the manifest's own selection
    // instead of crashing the listing (the pre-flight above already warned).
    let effectiveSpec: Awaited<ReturnType<SpecialistLoader['getEffective']>> = null;
    try {
      effectiveSpec = await loader.getEffective(spec.name);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(
        `[specialists] cannot compute merged mandatory-rules selection for '${spec.name}'; using manifest defaults: ${message}\n`,
      );
    }
    if (effectiveSpec) {
      const rulesConfig = effectiveSpec.specialist.mandatory_rules;
      spec.effective_template_sets = rulesConfig?.template_sets ?? [];
      spec.inline_rule_count = rulesConfig?.inline_rules?.length ?? 0;
      spec.globals_disabled = rulesConfig?.disable_default_globals ?? false;
    } else {
      // Discovery-only specialist (not resolvable by the loader): keep the
      // manifest file's own selection so the matrix stays populated.
      spec.effective_template_sets = fileSets;
    }
    spec.applied_rules = appliedRulesForSpec(spec, spec.effective_template_sets, required, defaults);
  }

  if (opts.filterRule) {
    const matchedSpecs = specs
      .map(s => ({ name: s.name, source_tier: s.source_tier, scope: s.applied_rules.find(r => r.id === opts.filterRule)?.scope }))
      .filter(x => !!x.scope);
    if (opts.json) {
      process.stdout.write(JSON.stringify({ rule: opts.filterRule, applied_to: matchedSpecs }, null, 2) + '\n');
      return;
    }
    console.log(`\nRule: ${opts.filterRule}\n`);
    if (matchedSpecs.length === 0) {
      console.log('  (no specialists pull this rule)');
    } else {
      for (const m of matchedSpecs) console.log(`  ${m.name.padEnd(20)} (${m.scope}, tier=${m.source_tier})`);
    }
    return;
  }

  if (opts.filterSpecialist) {
    const spec = specs.find(s => s.name === opts.filterSpecialist);
    if (!spec) {
      process.stderr.write(`No specialist found: ${opts.filterSpecialist}\n`);
      process.exit(1);
    }
    if (opts.json) {
      process.stdout.write(JSON.stringify(spec, null, 2) + '\n');
      return;
    }
    console.log(`\nSpecialist: ${spec.name}  (tier=${spec.source_tier}, globals_disabled=${spec.globals_disabled})\n`);
    if (spec.applied_rules.length === 0) {
      console.log('  (no rules applied)');
    } else {
      for (const r of spec.applied_rules) console.log(`  ${r.id.padEnd(28)} ${r.scope}`);
    }
    return;
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify({
      rules: rules.map(r => ({
        id: r.id,
        source_path: r.source_path,
        source_tier: r.source_tier,
        scope: required.includes(r.id) ? 'required' : defaults.includes(r.id) ? 'default' : 'role-specific',
      })),
      specialists: specs.map(s => ({
        name: s.name,
        source_tier: s.source_tier,
        source_path: s.source_path,
        globals_disabled: s.globals_disabled,
        inline_rule_count: s.inline_rule_count,
        effective_template_sets: s.effective_template_sets,
        applied_rules: s.applied_rules,
      })),
    }, null, 2) + '\n');
    return;
  }

  console.log(`\nMandatory rule library (${rules.length} sets, ${specs.length} specialists)\n`);
  console.log(renderMatrix(rules, specs));
  const orphans = rules.filter(r => !specs.some(s => s.applied_rules.some(a => a.id === r.id)) && !required.includes(r.id) && !defaults.includes(r.id));
  if (orphans.length > 0) {
    console.log(`\nOrphan rules (defined but not loaded by any specialist):`);
    for (const r of orphans) console.log(`  ${r.id}  (${basename(r.source_path)}, tier=${r.source_tier})`);
  }
}
