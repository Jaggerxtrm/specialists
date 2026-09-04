---
name: using-specialists-auto
description: >
  Deprecated compatibility alias for older unsupervised Specialists workflows.
  Do not use for new work. Load `using-specialists` for Specialist execution and
  XTRM's starting/resuming and multiplexing skills for continuity, monitoring, and
  multi-agent coordination.
disable-model-invocation: true
---

# Deprecated: using-specialists-auto

This skill no longer owns an independent orchestration protocol.

Older versions duplicated Specialist commands, merge behavior, monitoring loops, and
session-close rules. Those copies drifted from the released runtime and from the
canonical XTRM coordination model.

For new work:

1. Use `/using-xtrm` for the system-level operating contract.
2. Use `/starting-and-resuming-work` for unattended continuation and handoff.
3. Use `/multiplexing` for peer/subagent communication and supervision.
4. Use `/using-specialists` for Specialist-specific dispatch and evidence handling.

If an old prompt explicitly loads this skill, treat it as a request for those canonical
surfaces. Do not execute historical command recipes from older revisions of this file.