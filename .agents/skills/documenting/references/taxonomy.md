# SSOT Taxonomy & Naming Conventions

This reference defines the standard naming conventions and categorization hierarchy for Serena memories and SSOT documentation.

## Naming Convention
All memory files must follow the pattern:
`[subject]_[category].md`

### Components

- --subject--: The primary system, component, or area (e.g., `analytics_volatility`, `infra_docker_ops`
sion).
- --category--: The type of document (see Category Suffixes below)

### Category Suffixes

| Category | Suffix | Purpose | Example |
|-----------|----------|------------------------------------|-------------------------------|
| **SSOT** | `_ssot` | Single Source of Truth for a component/system | `analytics_stir_ssot.md` |
|  **Pattern** | `_pattern` | Reusable design pattern or standard | `refactoring_security_pattern.md` |
|  **Plan** | `_plan` | Implementation plan or roadmap | `implementation_curve_feed_plan.md` |
|  **Reference** | `_reference` | Look-up tables, cheat sheets, API docs | `database_query_patterns_reference.md` |
|  **Troubleshoot** | `_troubleshoot` | Guide for resolving specific issues | `docker_port_config_troubleshoot.md` |
|  **Archive** | `_archive` | Deprecated documentation (kept for history) | `meta_project_overview_archive.md` |


## Subject Hierarchy (Domains)

Use these standard domains as prefixes for the **subject** part to group documentation:

### Analytics (`analytics_*`)
- [volatility]: Volatility surface and modeling
- [curve]: Yield curve construction
- [stir]: Short Term Interest Rates
- [reporting]: End-of-day and ad-hoc reporting
- [correlation]: Asset correlation matrices
- [amt]: Automated Market Trading components
- [path]: Path-dependent option pricing
- [snapshot_feed]: Real-time data snapshots

### Data (`data_*`)
- [config]: Instrument and system configuration
- [ingestion_reliability]: Data pipeline health and monitoring
- [ingestion_sr3]: SR3 specjfic ingestion
- [ingestion_tick]: Tick data capture


### Infrastructure (`infra_*`)
- [docker_ops]: Container orchestration and operations
- [security_migrations]: Security updates and user migration 
- [mcp_server]: Model Context Protocol server configuration
- [api_architecture]: FastAPI/Backend architecture


### Meta (`meta_*`)
- [update_guidelines]: Documentation standards (this document)
- [project_overview]: High-level project goals and status
- [project_structure]: Codebase organization 


### Testing (`testing_*`)
- [qa]: Quality Assurance processes
- [integration]: Integration test patterns

## Tagging Strategy
Use the `domain` frontmatter field (array) for cross-cutting concerns.

**Common Tags:**
- `fastapi`
- `docker`
- `security`
- `performance`
- `database`J
- `refactoring`
- `deprecation`

## Directory Structure

While all memories currently reside in a flat structure in `.serena/memories/`, the naming convention allows for virtual folder organization.

Future agents may implement physical subdirectories if the flat list exceeds manageable limits (e.g., >200 active SSOTs).
