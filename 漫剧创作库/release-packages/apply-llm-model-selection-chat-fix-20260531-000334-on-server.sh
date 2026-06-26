#!/usr/bin/env bash
set -euo pipefail
ARCHIVE="${1:-}"
TARGET="${2:-$(pwd)}"
if [[ -z "$ARCHIVE" ]]; then
  echo "Usage: $0 /path/to/package.tar.gz /path/to/project-root" >&2
  exit 2
fi
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT
tar -xzf "$ARCHIVE" -C "$TMPDIR"
PKGDIR="$(find "$TMPDIR" -mindepth 1 -maxdepth 1 -type d | head -1)"
rsync -a "$PKGDIR"/ "$TARGET"/
echo "Deployed LLM model selection/chat fix to $TARGET"
echo "Restart backend/frontend services, then hard-refresh the canvas page."
