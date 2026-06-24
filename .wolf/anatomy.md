> Manual update: 2026-06-24T18:06:42Z — unitAI-xsrpn added redacted Gitleaks historical baseline and wired CI scans to --baseline-path so new leaks still fail while acknowledged history debt no longer blocks push.
> Manual update: 2026-06-24T14:12:00Z — unitAI-p1ecm fixed release-gate co-vendoring dispatch to xtrm-dev/core via gh api raw JSON and v<package_version> tag payload.
> Manual update: 2026-06-24T13:17:54Z — unitAI-fgpxv corrected pi-coding-agent ownership/package references to earendil-works in README, bootstrap/service docs, and sp init prerequisite hints.
> Manual update: 2026-06-22T11:42:39Z — unitAI-u3vjh bumps hono to 4.12.26 and vite to 8.0.16; package-lock regeneration required moving vite to devDependencies and removing direct-dep overrides that conflicted with npm package-lock-only regeneration.
> Manual update: 2026-06-21T22:55:20Z — unitAI-qrr21 hardens trusted script-specialist terminal JSON recovery: when PiAgentSession getLastOutput() returns raw tool-call markup, script-runner now prefers the last streamed assistant message and preserves one-turn JSON repair semantics.
> Manual update: 2026-06-21T02:41:59Z — unitAI-q5t29 security hardening: sp script now requires explicit opt-ins for local scripts/write-capable specialists, and PiAgentSession Serena pre-spawn now uses an isolated helper subprocess instead of async global process.env mutation.
# anatomy.md
> Manual update: 2026-05-26T23:12:00Z — unitAI-dkhi3 fixed PR #99 follow-up: package overrides now force qs 6.15.2 in bun.lock, and supervisor stop/resume telemetry is best-effort so SQLite failures do not block control actions.
> Manual update: 2026-05-27T00:00:00Z — unitAI-q5slu added docs/design/substrate-review.md with substrate review decisions covering turn/tick hierarchy, issue-backed workflow steps, channels, pulses, and dispatch examples.
> Manual update: 2026-05-23T13:30:00Z — unitAI-6x6p6 merged supervisor read-time dead-job reconciliation, added regression test, updated CHANGELOG and 2026-05-23 session report.
> Manual update: 2026-05-15T18:39:00Z — unitAI-ashu1 updated config/skills/using-specialists-v3/SKILL.md to clarify clean worktree dependency bootstrap responsibility; do not track node_modules/.venv.

> Manual update: 2026-06-01T18:09:38Z — unitAI-60w93.1 added docs/telemetry/forensic-event-contract.md as xtrm.forensic.v1 shared telemetry envelope SSOT; created follow-ups 60w93.2-.5.
> Manual update: 2026-06-02T11:24:41Z — unitAI-5537g aligned substrate/vault design with xtrm.forensic.v1: added Activation/Run identity, telemetry fabric §2.8, channel participant_id mapping, and participant_role contract examples.
> Manual update: 2026-06-02T12:11:00Z — unitAI-60w93.5 added docs/telemetry/prometheus-projection-contract.md and linked it from forensic/observability docs; follow-ups 60w93.6-.7 created.
> Auto-maintained by OpenWolf. Last scanned: 2026-04-01T04:04:51.100Z
> Files: 531 tracked | Anatomy hits: 0 | Misses: 0
> Manual update: 2026-05-13T12:11:27+00:00 — unitAI-sv0v2 updated docs/pi-session.md and docs/specialists-service.md for Pi isolation flags.
> Manual update: 2026-05-14T01:06:48Z — updated 2026-05-13c session report with late bug-hygiene closures and cleanup state.
> Manual update: 2026-05-15T00:47:00Z — unitAI-i4sz0 added security pipeline configs, CI workflows, local hooks, and security audit scripts.
> Manual update: 2026-05-15T01:03:00Z — unitAI-4r9sf pinned OSV Scanner action to v2.3.8 in live workflow and security-pipeline template.
> Manual update: 2026-05-15T01:09:00Z — unitAI-4r9sf added package overrides and synced bun.lock to clear OSV advisories.
> Manual update: 2026-05-15T01:12:00Z — unitAI-k9ba7 pinned safe Python dependency lower bounds in requirements.txt for OSV action parity.
> Manual update: 2026-05-15T01:29:00Z — unitAI-agdgr fixed Docker image builds by copying config and asset-contract generator into builder context.
> Manual update: 2026-05-15T01:35:00Z — unitAI-fxnei triaged npm Dependabot PRs and identified Zod 4 / TypeScript 6 migrations.
> Manual update: 2026-05-15T09:18:00Z — unitAI-3kt0b fixed release-gate dispatch payload keys and refreshed XTRM_TOOLS_DISPATCH_PAT; xtrm-tools repository_dispatch validation succeeded.

## ./

- `.gitattributes` — Git attributes (~47 tok)
- `.gitignore` — Git ignore rules (~175 tok)
- `.mcp copy.json` (~54 tok)
- `.mcp.json` (~211 tok)
- `.npmignore` — Esclude TUTTO ciò che non è necessario per il funzionamento dell'MCP server (~308 tok)
- `.gitleaks.toml` — Gitleaks allowlist for repo-local runtime state and known non-secret placeholders.
- `.pre-commit-config.yaml` — Local pre-commit/pre-push security and hygiene hook configuration.
- `.semgrepignore` — Semgrep exclusions for generated/runtime artifacts with security-pipeline source re-included.
- `.session-meta.json` (~19 tok)
- `AGENTS.md` — XTRM Agent Workflow (~4137 tok)
- `bunfig.toml` (~7 tok)
- `CHANGELOG.md` — Change log (~8386 tok)
- `CLAUDE.md` — OpenWolf (~4115 tok)
- `package-lock.json` — npm lock file (~37336 tok)
- `package.json` — Node.js package manifest (~421 tok)
- `PARITY-ANALYSIS.md` — Specialists ↔ xtrm-tools Parity Analysis (~3805 tok)
- `README.md` — Project documentation (~1508 tok)
- `requirements.txt` — Python dependencies (~8 tok)
- `ROADMAP.md` — Specialists Roadmap (~1867 tok)
- `SECURITY-PIPELINE.md` — Security baseline setup, local install, scan commands, and GitHub follow-up.
- `run-dashboard-workflow.js` — Workflow Execution Script for User Activity Dashboard Feature (~1603 tok)
- `settings.json` (~26 tok)
- `test_registration.ts` — Declares test (~83 tok)
- `tsconfig.json` — TypeScript configuration (~130 tok)
- `vitest.config.ts` — Vitest test configuration (~207 tok)

## .agents/skills/

- `README.txt` — Local Agent Skills (~412 tok)

## .agents/skills/clean-code/

- `SKILL.md` — Clean Code - Pragmatic AI Coding Standards (~1650 tok)

## .agents/skills/creating-service-skills/

- `SKILL.md` — Creating Service Skills (~4295 tok)

## .agents/skills/creating-service-skills/references/

- `script_quality_standards.md` — Script Quality Standards for Service Skills (~3783 tok)
- `service_skill_system_guide.md` — Service Skill System: Architecture & Operations Guide (~2872 tok)

## .agents/skills/creating-service-skills/scripts/

