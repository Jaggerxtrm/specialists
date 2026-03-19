---
title: Descrizione
scope: specialists_refactor.md
category: reference
version: 1.0.0
updated: 2026-03-19
domain: []
---

# Descrizione
Gli specialists correnti si basano su vecchi workflows e hanno bisogno di essere aggiornati. Per aggiornarli, rivedremo le loro funzioni attuali, e li migliorerò utilizzando delle skills esistenti, usando anche il nuovo skills creator per adattarle ulteriormente.
Alcuni workflows ha senso che vengano concatenati, ad esempio, un implementazione di una feature può avere: codebase-explorer, mappa la codebase con gitnexus, esplora per bene > planner (scrive su un file, riporta all'orchestrator solo piccoli dettagli) > implementer, usa test driven development, utilizza conventions di type quality, linting, cleancode (legge i file) > code cleaner > orchestrator infine fa il controllo finale. Tutto questo lanciato direttamente da orchestrator, quindi c'è la sorta di ping-pong in cui ogni agente ritorna indietro, oppure concatenati. Possono essere lanciati workflow come overthinker facendoli comunicare tra loro, creando un file (come overthinker originale), orchestrator lo legge.
Uno specialist dovrebbe venire triggerato anche se è orchestrator direttamente ad effettuare un lavoro, ad esempio triggerare una run di test alla fine di un implementazione.

```
Specialists (9)

  auto-remediation   google-gemini-cli/gemini-3-flash-preview  Autonomous self-healing workflow: detect issue, diagnose root cause, implement fix, and verify resolution.  [project]
  bug-hunt           anthropic/claude-sonnet-4-6               Autonomously investigates bug symptoms across the codebase: identifies relevant files, performs multi-backend root cause analysis, generates hypotheses, and produces a remediation plan.  [project]
  codebase-explorer  google-gemini-cli/gemini-3-flash-preview  Explores the codebase structure, identifies patterns, and answers architecture questions.  [project]
  feature-design     anthropic/claude-sonnet-4-6               End-to-end feature design and planning: architectural analysis, code implementation plan, and test generation across three coordinated phases.  [project]
  init-session       anthropic/claude-haiku-4-5                Gathers project context by analyzing recent Git commits, diffs, and related documentation to prepare a comprehensive dev session report.  [project]
  overthinker        anthropic/claude-sonnet-4-6               Multi-phase deep reasoning workflow: initial analysis, devil's advocate critique, synthesis, and final refined output.  [project]
  parallel-review    anthropic/claude-sonnet-4-6               Runs concurrent code review across multiple AI backends with configurable focus areas (architecture, security, performance, quality) and synthesizes findings into a unified report.  [project]
  report-generator   anthropic/claude-haiku-4-5                Generates structured markdown reports from analysis results or raw data.  [project]
  test-runner        anthropic/claude-haiku-4-5                Runs tests, interprets failures, and suggests fixes.  [project]
```

### CODEBASE EXPLORER
Questo specialist è molto basilare e datato. Verrà integrato con la skill `gitnexus-explorer` - inserita a livello di user in `~/.agents/`. 