#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(ROOT, 'dist', 'asset-contract.json');
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const SCHEMA_VERSION = '1.0.0';

async function main() {
  const packageJson = JSON.parse(await readFile(PACKAGE_PATH, 'utf8'));
  const contract = {
    schema_version: SCHEMA_VERSION,
    package_version: packageJson.version,
    shipped_skills: await collectSkillFiles(),
    shipped_specialists: await collectFiles('config/specialists', '.specialist.json', (filePath) => ({
      path: filePath,
    })),
    shipped_mandatory_rules: await collectMandatoryRules(),
    shipped_catalogs: await collectFiles('config/catalog', '.json', (filePath) => ({
      path: filePath,
    })),
    shipped_nodes: await collectFiles('config/nodes', '.json', (filePath) => ({
      path: filePath,
    })),
    shipped_hooks: await collectFiles('config/hooks', '.mjs', (filePath) => ({
      path: filePath,
    })),
    notes: [
      'Cross-repo expectation: xtrm-tools validates this manifest against shipped assets on fresh install.',
      'Any new skill, specialist, rule, catalog, node, or hook must appear here before release.',
    ],
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
}

// Every file a skill ships, not just its SKILL.md. A progressively-disclosed skill keeps
// its doctrine in bundled resources (references/**), and skills may ship scripts — all of
// those are packaged (package.json `files` includes config/skills/) and must be tracked
// here, or a missing resource would sail through release and fresh-install validation.
// `evals/` is excluded to mirror the package's own `!config/skills/**/evals/**` exclusion.
async function collectSkillFiles() {
  const files = [];
  for await (const filePath of walk('config/skills')) {
    if (filePath.split(path.sep).includes('evals')) continue;
    files.push({ path: filePath, sha256: await sha256File(path.join(ROOT, filePath)) });
  }
  files.sort(compareByPath);
  return files;
}

async function collectFiles(relativeDir, suffix, mapEntry) {
  const files = [];
  for await (const filePath of walk(relativeDir)) {
    if (filePath.endsWith(suffix)) {
      files.push(await mapEntry(filePath));
    }
  }
  files.sort(compareByPath);
  return files;
}

async function collectMandatoryRules() {
  const rules = [];
  for await (const filePath of walk('config/mandatory-rules')) {
    if (filePath.endsWith('.md') || filePath.endsWith('index.json')) {
      rules.push({ path: filePath });
    }
  }
  rules.sort(compareByPath);
  return rules;
}

async function* walk(relativeDir) {
  const absoluteDir = path.join(ROOT, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(relativePath);
      continue;
    }
    if (entry.isFile()) {
      yield relativePath;
    }
  }
}

async function sha256File(filePath) {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function compareByPath(left, right) {
  return left.path.localeCompare(right.path);
}

await main();
