#!/usr/bin/env bash
# bump-version.sh
# Bumps the patch version in package.json before each Electron build.
# Ensures every DMG has a unique, monotonically increasing version number
# so you always know exactly which build you're running.
#
# Usage: bash scripts/bump-version.sh [major|minor|patch]
#   Defaults to "patch" if no argument is given.
set -euo pipefail

PART="${1:-patch}"
PKG_JSON="$(dirname "$0")/../package.json"

# Read current version
CURRENT=$(node -e "console.log(require('$PKG_JSON').version)")

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$PART" in
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
    echo "Usage: $0 [major|minor|patch]"
    exit 1
    ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"

# Update package.json in-place (portable: works on macOS and Linux)
node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('$PKG_JSON', 'utf8'));
pkg.version = '$NEW_VERSION';
fs.writeFileSync('$PKG_JSON', JSON.stringify(pkg, null, 2) + '\n');
"

echo "Version bumped: $CURRENT → $NEW_VERSION"
