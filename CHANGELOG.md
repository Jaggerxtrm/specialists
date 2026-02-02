# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Comprehensive SSOT documentation system in `.serena/memories/`
  - `ssot_architecture_backends_2026-02.md` - Backend architecture and model mappings
  - `ssot_workflow_overthinker_status.md` - Overthinker v1.0 vs v2.0 status
- CHANGELOG.md for version tracking
- CLAUDE.md for AI agent development context

### Changed
- Updated documentation to reflect Gemini 3.x model versions
- Clarified Overthinker v1.0 actual implementation vs v2.0 planned features

### Fixed
- Corrected model version references in SSOT files (gemini-2.5 → gemini-3)

## [0.4.0] - 2026-01-22

### Added
- **Overthinker Workflow** - Multi-agent reasoning workflow with 4-phase process
  - Phase 1: Prompt Refiner - Creates structured Master Prompt
  - Phase 2: Initial Reasoning - Lead Architect develops solution
  - Phase 3: Iterative Review - Multiple review cycles (default: 3)
  - Phase 4: Final Consolidation - Polished output synthesis
  - Outputs saved to `.unitai/` directory
  - Context gathering from files and project standards
- **Init-Session Workflow Refactor**
  - Enhanced documentation search across `.serena/memories/` and `docs/`
  - Improved context gathering with keyword matching
  - Integration with Serena memories for SSOT awareness
- SSOT for init-session workflow (`ssot_workflows_init_session_2026-01-22.md`)

### Changed
- **Infrastructure Refactor to MCP Standards**
  - Aligned with Model Context Protocol 2.0 best practices
  - Updated tool registration and validation
  - Improved MCP server compliance
- **Model Upgrades**
  - Gemini: Upgraded to `gemini-3-pro-preview` (PRIMARY) and `gemini-3-flash-preview` (FLASH)
  - Deprecated `gemini-2.5-flash` and `gemini-2.5-pro` as primary models
- **Backend Consolidation**
  - Cursor Agent now handles surgical refactoring and testing (replaces Qwen)
  - Droid (GLM-4.6) established as Implementer backend
  - Deprecated Rovodev and Qwen as primary backends (CLI flags retained for compatibility)
- Init-session now defaults to `gemini-3-flash-preview` for commit analysis

### Fixed
- Overthinker persistence: Now saves outputs to `.unitai/` directory instead of project root
- Master prompt files now properly timestamped

### Deprecated
- `gemini-2.5-flash` and `gemini-2.5-pro` (use `gemini-3-flash-preview` and `gemini-3-pro-preview`)
- Qwen and Rovodev backends (use Cursor Agent instead)

## [0.3.x] - Earlier Releases

### Added
- Core MCP server infrastructure
- Multi-backend orchestration (Gemini, Qwen, Rovodev, Cursor, Droid)
- Smart Workflows:
  - Triangulated Review
  - Parallel Review
  - Bug Hunt
  - Feature Design
  - Auto Remediation
- Circuit Breaker pattern for backend resilience
- Permission system (4-tier: READ_ONLY, LOW, MEDIUM, HIGH)
- Agent specialization system:
  - ArchitectAgent (Gemini) - Design and architecture
  - ImplementerAgent (Droid) - Code generation
- Activity Analytics and audit trail
- Robust tool registry with Zod validation
- Token savings tracking

### Changed
- Established backend roles and specializations
- Implemented fallback mechanisms for API failures

---

## Version History Summary

| Version | Date | Key Features |
|---------|------|--------------|
| **0.4.0** | 2026-01-22 | Overthinker workflow, MCP 2.0, Gemini 3.x upgrade, backend consolidation |
| **0.3.x** | Earlier | Core infrastructure, multi-backend orchestration, smart workflows |

---

## Migration Guides

### Migrating from 0.3.x to 0.4.0

#### Model References
Update any hardcoded model references:
```diff
- gemini-2.5-flash
+ gemini-3-flash-preview

- gemini-2.5-pro
+ gemini-3-pro-preview
```

Or use constants:
```typescript
import { AI_MODELS } from './constants.js';

// Use
AI_MODELS.GEMINI.FLASH       // gemini-3-flash-preview
AI_MODELS.GEMINI.PRIMARY     // gemini-3-pro-preview
```

#### Backend References
Update backend calls:
```diff
- ask-qwen
+ ask-cursor

- ask-rovodev
+ ask-cursor
```

#### Overthinker Workflow
New workflow available via MCP:
```typescript
await executeOverthinker({
  initialPrompt: "Your complex problem",
  iterations: 3,
  outputFile: "analysis.md"
});
```

---

## Contributing

When adding entries to this changelog:
1. Place new changes under `[Unreleased]`
2. Use categories: Added, Changed, Deprecated, Removed, Fixed, Security
3. Link to issues/PRs where applicable
4. Follow [Keep a Changelog](https://keepachangelog.com/) format

---

## Links

- [GitHub Repository](https://github.com/jaggerxtrm/unitai)
- [NPM Package](https://www.npmjs.com/package/@jaggerxtrm/unitai)
- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/)
- [Beta Testing Guide](beta-testing.md)
