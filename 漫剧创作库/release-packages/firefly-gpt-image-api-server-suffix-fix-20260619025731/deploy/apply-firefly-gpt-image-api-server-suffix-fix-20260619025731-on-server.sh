#!/usr/bin/env bash
set -euo pipefail

PKG="firefly-gpt-image-api-server-suffix-fix-20260619025731"
ARCHIVE="${1:-}"
APP_ROOT="/var/www/ai-admin/ai-admin-platform"
API_DIR="$APP_ROOT/api-server"
SRC_TS="$API_DIR/src/modules/generation/adapters/registry.ts"
DIST_JS="$API_DIR/dist/modules/generation/adapters/registry.js"
BACKUP_ROOT="/var/www/ai-admin/backups"
STAMP="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="$BACKUP_ROOT/$PKG-$STAMP"

log(){ printf '[deploy] %s\n' "$*"; }
die(){ printf '[deploy][error] %s\n' "$*" >&2; exit 1; }

[ -n "$ARCHIVE" ] || die "archive path is required"
[ -f "$ARCHIVE" ] || die "archive not found: $ARCHIVE"
[ -d "$API_DIR" ] || die "api-server dir not found: $API_DIR"
[ -f "$SRC_TS" ] || die "source registry not found: $SRC_TS"
[ -f "$DIST_JS" ] || die "dist registry not found: $DIST_JS"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

log "extract $ARCHIVE"
tar -xzf "$ARCHIVE" -C "$TMP_DIR"
[ -f "$TMP_DIR/$PKG/README.md" ] || die "package marker missing"

log "backup dir: $BACKUP_DIR"
mkdir -p "$BACKUP_DIR/src/modules/generation/adapters" "$BACKUP_DIR/dist/modules/generation/adapters"
cp -p "$SRC_TS" "$BACKUP_DIR/src/modules/generation/adapters/registry.ts"
cp -p "$DIST_JS" "$BACKUP_DIR/dist/modules/generation/adapters/registry.js"

log "patch firefly/gpt-image-v2 model resolver"
export SRC_TS DIST_JS
python3 - <<'PY'
from pathlib import Path
import os
import re

src = Path(os.environ["SRC_TS"])
dist = Path(os.environ["DIST_JS"])

src_new = """function resolveGptImageV2ModelName(modelName: unknown, resolution: unknown) {
  const fireflyModel = normalizeFireflyGptImageModelName(modelName);
  if (fireflyModel) return fireflyModel;
  const baseModel = normalizeGptImageV2BaseModel(modelName);
  const cleanResolution = normalizeGptImageV2Resolution(resolution);
  if (cleanResolution === '1K' || cleanResolution === '3K') return baseModel;
  return `${baseModel}-${cleanResolution.toLowerCase()}`;
}

function normalizeFireflyGptImageModelName(modelName: unknown) {
  const raw = String(modelName || '').trim();
  const matched = raw.match(/firefly-gpt-image(?:-(?:1|2|3|4)k-[0-9]+x[0-9]+(?:-(?:1|2|3|4)k)*)?/i)?.[0] || '';
  if (!matched) return '';
  return matched.replace(/(?:-(?:1|2|3|4)k)+$/i, '').toLowerCase() || 'firefly-gpt-image';
}
"""

dist_new = """function resolveGptImageV2ModelName(modelName, resolution) {
    const fireflyModel = normalizeFireflyGptImageModelName(modelName);
    if (fireflyModel)
        return fireflyModel;
    const baseModel = normalizeGptImageV2BaseModel(modelName);
    const cleanResolution = normalizeGptImageV2Resolution(resolution);
    if (cleanResolution === '1K' || cleanResolution === '3K')
        return baseModel;
    return `${baseModel}-${cleanResolution.toLowerCase()}`;
}
function normalizeFireflyGptImageModelName(modelName) {
    const raw = String(modelName || '').trim();
    const matched = raw.match(/firefly-gpt-image(?:-(?:1|2|3|4)k-[0-9]+x[0-9]+(?:-(?:1|2|3|4)k)*)?/i)?.[0] || '';
    if (!matched)
        return '';
    return matched.replace(/(?:-(?:1|2|3|4)k)+$/i, '').toLowerCase() || 'firefly-gpt-image';
}
"""

