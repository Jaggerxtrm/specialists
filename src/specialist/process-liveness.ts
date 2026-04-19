import { readFileSync } from 'node:fs';

const PROC_STAT_START_TIME_INDEX = 21;

function isValidPid(pid: number): boolean {
  return Number.isInteger(pid) && pid > 0;
}

function isAliveBySignal(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function parseBootTimeMs(): number | undefined {
  try {
    const procStat = readFileSync('/proc/stat', 'utf-8');
    const bootLine = procStat
      .split('\n')
      .find((line) => line.startsWith('btime '));

    if (!bootLine) return undefined;

    const bootSeconds = Number.parseInt(bootLine.split(/\s+/)[1] ?? '', 10);
    if (!Number.isFinite(bootSeconds) || bootSeconds <= 0) return undefined;

    return bootSeconds * 1_000;
  } catch {
    return undefined;
  }
}

function parseProcessStartTimeMs(pid: number): number | undefined {
  try {
    const statRaw = readFileSync(`/proc/${pid}/stat`, 'utf-8');
    const closeParenIndex = statRaw.lastIndexOf(')');
    if (closeParenIndex < 0) return undefined;

    const suffix = statRaw.slice(closeParenIndex + 1).trim();
    const fields = suffix.split(/\s+/);
    const startTimeTicksText = fields[PROC_STAT_START_TIME_INDEX - 2];
    if (!startTimeTicksText) return undefined;

    const startTimeTicks = Number.parseInt(startTimeTicksText, 10);
    if (!Number.isFinite(startTimeTicks) || startTimeTicks < 0) return undefined;

    const bootTimeMs = parseBootTimeMs();
    if (bootTimeMs === undefined) return undefined;

    const ticksPerSecond = 100;
    return bootTimeMs + Math.floor((startTimeTicks * 1_000) / ticksPerSecond);
  } catch {
    return undefined;
  }
}

export function isProcessAlive(pid: number, startTimeMs?: number): boolean {
  if (!isValidPid(pid)) return false;
  if (!isAliveBySignal(pid)) return false;
  if (startTimeMs === undefined) return true;

  const actualStartTimeMs = parseProcessStartTimeMs(pid);
  if (actualStartTimeMs === undefined) return true;

  return Math.abs(actualStartTimeMs - startTimeMs) <= 2_000;
}
