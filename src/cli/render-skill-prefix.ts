// `specialists render-skill-prefix` — turn-1 /skill: composition emitter (unitAI-qeguh).
//
// Consumed by xtrm-tools (`xt --role`) so it can reuse the exact prefix that
// `sp render-task` bakes into initial_prompt, keeping the sp/xt parity contract
// (unitAI-6639v.1) intact without reimplementing derivation/dedup logic.
import { SpecialistLoader } from '../specialist/loader.js';
import { buildSkillPrefix, type Surface } from '../specialist/task-prompt.js';

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
  if (!name) fail('usage', 'Usage: specialists render-skill-prefix <name> [--surface pi|claude]');
  if (surface !== 'pi' && surface !== 'claude') {
    fail('usage', `--surface must be 'pi' or 'claude' (got '${surface}')`);
  }

  const spec = await new SpecialistLoader().get(name).catch((error: unknown) => {
    fail('specialist_not_found', `specialist '${name}': ${(error as Error)?.message ?? String(error)}`);
  });

  process.stdout.write(`${JSON.stringify({
    ok: true,
    specialist: spec.specialist.metadata.name,
    surface,
    skill_prefix: buildSkillPrefix(spec.specialist, surface),
  }, null, 2)}\n`);
}
