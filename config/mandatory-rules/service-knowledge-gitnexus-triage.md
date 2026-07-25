---
name: service-knowledge-gitnexus-triage
kind: mandatory-rule
---
Service-skills drift triage is gitnexus-backed, not string-based. A failed or absent `drift_detector` pre-script (tier=unknown / gitnexus_status=absent|no_ref|cli_error) is NOT license to skip semantic triage: repair gitnexus first (`npx gitnexus analyze`; have the operator run `xt update --apply` if machinery/last_sync_ref is missing), then re-triage. The `audited-and-unchanged` verdict is gitnexus-only — it must cite a gitnexus signal (detect_changes/impact/context) confirming the SKILL.md's Architecture/Data-Flow/Failure-Mode symbols still exist with documented signatures. If gitnexus genuinely cannot run, emit the weaker `synced (string-level only)` verdict, name what was not verified, and flag a follow-up gitnexus pass. Grep/string matching is a secondary cross-check, never the basis for an "unchanged" verdict.
