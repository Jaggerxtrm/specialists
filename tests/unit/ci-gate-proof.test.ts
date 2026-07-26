// TEMPORARY — proof that the `tests` workflow fails a pull request on a red suite.
// Bead xtrm-wiy5n.4.26. Removed in the next commit on this branch.
import { describe, expect, it } from 'vitest';

describe('ci gate proof', () => {
  it('fails on purpose so the CI job must go red', () => {
    expect(1).toBe(2);
  });
});
