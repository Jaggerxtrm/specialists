#!/usr/bin/env python3
"""
Add entry to CHANGELOG.md [Unreleased] section.

Automatically:
- Places entry in correct category
- Creates category if missing
- Maintains category ordering per Keep a Changelog
- Preserves existing entries
"""

import re
import sys
from enum import Enum
from pathlib import Path
from typing import Optional


class ChangeCategory(Enum):
    """Keep a Changelog categories in proper order."""
    ADDED = "Added"
    CHANGED = "Changed"
    DEPRECATED = "Deprecated"
    REMOVED = "Removed"
    FIXED = "Fixed"
    SECURITY = "Security"


CATEGORY_ORDER = [cat.value for cat in ChangeCategory]


def add_entry(changelog_content: str, category: ChangeCategory, description: str) -> str:
    """
    Add entry to [Unreleased] section under specified category.

    Args:
        changelog_content: Full CHANGELOG.md content
        category: ChangeCategory enum value
        description: Entry text (without leading "- ")

    Returns:
        Updated changelog content
    """
    lines = changelog_content.splitlines()

    # Find [Unreleased] section
    unreleased_idx = None
    for i, line in enumerate(lines):
        if re.match(r"^## \[Unreleased\]", line):
            unreleased_idx = i
            break

    if unreleased_idx is None:
        raise ValueError("CHANGELOG missing [Unreleased] section")

    # Find next version section (end of Unreleased)
    next_version_idx = len(lines)
    for i in range(unreleased_idx + 1, len(lines)):
        if re.match(r"^## \[.+\]", lines[i]):
            next_version_idx = i
            break

    # Find or create category section
    category_name = category.value
    category_idx = None

    for i in range(unreleased_idx + 1, next_version_idx):
        if lines[i].strip() == f"### {category_name}":
            category_idx = i
            break

    if category_idx is None:
        # Category doesn't exist, create it in proper order
        category_idx = _insert_category_in_order(
            lines,
            unreleased_idx,
            next_version_idx,
            category_name
        )
        # Update next_version_idx as lines shifted
        # Wait, if I insert, I need to know how many lines. 
        # _insert_category_in_order returns the index of the new category header.
        # But if it inserted blank lines, the indices after it shifted. 
        # But next_version_idx is an index, so if I insert BEFORE it, it shifts.
        # Let's check _insert_category_in_order implementation logic.
        # It mutates 'lines' list.
        # If it inserts 2 lines, next_version_idx should increase by 2.
        # But wait, next_version_idx was calculated based on initial list.
        # I should probably re-calculate or just use the return value.
        # But wait, the function mutates the list.
        # Let's look at the implementation below.
        
        # Recalculate next_version_idx to be safe? 
        # Or rely on finding the category index.
        pass

    # Re-find next version idx just to be safe if lines shifted
    for i in range(unreleased_idx + 1, len(lines)):
        if re.match(r"^## \[.+\]", lines[i]):
            next_version_idx = i
            break
    else:
        next_version_idx = len(lines)
        
    # Re-find category index
    for i in range(unreleased_idx + 1, next_version_idx):
        if lines[i].strip() == f"### {category_name}":
            category_idx = i
            break

    # Find where to insert the entry (after category header)
    insert_idx = category_idx + 1

    # Skip existing entries to add at end of category
    while insert_idx < len(lines) and insert_idx < next_version_idx and lines[insert_idx].strip().startswith("- "):
        insert_idx += 1

    # Insert the new entry
    entry_line = f"- {description}"
    lines.insert(insert_idx, entry_line)

    return '\n'.join(lines)


def _insert_category_in_order(
    lines: list,
    unreleased_idx: int,
    next_version_idx: int,
    category_name: str
) -> int:
    """
    Insert category header in proper Keep a Changelog order.

    Returns:
        Index where category header was inserted
    """
    category_order_idx = CATEGORY_ORDER.index(category_name)

    # Find existing categories in Unreleased section
    existing_categories = []
    # Note: next_version_idx is based on current lines state
    for i in range(unreleased_idx + 1, next_version_idx):
        match = re.match(r"^### (.+)$", lines[i])
        if match:
            cat = match.group(1)
            if cat in CATEGORY_ORDER:
                existing_categories.append((i, cat))

    # Find insertion point
    insert_idx = next_version_idx
    for idx, cat in existing_categories:
        cat_order_idx = CATEGORY_ORDER.index(cat)
        if category_order_idx < cat_order_idx:
            # Insert before this category
            insert_idx = idx
            break

    # Insert category header with blank line before if not first
    if existing_categories:
        lines.insert(insert_idx, "")
        insert_idx += 1
    else:
        # First category, add blank line after [Unreleased]
        lines.insert(unreleased_idx + 1, "")
        insert_idx = unreleased_idx + 2

    lines.insert(insert_idx, f"### {category_name}")

    return insert_idx


def add_entry_to_file(
    filepath: Path,
    category: ChangeCategory,
    description: str
) -> None:
    """Add entry to CHANGELOG file."""
    if not filepath.exists():
        raise FileNotFoundError(f"CHANGELOG not found: {filepath}")

    content = filepath.read_text(encoding='utf-8')
    updated = add_entry(content, category, description)
    filepath.write_text(updated, encoding='utf-8')

    print(f"✅ Added to {filepath.name}:")
    print(f"   [{category.value}] {description}")


def main():
    """CLI entry point."""
    if len(sys.argv) != 4:
        print("Usage: add_entry.py <changelog_file> <category> <description>")
        print("")
        print("Categories: Added, Changed, Deprecated, Removed, Fixed, Security")
        print("")
        print("Example:")
        print('  add_entry.py CHANGELOG.md Added "New semantic search feature"')
        sys.exit(1)

    filepath = Path(sys.argv[1])
    category_str = sys.argv[2]
    description = sys.argv[3]

    # Validate category
    try:
        category = ChangeCategory[category_str.upper()]
    except KeyError:
        print(f"ERROR: Invalid category '{category_str}'")
        print(f"Valid: {', '.join(CATEGORY_ORDER)}")
        sys.exit(1)

    add_entry_to_file(filepath, category, description)


if __name__ == "__main__":
    main()
