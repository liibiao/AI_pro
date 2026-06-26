#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-/tmp/cpamc-public-baseurl-20260517.tar.gz}"
REMOTE_HOST="${REMOTE_HOST:-43.165.186.217}"
REMOTE_USER="${REMOTE_USER:-ubuntu}"
REMOTE_ARCHIVE="/tmp/cpamc-public-baseurl-20260517.tar.gz"
REMOTE_TMP="/tmp/cpamc-public-baseurl"
REMOTE_WEB_ROOT="/opt/cliproxy-cpamc/html/cpamc"

if [[ ! -f "$ARCHIVE" ]]; then
  echo "Archive not found: $ARCHIVE" >&2
  exit 1
fi

scp "$ARCHIVE" "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ARCHIVE}"

ssh "${REMOTE_USER}@${REMOTE_HOST}" <<'REMOTE'
set -euo pipefail
REMOTE_ARCHIVE="/tmp/cpamc-public-baseurl-20260517.tar.gz"
REMOTE_TMP="/tmp/cpamc-public-baseurl"
REMOTE_WEB_ROOT="/opt/cliproxy-cpamc/html/cpamc"

rm -rf "$REMOTE_TMP"
mkdir -p "$REMOTE_TMP"
tar -xzf "$REMOTE_ARCHIVE" -C "$REMOTE_TMP"

sudo mkdir -p "$REMOTE_WEB_ROOT"
sudo rm -rf "${REMOTE_WEB_ROOT:?}/"*
sudo cp -a "$REMOTE_TMP/dist/." "$REMOTE_WEB_ROOT/"

sudo nginx -t
sudo systemctl reload nginx

curl -sS http://127.0.0.1:3000/cpamc/ | head -c 160
echo
grep -Rao "43.165.186.217/v1" "$REMOTE_WEB_ROOT/assets" | head
REMOTE