def replace_function(path: Path, replacement: str) -> None:
    text = path.read_text(encoding="utf-8")
    if "function normalizeFireflyGptImageModelName" in text and "const fireflyModel = normalizeFireflyGptImageModelName(modelName);" in text:
        print(f"[deploy] already patched: {path}")
        return
    pattern = re.compile(
        r"function resolveGptImageV2ModelName\([^)]*\) \{\n"
        r"(?:.|\n)*?"
        r"\n\}\n\n?function normalizeGptImageV2BaseModel",
        re.MULTILINE,
    )
    match = pattern.search(text)
    if not match:
        raise SystemExit(f"expected resolver block not found in {path}")
    text = text[:match.start()] + replacement + "\nfunction normalizeGptImageV2BaseModel" + text[match.end():]
    path.write_text(text, encoding="utf-8")
    print(f"[deploy] patched: {path}")

replace_function(src, src_new)
replace_function(dist, dist_new)
PY

log "verify installed markers"
grep -Fq "normalizeFireflyGptImageModelName" "$SRC_TS"
grep -Fq "normalizeFireflyGptImageModelName" "$DIST_JS"
grep -Fq "firefly-gpt-image(?:-(?:1|2|3|4)k-[0-9]+x[0-9]+" "$SRC_TS"
grep -Fq "firefly-gpt-image(?:-(?:1|2|3|4)k-[0-9]+x[0-9]+" "$DIST_JS"

log "run resolver smoke test"
node - <<'NODE'
function normalizeGptImageV2Resolution(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (/^(?:uhd|4k|4096|3840|2160p)$/.test(raw)) return '4K';
  if (/^(?:3k|3072|2880|1800p)$/.test(raw)) return '3K';
  if (/^(?:qhd|2k|2048|1920|1440p)$/.test(raw)) return '2K';
  return '1K';
}
function normalizeGptImageV2BaseModel(modelName) {
  const raw = String(modelName || 'gpt-image-2').trim() || 'gpt-image-2';
  return raw.replace(/-(?:1|2|3|4)k$/i, '');
}
function normalizeFireflyGptImageModelName(modelName) {
  const raw = String(modelName || '').trim();
  const matched = raw.match(/firefly-gpt-image(?:-(?:1|2|3|4)k-[0-9]+x[0-9]+(?:-(?:1|2|3|4)k)*)?/i)?.[0] || '';
  if (!matched) return '';
  return matched.replace(/(?:-(?:1|2|3|4)k)+$/i, '').toLowerCase() || 'firefly-gpt-image';
}
function resolveGptImageV2ModelName(modelName, resolution) {
  const fireflyModel = normalizeFireflyGptImageModelName(modelName);
  if (fireflyModel) return fireflyModel;
  const baseModel = normalizeGptImageV2BaseModel(modelName);
  const cleanResolution = normalizeGptImageV2Resolution(resolution);
  if (cleanResolution === '1K' || cleanResolution === '3K') return baseModel;
  return `${baseModel}-${cleanResolution.toLowerCase()}`;
}
const cases = [
  ['firefly-gpt-image-1k-3x2', '1k', 'firefly-gpt-image-1k-3x2'],
  ['firefly-gpt-image-1k-3x2-1k', '1k', 'firefly-gpt-image-1k-3x2'],
  ['firefly-gpt-image-2k-16x9', '2k', 'firefly-gpt-image-2k-16x9'],
  ['firefly-gpt-image-4k-9x16-4k', '4k', 'firefly-gpt-image-4k-9x16'],
  ['canvas-aiyunzhi-firefly-gpt-image', '1k', 'firefly-gpt-image'],
  ['gpt-image-2', '1k', 'gpt-image-2'],
  ['gpt-image-2', '2k', 'gpt-image-2-2k'],
  ['gpt-image-2', '3k', 'gpt-image-2'],
  ['gpt-image-2', '4k', 'gpt-image-2-4k'],
];
for (const [base, res, expected] of cases) {
  const actual = resolveGptImageV2ModelName(base, res);
  if (actual !== expected) throw new Error(`${base}/${res}: expected ${expected}, got ${actual}`);
}
NODE

log "restart pm2: ai-admin-api"
if pm2 describe ai-admin-api >/dev/null 2>&1; then
  pm2 restart ai-admin-api --update-env >/dev/null
elif id ubuntu >/dev/null 2>&1 && command -v runuser >/dev/null 2>&1; then
  runuser -l ubuntu -c 'pm2 restart ai-admin-api --update-env >/dev/null'
elif id ubuntu >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then
  sudo -u ubuntu bash -lc 'pm2 restart ai-admin-api --update-env >/dev/null'
else
  die "pm2 process ai-admin-api not found for current user and cannot switch to ubuntu"
fi

log "done"
echo "backup: $BACKUP_DIR"
