import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function writeFakePiBinary(root: string): string {
  const binDir = join(root, 'bin');
  mkdirSync(binDir, { recursive: true });
  const piPath = join(binDir, 'pi');
  writeFileSync(
    piPath,
    `#!/usr/bin/env node
const { appendFileSync } = require('node:fs');
const args = process.argv.slice(2);
const logPath = process.env.PI_ARGV_LOG;
if (logPath) appendFileSync(logPath, JSON.stringify(args) + '\\n');
const stderrText = process.env.PI_FAKE_STDERR ?? '';
const exitCode = Number(process.env.PI_FAKE_EXIT_CODE ?? '0');
const delayMs = Number(process.env.PI_FAKE_DELAY_MS ?? '25');
const text = process.env.PI_FAKE_RESPONSE ?? JSON.stringify({ message: 'hello', cwd: process.cwd() });
process.stdin.resume();
process.stdin.on('end', () => {
  setTimeout(() => {
    if (stderrText) process.stderr.write(stderrText + '\\n');
    if (exitCode !== 0) process.exit(exitCode);
    const event = { type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text }] } };
    process.stdout.write(JSON.stringify(event) + '\\n');
  }, delayMs);
});
`,
    { mode: 0o755 },
  );
  return piPath;
}

export function readLoggedPiArgv(logPath: string): string[][] {
  return readFileSync(logPath, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line) as string[]);
}

export function getExtensionArgs(argv: readonly string[]): string[] {
  const values: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '-e' && argv[i + 1]) values.push(argv[i + 1]!);
  }
  return values;
}

export function countArg(argv: readonly string[], value: string): number {
  return argv.filter(entry => entry === value).length;
}

