// src/cli/models.ts

import { spawnSync } from 'node:child_process';
import { SpecialistLoader } from '../specialist/loader.js';

// ── ANSI helpers ───────────────────────────────────────────────────────────────
const bold   = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim    = (s: string) => `\x1b[2m${s}\x1b[0m`;
const cyan   = (s: string) => `\x1b[36m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const green  = (s: string) => `\x1b[32m${s}\x1b[0m`;

interface PiModel {
  provider: string;
  model:    string;
  context:  string;
  maxOut:   string;
  thinking: boolean;
  images:   boolean;
}

function parsePiModels(): PiModel[] | null {
  const r = spawnSync('pi', ['--list-models'], {
    encoding: 'utf8',
    stdio: 'pipe',
    timeout: 8000,
  });
  if (r.status !== 0 || r.error) return null;

  return r.stdout
    .split('\n')
    .slice(1)                      // skip header
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const cols = line.split(/\s+/);
      return {
        provider: cols[0] ?? '',
        model:    cols[1] ?? '',
        context:  cols[2] ?? '',
        maxOut:   cols[3] ?? '',
        thinking: cols[4] === 'yes',
        images:   cols[5] === 'yes',
      };
    })
    .filter(m => m.provider && m.model);
}

function parseArgs(argv: string[]): { provider?: string; used?: boolean } {
  const out: { provider?: string; used?: boolean } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--provider' && argv[i + 1]) { out.provider = argv[++i]; continue; }
    if (argv[i] === '--used') { out.used = true; continue; }
  }
  return out;
}

export async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(3));

  // Load specialists to know which models are in use
  const loader = new SpecialistLoader();
  const specialists = await loader.list();

  // Build map: "provider/model" → specialist names
  const usedBy = new Map<string, string[]>();
  for (const s of specialists) {
    const key = s.model; // already stored as "provider/model"
    if (!usedBy.has(key)) usedBy.set(key, []);
    usedBy.get(key)!.push(s.name);
  }

  const allModels = parsePiModels();
  if (!allModels) {
    console.error('pi not found or failed — install and configure pi first');
    process.exit(1);
  }

  // Filter
  let models = allModels;
  if (args.provider) {
    models = models.filter(m => m.provider.toLowerCase().includes(args.provider!.toLowerCase()));
  }
  if (args.used) {
    models = models.filter(m => usedBy.has(`${m.provider}/${m.model}`));
  }

  if (models.length === 0) {
    console.log('No models match.');
    return;
  }

  // Group by provider
  const byProvider = new Map<string, PiModel[]>();
  for (const m of models) {
    if (!byProvider.has(m.provider)) byProvider.set(m.provider, []);
    byProvider.get(m.provider)!.push(m);
  }

  const total = models.length;
  console.log(`\n${bold(`Models on pi`)}  ${dim(`(${total} total)`)}\n`);

  for (const [provider, pModels] of byProvider) {
    console.log(`  ${cyan(provider)}  ${dim(`${pModels.length} model${pModels.length !== 1 ? 's' : ''}`)}`);

    const modelWidth = Math.max(...pModels.map(m => m.model.length));

    for (const m of pModels) {
      const key       = `${m.provider}/${m.model}`;
      const inUse     = usedBy.get(key);
      const flags     = [
        m.thinking ? green('thinking') : dim('·'),
        m.images   ? dim('images')    : '',
      ].filter(Boolean).join('  ');
      const ctx       = dim(`ctx ${m.context}`);
      const usedLabel = inUse ? `  ${yellow('←')} ${dim(inUse.join(', '))}` : '';

      console.log(`    ${m.model.padEnd(modelWidth)}  ${ctx.padEnd(18)}  ${flags}${usedLabel}`);
    }
    console.log();
  }

  if (!args.used) {
    console.log(dim(`  --provider <name>  filter by provider`));
    console.log(dim(`  --used             only show models used by your specialists`));
    console.log();
  }
}
