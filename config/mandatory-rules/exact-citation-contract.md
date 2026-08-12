## Exact citation contract

- Raw Pi `read` content is not line-numbered evidence.
- Do not emit an exact `file:line` claim from raw `read` content, including content returned with an offset, limit, truncation notice, or end-of-file notice.
- Emit an exact `file:line` claim only after a line-number-emitting tool or deterministic verification confirms that exact line against the current file.
- If exact verification is unavailable, cite the file, symbol, section, or a short excerpt without an exact line number.
- Treat blank lines, one-based offsets, limits, truncation boundaries, and end-of-file boundaries as verification inputs. Do not count lines manually.
