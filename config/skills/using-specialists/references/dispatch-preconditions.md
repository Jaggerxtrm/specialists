# Dispatch preconditions

Before a dependent Specialist dispatch, verify the state the new worker will actually
receive:

- correct repository/worktree/branch;
- required prior commits/results present;
- no unresolved conflict or dirty state that changes the contract;
- bead is ready and still matches current code;
- no existing worker unexpectedly owns the same mutable surface;
- required tools/package/runtime are healthy enough to start.

Use current `git`, `sp ps`, `git worktree`, XTRM topology, and runtime help as needed.
Do not dispatch from a stale base because the previous job “said it finished.”

If the next lane depends only on a durable result/report rather than source changes,
verify that result exists and is the intended final version before launching the consumer.