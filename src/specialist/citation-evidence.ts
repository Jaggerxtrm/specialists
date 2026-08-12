import { readFile } from 'node:fs/promises';

export interface CitationLine {
  line: number;
  text: string;
}

export interface VerifiedCitationWindow {
  source: 'deterministic_file_read';
  path: string;
  offset: number;
  totalLines: number;
  lines: CitationLine[];
  complete: boolean;
  truncated: boolean;
  nextOffset?: number;
}

export interface RawPiReadEvidence {
  source: 'raw_pi_read';
  path: string;
  content: string;
  offset?: number;
  limit?: number;
  truncated?: boolean;
}

export interface ExactLineClaim {
  line: number;
  text: string;
}

export type ExactLineCitationResult =
  | { ok: true; citation: string; line: number; text: string }
  | {
    ok: false;
    reason:
      | 'raw_pi_read_unverified'
      | 'line_outside_verified_window'
      | 'line_mismatch'
      | 'stale_snapshot';
  };

export interface VerifiedCitationWindowOptions {
  offset?: number;
  limit?: number;
  maxLines?: number;
  maxBytes?: number;
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return resolved;
}

function safeCitationPath(path: string): string {
  if (/[\u0000-\u001f\u007f]/u.test(path)) {
    throw new TypeError('path must not contain control characters');
  }
  return path;
}

export async function readVerifiedCitationWindow(
  path: string,
  options: VerifiedCitationWindowOptions = {},
): Promise<VerifiedCitationWindow> {
  safeCitationPath(path);
  const offset = positiveInteger(options.offset, 1, 'offset');
  const limit = options.limit === undefined
    ? undefined
    : positiveInteger(options.limit, 1, 'limit');
  const maxLines = positiveInteger(options.maxLines, 2_000, 'maxLines');
  const maxBytes = positiveInteger(options.maxBytes, 50 * 1024, 'maxBytes');
  const content = await readFile(path, 'utf8');
  const sourceLines = content.split('\n');
  const totalLines = sourceLines.length;
  const start = offset - 1;

  if (start >= totalLines) {
    throw new RangeError(`Offset ${offset} is beyond end of file (${totalLines} lines total)`);
  }

  const requestedEnd = limit === undefined
    ? totalLines
    : Math.min(start + limit, totalLines);
  const requestedLines = sourceLines.slice(start, requestedEnd);
  const lines: CitationLine[] = [];
  let bytes = 0;

  for (const [index, text] of requestedLines.entries()) {
    if (lines.length >= maxLines) break;
    const separatorBytes = lines.length === 0 ? 0 : 1;
    const candidateBytes = bytes + separatorBytes + Buffer.byteLength(text, 'utf8');
    if (candidateBytes > maxBytes) break;
    bytes = candidateBytes;
    lines.push({ line: offset + index, text });
  }

  if (requestedLines.length > 0 && lines.length === 0) {
    throw new RangeError(`Line ${offset} exceeds the ${maxBytes}-byte verification limit`);
  }

  const truncated = lines.length < requestedLines.length;
  const consumedThrough = start + lines.length;
  const complete = consumedThrough >= totalLines;

  return {
    source: 'deterministic_file_read',
    path,
    offset,
    totalLines,
    lines,
    complete,
    truncated,
    ...(complete ? {} : { nextOffset: consumedThrough + 1 }),
  };
}

export async function verifyExactLineCitation(
  evidence: VerifiedCitationWindow | RawPiReadEvidence,
  claim: ExactLineClaim,
): Promise<ExactLineCitationResult> {
  if (evidence.source === 'raw_pi_read') {
    return { ok: false, reason: 'raw_pi_read_unverified' };
  }

  const verifiedLine = evidence.lines.find((entry) => entry.line === claim.line);
  if (!verifiedLine) {
    return { ok: false, reason: 'line_outside_verified_window' };
  }
  if (verifiedLine.text !== claim.text) {
    return { ok: false, reason: 'line_mismatch' };
  }

  const currentContent = await readFile(safeCitationPath(evidence.path), 'utf8');
  const currentLine = currentContent.split('\n')[claim.line - 1];
  if (currentLine !== claim.text) {
    return { ok: false, reason: 'stale_snapshot' };
  }

  return {
    ok: true,
    citation: `${evidence.path}:${claim.line}`,
    line: claim.line,
    text: claim.text,
  };
}
