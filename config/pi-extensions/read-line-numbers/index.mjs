// Forked from xtrm-dev/core@7f6cd7f7
//   packages/pi-extensions/extensions/read-line-numbers/index.ts
// Sync back when @jaggerxtrm/pi-extensions publishes >=0.12.
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
  return lines
    .map((line, index) => (line === '' ? line : `${startLine + index} | ${line}`))
    .join('\n');
}

/**
 * Number the model-facing text of a `read` tool result.
 *
 * - `startLine` is the 1-based number of the first line (Pi's `offset`, default 1).
 * - `truncated` mirrors `details.truncation.truncated`: when true, Pi appended a
 *   trailing `\n\n[Showing lines ...]` notice that stays verbatim.
 * - Empty lines pass through unnumbered; their index still advances the count,
 *   so a trailing newline leaves the final empty line unnumbered.
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
