#!/usr/bin/env node
// Refresh the [Unreleased] section of CHANGELOG.md from the git log.
//
// Why this exists instead of `git-cliff --prepend`:
//   --prepend blindly inserts at line 1. On this repo that put the generated block
//   ABOVE the "# Changelog" title (stranding it mid-file) and stacked a SECOND
//   [Unreleased] section on top of the existing one. Every run made it worse.
//
// This script is idempotent: it replaces the [Unreleased] section in place, keeping
// the title/preamble at the top and every released section untouched. Run it twice,
// get the same file.
//
// It never uses `git-cliff -o` / plain generate — those rebuild CHANGELOG.md from the
// git log and would drop every hand-written line (measured: 362 lines in this repo).
//
//   node scripts/changelog-update.mjs [--check]
//     --check  exit 1 if the file would change (CI guard), write nothing
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const CHANGELOG = 'CHANGELOG.md';
const CONFIG = 'changelog/cliff.toml';
const UNRELEASED = '## [Unreleased]';
const check = process.argv.includes('--check');

const current = readFileSync(CHANGELOG, 'utf8');

// The header is everything before the first section heading (title + preamble + rule).
const firstSection = current.search(/^## \[/m);
if (firstSection === -1) throw new Error(`${CHANGELOG}: no "## [" section found — refusing to guess its shape.`);
const header = current.slice(0, firstSection).trimEnd();

// A file already corrupted by `git-cliff --prepend` has its "# Changelog" title BELOW the
// injected [Unreleased] block, so "everything above the first section" is empty and the title
// would be dropped along with that block. Refuse rather than silently delete it.
if (!/^# /m.test(header)) {
  throw new Error(
    `${CHANGELOG}: no "# " title above the first section — the file looks --prepend-corrupted.\n` +
    `Restore the title/preamble to the top of the file, then re-run.`,
  );
}

const generated = execFileSync('git-cliff', ['--config', CONFIG, '--unreleased'], {
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
}).trim();

// Released sections = everything from the first "## [" that is NOT [Unreleased].
// Dropping any existing [Unreleased] block is what makes this idempotent.
const sections = current.slice(firstSection).split(/^(?=## \[)/m);
const released = sections.filter((s) => !s.startsWith(UNRELEASED)).join('').trimEnd();

// git-cliff emits its own "## [Unreleased]" heading; keep exactly one.
const body = generated.startsWith(UNRELEASED) ? generated : `${UNRELEASED}\n\n${generated}`;
const hasEntries = /^- /m.test(generated);

const next = `${header}\n\n${hasEntries ? body : UNRELEASED}\n\n${released}\n`;

if (next === current) {
  console.log(`${CHANGELOG}: already up to date`);
  process.exit(0);
}
if (check) {
  console.error(`${CHANGELOG}: out of date — run: node scripts/changelog-update.mjs`);
  process.exit(1);
}

// Safety net: never lose a released section.
for (const heading of current.match(/^## \[v[^\]]+\].*$/gm) ?? []) {
  if (!next.includes(heading)) throw new Error(`refusing to write: would drop released section ${heading}`);
}

writeFileSync(CHANGELOG, next);
console.log(`${CHANGELOG}: [Unreleased] refreshed (${(generated.match(/^- /gm) ?? []).length} entries)`);
