# Example Workflow: Documenting a New Feature

This example shows the complete workflow for documenting a new feature in a project.

## Scenario

You've just completed a new "semantic search" feature for your project:
- Added new API endpoint `/api/search`
- Implemented vector search with ChromaDB
- Added new configuration options
- Created comprehensive tests

## Step 1: Document with Orchestrator

```bash
cd ~/projects/my-project

python3 ~/.claude/skills/documenting/scripts/orchestrator.py . feature 
  "Semantic search with vector embeddings" 
  --scope=search 
  --category=backend
```

**Output:**
```
📝 Documentation Update Results
============================================================
✅ CHANGELOG.md updated

💡 README.md suggestions:
  - Consider adding to ## Features section: Semantic search with vector embeddings
  - Update ## Usage section with new example

💡 CLAUDE.md suggestions:
  - Review ## Architecture section for: Semantic search with vector embeddings

✅ All documentation validated
```

## Step 2: Review CHANGELOG

```bash
grep -A 10 "\[Unreleased\]" CHANGELOG.md
```

**Output:**
```markdown
## [Unreleased]

### Added
- Semantic search with vector embeddings
```

## Step 3: Update README.md

Based on orchestrator suggestions, update README:

```markdown
## Features

- **Semantic Search**: Natural language search using vector embeddings
  - Powered by OpenAI embeddings and ChromaDB
  - Fast approximate nearest neighbor search
  - Configurable similarity threshold
```

```markdown
## Usage

### Semantic Search

```python
from search import SearchEngine

engine = SearchEngine()
results = engine.search("find documents about machine learning")

for result in results:
    print(f"{result.title} (similarity: {result.score})")
```
```

## Step 4: Update CLAUDE.md

Based on suggestions, update architecture:

```markdown
## Architecture

- **Search Layer**: `services/search_service.py` - Vector search implementation
  - Uses ChromaDB for vector storage
  - OpenAI embeddings via `embedding_service`
  - Configurable reranking with FlashRank
```

## Step 5: Create SSOT Memory

For significant architectural additions:

```bash
python3 ~/.claude/skills/documenting/scripts/generate_template.py ssot 
  .serena/memories/ssot_search_semantic_2026-02-01.md 
  title="Semantic Search SSOT" 
  scope="search-semantic" 
  subcategory="search" 
  domain="backend,ml"
```

Edit the generated file to document:
- Search algorithm design
- Vector storage architecture
- Embedding strategy
- Performance characteristics

## Step 6: Validate Everything

```bash
# Validate CHANGELOG
python3 ~/.claude/skills/documenting/scripts/changelog/validate_changelog.py CHANGELOG.md

# Validate SSOT
python3 ~/.claude/skills/documenting/scripts/validate_metadata.py 
  .serena/memories/ssot_search_semantic_2026-02-01.md

# Or use orchestrator validation
python3 ~/.claude/skills/documenting/scripts/orchestrator.py . validate
```

## Step 7: Commit

```bash
git add 
  CHANGELOG.md 
  README.md 
  CLAUDE.md 
  .serena/memories/ssot_search_semantic_2026-02-01.md

git commit -m "feat(search): add semantic search with vector embeddings

- Implement vector search using ChromaDB
- Add OpenAI embedding generation
