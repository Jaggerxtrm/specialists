// Forked from xtrm-dev/core@7f6cd7f7
//   packages/pi-extensions/extensions/read-line-numbers/index.ts
//
// SUNSET CONDITION — remove this vendored fork and switch the Specialists
// loader (src/pi/read-line-numbers-extension.ts) to
// `require.resolve('@jaggerxtrm/pi-extensions/read-line-numbers')` once
// @jaggerxtrm/pi-extensions >=0.12 publishes containing the Core blank-line
// numbering fix (interior blank lines carry their line number). Until that
// republish lands, THIS file is the executing implementation for Specialist
// chains and MUST stay in sync with the Core fix — including the interior
// blank-line numbering below (mirrored ahead of Core's republish so specialist
// output cites the right line right now).
//
// read-line-numbers — owns the model-facing transform of Pi's built-in `read`
// tool: every source line is prefixed with its true line number, honoring the
// caller's `offset` so numbering matches the file, not the window position.
//
// Boundaries:
//  - The transform applies ONLY to built-in `read` tool results
//    (discriminated via isReadToolResult). All other tools pass through.
//  - Pi synthetic notices are preserved verbatim — prefixing one would
//    fabricate a false citation. They are recognized by the same discriminants
//    Pi uses: isError for error banners, details.truncation for truncation
//    notices, and the exact notice text Pi appends for user-limit reads.
//  - xtrm-ui remains presentation-only: it renders the already-numbered
//    content unchanged and never re-prefixes.

import { isReadToolResult } from '@earendil-works/pi-coding-agent';

/** Pi appends this notice after a blank separator when the line limit was hit. */
const SHOWING_NOTICE = /^\[Showing lines \d+-\d+ of \d+.*Use offset=\d+ to continue\.\]$/;
/** Pi appends this notice when a user-specified `limit` stopped before EOF. */
const USER_LIMIT_NOTICE = /^\[\d+ more lines in file\. Use offset=\d+ to continue\.\]$/;
/** Pi emits this banner alone when the first line exceeds the byte limit. */
const FIRST_LINE_BANNER = /^\[Line \d+ is .* exceeds .* limit\. Use bash: sed -n '\d+p' .*\]$/;

function isSyntheticNotice(line) {
  return SHOWING_NOTICE.test(line) || USER_LIMIT_NOTICE.test(line) || FIRST_LINE_BANNER.test(line);
}

function numberLines(lines, startLine) {
  // Number every line, including interior blanks — a citation like "line 42"
  // must still resolve when line 42 is empty. A single trailing empty (produced
  // by `'…\n'.split('\n')`) stays unnumbered so the terminating newline is
  // preserved without inventing a phantom line.
  const hasTrailingNewline = lines.length > 1 && lines[lines.length - 1] === '';
  const body = hasTrailingNewline ? lines.slice(0, -1) : lines;
  const numbered = body.map((line, index) => `${startLine + index} | ${line}`).join('\n');
  return hasTrailingNewline ? numbered + '\n' : numbered;
}

/**
 * Number the model-facing text of a `read` tool result.
 *
 * - `startLine` is the 1-based number of the first line (Pi's `offset`, default 1).
 * - `truncated` mirrors `details.truncation.truncated`: when true, Pi appended a
 *   trailing `\n\n[Showing lines ...]` notice that stays verbatim.
 * - Interior blank lines ARE numbered (e.g. `3 | ` for a blank line at true
 *   line 3) so citations resolve to the correct source line. A single trailing
 *   empty produced by a trailing newline stays unnumbered — the terminator is
 *   preserved without fabricating a phantom line beyond EOF.
 */
export function numberReadText(text, startLine, truncated) {
  if (text.length === 0) return text;
  const lines = text.split('\n');
  const last = lines.length - 1;
  if (isSyntheticNotice(lines[last])) {
    // Whole payload is a banner (firstLineExceedsLimit) — keep verbatim.
    if (last === 0) return lines[last];
    // Trailing "\n\n[notice]": number the body, re-append the notice verbatim
    // (the blank separator line stays unnumbered).
    return numberLines(lines.slice(0, last), startLine) + '\n' + lines[last];
  }
  return numberLines(lines, startLine);
}

export default function readLineNumbersExtension(pi) {
  pi.on('tool_result', (event) => {
    // Built-in `read` tool only — never intercept other tools.
    if (!isReadToolResult(event)) return undefined;
    // Error banners ("Offset N is beyond end of file", ...) stay verbatim.
    if (event.isError) return undefined;
    const truncation = event.details?.truncation;
    // The whole payload is the bash-fallback banner, not file content.
    if (truncation?.firstLineExceedsLimit) return undefined;
    // Image / non-text (binary) content: no-op.
    if (event.content.some((item) => item.type !== 'text')) return undefined;

    // Pi's `offset` is 1-based; the first displayed line keeps that number.
    const startLine = event.input.offset != null && event.input.offset > 0 ? event.input.offset : 1;
    const transformed = event.content.map((item) => {
      if (item.type !== 'text') return item;
      const text = item.text;
      if (typeof text !== 'string') return item;
      return { type: 'text', text: numberReadText(text, startLine, truncation?.truncated === true) };
    });
    return { content: transformed };
  });
}
