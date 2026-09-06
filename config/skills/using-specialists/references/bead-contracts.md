# Specialist contract precondition

The generic work-contract doctrine belongs to XTRM `/using-xtrm` and `/planning`.
Specialists does not maintain a second contract schema.

Before dispatching a Specialist, verify the bead is ready and contains at least:
`PROBLEM`, `SUCCESS`, `SCOPE`, `NON_GOALS`, `CONSTRAINTS`, `VALIDATION`, and `OUTPUT`.
Add role/scrutiny/security/telemetry/rollback details when the task requires them.

A draft or title-only bead is not dispatchable. Repair/promote it through the XTRM
planning workflow, then re-read the final bead from the recipient's point of view.

Do not use `--prompt` or another private message to supply requirements that belong in the
durable contract. A fresh worker should be able to execute from the bead plus referenced
artifacts and current repository state.