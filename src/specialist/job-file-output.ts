export type JobFileOutputMode = 'on' | 'off';

function normalizeMode(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function detectJobFileOutputMode(env: NodeJS.ProcessEnv = process.env): JobFileOutputMode {
  const normalized = normalizeMode(env.SPECIALISTS_JOB_FILE_OUTPUT);
  if (normalized === 'on' || normalized === '1' || normalized === 'true') return 'on';
  if (normalized === 'off' || normalized === '0' || normalized === 'false') return 'off';
  return 'off';
}

export function isJobFileOutputEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return detectJobFileOutputMode(env) === 'on';
}
