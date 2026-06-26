import os
import shutil
import subprocess
import sys
import time
from pathlib import Path


REMOTE_ROOT = Path(os.environ.get("REMOTE_ROOT", "/var/www/ai-admin"))
APP_DIR = Path(os.environ.get("APP_DIR", str(REMOTE_ROOT / "ai-admin-platform")))
PM2_APP = os.environ.get("PM2_APP", "ai-admin-api")
PM2_USER = os.environ.get("PM2_USER", "ubuntu")
STAMP = time.strftime("%Y%m%d%H%M%S")
BACKUP_DIR = REMOTE_ROOT / "backups" / f"gpt-image-v2-admin-model-suffix-fix-inline-{STAMP}"


def log(message: str) -> None:
    print(f"[inline-patch] {message}", flush=True)


def fail(message: str) -> None:
    print(f"[inline-patch] ERROR: {message}", file=sys.stderr, flush=True)
    sys.exit(1)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        fail(f"marker not found for {label}")
    return text.replace(old, new, 1)


src_path = APP_DIR / "api-server/src/modules/generation/adapters/registry.ts"
dist_path = APP_DIR / "api-server/dist/modules/generation/adapters/registry.js"
if not src_path.exists():
    fail(f"missing source file: {src_path}")
if not dist_path.exists():
    fail(f"missing dist file: {dist_path}")

log(f"backup current files: {BACKUP_DIR}")
(BACKUP_DIR / "ai-admin-platform/api-server/src/modules/generation/adapters").mkdir(parents=True, exist_ok=True)
(BACKUP_DIR / "ai-admin-platform/api-server/dist/modules/generation/adapters").mkdir(parents=True, exist_ok=True)
shutil.copy2(src_path, BACKUP_DIR / "ai-admin-platform/api-server/src/modules/generation/adapters/registry.ts")
shutil.copy2(dist_path, BACKUP_DIR / "ai-admin-platform/api-server/dist/modules/generation/adapters/registry.js")

src = src_path.read_text(encoding="utf-8")
src = replace_once(
    src,
    """async function submitGptImageV2(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  assertImageModelName(ctx);
  const aspectRatio = String(ctx.params.aspect_ratio || ctx.params.aspectRatio || ctx.params.requestedRatio || ctx.params.size || '16:9');
  const resolution = String(ctx.params.resolution || ctx.params.requestedResolution || '1K').toUpperCase();
  const referenceImages = await buildGptImageV2ReferenceImages(ctx);""",
    """async function submitGptImageV2(ctx: AdapterContext): Promise<AdapterSubmitResult> {
  assertImageModelName(ctx);
  const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
  const aspectRatio = String(ctx.params.aspect_ratio || ctx.params.aspectRatio || ctx.params.requestedRatio || ctx.params.size || '16:9');
  const resolution = normalizeGptImageV2Resolution(ctx.params.resolution || ctx.params.requestedResolution || ctx.params.imageSize || defaults.resolution || defaults.imageSize);
  const requestModel = resolveGptImageV2ModelName(ctx.params.model || ctx.model.name, resolution);
  const referenceImages = await buildGptImageV2ReferenceImages(ctx);""",
    "typescript submitGptImageV2 header",
)
src = replace_once(src, "    model: normalizeGptImageV2BaseModel(ctx.model.name),", "    model: requestModel,", "typescript request model")
src = replace_once(
    src,
    """function normalizeGptImageV2BaseModel(modelName: string) {
  const raw = String(modelName || 'gpt-image-2').trim() || 'gpt-image-2';
  return raw.replace(/-(?:1|2|4)k$/i, '');
}""",
    """function normalizeGptImageV2Resolution(value: unknown) {
  const raw = String(value || '').trim().toLowerCase().replace(/\\s+/g, '');
  if (/^[1-4]k$/.test(raw)) return raw.toUpperCase();
  const sizeMatch = raw.match(/(\\d{3,5})[x×](\\d{3,5})/i);
  if (sizeMatch) {
    const longSide = Math.max(Number(sizeMatch[1]), Number(sizeMatch[2]));
    if (longSide >= 3500) return '4K';
    if (longSide >= 2500) return '3K';
    if (longSide >= 1500) return '2K';
    return '1K';
  }
  if (/^(?:uhd|4k|4096|3840|2160p)$/.test(raw)) return '4K';
  if (/^(?:3k|3072|2880|1800p)$/.test(raw)) return '3K';
  if (/^(?:qhd|2k|2048|1920|1440p)$/.test(raw)) return '2K';
  return '1K';
}

function resolveGptImageV2ModelName(modelName: unknown, resolution: unknown) {
  const baseModel = normalizeGptImageV2BaseModel(modelName);
  return `${baseModel}-${normalizeGptImageV2Resolution(resolution).toLowerCase()}`;
}

function normalizeGptImageV2BaseModel(modelName: unknown) {
  const raw = String(modelName || 'gpt-image-2').trim() || 'gpt-image-2';
  return raw.replace(/-(?:1|2|3|4)k$/i, '');
}""",
    "typescript helper",
)
src_path.write_text(src, encoding="utf-8")

