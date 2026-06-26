#!/usr/bin/env bash
set -euo pipefail

ROOT="${ROOT:-/var/www/ai-admin}"
API_DIR="${API_DIR:-$ROOT/ai-admin-platform/api-server}"
CANVAS_HTML="${CANVAS_HTML:-$ROOT/workbench-web/image-studio-canvas-next.html}"

if [[ ! -d "$API_DIR" ]]; then
  echo "api-server not found: $API_DIR" >&2
  exit 1
fi
if [[ ! -f "$CANVAS_HTML" ]]; then
  echo "canvas html not found: $CANVAS_HTML" >&2
  exit 1
fi

sudo cp "$API_DIR/src/modules/models/routes.ts" "$API_DIR/src/modules/models/routes.ts.bak.$(date +%Y%m%d%H%M%S)"
sudo cp "$CANVAS_HTML" "$CANVAS_HTML.bak.$(date +%Y%m%d%H%M%S)"

sudo API_DIR="$API_DIR" CANVAS_HTML="$CANVAS_HTML" python3 - <<'PY'
from pathlib import Path
import os
import re

api_dir = Path(os.environ["API_DIR"])
canvas = Path(os.environ["CANVAS_HTML"])
src = api_dir / "src/modules/models/routes.ts"

text = src.read_text()
text = re.sub(
    r"where:\s*\{\s*status:\s*'ACTIVE',\s*\.\.\.\(type \? \{ type: type as 'IMAGE' \| 'VIDEO' \| 'LLM' \} : \{\}\),\s*\},",
    """where: {
      status: 'ACTIVE',
      provider: { status: 'ACTIVE' },
      ...(type ? { type: type as 'IMAGE' | 'VIDEO' | 'LLM' } : {}),
    },""",
    text,
)
src.write_text(text)

html = canvas.read_text()
html = html.replace("if(built.viaGateway&&!built.payload?.baseUrl){", "if(built.viaGateway){")
canvas.write_text(html)

print("patched source:", src)
print("patched canvas:", canvas)
PY

cd "$API_DIR"
npm run build
pm2 restart ai-admin-api

grep -n "provider: { status: 'ACTIVE' }" "$API_DIR/src/modules/models/routes.ts"
grep -n "built.viaGateway" "$CANVAS_HTML" | head
curl -sS http://127.0.0.1:4000/api/health
