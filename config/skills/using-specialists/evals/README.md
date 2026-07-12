# using-specialists evals

Deterministic smoke for QA-routing semantics.

Fixtures:
- `fixtures/qa-routing/source-regression.diff`
- `fixtures/qa-routing/bad-test-result.json`
- `fixtures/qa-routing/source-regression-result.json`
- `fixtures/qa-routing/reviewer-input.json`

Checks:
- test-engineer = primary and secondary writer by mandate
- test-runner = exact-command executor with owner routing
- reviewer = consumes QA evidence plus Iron gates
