// `specialists render-skill-prefix` — turn-1 skill-command block emitter (unitAI-qeguh).
//
// Consumed by xtrm-tools (`xt --role`) so it can reuse the exact prefix that
// `sp render-task` bakes into initial_prompt, keeping the sp/xt parity contract
// (unitAI-6639v.1) intact without reimplementing derivation/dedup logic.
//
// Surfaces: pi (`/skill:<name>`), claude (`/<name>`), and the native codex
// surface (K3, unitAI-e67up.2; `$<name>`, experimental until GATE-IFACE).
import { loadSpecialistForSurface, type Surface } from './render-task.js';
import { buildSkillPrefix } from '../specialist/task-prompt.js';

type ErrorCode = 'usage' | 'specialist_not_found';

function fail(code: ErrorCode, message: string): never {
  process.stdout.write(`${JSON.stringify({ ok: false, error: { code, message } }, null, 2)}\n`);
  process.exit(1);
}

export async function run(): Promise<void> {
  const argv = process.argv.slice(3);
  const positional: string[] = [];
  let surface: Surface = 'pi';
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--surface') surface = (argv[++i] ?? 'pi') as Surface;
    else if (!arg.startsWith('-')) positional.push(arg);
  }
  const name = positional[0] ?? '';
  if (!name) fail('usage', 'Usage: specialists render-skill-prefix <name> [--surface pi|claude|codex]');
  if (surface !== 'pi' && surface !== 'claude' && surface !== 'codex') {
    fail('usage', `--surface must be 'pi', 'claude' or 'codex' (got '${surface}')`);
  }

  const spec = await loadSpecialistForSurface(name, surface).catch((error: unknown) => {
    fail('specialist_not_found', `specialist '${name}': ${(error as Error)?.message ?? String(error)}`);
  });

  process.stdout.write(`${JSON.stringify({
    ok: true,
    specialist: spec.specialist.metadata.name,
    surface,
    skill_prefix: buildSkillPrefix(spec.specialist, surface),
  }, null, 2)}\n`);
}
