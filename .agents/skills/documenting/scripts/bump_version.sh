#!/bin/bash
# Semantic version bumping utility for SSOT memories
#
# Usage: bump_version.sh <current_version> <bump_type>
# bump_type: major | minor | patch
#
# Examples:
#   bump_version.sh 1.2.3 patch  -> 1.2.4
#   bump_version.sh 1.2.3 minor  -> 1.3.0
#   bump_version.sh 1.2.3 major  -> 2.0.0

set -e

if [ $# -ne 2 ]; then
    echo "Usage: $0 <current_version> <bump_type>"
    echo "bump_type: major | minor | patch"
    echo ""
    echo "Examples:"
    echo "  $0 1.2.3 patch  -> 1.2.4"
    echo "  $0 1.2.3 minor  -> 1.3.0"
    echo "  $0 1.2.3 major  -> 2.0.0"
    exit 1
fi

CURRENT_VERSION=$1
BUMP_TYPE=$2

# Validate version format
if ! echo "$CURRENT_VERSION" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    echo "ERROR: Invalid version format: $CURRENT_VERSION"
    echo "Expected format: x.y.z (e.g., 1.2.3)"
    exit 1
fi

# Parse version components
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Bump version based on type
case "$BUMP_TYPE" in
    major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
    patch)
        PATCH=$((PATCH + 1))
        ;;
    *)
        echo "ERROR: Invalid bump type: $BUMP_TYPE"
        echo "Must be one of: major, minor, patch"
        exit 1
        ;;
esac

NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
echo "$NEW_VERSION"
