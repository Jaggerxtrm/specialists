import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

export function resolveSpecialistsRoot() {
  let cursor = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 10; depth += 1) {
    if (existsSync(path.join(cursor, 'src', 'specialist', 'schema.ts'))) return cursor;
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }

  try {
    return path.dirname(require.resolve('@jaggerxtrm/specialists/package.json'));
  } catch {
    throw new Error(
      'Cannot locate Specialists source or installed @jaggerxtrm/specialists package. ' +
      'Install the package or run from a Specialists checkout.',
    );
  }
}
