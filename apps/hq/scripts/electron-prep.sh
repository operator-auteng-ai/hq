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
echo "✓ Standalone package ready for electron-builder"
