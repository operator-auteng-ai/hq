#!/usr/bin/env bash
# electron-prep.sh
# Prepares the Next.js standalone output for Electron packaging.
#
# Next.js standalone tracing is designed for serverless (Vercel) where the
# platform supplies modules. For Electron, we need fully self-contained
# node_modules. This script:
#   1. Copies standalone output with dereferenced symlinks
#   2. Merges root-level modules into the app-level node_modules
#   3. Replaces partially-traced modules with their full versions
set -euo pipefail

STANDALONE=".next/standalone"
PKG=".next/standalone-pkg"
APP_MODULES="$PKG/apps/hq/node_modules"
ROOT_MODULES="../../node_modules"

echo "→ Cleaning previous standalone-pkg..."
rm -rf "$PKG"

echo "→ Copying standalone output (dereferencing symlinks)..."
rsync -aL --exclude '.pnpm' --exclude 'release' "$STANDALONE/" "$PKG/"

echo "→ Merging root-level node_modules into app-level..."
rsync -a "$PKG/node_modules/" "$APP_MODULES/"

echo "→ Replacing partially-traced modules with full versions..."
replaced=0

# Regular modules
for dir in "$APP_MODULES"/*/; do
  [ -d "$dir" ] || continue
  name=$(basename "$dir")

  # Skip scoped modules (handled below)
  [[ "$name" == @* ]] && continue

  src="$ROOT_MODULES/$name"
  if [ -d "$src" ]; then
    rsync -aL --delete --exclude '.bin' "$src/" "$dir/"
    replaced=$((replaced + 1))
  fi
done

# Scoped modules (@scope/name)
for scope_dir in "$APP_MODULES"/@*/; do
  [ -d "$scope_dir" ] || continue
  scope=$(basename "$scope_dir")

  for dir in "$scope_dir"*/; do
    [ -d "$dir" ] || continue
    name=$(basename "$dir")

    src="$ROOT_MODULES/$scope/$name"
    if [ -d "$src" ]; then
      rsync -aL --delete --exclude '.bin' "$src/" "$dir/"
      replaced=$((replaced + 1))
    fi
  done
done

echo "→ Replaced $replaced modules with full versions"

echo "→ Rebuilding native modules for Electron..."
# better-sqlite3 must be compiled against Electron's Node.js headers,
# not the system Node.js, otherwise we get NODE_MODULE_VERSION mismatches.
ELECTRON_VERSION=$(node -e "console.log(require('electron/package.json').version)")
echo "  Electron version: $ELECTRON_VERSION"

# Find a better-sqlite3 directory to rebuild (prefer the one in node_modules)
SQLITE_DIR="$APP_MODULES/better-sqlite3"
if [ ! -d "$SQLITE_DIR" ]; then
  # Fallback: find it anywhere in the standalone package
  SQLITE_DIR=$(find "$PKG" -type d -name "better-sqlite3" | head -1)
fi

if [ -z "$SQLITE_DIR" ] || [ ! -d "$SQLITE_DIR" ]; then
  echo "⚠ Could not find better-sqlite3 directory to rebuild"
  exit 1
fi

echo "  Rebuilding: $SQLITE_DIR"
npx @electron/rebuild \
  --version "$ELECTRON_VERSION" \
  --module-dir "$SQLITE_DIR" \
  --only better-sqlite3

# Next.js standalone traces native modules into .next/node_modules/ with
# content-hashed directory names (e.g. better-sqlite3-90e2652d1716b047).
# We need to replace ALL .node binaries with the Electron-rebuilt versions.
REBUILT_NODE="$SQLITE_DIR/build/Release/better_sqlite3.node"
if [ -f "$REBUILT_NODE" ]; then
  echo "→ Replacing all traced better_sqlite3.node copies..."
  copied=0
  while IFS= read -r target; do
    # Skip the source file itself
    [ "$target" = "$REBUILT_NODE" ] && continue
    cp "$REBUILT_NODE" "$target"
    echo "  Replaced: $target"
    copied=$((copied + 1))
  done < <(find "$PKG" -name "better_sqlite3.node" -type f)
  echo "✓ Replaced $copied additional .node copies"
else
  echo "⚠ Rebuilt .node file not found at $REBUILT_NODE"
  exit 1
fi

echo "✓ Native modules rebuilt for Electron $ELECTRON_VERSION"
echo "✓ Standalone package ready for electron-builder"
