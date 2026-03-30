# CHANGELOG Format Reference

This project uses [Keep a Changelog 1.0.0](https://keepachangelog.com/en/1.0.0/) format.

## Structure

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- New features

### Changed
- Changes to existing functionality

### Deprecated
- Soon-to-be removed features

### Removed
- Removed features

### Fixed
- Bug fixes

### Security
- Security fixes

## [1.0.0] - 2026-02-01

### Added
- Initial release
```

## Categories (in order)

1. **Added** - New features
2. **Changed** - Changes to existing functionality
3. **Deprecated** - Soon-to-be removed features
4. **Removed** - Removed features
5. **Fixed** - Bug fixes
6. **Security** - Security vulnerabilities fixed

## Version Format

- Use [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
- Format: `[X.Y.Z] - YYYY-MM-DD`
- Example: `[1.2.3] - 2026-02-01`

## Entry Guidelines

- Start with action verb
- Be specific and concise
- Include context if needed
- Use bullet points (-)
- Sub-bullets for details (indented)

### Examples

**Good:**
```markdown
### Added
- **Universal Context**: Support for indexing multiple sources simultaneously
  - Zero-Config Auto-Discovery for current project
  - Context-Aware Search with source filtering
- Reranking with FlashRank (ms-marco-TinyBERT-L-2-v2 model)
```

**Bad:**
```markdown
### Added
- Added stuff
- Fixed things
- Improvements
```

## Breaking Changes

Mark breaking changes with **BREAKING**: prefix:

```markdown
### Changed
- **BREAKING**: Renamed `old_function()` to `new_function()`
```

## Scripts

- `init_changelog.py` - Create new CHANGELOG.md
- `add_entry.py` - Add entry to [Unreleased]
- `bump_release.py` - Move [Unreleased] to version
- `validate_changelog.py` - Validate format
