import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveSpecialistsRoot } from './resolve-specialists-root.mjs';

function usage(): never {
  console.error('Usage: bun validate-specialist.ts <path-to.specialist.json>');
  process.exit(64);
}

const file = process.argv[2];
if (!file) usage();

let raw: string;
try {
  raw = readFileSync(file, 'utf8');
} catch (error) {
  console.error(`File not found or unreadable: ${file}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(66);
}

try {
  const root = resolveSpecialistsRoot();
  const schemaUrl = pathToFileURL(path.join(root, 'src', 'specialist', 'schema.ts')).href;
  const { parseSpecialist } = await import(schemaUrl);
  await parseSpecialist(raw);
  console.log(`OK ${file}`);
} catch (error) {
  console.error(`Invalid ${file}`);
  if (error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues)) {
    for (const issue of error.issues) {
      const issuePath = Array.isArray(issue.path) && issue.path.length ? issue.path.join('.') : '<root>';
      console.error(`- ${issuePath}: ${issue.message}`);
    }
  } else {
    console.error(error instanceof Error ? error.message : String(error));
  }
  process.exit(1);
}
