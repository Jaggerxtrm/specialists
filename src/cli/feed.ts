// src/cli/feed.ts
// Tail events.jsonl for a job. Use --follow to stream live updates.

import { existsSync, readFileSync, statSync, watchFile } from 'node:fs';
import { join } from 'node:path';
import { Supervisor } from '../specialist/supervisor.js';

const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan   = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red    = (s: string) => `\x1b[31m${s}\x1b[0m`;

function formatEvent(line: string): string {
  try {
    const e = JSON.parse(line);
    const ts = new Date(e.t).toISOString().slice(11, 19);
    const type = e.type ?? '?';
    const extra = e.tool ? ` ${cyan(e.tool)}` : e.model ? ` ${dim(e.model)}` : e.message ? ` ${red(e.message)}` : '';
    return `${dim(ts)}  ${type}${extra}`;
  } catch {
    return line;
  }
}

function printLines(content: string, from: number): number {
  const lines = content.split('\n').filter(Boolean);
  for (let i = from; i < lines.length; i++) {
    console.log(formatEvent(lines[i]));
  }
  return lines.length;
}

export async function run(): Promise<void> {
  const argv = process.argv.slice(3);
  let jobId: string | undefined;
  let follow = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--job' && argv[i + 1]) { jobId = argv[++i]; continue; }
    if (argv[i] === '--follow' || argv[i] === '-f') { follow = true; continue; }
    // positional
    if (!jobId && !argv[i].startsWith('--')) jobId = argv[i];
  }

  if (!jobId) {
    console.error('Usage: specialists feed --job <job-id> [--follow]');
    process.exit(1);
  }

  const jobsDir = join(process.cwd(), '.specialists', 'jobs');
  const eventsPath = join(jobsDir, jobId, 'events.jsonl');

  if (!existsSync(eventsPath)) {
    const supervisor = new Supervisor({ runner: null as any, runOptions: null as any, jobsDir });
    if (!supervisor.readStatus(jobId)) {
      console.error(`No job found: ${jobId}`);
      process.exit(1);
    }
    console.log(dim('No events yet.'));
    return;
  }

  const content = readFileSync(eventsPath, 'utf-8');
  let linesRead = printLines(content, 0);

  if (!follow) return;

  // Follow mode: watch file for changes
  process.stderr.write(dim(`Following ${jobId}... (Ctrl+C to stop)\n`));

  await new Promise<void>((resolve) => {
    watchFile(eventsPath, { interval: 500 }, () => {
      try {
        const updated = readFileSync(eventsPath, 'utf-8');
        linesRead = printLines(updated, linesRead);

        // Check if job is done
        const supervisor = new Supervisor({ runner: null as any, runOptions: null as any, jobsDir });
        const status = supervisor.readStatus(jobId!);
        if (status && status.status !== 'running' && status.status !== 'starting') {
          const finalMsg = status.status === 'done'
            ? `\n${yellow('Job complete.')} Run: specialists result ${jobId}`
            : `\n${red(`Job ${status.status}.`)} ${status.error ?? ''}`;
          process.stderr.write(finalMsg + '\n');
          resolve();
        }
      } catch { /* file may be mid-write */ }
    });
  });
}
