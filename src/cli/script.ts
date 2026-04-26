import { spawnSync } from 'node:child_process';
import { SpecialistLoader } from '../specialist/loader.js';
import { runScriptSpecialist, type ScriptGenerateRequest, type ScriptGenerateResult } from '../specialist/script-runner.js';

interface ScriptArgs {
  specialist: string;
  variables: Record<string, string>;
  template?: string;
  modelOverride?: string;
  thinking?: string;
  projectDir: string;
  dbPath?: string;
  timeoutMs?: number;
  json: boolean;
  singleInstance?: string;
  trace: boolean;
}

function parseVar(entry: string): [string, string] {
  const index = entry.indexOf('=');
  if (index <= 0) throw new Error(`Invalid --vars entry: ${entry}`);
  return [entry.slice(0, index), entry.slice(index + 1)];
}

export function parseArgs(argv: string[]): ScriptArgs {
  if (argv.length === 0) throw new Error('Missing specialist name');
  const specialist = argv[0];
  const variables: Record<string, string> = {};
  let template: string | undefined;
  let modelOverride: string | undefined;
  let thinking: string | undefined;
  let projectDir = process.cwd();
  let dbPath: string | undefined;
  let timeoutMs: number | undefined;
  let json = false;
  let singleInstance: string | undefined;
  let trace = true;

  for (let i = 1; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--vars' && argv[i + 1]) {
      const [key, value] = parseVar(argv[++i]);
      variables[key] = value;
    } else if (token === '--template' && argv[i + 1]) template = argv[++i];
    else if (token === '--model' && argv[i + 1]) modelOverride = argv[++i];
    else if (token === '--thinking' && argv[i + 1]) thinking = argv[++i];
    else if ((token === '--project-dir' || token === '--user-dir') && argv[i + 1]) projectDir = argv[++i];
    else if (token === '--db-path' && argv[i + 1]) dbPath = argv[++i];
    else if (token === '--timeout-ms' && argv[i + 1]) timeoutMs = Number(argv[++i]);
    else if (token === '--json') json = true;
    else if (token === '--single-instance' && argv[i + 1]) singleInstance = argv[++i];
    else if (token === '--no-trace') trace = false;
    else if (token === '--vars') throw new Error('Missing value for --vars');
    else if (token === '--template' || token === '--model' || token === '--thinking' || token === '--project-dir' || token === '--user-dir' || token === '--db-path' || token === '--timeout-ms' || token === '--single-instance') {
      throw new Error(`Missing value for ${token}`);
    }
  }

  if (!specialist) throw new Error('Missing specialist name');
  if (Number.isNaN(timeoutMs)) throw new Error('Invalid --timeout-ms value');

  return { specialist, variables, template, modelOverride, thinking, projectDir, dbPath, timeoutMs, json, singleInstance, trace };
}

function buildRequest(args: ScriptArgs): ScriptGenerateRequest {
  return {
    specialist: args.specialist,
    variables: args.variables,
    template: args.template,
    model_override: args.modelOverride,
    thinking_level: args.thinking,
    timeout_ms: args.timeoutMs,
    trace: args.trace,
  };
}

export function mapExitCode(result: ScriptGenerateResult): number {
  if (result.success) return 0;
  switch (result.error_type) {
    case 'specialist_not_found':
    case 'specialist_load_error': return 2;
    case 'template_variable_missing': return 3;
    case 'auth':
    case 'quota': return 4;
    case 'timeout':
    case 'network': return 5;
    case 'invalid_json': return 6;
    case 'output_too_large': return 7;
    default: return 1;
  }
}

function printResult(result: ScriptGenerateResult, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(result));
    return;
  }
  if (result.success) {
    console.log(result.output);
    return;
  }
  console.error(result.error);
}

function runUnderLock(lockPath: string, argv: string[]): number {
  const flock = spawnSync('flock', ['-n', lockPath, 'env', 'SP_SCRIPT_NO_LOCK=1', process.execPath, process.argv[1], 'script', ...argv], {
    encoding: 'utf-8',
    stdio: 'inherit',
  });
  if (flock.status === 0) return 0;
  if (flock.status === 1) return 75;
  return flock.status ?? 1;
}

export async function run(argv: string[] = process.argv.slice(3)): Promise<void> {
  const args = parseArgs(argv);
  if (args.singleInstance && !process.env.SP_SCRIPT_NO_LOCK) {
    process.exit(runUnderLock(args.singleInstance, argv));
  }

  const loader = new SpecialistLoader({ projectDir: args.projectDir });
  const result = await runScriptSpecialist(buildRequest(args), { loader, projectDir: args.projectDir, observabilityDbPath: args.dbPath ?? args.projectDir });
  printResult(result, args.json);
  process.exit(mapExitCode(result));
}

export const scriptCli = { parseArgs, mapExitCode };