dist = dist_path.read_text(encoding="utf-8")
dist = replace_once(
    dist,
    """async function submitGptImageV2(ctx) {
    assertImageModelName(ctx);
    const aspectRatio = String(ctx.params.aspect_ratio || ctx.params.aspectRatio || ctx.params.requestedRatio || ctx.params.size || '16:9');
    const resolution = String(ctx.params.resolution || ctx.params.requestedResolution || '1K').toUpperCase();
    const referenceImages = await buildGptImageV2ReferenceImages(ctx);""",
    """async function submitGptImageV2(ctx) {
    assertImageModelName(ctx);
    const defaults = isRecord(ctx.model.defaults) ? ctx.model.defaults : {};
    const aspectRatio = String(ctx.params.aspect_ratio || ctx.params.aspectRatio || ctx.params.requestedRatio || ctx.params.size || '16:9');
    const resolution = normalizeGptImageV2Resolution(ctx.params.resolution || ctx.params.requestedResolution || ctx.params.imageSize || defaults.resolution || defaults.imageSize);
    const requestModel = resolveGptImageV2ModelName(ctx.params.model || ctx.model.name, resolution);
    const referenceImages = await buildGptImageV2ReferenceImages(ctx);""",
    "dist submitGptImageV2 header",
)
dist = replace_once(dist, "        model: normalizeGptImageV2BaseModel(ctx.model.name),", "        model: requestModel,", "dist request model")
dist = replace_once(
    dist,
    """function normalizeGptImageV2BaseModel(modelName) {
    const raw = String(modelName || 'gpt-image-2').trim() || 'gpt-image-2';
    return raw.replace(/-(?:1|2|4)k$/i, '');
}""",
    """function normalizeGptImageV2Resolution(value) {
    const raw = String(value || '').trim().toLowerCase().replace(/\\s+/g, '');
    if (/^[1-4]k$/.test(raw))
        return raw.toUpperCase();
    const sizeMatch = raw.match(/(\\d{3,5})[x×](\\d{3,5})/i);
    if (sizeMatch) {
        const longSide = Math.max(Number(sizeMatch[1]), Number(sizeMatch[2]));
        if (longSide >= 3500)
            return '4K';
        if (longSide >= 2500)
            return '3K';
        if (longSide >= 1500)
            return '2K';
        return '1K';
    }
    if (/^(?:uhd|4k|4096|3840|2160p)$/.test(raw))
        return '4K';
    if (/^(?:3k|3072|2880|1800p)$/.test(raw))
        return '3K';
    if (/^(?:qhd|2k|2048|1920|1440p)$/.test(raw))
        return '2K';
    return '1K';
}
function resolveGptImageV2ModelName(modelName, resolution) {
    const baseModel = normalizeGptImageV2BaseModel(modelName);
    return `${baseModel}-${normalizeGptImageV2Resolution(resolution).toLowerCase()}`;
}
function normalizeGptImageV2BaseModel(modelName) {
    const raw = String(modelName || 'gpt-image-2').trim() || 'gpt-image-2';
    return raw.replace(/-(?:1|2|3|4)k$/i, '');
}""",
    "dist helper",
)
dist_path.write_text(dist, encoding="utf-8")

for path in (src_path, dist_path):
    text = path.read_text(encoding="utf-8")
    if "model: requestModel" not in text or "resolveGptImageV2ModelName" not in text or "normalizeGptImageV2Resolution" not in text:
        fail(f"verification markers missing after patch: {path}")

log("build api-server if TypeScript is available")
tsc = APP_DIR / "api-server/node_modules/typescript/bin/tsc"
if tsc.exists():
    subprocess.run(["node", str(tsc), "-p", "tsconfig.json"], cwd=APP_DIR / "api-server", check=True)
else:
    log("TypeScript toolchain not found; using patched dist")

log("restart api")
subprocess.run(f"pm2 restart {PM2_APP} --update-env || sudo -u {PM2_USER} PM2_HOME=/home/{PM2_USER}/.pm2 pm2 restart {PM2_APP} --update-env || true", shell=True, check=False)
subprocess.run(f"pm2 save || sudo -u {PM2_USER} PM2_HOME=/home/{PM2_USER}/.pm2 pm2 save || true", shell=True, check=False)

health = subprocess.run("curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1", shell=True)
log("api health: ok" if health.returncode == 0 else "api health: skipped/failed")
log(f"backup: {BACKUP_DIR}")
