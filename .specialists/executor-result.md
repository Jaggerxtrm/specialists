Implemented ✅ retry logic in `SpecialistRunner` with exponential backoff + jitter, plus schema and helper updates.

### Changed files

- `src/specialist/runner.ts`
  - Added `RunOptions.maxRetries?: number`.
  - Added retry loop around `session.prompt()` + `session.waitForDone()`.
  - Retry policy:
    - max attempts = `1 + maxRetries`
    - `maxRetries` resolved as: `options.maxRetries ?? execution.max_retries ?? 0`
    - exponential backoff: `1s, 2s, 4s...`
    - jitter: ±20%
  - Retries only when:
    - error is transient (`isTransientError(...)`)
    - not `SessionKilledError`
    - not auth-like error (401/403/unauthorized/forbidden/api-key/authentication)
  - Emits retry signal via `onEvent?.('auto_retry')` and progress message.
  - `circuitBreaker.recordFailure(model)` remains only on final failure path (not intermediate retries).

- `src/specialist/schema.ts`
  - Added:
    - `execution.max_retries: z.number().int().min(0).default(0)`

- `src/utils/circuitBreaker.ts`
  - Added exported helper:
    - `isTransientError(error: unknown): boolean`
  - Detects transient conditions via:
    - HTTP status 5xx (`status`/`statusCode`)
    - timeout/network/transient backend patterns

### Tests updated

- `tests/unit/specialist/runner.test.ts`
  - Added:
    - retries transient timeout and succeeds
    - does not retry auth errors
    - circuit breaker failure recorded once after retries exhausted

- `tests/unit/specialist/schema.test.ts`
  - Added assertions:
    - default `execution.max_retries === 0`
    - accepts explicit `execution.max_retries`

- `tests/unit/circuitBreaker.test.ts`
  - Added tests for `isTransientError(...)`

### Validation run

- `npm run lint` ✅
- `npm test -- tests/unit/specialist/runner.test.ts tests/unit/specialist/schema.test.ts tests/unit/circuitBreaker.test.ts` ✅ (39 passed)

---
Context: 24% used (approx, token budget not exposed by runtime)