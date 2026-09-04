# Specialist role and gate recipes

Use `specialists list --full` to discover the live role set. Pick by work shape rather
than habit.

Typical sequence:

```text
uncertainty about architecture/scope
  -> explorer/planner/critic role

unknown failure cause
  -> debugger

ready implementation contract
  -> executor

production diff
  -> independent test/review/security/obligation gates required by project scrutiny

valid finding
  -> fix with owning implementation role
  -> re-run the affected gate
```

The exact production-diff pipeline is runtime/project policy and can evolve. Do not encode
a permanent ordered list of every role in this reference. Resolve required gates from the
current XTRM/Specialists configuration and contract.

Use a fresh independent reviewer for a final publish decision when the workflow requires
one. Tests are evidence, not a substitute for review; review is not a substitute for
behavioral tests.

Parallelize only roles with genuinely independent mutable scope or read-only evidence
lanes. When one stage consumes the previous stage's changes, use the same verified base
and explicit ordering.