import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolveSpecialistsRoot } from './resolve-specialists-root.mjs';

const root = resolveSpecialistsRoot();
const schemaUrl = pathToFileURL(path.join(root, 'src', 'specialist', 'schema.ts')).href;
const { validateSpecialist } = await import(schemaUrl);

const dirs = [
  path.join(root, 'config', 'specialists'),
  path.join(root, '.specialists', 'default'),
].filter(existsSync);

const files = dirs.flatMap((dir) =>
  readdirSync(dir)
    .filter((name) => name.endsWith('.specialist.json'))
    .sort()
    .map((name) => path.join(dir, name)),
);

let failures = 0;
for (const file of files) {
  try {
    const result = await validateSpecialist(readFileSync(file, 'utf8'));
    if (result.valid) continue;
    failures += 1;
    console.error(`INVALID ${path.relative(root, file)}`);
    for (const issue of result.errors ?? []) console.error(`  ${issue.path}: ${issue.message}`);
  } catch (error) {
    failures += 1;
    console.error(`ERROR ${path.relative(root, file)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures) {
  console.error(`specialist spec audit: ${failures} invalid file(s)`);
  process.exit(1);
}
console.log(`specialist spec audit OK — ${files.length} file(s)`);