- `bootstrap.py` — /*", "").replace("/**", "").rstrip("/") (~2600 tok)
- `deep_dive.py` — API router (~3264 tok)
- `scaffolder.py` — scaffold_service_skill, write_skill_md, write_script_stubs, check_container + 6 more (~4288 tok)

## .agents/skills/delegating/

- `config.yaml` — Delegation Configuration (~2096 tok)
- `SKILL.md` — Delegating Tasks (~1696 tok)

## .agents/skills/delegating/references/

- `orchestration-protocols.md` — Multi-Agent Orchestration Protocols (~551 tok)

## .agents/skills/docker-expert/

- `SKILL.md` — Docker Expert (~3511 tok)

## .agents/skills/documenting/

- `CHANGELOG.md` — Change log (~156 tok)
- `README.md` — Project documentation (~1023 tok)
- `SKILL.md` — Documenting Skill (~1039 tok)

## .agents/skills/documenting/examples/

- `example_pattern.md` — Purpose (~482 tok)
- `example_reference.md` — Purpose (~429 tok)
- `example_ssot_analytics.md` — Purpose (~539 tok)
- `example_workflow.md` — Example Workflow: Documenting a New Feature (~810 tok)

## .agents/skills/documenting/references/

- `changelog-format.md` — CHANGELOG Format Reference (~497 tok)
- `metadata-schema.md` — SSOT Metadata Schema (~988 tok)
- `taxonomy.md` — SSOT Taxonomy & Naming Conventions (~754 tok)
- `versioning-rules.md` — Versioning Rules for SSOT (~603 tok)

## .agents/skills/documenting/scripts/

- `bump_version.sh` — Semantic version bumping utility for SSOT memories (~394 tok)
- `drift_detector.py` — find_project_root, get_memories_dir, extract_frontmatter, extract_tracks + 10 more (~2400 tok)
- `generate_template.py` — generate_timestamp, generate_date, generate_template, main (~1729 tok)
- `list_by_category.sh` — List Serena memories filtered by category suffix (~718 tok)
- `orchestrator.py` — ChangeType: document_change, validate_all, main (~2460 tok)
- `validate_metadata.py` — extract_headings, generate_index_table, inject_index, extract_frontmatter + 5 more (~2300 tok)

## .agents/skills/documenting/scripts/changelog/

- `__init__.py` (~0 tok)
- `add_entry.py` — ChangeCategory: add_entry, add_entry_to_file, main (~1886 tok)
- `bump_release.py` — bump_release, bump_release_file, main (~980 tok)
- `init_changelog.py` — Initialize a new CHANGELOG.md file. (~511 tok)
- `validate_changelog.py` — validate_changelog, validate_file, main (~1008 tok)

## .agents/skills/documenting/templates/

- `CHANGELOG.md.template` — Changelog (~91 tok)

## .agents/skills/documenting/tests/

- `integration_test.sh` — Integration test for documenting skill workflows (~656 tok)
- `test_changelog.py` — Tests for CHANGELOG management scripts. (~1445 tok)
- `test_drift_detector.py` — /*.ts" (~622 tok)
- `test_orchestrator.py` — Tests for documentation orchestrator. (~420 tok)
- `test_validate_metadata.py` — Tests: extract_headings, generate_index_table, inject_index_replaces_existing, inject_index_adds_when_missing (~530 tok)

## .agents/skills/find-skills/

- `SKILL.md` — Find Skills (~1157 tok)

## .agents/skills/gitnexus-exploring/

- `SKILL.md` — Exploring Codebases with GitNexus (~671 tok)

## .agents/skills/gitnexus-impact-analysis/

- `SKILL.md` — Impact Analysis with GitNexus (~671 tok)

## .agents/skills/gitnexus-refactoring/

- `SKILL.md` — Refactoring with GitNexus (~971 tok)

## .agents/skills/hook-development/

- `SKILL.md` — Hook Development for Claude Code Plugins (~4830 tok)

## .agents/skills/hook-development/examples/

- `load-context.sh` — Example SessionStart hook for loading project context (~479 tok)
- `quality-check.js` — React App Quality Check Hook (~10527 tok)
- `validate-bash.sh` — Example PreToolUse hook for validating Bash commands (~373 tok)
- `validate-write.sh` — Example PreToolUse hook for validating Write/Edit operations (~350 tok)

## .agents/skills/hook-development/references/

- `advanced.md` — Advanced Hook Use Cases (~2820 tok)
- `migration.md` — Migrating from Basic to Advanced Hooks (~2054 tok)
- `patterns.md` — Common Hook Patterns (~2225 tok)

## .agents/skills/hook-development/scripts/

- `hook-linter.sh` — Hook Linter (~1137 tok)
- `README.md` — Project documentation (~920 tok)
- `test-hook.sh` — Hook Testing Helper (~1470 tok)
- `validate-hook-schema.sh` — Hook Schema Validator (~1414 tok)

## .agents/skills/obsidian-cli/

- `SKILL.md` — Obsidian CLI (~795 tok)

## .agents/skills/orchestrating-agents/

- `config.yaml` — Orchestration Configuration (~438 tok)
- `SKILL.md` — Orchestrating Agents (~1340 tok)

## .agents/skills/orchestrating-agents/references/

- `agent-context-integration.md` — AgentContext Integration (~283 tok)
- `examples.md` — Handshake Examples (~310 tok)
- `handover-protocol.md` — Handover Protocol (~349 tok)
- `workflows.md` — Multi-Turn Orchestration Workflows (~537 tok)

## .agents/skills/orchestrating-agents/scripts/

- `detect_neighbors.py` — check_command, main (~171 tok)

## .agents/skills/planning/

- `SKILL.md` — Planning (~3355 tok)

## .agents/skills/planning/evals/

- `evals.json` (~424 tok)

## .agents/skills/prompt-improving/

- `README.md` — Project documentation (~1139 tok)
- `SKILL.md` — Prompt Improver ( /prompt-improving ) (~815 tok)

## .agents/skills/prompt-improving/references/

- `analysis_commands.md` — Analysis Frameworks (~137 tok)
- `chain_of_thought.md` — Chain of Thought (CoT) (~134 tok)
- `mcp_definitions.md` — MCP Tool Definitions (~128 tok)
- `multishot.md` — Multishot Prompting (~143 tok)
- `xml_core.md` — XML Tags for Clarity & Structure (~444 tok)

## .agents/skills/python-testing/

- `SKILL.md` — Python Testing Patterns (~4688 tok)

## .agents/skills/scoping-service-skills/

- `SKILL.md` — Scoping Service Skills ( /scope ) (~1724 tok)

## .agents/skills/scoping-service-skills/scripts/

- `scope.py` — find_registry, main (~656 tok)

## .agents/skills/senior-backend/

- `SKILL.md` — Senior Backend (~1136 tok)

## .agents/skills/senior-backend/references/

- `api_design_patterns.md` — Api Design Patterns (~403 tok)
- `backend_security_practices.md` — Backend Security Practices (~405 tok)
- `database_optimization_guide.md` — Database Optimization Guide (~405 tok)

## .agents/skills/senior-backend/scripts/

- `api_load_tester.py` — ApiLoadTester: run, validate_target, analyze, generate_report + 1 more (~888 tok)
- `api_scaffolder.py` — ApiScaffolder: run, validate_target, analyze, generate_report + 1 more (~888 tok)
- `database_migration_tool.py` — DatabaseMigrationTool: run, validate_target, analyze, generate_report + 1 more (~900 tok)

## .agents/skills/senior-data-scientist/

- `SKILL.md` — Senior Data Scientist (~1408 tok)

## .agents/skills/senior-data-scientist/references/

- `experiment_design_frameworks.md` — Experiment Design Frameworks (~359 tok)
- `feature_engineering_patterns.md` — Feature Engineering Patterns (~359 tok)
- `statistical_methods_advanced.md` — Statistical Methods Advanced (~359 tok)

## .agents/skills/senior-data-scientist/scripts/

- `experiment_designer.py` — ExperimentDesigner: validate_config, process, main (~796 tok)
- `feature_engineering_pipeline.py` — FeatureEngineeringPipeline: validate_config, process, main (~808 tok)
- `model_evaluation_suite.py` — ModelEvaluationSuite: validate_config, process, main (~800 tok)

## .agents/skills/senior-devops/

- `SKILL.md` — Senior Devops (~1118 tok)

## .agents/skills/senior-devops/references/

- `cicd_pipeline_guide.md` — Cicd Pipeline Guide (~403 tok)
- `deployment_strategies.md` — Deployment Strategies (~403 tok)
- `infrastructure_as_code.md` — Infrastructure As Code (~404 tok)

## .agents/skills/senior-devops/scripts/

- `deployment_manager.py` — DeploymentManager: run, validate_target, analyze, generate_report + 1 more (~893 tok)
- `pipeline_generator.py` — PipelineGenerator: run, validate_target, analyze, generate_report + 1 more (~893 tok)
- `terraform_scaffolder.py` — TerraformScaffolder: run, validate_target, analyze, generate_report + 1 more (~896 tok)

## .agents/skills/senior-security/

- `SKILL.md` — Senior Security (~1133 tok)

## .agents/skills/senior-security/references/

- `cryptography_implementation.md` — Cryptography Implementation (~406 tok)
- `penetration_testing_guide.md` — Penetration Testing Guide (~405 tok)
- `security_architecture_patterns.md` — Security Architecture Patterns (~407 tok)

## .agents/skills/senior-security/scripts/

- `pentest_automator.py` — PentestAutomator: run, validate_target, analyze, generate_report + 1 more (~892 tok)
- `security_auditor.py` — SecurityAuditor: run, validate_target, analyze, generate_report + 1 more (~891 tok)
- `threat_modeler.py` — ThreatModeler: run, validate_target, analyze, generate_report + 1 more (~888 tok)

## .agents/skills/skill-creator/

- `LICENSE.txt` — Declares name (~2840 tok)
- `SKILL.md` — Skill Creator (~8048 tok)

## .agents/skills/skill-creator/agents/

- `analyzer.md` — Post-hoc Analyzer Agent (~2594 tok)
- `comparator.md` — Blind Comparator Agent (~1821 tok)
- `grader.md` — Grader Agent (~2258 tok)

## .agents/skills/skill-creator/assets/

- `eval_review.html` — Eval Set Review - __SKILL_NAME_PLACEHOLDER__ (~1883 tok)

## .agents/skills/skill-creator/eval-viewer/

- `generate_review.py` — Generate and serve a review page for eval results. (~4656 tok)
- `viewer.html` — Eval Review (~11994 tok)

## .agents/skills/skill-creator/references/

- `schemas.md` — JSON Schemas (~3015 tok)

## .agents/skills/skill-creator/scripts/

- `__init__.py` (~0 tok)
- `aggregate_benchmark.py` — calculate_stats, load_run_results, aggregate_results, generate_benchmark + 1 more (~4082 tok)
- `generate_report.py` — Generate an HTML report from run_loop.py output. (~3668 tok)
- `improve_description.py` — Improve a skill description based on eval results. (~3063 tok)
- `package_skill.py` — should_exclude, package_skill, main (~1205 tok)
- `quick_validate.py` — validate_skill (~1135 tok)
- `run_eval.py` — Run trigger evaluation for a skill description. (~3276 tok)
- `run_loop.py` — Run the eval + improve loop until all pass or max iterations reached. (~3910 tok)
- `utils.py` — Shared utilities for skill-creator scripts. (~475 tok)

## .agents/skills/specialists-creator/

- `SKILL.md` — Specialist Author Guide (~4755 tok)

## .agents/skills/specialists-creator/scripts/

- `validate-specialist.ts` — Declares printUsage (~332 tok)

## .agents/skills/sync-docs-workspace/iteration-1/

- `benchmark.json` (~3036 tok)
- `benchmark.md` — Skill Benchmark: sync-docs (~95 tok)

## .agents/skills/sync-docs-workspace/iteration-1/eval-doc-audit/

- `eval_metadata.json` (~342 tok)

## .agents/skills/sync-docs-workspace/iteration-1/eval-doc-audit/with_skill/outputs/

- `result.md` — Doc Audit Report — xtrm-tools (~2561 tok)

## .agents/skills/sync-docs-workspace/iteration-1/eval-doc-audit/with_skill/run-1/

- `grading.json` (~454 tok)
- `timing.json` (~23 tok)

## .agents/skills/sync-docs-workspace/iteration-1/eval-doc-audit/without_skill/

- `timing.json` (~25 tok)

## .agents/skills/sync-docs-workspace/iteration-1/eval-doc-audit/without_skill/outputs/

- `result.md` — Doc Audit: README.md vs docs/ (~1741 tok)

## .agents/skills/sync-docs-workspace/iteration-1/eval-doc-audit/without_skill/run-1/

- `grading.json` (~463 tok)
- `timing.json` (~25 tok)

## .agents/skills/sync-docs-workspace/iteration-1/eval-fix-mode/

- `eval_metadata.json` (~282 tok)

## .agents/skills/sync-docs-workspace/iteration-1/eval-fix-mode/with_skill/outputs/

- `result.md` — sync-docs --fix Run Summary (~1579 tok)

## .agents/skills/sync-docs-workspace/iteration-1/eval-fix-mode/with_skill/run-1/

- `grading.json` (~371 tok)
- `timing.json` (~23 tok)

## .agents/skills/sync-docs-workspace/iteration-1/eval-fix-mode/without_skill/outputs/

- `result.md` — sync-docs --fix — Execution Summary (~1162 tok)

## .agents/skills/sync-docs-workspace/iteration-1/eval-fix-mode/without_skill/run-1/

- `grading.json` (~436 tok)
- `timing.json` (~23 tok)

## .agents/skills/sync-docs-workspace/iteration-1/eval-sprint-closeout/

- `eval_metadata.json` (~359 tok)

## .agents/skills/sync-docs-workspace/iteration-1/eval-sprint-closeout/with_skill/outputs/

- `result.md` — sync-docs Eval: Sprint Closeout (~3082 tok)

## .agents/skills/sync-docs-workspace/iteration-1/eval-sprint-closeout/with_skill/run-1/

- `grading.json` (~430 tok)
- `timing.json` (~23 tok)

## .agents/skills/sync-docs-workspace/iteration-1/eval-sprint-closeout/without_skill/outputs/

- `result.md` — Doc Sync Report — Sprint Closeout (2026-03-18) (~1604 tok)

## .agents/skills/sync-docs-workspace/iteration-1/eval-sprint-closeout/without_skill/run-1/

- `grading.json` (~424 tok)
- `timing.json` (~23 tok)

## .agents/skills/sync-docs-workspace/iteration-2/

- `benchmark.json` (~4370 tok)
- `benchmark.md` — Skill Benchmark: sync-docs (~98 tok)

## .agents/skills/sync-docs-workspace/iteration-2/eval-doc-audit/

- `eval_metadata.json` (~208 tok)

## .agents/skills/sync-docs-workspace/iteration-2/eval-doc-audit/with_skill/outputs/

- `result.md` — Doc Audit Report — xtrm-tools (~1773 tok)

## .agents/skills/sync-docs-workspace/iteration-2/eval-doc-audit/with_skill/run-1/

- `grading.json` (~1536 tok)
- `timing.json` (~23 tok)

## .agents/skills/sync-docs-workspace/iteration-2/eval-doc-audit/without_skill/outputs/

- `result.md` — Doc Audit: README.md vs docs/ (~1669 tok)

## .agents/skills/sync-docs-workspace/iteration-2/eval-doc-audit/without_skill/run-1/

- `grading.json` — Declares of (~1378 tok)
- `timing.json` (~23 tok)

## .agents/skills/sync-docs-workspace/iteration-2/eval-fix-mode/

- `eval_metadata.json` (~197 tok)

## .agents/skills/sync-docs-workspace/iteration-2/eval-fix-mode/with_skill/outputs/

- `result.md` — sync-docs --fix Evaluation Result (~1822 tok)

## .agents/skills/sync-docs-workspace/iteration-2/eval-fix-mode/with_skill/run-1/

- `grading.json` (~1071 tok)
- `timing.json` (~23 tok)

## .agents/skills/sync-docs-workspace/iteration-2/eval-fix-mode/without_skill/outputs/

- `result.md` — sync-docs --fix: Evaluation Result (without_skill) (~1603 tok)

## .agents/skills/sync-docs-workspace/iteration-2/eval-fix-mode/without_skill/run-1/

- `grading.json` (~1369 tok)
- `timing.json` (~26 tok)

## .agents/skills/sync-docs-workspace/iteration-2/eval-sprint-closeout/

- `eval_metadata.json` (~254 tok)

## .agents/skills/sync-docs-workspace/iteration-2/eval-sprint-closeout/with_skill/outputs/

- `result.md` — sync-docs Skill Evaluation: Sprint Closeout (~2362 tok)

## .agents/skills/sync-docs-workspace/iteration-2/eval-sprint-closeout/with_skill/run-1/

- `grading.json` (~1791 tok)
- `timing.json` (~23 tok)

## .agents/skills/sync-docs-workspace/iteration-2/eval-sprint-closeout/without_skill/outputs/

- `result.md` — Documentation Sync Report — Sprint Closeout (~2670 tok)

## .agents/skills/sync-docs-workspace/iteration-2/eval-sprint-closeout/without_skill/run-1/

- `grading.json` (~1650 tok)
- `timing.json` (~26 tok)

## .agents/skills/sync-docs-workspace/iteration-3/

- `benchmark.json` (~4313 tok)
- `benchmark.md` — Skill Benchmark: sync-docs (~97 tok)

## .agents/skills/sync-docs-workspace/iteration-3/eval-doc-audit/

- `eval_metadata.json` (~208 tok)

## .agents/skills/sync-docs-workspace/iteration-3/eval-doc-audit/with_skill/outputs/

- `result.md` — Doc Audit — xtrm-tools (~1556 tok)

## .agents/skills/sync-docs-workspace/iteration-3/eval-doc-audit/with_skill/run-1/

- `grading.json` (~1627 tok)
- `timing.json` (~26 tok)

## .agents/skills/sync-docs-workspace/iteration-3/eval-doc-audit/without_skill/outputs/

- `result.md` — Doc Audit: README.md vs docs/ (~1919 tok)

## .agents/skills/sync-docs-workspace/iteration-3/eval-doc-audit/without_skill/run-1/

- `grading.json` (~1446 tok)
- `timing.json` (~25 tok)

## .agents/skills/sync-docs-workspace/iteration-3/eval-fix-mode/

- `eval_metadata.json` (~197 tok)

## .agents/skills/sync-docs-workspace/iteration-3/eval-fix-mode/with_skill/outputs/

- `result.md` — Command Run (~900 tok)

## .agents/skills/sync-docs-workspace/iteration-3/eval-fix-mode/with_skill/run-1/

- `grading.json` (~1344 tok)
- `timing.json` (~26 tok)

## .agents/skills/sync-docs-workspace/iteration-3/eval-fix-mode/without_skill/outputs/

- `result.md` — sync-docs --fix — Result (~909 tok)

## .agents/skills/sync-docs-workspace/iteration-3/eval-fix-mode/without_skill/run-1/

- `grading.json` (~1332 tok)
- `timing.json` (~26 tok)

## .agents/skills/sync-docs-workspace/iteration-3/eval-sprint-closeout/

- `eval_metadata.json` (~254 tok)

## .agents/skills/sync-docs-workspace/iteration-3/eval-sprint-closeout/with_skill/outputs/

- `phase1_context.json` (~4518 tok)
- `phase2_drift.txt` (~254 tok)
- `phase3_analysis.json` (~719 tok)
- `phase4_fix.txt` (~658 tok)
- `phase5_validate.txt` (~169 tok)
- `result.md` — Sprint Closeout — sync-docs Eval (Iteration 3) (~1973 tok)

## .agents/skills/sync-docs-workspace/iteration-3/eval-sprint-closeout/with_skill/run-1/

- `grading.json` (~2086 tok)
- `timing.json` (~26 tok)

## .agents/skills/sync-docs-workspace/iteration-3/eval-sprint-closeout/without_skill/outputs/

- `result.md` — Doc Sync Result — Sprint Closeout (without sync-docs skill) (~1059 tok)

## .agents/skills/sync-docs-workspace/iteration-3/eval-sprint-closeout/without_skill/run-1/

- `grading.json` (~1670 tok)
- `timing.json` (~26 tok)

## .agents/skills/sync-docs/

- `SKILL.md` — sync-docs (~2164 tok)

## .agents/skills/sync-docs/evals/

- `evals.json` (~1295 tok)

## .agents/skills/sync-docs/references/

- `doc-structure.md` — docs/ Structure Guide (~757 tok)
- `schema.md` — docs/ File Schema (~765 tok)

## .agents/skills/sync-docs/scripts/

- `context_gatherer.py` — run, find_project_root, find_main_repo_root, ensure_dolt_server + 7 more (~2069 tok)
- `doc_structure_analyzer.py` — /*.mjs", "policies/*.json"]), (~5329 tok)
- `drift_detector.py` — find_project_root, get_docs_files, extract_frontmatter, extract_globs + 12 more (~5232 tok)
- `validate_doc.py` — extract_frontmatter, extract_headings, make_anchor, generate_index_table + 6 more (~3542 tok)
- `validate_metadata.py` — extract_headings, generate_index_table, inject_index, extract_frontmatter + 5 more (~1618 tok)

## .agents/skills/sync-docs/scripts/changelog/

- `add_entry.py` — ChangeCategory: add_entry, add_entry_to_file, main (~1886 tok)

## .agents/skills/test-planning/

- `SKILL.md` — Test Planning (~5472 tok)

## .agents/skills/test-planning/evals/

- `evals.json` (~819 tok)

## .agents/skills/updating-service-skills/

- `SKILL.md` — Updating Service Skills (~935 tok)

## .agents/skills/updating-service-skills/scripts/

- `drift_detector.py` — URL configuration (~2064 tok)

## .agents/skills/using-quality-gates/

- `SKILL.md` — Using Quality Gates (~1804 tok)

## .agents/skills/using-serena-lsp/

- `README.md` — Project documentation (~58 tok)
- `REFERENCE.md` — Serena Tool Reference (~1123 tok)
- `SKILL.md` — Using Serena LSP Workflow (~912 tok)

## .agents/skills/using-service-skills/

- `SKILL.md` — Using Service Skills (~742 tok)

## .agents/skills/using-service-skills/scripts/

- `cataloger.py` — generate_catalog, main (~689 tok)
- `skill_activator.py` — match_territory, find_service_for_file, find_service_for_command, build_context + 1 more (~1526 tok)
- `test_skill_activator.py` — Tests for skill_activator.py — load_registry integration. (~531 tok)

## .agents/skills/using-service-skills/scripts/.pytest_cache/

- `.gitignore` — Git ignore rules (~10 tok)
- `CACHEDIR.TAG` (~51 tok)
- `README.md` — Project documentation (~76 tok)

## .agents/skills/using-service-skills/scripts/.pytest_cache/v/cache/

- `lastfailed` (~1 tok)
- `nodeids` (~57 tok)

## .agents/skills/using-specialists/

- `SKILL.md` — Specialists Usage (~1784 tok)

## .agents/skills/using-specialists/evals/

- `evals.json` (~904 tok)

## .agents/skills/using-tdd/

- `SKILL.md` — Test-Driven Development Workflow (~2408 tok)

## .agents/skills/using-xtrm/

- `SKILL.md` — XTRM — When to Use What (~1198 tok)

## .agents/skills/xt-debugging/

- `SKILL.md` — xt-debugging (~1275 tok)

## .agents/skills/xt-end/

- `SKILL.md` — xt-end — Autonomous Session Close Flow (~1944 tok)

## .agents/skills/xt-merge/

- `SKILL.md` — merge-prs — Worktree PR Merge Workflow (~2768 tok)

## .beads/

- `.gitignore` — Git ignore rules (~321 tok)
- `.local_version` (~2 tok)
- `config.yaml` — Beads Configuration File (~596 tok)
- `dolt-monitor.pid` (~2 tok)
- `dolt-server.activity` (~3 tok)
- `dolt-server.pid` (~2 tok)
- `dolt-server.port` (~2 tok)
- `interactions.jsonl` (~4133 tok)
- `last-touched` (~4 tok)
- `metadata.json` (~45 tok)
- `README.md` — Project documentation (~562 tok)

## .beads/backup/

- `.backup-tmp-3896286398` (~85659 tok)
- `backup_state.json` (~77 tok)
- `comments.jsonl` (~0 tok)
- `config.jsonl` (~6186 tok)
- `dependencies.jsonl` (~9402 tok)
- `labels.jsonl` (~365 tok)

## .beads/dolt/

- `.bd-dolt-ok` (~1 tok)
- `.beads-credential-key` (~8 tok)
- `config.yaml` — Dolt SQL server configuration (~614 tok)

## .beads/dolt/.dolt/

- `config.json` (~21 tok)
- `repo_state.json` (~24 tok)
- `sql-server.info` (~14 tok)

## .beads/dolt/.dolt/noms/

- `journal.idx` (~0 tok)
- `LOCK` (~0 tok)
- `manifest` (~39 tok)
- `vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv` (~489 tok)

## .beads/dolt/.dolt/stats/.dolt/

- `config.json` (~1 tok)
- `repo_state.json` (~24 tok)

## .beads/dolt/.dolt/stats/.dolt/noms/

- `journal.idx` (~63556 tok)
- `LOCK` (~0 tok)
- `manifest` (~40 tok)

## .beads/dolt/unitAI/.dolt/

- `config.json` (~1 tok)
- `repo_state.json` (~24 tok)

## .beads/dolt/unitAI/.dolt/noms/

- `manifest` (~40 tok)

## .beads/dolt/unitAI/.dolt/stats/.dolt/

- `config.json` (~1 tok)
- `repo_state.json` (~24 tok)

## .beads/dolt/unitAI/.dolt/stats/.dolt/noms/

- `journal.idx` (~68 tok)
- `LOCK` (~0 tok)
- `manifest` (~39 tok)
- `vvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv` (~487 tok)

## .beads/hooks/

- `post-checkout` — --- BEGIN BEADS INTEGRATION v0.59.0 --- (~88 tok)
- `post-merge` — --- BEGIN BEADS INTEGRATION v0.59.0 --- (~87 tok)
- `pre-commit` — --- BEGIN BEADS INTEGRATION v0.59.0 --- (~87 tok)
- `pre-push` — --- BEGIN BEADS INTEGRATION v0.59.0 --- (~86 tok)
- `prepare-commit-msg` — --- BEGIN BEADS INTEGRATION v0.59.0 --- (~89 tok)

## .claude/

- `hookify.bd-no-markdown-todos.local.md` (~119 tok)
- `README.md` — Project documentation (~600 tok)
- `service-registry.json` (~13 tok)
- `settings.json` (~967 tok)
- `user-preferences.json` (~369 tok)
- `user-preferences.README.md` — User Preferences Configuration (~1309 tok)

## .claude/agents/

- `gemini-codebase-analyzer.md` — ⚠️ Migration Notice (v3.0) (~1924 tok)
- `implementation-validator.md` — ⚠️ Migration Notice (v3.0) (~2179 tok)
- `infrastructure-analyzer.md` — ⚠️ Migration Notice (v3.0) (~3329 tok)
- `rovodev-task-handler.md` — ⚠️ Migration Notice (v3.0) (~2732 tok)
- `triple-validator.md` — ⚠️ Migration Notice (v3.0) (~3780 tok)

## .claude/commands/

- `ai-task.md` — Instructions (~529 tok)
- `check-docs.md` — Argument Parsing (~1164 tok)
- `create-spec.md` — Instructions (~614 tok)
- `init-session.md` — Instructions (~444 tok)
- `prompt.md` — Instructions (~650 tok)
- `save-commit.md` — Instructions (~522 tok)

## .claude/docs/

- `quality-gates-readme.md` — Quality Gates (~661 tok)
- `service-skills-set-readme.md` — Service Skills Set (~805 tok)

## .claude/git-hooks/

- `doc_reminder.py` — get_staged_files, main (~550 tok)
- `skill_staleness.py` — get_push_ranges, get_changed_files, file_touches_service, is_globally_triggered + 2 more (~1876 tok)

## .claude/hooks/

- `hook-config.json` — Declares assertions (~424 tok)
- `quality-check.cjs` — Node.js Quality Check Hook (~10854 tok)
- `quality-check.py` — URL configuration (~3734 tok)
- `specialists-complete.mjs` — specialists-complete — Claude Code UserPromptSubmit hook (~456 tok)
- `specialists-session-start.mjs` — specialists-session-start — Claude Code SessionStart hook (~1049 tok)

## .claude/rules/

- `openwolf.md` (~313 tok)

## .claude/skills/creating-service-skills/

- `SKILL.md` — Creating Service Skills (~4295 tok)

## .claude/skills/creating-service-skills/references/

- `script_quality_standards.md` — Script Quality Standards for Service Skills (~3783 tok)
- `service_skill_system_guide.md` — Service Skill System: Architecture & Operations Guide (~2872 tok)

## .claude/skills/creating-service-skills/scripts/

- `bootstrap.py` — /*", "").replace("/**", "").rstrip("/") (~2419 tok)
- `deep_dive.py` — API router (~3264 tok)
- `scaffolder.py` — scaffold_service_skill, write_skill_md, write_script_stubs, check_container + 6 more (~4288 tok)

## .claude/skills/gitnexus/debugging/

- `SKILL.md` — Debugging with GitNexus (~731 tok)

## .claude/skills/gitnexus/exploring/

- `SKILL.md` — Exploring Codebases with GitNexus (~671 tok)

## .claude/skills/gitnexus/gitnexus-cli/

- `SKILL.md` — GitNexus CLI Commands (~859 tok)

## .claude/skills/gitnexus/gitnexus-debugging/

- `SKILL.md` — Debugging with GitNexus (~780 tok)

## .claude/skills/gitnexus/gitnexus-exploring/

- `SKILL.md` — Exploring Codebases with GitNexus (~749 tok)

## .claude/skills/gitnexus/gitnexus-guide/

- `SKILL.md` — GitNexus Guide (~867 tok)

## .claude/skills/gitnexus/gitnexus-impact-analysis/

- `SKILL.md` — Impact Analysis with GitNexus (~723 tok)

## .claude/skills/gitnexus/gitnexus-refactoring/

- `SKILL.md` — Refactoring with GitNexus (~1010 tok)

## .claude/skills/gitnexus/impact-analysis/

- `SKILL.md` — Impact Analysis with GitNexus (~671 tok)

## .claude/skills/gitnexus/refactoring/

- `SKILL.md` — Refactoring with GitNexus (~971 tok)

## .claude/skills/scoping-service-skills/

- `SKILL.md` — Scoping Service Skills ( /scope ) (~1724 tok)

## .claude/skills/scoping-service-skills/scripts/

- `scope.py` — find_registry, main (~656 tok)

## .claude/skills/specialists-creator/

- `SKILL.md` — Specialist Author Guide (~4741 tok)

## .claude/skills/specialists-creator/scripts/

- `validate-specialist.ts` — Declares printUsage (~332 tok)

## .claude/skills/updating-service-skills/

- `SKILL.md` — Updating Service Skills (~935 tok)

## .claude/skills/updating-service-skills/scripts/

- `drift_detector.py` — URL configuration (~2064 tok)

## .claude/skills/using-quality-gates/

- `SKILL.md` — Using Quality Gates (~1804 tok)

## .claude/skills/using-service-skills/

- `SKILL.md` — Using Service Skills (~742 tok)

## .claude/skills/using-service-skills/scripts/

- `cataloger.py` — generate_catalog, main (~689 tok)
- `skill_activator.py` — match_territory, find_service_for_file, find_service_for_command, build_context + 1 more (~1526 tok)
- `test_skill_activator.py` — Tests for skill_activator.py — load_registry integration. (~531 tok)

## .claude/skills/using-specialists/

- `SKILL.md` — Specialists Usage (~5890 tok)

## .claude/skills/using-specialists/evals/

- `evals.json` (~904 tok)

## .claude/tdd-guard/data/

- `instructions.md` — TDD Fundamentals (~697 tok)

## .claude/tsc-cache/48be2b53-c0d7-47ae-aeba-a568d4eb8c3a/

- `context-last-reminder` (~3 tok)
- `context-reminders.log` (~44 tok)
- `memory-reminder-shown` (~0 tok)
- `memory-search-reminders.log` (~338 tok)
- `recent-files.log` (~74 tok)
- `workflow-validate-last-commit-last-suggestion` (~3 tok)

## .claude/tsc-cache/4bb37ccc-8280-4a4c-b4ff-322301b54af8/

- `memory-reminder-shown` (~0 tok)
- `memory-search-reminders.log` (~36 tok)

## .claude/tsc-cache/9ee53232-fde8-47cc-8b60-8e2aa7dca7d6/

- `context-last-reminder` (~3 tok)
- `context-reminders.log` (~102 tok)
- `memory-reminder-shown` (~0 tok)
- `memory-search-reminders.log` (~107 tok)
- `recent-files.log` (~29 tok)
- `workflow-bug-hunt-last-suggestion` (~3 tok)

## .claude/tsc-cache/baec6910-98dd-48af-b593-7f1eb1f1c24b/

- `context-last-reminder` (~3 tok)
- `context-reminders.log` (~45 tok)
- `memory-reminder-shown` (~0 tok)
- `memory-search-reminders.log` (~445 tok)
- `recent-files.log` (~42 tok)
- `workflow-bug-hunt-last-suggestion` (~3 tok)
- `workflow-pre-commit-validate-last-suggestion` (~3 tok)

## .claude/tsc-cache/db19800c-2923-4a05-b2d5-6d48f34219da/

- `context-last-reminder` (~3 tok)
- `context-reminders.log` — Declares f (~64 tok)
- `memory-reminder-shown` (~0 tok)
- `memory-search-reminders.log` (~922 tok)
- `recent-files.log` (~407 tok)
- `workflow-pre-commit-validate-last-suggestion` (~3 tok)
- `workflow-validate-last-commit-last-suggestion` (~3 tok)

## .github/

- `dependabot.yml` — Dependabot updates for npm, pip, Docker, and GitHub Actions.

## .github/workflows/

- `gitleaks.yml` — PR/default-branch/scheduled secret scanning.
- `osv-scanner.yml` — PR/default-branch/scheduled OSV vulnerability scanning.
- `semgrep.yml` — PR diff-aware and scheduled Semgrep SAST.

## .githooks/

- `.security-pipeline-baseline` — Anti-main-push guard plus diff-only Semgrep and informational OSV pre-push checks.
- `pre-commit` — Managed wrapper preserving local doc reminder before pre-commit security checks.
- `pre-commit.local` — Preserved doc-reminder hook.
- `pre-push` — Managed wrapper preserving local skill-staleness hook after security baseline.
- `pre-push.local` — Preserved skill-staleness hook.

## scripts/

- `security-scan.sh` — Informational local Gitleaks/Semgrep/OSV audit.
- `semgrep-diff.sh` — Baseline-aware Semgrep scan for pre-push.

## .gitnexus/

- `meta.json` (~84 tok)

## .pi/

- `settings.json` (~189 tok)

## .pi/extensions/auto-session-name/

- `index.ts` — oh-pi Auto Session Name Extension (~243 tok)
- `package.json` — Node.js package manifest (~81 tok)

## .pi/extensions/auto-update/

- `index.ts` — oh-pi Auto Update — check for new oh-pi version on session start (~661 tok)
- `package.json` — Node.js package manifest (~78 tok)

## .pi/extensions/beads/

- `index.ts` — Declares getCwd (~2228 tok)
- `package.json` — Node.js package manifest (~90 tok)

## .pi/extensions/compact-header/

- `index.ts` — oh-pi Compact Header — table-style startup info with dynamic column widths (~776 tok)
- `package.json` — Node.js package manifest (~80 tok)

## .pi/extensions/core/

- `adapter.ts` — Checks if the tool event is a mutating file operation (write, edit, etc). (~490 tok)
- `guard-rules.ts` — Canonical guard-rule constants for Pi extensions. (~501 tok)
- `lib.ts` (~23 tok)
- `logger.ts` — Exports LogLevel, LoggerOptions, Logger (~317 tok)
- `package.json` — Node.js package manifest (~132 tok)
- `runner.ts` — Run a command deterministically with a timeout and optional stdin. (~438 tok)
- `session-state.ts` — Exports SessionPhase, SessionState, findSessionStateFile, readSessionState (~503 tok)

## .pi/extensions/custom-footer/

- `index.ts` — XTRM Custom Footer Extension (~3495 tok)
- `package.json` — Node.js package manifest (~95 tok)

## .pi/extensions/custom-footer/.pi/structured-returns/

- `83051fe4-97da-4e2c-bdaa-343b32f4e714.combined.log` (~257 tok)
- `83051fe4-97da-4e2c-bdaa-343b32f4e714.stderr.log` (~0 tok)
- `83051fe4-97da-4e2c-bdaa-343b32f4e714.stdout.log` (~257 tok)

## .pi/extensions/custom-provider-qwen-cli/

- `index.ts` — Qwen CLI Provider Extension (~3078 tok)
- `package.json` — Node.js package manifest (~78 tok)

## .pi/extensions/git-checkpoint/

- `index.ts` — Git Checkpoint Extension (~419 tok)
- `package.json` — Node.js package manifest (~80 tok)

## .pi/extensions/lsp-bootstrap/

- `index.ts` — Exports register (~1292 tok)
- `package.json` — Node.js package manifest (~96 tok)

## .pi/extensions/pi-serena-compact/

- `index.ts` — Serena/GitNexus MCP tool names that produce verbose output (~923 tok)
- `package.json` — Node.js package manifest (~114 tok)

## .pi/extensions/quality-gates/

- `index.ts` — Declares resolveQualityHook (~617 tok)
- `package.json` — Node.js package manifest (~95 tok)

## .pi/extensions/service-skills/

- `index.ts` — Declares SERVICE_REGISTRY_FILES (~991 tok)
- `package.json` — Node.js package manifest (~95 tok)

## .pi/extensions/session-flow/

- `index.ts` — isClaimCommand: isWorktree, getSessionId, getSessionClaim, isClaimStillInProgress (~1058 tok)
- `package.json` — Node.js package manifest (~94 tok)

## .pi/extensions/xtrm-loader/

- `index.ts` — Recursively find markdown files in a directory. (~1368 tok)
- `package.json` — Node.js package manifest (~94 tok)

## .pi/extensions/xtrm-ui/

- `format.ts` — Exports DiffStats, shortenHome, shortenPath, shortenCommand + 9 more (~922 tok)
- `index.ts` — XTRM UI Extension (~12047 tok)
- `package.json` — Node.js package manifest (~61 tok)

## .pi/extensions/xtrm-ui/themes/

- `pidex-dark.json` (~659 tok)
- `pidex-light.json` (~659 tok)

## .pi/npm/

- `.gitignore` — Git ignore rules (~4 tok)
- `package-lock.json` — npm lock file (~51436 tok)
- `package.json` — Node.js package manifest (~75 tok)

## .pi/skills/specialists-creator/

- `SKILL.md` — Specialist Author Guide (~4741 tok)

## .pi/skills/specialists-creator/scripts/

- `validate-specialist.ts` — Declares printUsage (~332 tok)

## .pi/skills/using-specialists/

- `SKILL.md` — Specialists Usage (~1784 tok)

## .pi/skills/using-specialists/evals/

- `evals.json` (~904 tok)

## .pi/structured-returns/

- `009fc309-f6ee-4071-96f8-3b5d1dff1051.combined.log` — Declares session (~1956 tok)
- `009fc309-f6ee-4071-96f8-3b5d1dff1051.stderr.log` — Declares session (~1949 tok)
- `009fc309-f6ee-4071-96f8-3b5d1dff1051.stdout.log` (~8 tok)
- `1ba399d6-935d-4af5-80a2-1f850886b90b.combined.log` (~106 tok)
- `1ba399d6-935d-4af5-80a2-1f850886b90b.stderr.log` (~15 tok)
- `1ba399d6-935d-4af5-80a2-1f850886b90b.stdout.log` (~91 tok)
- `4c9c0dfa-3c6b-476d-9c2d-fa00cb252dd9.combined.log` (~106 tok)
- `4c9c0dfa-3c6b-476d-9c2d-fa00cb252dd9.stderr.log` (~15 tok)
- `4c9c0dfa-3c6b-476d-9c2d-fa00cb252dd9.stdout.log` (~91 tok)
- `561f7a88-ff0d-48ec-b08b-852a09585d67.combined.log` (~61 tok)
- `561f7a88-ff0d-48ec-b08b-852a09585d67.stderr.log` (~0 tok)
- `561f7a88-ff0d-48ec-b08b-852a09585d67.stdout.log` (~61 tok)
- `8ba7db63-db2a-4b1f-a38d-f19e5725b83a.combined.log` (~527 tok)
- `8ba7db63-db2a-4b1f-a38d-f19e5725b83a.stderr.log` (~520 tok)
- `8ba7db63-db2a-4b1f-a38d-f19e5725b83a.stdout.log` (~8 tok)
- `91fb7401-6dc5-494a-98f9-3ece30d31f5c.combined.log` (~393 tok)
- `91fb7401-6dc5-494a-98f9-3ece30d31f5c.stderr.log` (~254 tok)
- `91fb7401-6dc5-494a-98f9-3ece30d31f5c.stdout.log` (~140 tok)
- `f74851fe-b43a-49c6-bd03-f81084170cb0.combined.log` (~4 tok)
- `f74851fe-b43a-49c6-bd03-f81084170cb0.stderr.log` (~4 tok)
- `f74851fe-b43a-49c6-bd03-f81084170cb0.stdout.log` (~0 tok)
- `fa6545ec-d423-4613-aaf3-06a00f55800d.combined.log` — Declares combined (~3889 tok)
- `fa6545ec-d423-4613-aaf3-06a00f55800d.stderr.log` — Declares combined (~3882 tok)
- `fa6545ec-d423-4613-aaf3-06a00f55800d.stdout.log` (~8 tok)

## .serena/

- `.gitignore` — Git ignore rules (~2 tok)
- `project.yml` — the name by which the project can be referenced within Serena (~2598 tok)

## .serena/cache/typescript/

- `raw_document_symbols.pkl` (~184206 tok)

## .serena/memories/

- `reference_documentation_conventions_2025-11-28.md` — Documentation Conventions (~1837 tok)
- `ssot_architecture_backends_2026-02.md` — Purpose (~1416 tok)
- `ssot_workflow_overthinker_status.md` — Purpose (~2036 tok)
- `ssot_workflows_init_session_2026-01-22.md` — Purpose (~791 tok)

## .specialists/

- `executor-result.md` (~467 tok)
- `trace.jsonl` (~2573 tok)

## .specialists/default/

- `debugger.specialist.yaml` (~1088 tok)
- `executor.specialist.yaml` — safety: getUserRole, getUserRole, handle (~2911 tok)
- `explorer.specialist.yaml` (~937 tok)
- `memory-processor.specialist.yaml` — Declares and (~1766 tok)
- `overthinker.specialist.yaml` (~795 tok)
- `parallel-review.specialist.yaml` (~852 tok)
- `planner.specialist.yaml` (~888 tok)
- `reviewer.specialist.yaml` (~1344 tok)
- `specialists-creator.specialist.yaml` — Declares value (~973 tok)
- `sync-docs.specialist.yaml` (~736 tok)
- `test-runner.specialist.yaml` — Declares errors (~575 tok)
- `xt-merge.specialist.yaml` (~2052 tok)

## .specialists/jobs/

- `latest` (~2 tok)

## .specialists/jobs/56ed27/

- `events.jsonl` (~55 tok)
- `result.txt` (~1 tok)
- `status.json` (~92 tok)

## .specialists/jobs/61618a/

- `events.jsonl` (~61 tok)
- `result.txt` (~1 tok)
- `status.json` (~92 tok)

## .specialists/jobs/c796a7/

- `events.jsonl` (~61 tok)
- `result.txt` (~1 tok)
- `status.json` (~92 tok)

## .specialists/jobs/df8efd/

- `events.jsonl` (~55 tok)
- `result.txt` (~1 tok)
- `status.json` (~92 tok)

## .specialists/ready/

- `56ed27` (~0 tok)
- `61618a` (~0 tok)
- `c796a7` (~0 tok)
- `df8efd` (~0 tok)

## .xtrm/

- `memory.md` — Project Memory — specialists (@jaggerxtrm/specialists v3.3.4) (~1663 tok)
- `session-meta.json` (~19 tok)

## .xtrm/report-templates/

- `session-report-reference.md` — Session Report — Reference Template (~1802 tok)

## .xtrm/reports/

- `2026-03-30-orchestration-session.md` — Session Report — 2026-03-30/31 (~2858 tok)
- `2026-05-13c-everything-pre-release.md` — Session Report — 2026-05-13c Everything-Pre-Release SSOT with late bug-hygiene addendum (~6000 tok)

## .xtrm/worktrees/specialists-xt-claude-giu4/

- `.gitattributes` — Git attributes (~47 tok)
- `.gitignore` — Git ignore rules (~213 tok)
- `.mcp copy.json` (~54 tok)
- `.npmignore` — Esclude TUTTO ciò che non è necessario per il funzionamento dell'MCP server (~308 tok)
- `.gitleaks.toml` — Gitleaks allowlist for repo-local runtime state and known non-secret placeholders.
- `.pre-commit-config.yaml` — Local pre-commit/pre-push security and hygiene hook configuration.
- `.semgrepignore` — Semgrep exclusions for generated/runtime artifacts with security-pipeline source re-included.
- `.session-meta.json` (~19 tok)
- `AGENTS.md` — XTRM Agent Workflow (~3544 tok)
- `bunfig.toml` (~7 tok)
- `CHANGELOG.md` — Change log (~5750 tok)
- `CLAUDE.md` — XTRM Agent Workflow (~6909 tok)
- `package.json` — Node.js package manifest (~421 tok)
- `PARITY-ANALYSIS.md` — Specialists ↔ xtrm-tools Parity Analysis (~3805 tok)
- `README.md` — Project documentation (~1508 tok)

## .xtrm/worktrees/specialists-xt-claude-giu4/.agents/skills/specialists-creator/

- `SKILL.md` — Specialist Author Guide (~4678 tok)

## .xtrm/worktrees/specialists-xt-claude-giu4/.agents/skills/specialists-creator/scripts/

- `validate-specialist.ts` — Declares printUsage (~332 tok)

## .xtrm/worktrees/specialists-xt-claude-giu4/.agents/skills/using-specialists/

- `SKILL.md` — Specialists Usage (~1388 tok)

## .xtrm/worktrees/specialists-xt-claude-giu4/.agents/skills/using-specialists/evals/

- `evals.json` (~904 tok)

## .xtrm/worktrees/specialists-xt-claude-giu4/.beads/

- `.gitignore` — Git ignore rules (~321 tok)
- `config.yaml` — Beads Configuration File (~596 tok)
- `interactions.jsonl` (~1399 tok)
- `metadata.json` (~45 tok)
- `README.md` — Project documentation (~562 tok)
- `redirect` (~5 tok)

## .xtrm/worktrees/specialists-xt-claude-giu4/.beads/hooks/

- `post-checkout` — --- BEGIN BEADS INTEGRATION v0.59.0 --- (~88 tok)
- `post-merge` — --- BEGIN BEADS INTEGRATION v0.59.0 --- (~87 tok)
- `pre-commit` — --- BEGIN BEADS INTEGRATION v0.59.0 --- (~87 tok)
- `pre-push` — --- BEGIN BEADS INTEGRATION v0.59.0 --- (~86 tok)
- `prepare-commit-msg` — --- BEGIN BEADS INTEGRATION v0.59.0 --- (~89 tok)

## src/cli/

- `list.ts` — src/cli/list.ts (~2400 tok)

- 2026-04-16: updated dead-PID recovery behavior in src/specialist/supervisor.ts and regression coverage in tests/unit/specialist/supervisor.test.ts.
- 2026-04-22: updated src/cli/init.ts so --sync-defaults refreshes existing canonical files in .specialists/default/; regression coverage added in tests/unit/cli/init.test.ts.

## docs/design/

- `docs/design/gzrx-tool-catalog.md` — Design for centralized specialists manifest, tool catalog, capability tier policy, fallback semantics, and resolved config debug surface (~5200 tok)

## config/skills/using-specialists-v2/

- `SKILL.md` — Canonical Specialists V2 orchestration skill; v1.4 describes final-state bead-first orchestration, canonical-live Cat A asset resolution, Cat B xtrm-tools ownership, source verification, drift commands, and release context flow without changelog/gotcha framing.


## config/skills/using-specialists-v3/

- `SKILL.md` — Canonical Specialists V3 orchestration skill; clean self-contained bead-first workflow using live specialist registry and help surface while preserving core contract/review/merge/failure-recovery guidance.
- `evals/evals.json` — Role-selection and merge-publication eval prompts for using-specialists-v3.


## .xtrm/skills/active/

- `using-specialists-v3` — Active symlink to `../default/using-specialists-v3` for Claude Code skill evaluation.

## .xtrm/skills/default/using-specialists-v2/

- `SKILL.md` — Installed mirror of canonical using-specialists-v2 skill; keep synced from config/skills/using-specialists-v2/SKILL.md.

- 2026-05-04: `config/skills/using-specialists-v2/SKILL.md` bumped to v1.4 and canonicalized to final-state guidance only; installed mirror copied to `.xtrm/skills/default/using-specialists-v2/SKILL.md`.
- 2026-05-05: Latest report `.xtrm/reports/2026-05-04-2b52300a.md` includes addendum for using-specialists-v3 merge, manual expansion, activation, and remaining xtrm-tools mirror decision.

- 2026-05-04: Updated config/specialists/*.specialist.json descriptions and .specialists/user overlays to improve `specialists list` routing; specialists-creator v1.2 now teaches list-friendly metadata.description authoring.

- 2026-05-04: `config/specialists/*.specialist.json` and `.specialists/user` overlays now use truncation-first metadata descriptions for `specialists list`; package-owned configs require package release/update for other repos to receive them.

- 2026-05-04: Added config/specialists/security-auditor.specialist.json — LOW-permission security audit specialist with safe local audit commands, dependency advisory triage, researcher-style current sources, and no-edit/no-exploit boundaries.

- 2026-05-04: Added config/specialists/code-sanity.specialist.json — READ_ONLY bounded implementation sanity pass for executor diffs before reviewer, using GitNexus/Serena tool surface and clean-code guidance.

- 2026-05-04: Fixed specialists-creator validate-specialist helper import path so documented project-root validation command works; logged as bug-012.

- 2026-05-04: Fixed repo-local mandatory rule resolution: `.specialists/mandatory-rules/<id>.md` is now searched when `.specialists/mandatory-rules/index.json` references a set; `bun-native-tooling` stays repo-local, not canonical.

- 2026-05-04: Updated config/skills/using-specialists-v2/SKILL.md to route code-sanity as optional pre-review implementation smell pass and security-auditor as LOW recommendation-only security/dependency audit in implementation chains.


- 2026-05-05: Updated `.xtrm/reports/2026-05-04-2b52300a.md` addendum with npm audit triage: @modelcontextprotocol/sdk/yaml safe bumps, audit reduction, security-auditor stall, and Vitest 4 follow-up.

## docs/installation.md

- New installation/distribution guide for Specialists two-category model: Category A runtime-resolved package assets, Category B xtrm-managed filesystem assets, migration steps, and cross-links.

## docs distribution references

- `docs/authoring.md` — adds canonical rule/skill reference pattern for user specialists.
- `docs/manifest.md` — notes tool catalog as Category A package-live asset.
- `docs/skills.md` — documents skill snapshots as Category B managed by `xt doctor` / `xt update`.
- `docs/hooks.md` — documents hook snapshots as Category B and separates `specialists doctor` from `xt doctor` drift checks.
- `docs/cli-reference.md` — updates `sp init`, `sp doctor --check-drift`, `sp prune-stale-defaults`, and xtrm-managed `xt doctor` / `xt update` references.
## Manual session note — 2026-05-06 specialists-6vy

- `src/specialist/script-runner.ts` — script-class pi invocation now includes full prompt-isolation flags after `--offline`.
- `tests/unit/specialist/script-runner.test.ts` — regression coverage for script-runner pi isolation argv and child_process spawnSync mock support.
- `dist/index.js` — rebuilt bundled CLI output containing the script-runner isolation flags.


## Manual session note — 2026-05-06 unitAI-z2vpq.1

- `src/specialist/script-runner.ts` — script-class pi invocation now sends rendered task prompts over child stdin instead of appending prompt text to argv; stdin EPIPE/error events are swallowed so close/error handling owns classification.
- `tests/unit/specialist/script-runner.test.ts` — regression coverage now asserts rendered prompt is absent from argv, written to stdin, stdin is closed, and stdin error events do not crash the caller.
- `dist/index.js` / `dist/lib.js` / `dist/types/specialist/script-runner.d.ts.map` — rebuilt bundled/package outputs for prompt-stdin transport change.


## Manual session note — 2026-05-07 unitAI-8y70l

- `src/cli/serve.ts` — `sp serve` now emits non-PII structured JSON operational logs for every `/v1/generate` request and supports `--log-level off|info|debug` (default info).
- `tests/integration/sp-serve.test.ts` — regression coverage for success logs, malformed-request logs, and `--log-level off` suppression.
- `src/index.ts` — serve help includes `--log-level off|info|debug`.


## Manual session note — 2026-05-07 unitAI-826pp

- `compose.yml` — local specialists repo dev compose now uses explicit `container_name: sp-service-dev` to avoid confusion with consumer `specialists-service` containers.
- `docs/specialists-service-install.md` — documents dev vs consumer container naming and how to inspect compose labels.

## Manual session note — 2026-05-12 unitAI-uof0t

- `src/specialist/process-health.ts` — new Linux `/proc` scanner for `sp ps` system health: specialist/Dolt/Serena/orphan classification, RSS/CPU/age, MemAvailable thresholds, WARN/REFUSE status reasons.
- `src/cli/ps.ts` — renders System health block and emits `process_health` JSON with process counts, alerts, and per-process rows.
- `src/cli/clean.ts` — reuses shared orphan-process collection from process-health.
- `tests/unit/specialist/process-health.test.ts` / `tests/unit/cli/ps.test.ts` — fixture coverage for proc parsing, uptime-based age, status alerts, and ps rendering/JSON.

## Manual session note — 2026-05-12 unitAI-tdw9o

- `src/cli/ps.ts` — default visibility now renders active jobs only; terminal historical jobs are hidden unless `--include-terminal` or `--all` is passed.
- `tests/unit/cli/ps.test.ts` — regression coverage for hiding terminal jobs by default and showing them via `--include-terminal`.

## Manual session note — 2026-05-12 unitAI-hqy43

- `src/index.ts` / `src/cli/help.ts` — expanded `sp ps --help` and `sp clean --help` for actionable dashboard, `--active`, `--include-terminal`, `--include-cleaned`, `--health`, and `sp clean --ps` soft-clean semantics.
- `config/skills/using-specialists-v3/SKILL.md` — documents final `sp ps` / `sp clean --ps` operational model for orchestration cleanup and monitoring.
> Manual update: 2026-05-14T18:52:00Z — unitAI-fqo38 hardened `sp ps -f` follow rendering in `src/cli/ps.ts` and rebuilt `dist/index.js`.


## Manual session note — 2026-05-15 unitAI-xvvqb

- `README.md` — refreshed first-time user overview, install/update commands, specialist workflow, service surface, docs index, and explicit xtrm-tools relationship.
- `docs/` — reconciled v3.14-v3.15 release drift across bootstrap, catalog, skills, CLI/features, service install, MCP, worktree, pi/RPC, manifest, workflow, and background-jobs docs.
- `CHANGELOG.md` — added `[Unreleased]` Changed entry for the documentation refresh.

## Manual session note — 2026-05-18 unitAI-ylphl.8

- `config/skills/using-specialists-v3/SKILL.md` — relationship vocabulary expanded to v3.4 with typed bd dependency scenarios, duplicate/supersede commands, cycle checks before epic merge, and existing workflow examples updated to use `discovered-from`, `caused-by`, `validates`, `relates-to`, and `supersede` in context.
- `.wolf/cerebrum.md` / `.wolf/memory.md` — captured operator correction and session memory for weaving relationship guidance into examples instead of only adding a standalone table.

## Manual session note — 2026-05-18 unitAI-ylphl workflow-router decision

- Beads `unitAI-ylphl`, `.1`-`.7`, `.9`-`.11` — epic reframed around `sp workflows` CLI/router; children define workflow registry entries and implementation work, with dependency edges from relationship vocabulary to entries and entries to CLI implementation.
- `.wolf/cerebrum.md` / `.wolf/memory.md` — recorded the workflow-router decision for future sessions.

> Manual update: 2026-05-21T17:10:10+00:00 — unitAI-929wj fixed sp chat TUI mounting/render timing in src/cli/chat.ts; strengthened tests/smoke/sp-chat.smoke.test.ts and rebuilt dist/index.js.

> Manual update: 2026-05-21T17:51:53+00:00 — unitAI-929wj aligned sp chat feed rendering with sp run/feed by tailing events.jsonl and using formatEventInlineDebounced.

> Manual update: 2026-05-21T18:20:57+00:00 — unitAI-929wj added sp feed dedupe/startup context and sp result output surfacing to src/cli/chat.ts.

> Manual update: 2026-05-21T21:03:34+00:00 — refined `src/cli/chat.ts` dedupe to reset on turn start before appending fixes to PR 93.

> Manual update: 2026-05-21T21:08:27+00:00 — unitAI-cxa50 documented sp chat TUI/feed parity and current attach boundary in docs/cli-reference.md, docs/background-jobs.md, and docs/workflow.md.

> Manual update: 2026-05-21T21:47:23+00:00 — unitAI-vj8cl updated src/cli/help.ts and README.md with sp chat guidance; rebuilt dist/index.js.

> Manual update: 2026-05-22T08:11:20+00:00 — unitAI-17kx3 updated src/cli/chat.ts, src/cli/chat/control.ts, chat tests, docs/help/readme for attach-safe detach semantics.

> Manual update: 2026-05-22T13:43:53Z — unitAI-76yuy updated `src/cli/attach.ts` bare attach picker to support arrow-key selection; `tests/unit/cli/attach.test.ts` covers active-only picker and arrow navigation.

> Manual update: 2026-05-26T15:44:47+00:00 — unitAI-gqpvw added `src/cli/log.ts`, runtime `control_signal` timeline events, result/log help/docs, tests, and rebuilt dist for specialist error tracing.

## 2026-05-26 — `sp log` global mode
- `src/cli/log.ts` now resolves log DB targets with repo-root-first behavior and parent-directory discovery: when cwd lacks `.specialists/db/observability.db`, it scans immediate child directories for that DB and aggregates rows across repos.
- `sp log --repo <name>` filters parent/global output to one discovered child repo.
- Human output identifies rows as `worktree=<repo>/<worktree>` for cross-repo disambiguation; JSON includes `db_path`.

## 2026-05-26 — `sp log` restrained color palette
- `src/cli/log.ts` human rendering keeps a calm palette: timestamps/metadata dim, job ids plain, specialist bold, success green, warnings/control/cancel yellow, failures red.
- `sp log` intentionally does not use per-job rainbow colors; `sp feed` remains the richer live progress view.

## 2026-05-26 — `sp log` status colors + human dedupe
- `src/cli/log.ts` collapses near-identical human display rows within a 2s window using a normalized event payload key; JSON mode remains full-fidelity.
- `status=<state>` is color-coded as a whole segment with the restrained palette: done green, error red, cancelled/starting/waiting yellow, running cyan.
> Manual update: 2026-06-03 — `.wolf/cerebrum.md` and `.wolf/memory.md` recorded the substrate-vs-devops design SSOT distinction clarified during unitAI-69s6t planning.
> Manual update: 2026-06-03 — unitAI-69s6t updated `/home/dawid/second-mind/1-projects/xtrm/substrate/substrate_design_it.md` (§2.8, §11.3, §12.5) for telemetry projection links, shipped forensic/metrics surfaces, and console lineage/evidence drawer semantics.
> Manual update: 2026-06-03 — unitAI-0gdjp added `docs/telemetry/agentops-event-catalog.md` and linked it from `docs/telemetry/forensic-event-contract.md`.
> Manual update: 2026-06-03 — unitAI-eoqxp.1 research refresh closed; evidence pack and scope refinements appended to beads `unitAI-eoqxp`, `unitAI-eoqxp.1`, and children `.1`-`.4`.
> Manual update: 2026-06-03 — DevOps PRD vault note `/home/dawid/second-mind/1-projects/xtrm/devops/devops-system.md` gained §7.2 parking `unitAI-eoqxp.1` research findings behind telemetry/roadmap/substrate/channels sequencing.
> Manual update: 2026-06-03 — unitAI-eoqxp.3 extended `docs/telemetry/forensic-event-contract.md`, `docs/telemetry/agentops-event-catalog.md`, and `docs/telemetry/prometheus-projection-contract.md`; created implementation children `unitAI-eoqxp.3.1`-.`3.5`.
> Manual update: 2026-06-03 — telemetry pricing correction: docs now treat token usage as current reliable signal and defer USD cost metrics until direct API billing/pricing provenance exists.
> Manual update: 2026-06-03 — unitAI-eoqxp.3.4 added identity/policy/eval forensic label support and optional Prometheus projection over forensic event fixtures.
> Manual update: 2026-06-04 — unitAI-eoqxp.3.6.1 added `sp ps <job>` fallback from persisted timeline/forensic events when status row is missing.
> Manual update: 2026-06-04 — unitAI-eoqxp.3.5 expanded forensic/Prometheus tests with full forbidden-label coverage, AgentOps catalog fixtures, and Prometheus forbidden-label parser validation.

- 2026-06-04: `src/index.ts` top-level CLI dispatcher explicitly exits after successful subcommand completion to avoid Bun foreground command hangs; no-subcommand MCP server mode remains long-running.
> Manual update: 2026-06-04 — unitAI-eoqxp.3.1 added optional session/conversation/trace/span forensic correlation propagation through Pi session meta, supervisor status, SQLite normalization, and feed/log JSON envelopes.
> Manual update: 2026-06-04 — unitAI-eoqxp.3.2 added MCP forensic normalization for semconv-style MCP events, `_meta` trace/id extraction, OTel attribute hints, and MCP Prometheus projection coverage.
> Manual update: 2026-06-04 — unitAI-v1fzu updated docs/telemetry shipped-status sections for forensic bridge, session correlation, MCP pre-wiring boundary, and Prometheus projection scope.
> Manual update: 2026-06-04 — unitAI-7v93b synced eoqxp open children, repo DevOps PRD, and vault devops-system.md to current shipped telemetry bridge / MCP pre-wiring status.
> Manual update: 2026-06-04 — unitAI-4j22u copied docs/telemetry/*.md into vault folder `/home/dawid/second-mind/1-projects/xtrm/telemetry/` with matching checksums.

## Manual update — 2026-06-04 unitAI-5ljfu
- `src/specialist/prometheus-projection.ts` — adds bounded chain metrics and forensic gate/evidence projections.
- `src/specialist/forensic-events.ts` — token split body normalization, git commit evidence body/correlation, `chain_template` allowlist, `raw_diff` forbidden label.
- `src/cli/serve.ts` / `src/index.ts` — adds per-job feed-events route and keeps `sp serve` long-running after listen.
- `docs/telemetry/*.md` — console-safe forensic/Prometheus handoff updates.
> Manual update: 2026-06-22T22:16:32Z — unitAI-pj2mm.1/.2/.3 shipped global override support for execution.interactive + stall_detection.waiting_auto_close_ms, added Supervisor waiting auto-close (graceful close first, forced termination fallback), updated specialists-creator/setup skills and canonical docs, and rebuilt dist for linked-bin testing.

> Manual update: 2026-06-23T13:05:16Z — unitAI-c7zdy.1 reworked .github/workflows/osv-scanner.yml into PR-advisory vs push/schedule-hard-gate jobs, added scripts/osv-security-forced-classifier.mjs, and added tests/unit/scripts/osv-security-forced-classifier.test.ts for CVSS/KEV/active-exploit classification.
> Manual update: 2026-06-23T13:05:16Z — unitAI-c7zdy.2 reworked .github/workflows/package-payload.yml so payload-contract now isolates install, build, pack-manifest, and assert into separate named steps while preserving the exact required asset list.

> Manual update: 2026-06-23T13:15:21Z — unitAI-c7zdy.3 added scripts/materialize-dependency-verdict.mjs, tests/unit/scripts/materialize-dependency-verdict.test.ts, and docs/devops/dependency-verdict-materialization.md for dry-run-first dependency verdict → substrate issue materialization (advisor/followup/gate with discovered-from/validates/blocks edge conventions).
