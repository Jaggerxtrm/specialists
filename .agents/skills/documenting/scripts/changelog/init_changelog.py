#!/usr/bin/env python3
"""Initialize a new CHANGELOG.md file."""

import sys
from datetime import date
from pathlib import Path


def init_changelog(output_path: Path, initial_version: str = "0.1.0") -> None:
    """Create new CHANGELOG.md from template."""
    # Assuming the script is in skills/documenting/scripts/changelog/
    # And template is in skills/documenting/templates/
    # script path: .../skills/documenting/scripts/changelog/init_changelog.py
    # parent: .../skills/documenting/scripts/changelog
    # parent.parent: .../skills/documenting/scripts
    # parent.parent.parent: .../skills/documenting
    
    template_path = Path(__file__).resolve().parent.parent.parent / "templates" / "CHANGELOG.md.template"

    if not template_path.exists():
        raise FileNotFoundError(f"Template not found: {template_path}")

    if output_path.exists():
        raise FileExistsError(f"CHANGELOG already exists: {output_path}")

    template = template_path.read_text(encoding='utf-8')
    content = template.format(
        release_date=date.today().strftime('%Y-%m-%d'),
        initial_version=initial_version
    )

    output_path.write_text(content, encoding='utf-8')
    print(f"✅ Created {output_path}")
    print(f"📝 Initial version: {initial_version}")


def main():
    """CLI entry point."""
    if len(sys.argv) < 2:
        print("Usage: init_changelog.py <output_path> [initial_version]")
        print("")
        print("Example:")
        print("  init_changelog.py ./CHANGELOG.md")
        print("  init_changelog.py ./CHANGELOG.md 1.0.0")
        sys.exit(1)

    output_path = Path(sys.argv[1])
    initial_version = sys.argv[2] if len(sys.argv) > 2 else "0.1.0"

    init_changelog(output_path, initial_version)


if __name__ == "__main__":
    main()
