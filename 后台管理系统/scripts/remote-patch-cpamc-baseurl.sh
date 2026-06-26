#!/usr/bin/env bash
set -euo pipefail

PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-http://43.165.186.217/v1}"
WEB_ROOT="${WEB_ROOT:-/opt/cliproxy-cpamc/html/cpamc}"

JS_FILE="$(ls -t "$WEB_ROOT"/assets/index-*.js | head -n 1)"
if [[ -z "${JS_FILE:-}" || ! -f "$JS_FILE" ]]; then
  echo "CPAMC JS asset not found under $WEB_ROOT/assets" >&2
  exit 1
fi

sudo cp "$JS_FILE" "${JS_FILE}.bak.$(date +%Y%m%d%H%M%S)"

sudo PUBLIC_BASE_URL="$PUBLIC_BASE_URL" JS_FILE="$JS_FILE" python3 - <<'PY'
from pathlib import Path
import os
import re

public = os.environ["PUBLIC_BASE_URL"]
p = Path(os.environ["JS_FILE"])
s = p.read_text(errors="ignore")

s = s.replace('"http://127.0.0.1:8317/v1"', f'"{public}"')
s = s.replace('`http://${window.location.hostname}:8317/v1`', f'"{public}"')
s = s.replace('`http://${window.location.hostname||"127.0.0.1"}:8317/v1`', f'"{public}"')

# Minified blocks: const port=cfg.port||8317,host=window.location.hostname||"127.0.0.1";setUrl(`http://${host}:${port}/v1`)
s = re.sub(
    r'const ([A-Za-z_$][A-Za-z0-9_$]*)=([^,;]+)\.port\|\|8317,([A-Za-z_$][A-Za-z0-9_$]*)=window\.location\.hostname\|\|"127\.0\.0\.1";([A-Za-z_$][A-Za-z0-9_$]*)\(`http://\$\{\3\}:\$\{\1\}/v1`\)',
    rf'\4("{public}")',
    s,
)

# Playground block: const cfg=await Uo.get(),port=(cfg?.port)||8317,host=window.location.hostname||"127.0.0.1",keys=...
s = re.sub(
    r'const ([A-Za-z_$][A-Za-z0-9_$]*)=await Uo\.get\(\),([A-Za-z_$][A-Za-z0-9_$]*)=\(\1==null\?void 0:\1\.port\)\|\|8317,([A-Za-z_$][A-Za-z0-9_$]*)=window\.location\.hostname\|\|"127\.0\.0\.1",([A-Za-z_$][A-Za-z0-9_$]*)=Array\.isArray\((\1==null\?void 0:\1\["api-keys"\])\)\?([^;]+);([A-Za-z_$][A-Za-z0-9_$]*)\(`http://\$\{\3\}:\$\{\2\}/v1`\)',
    rf'const \1=await Uo.get(),\4=Array.isArray(\5)?\6;\7("{public}")',
    s,
)

p.write_text(s)

bad = [
    "http://127.0.0.1:8317/v1",
    'window.location.hostname||"127.0.0.1"',
    "window.location.hostname}:8317/v1",
]
for item in bad:
    if item in s:
        raise SystemExit(f"patch incomplete, still found: {item}")

print(f"patched {p}")
print(f"public base url count: {s.count(public)}")
PY

sudo nginx -t
sudo systemctl reload nginx

grep -Rao "$PUBLIC_BASE_URL" "$WEB_ROOT/assets" | head

