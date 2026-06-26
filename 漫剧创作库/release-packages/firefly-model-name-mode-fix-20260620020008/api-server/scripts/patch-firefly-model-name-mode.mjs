import fs from 'node:fs';
import path from 'node:path';

const apiRoot = process.cwd();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const marker = 'AIYUNZHI_FIREFLY_MODEL_NAME_MODE';

function backup(file) {
  fs.copyFileSync(file, `${file}.bak-firefly-model-name-mode-${stamp}`);
}

function hasResolverBlock(text) {
  return /function resolveAiyunzhiFireflyModelName\(ctx(?:: AdapterContext)?\) \{[\s\S]*?\r?\n\}\r?\n\s*function fireflyGptImageBaseModel/.test(text)
    || /function resolveAiyunzhiFireflyDirectModel\(ctx(?:: AdapterContext)?\) \{[\s\S]*?\r?\n\}\r?\n\s*function validAiyunzhiFireflyDirectModelName/.test(text);
}

function replaceResolver(text, replacement, file) {
  const modelNamePattern = /function resolveAiyunzhiFireflyModelName\(ctx(?:: AdapterContext)?\) \{[\s\S]*?\r?\n\}\r?\n\s*function fireflyGptImageBaseModel/;
  if (modelNamePattern.test(text)) return text.replace(modelNamePattern, `${replacement}\n\nfunction fireflyGptImageBaseModel`);
  const directPattern = /function resolveAiyunzhiFireflyDirectModel\(ctx(?:: AdapterContext)?\) \{[\s\S]*?\r?\n\}\r?\n\s*function validAiyunzhiFireflyDirectModelName/;
  if (directPattern.test(text)) return text.replace(directPattern, `${replacement}\n\nfunction validAiyunzhiFireflyDirectModelName`);
  throw new Error(`Firefly model resolver block not found in ${file}. Deploy Firefly adapter first.`);
}

function patch(file, replacement, options = {}) {
  const full = path.join(apiRoot, file);
  const required = options.required === true;
  if (!fs.existsSync(full)) {
    if (required) throw new Error(`required file not found: ${file}`);
    console.log(`[patch-firefly-model-name-mode] skip missing optional file ${file}`);
    return false;
  }
  const before = fs.readFileSync(full, 'utf8');
  if (!hasResolverBlock(before)) {
    if (required) throw new Error(`resolveAiyunzhiFireflyDirectModel block not found in required file ${file}. Deploy firefly direct adapter first.`);
    console.log(`[patch-firefly-model-name-mode] skip optional file without direct adapter block ${file}`);
    return false;
  }
  const after = replaceResolver(before, replacement, file);
  if (after !== before) {
    backup(full);
    fs.writeFileSync(full, after);
    console.log(`[patch-firefly-model-name-mode] patched ${file}`);
    return true;
  } else {
    console.log(`[patch-firefly-model-name-mode] unchanged ${file}`);
    return false;
  }
}

function tsResolver() {
  return `function resolveAiyunzhiFireflyModelName(ctx: AdapterContext) {
  // ${marker}: backend model management can choose literal model names or Firefly geometry suffixes.
  const configured = firstDefined(ctx.model.name, ctx.provider.defaultModel);
  const paramModel = firstDefined(ctx.params.model, ctx.params.image_model, ctx.params.imageModel);
  if (!shouldAssembleAiyunzhiFireflyDirectModel(ctx)) {
    return normalizeAiyunzhiFireflyLiteralModel(firstDefined(configured, paramModel));
  }
  const explicit = String(firstDefined(paramModel, configured) || '').trim();
  const explicitModel = validAiyunzhiFireflyModelName(explicit);
  if (explicitModel) return explicitModel;
  const base = fireflyGptImageBaseModel(explicit || configured || 'firefly-gpt-image');
  const resolution = resolveOpenAiImageResolution(ctx.params).toLowerCase();
  const aspectRatio = resolveOpenAiImageAspectRatio(ctx.params) || '1:1';
  return \`\${base}-\${resolution}-\${aspectRatio.replace(':', 'x')}\`;
}

function shouldAssembleAiyunzhiFireflyDirectModel(ctx: AdapterContext) {
  const modelAny = ctx.model as any;
  const providerAny = ctx.provider as any;
  const protocol = aiyunzhiFireflyRecord(firstDefined(modelAny.protocol, providerAny.protocol));
  const capabilities = aiyunzhiFireflyRecord(modelAny.capabilities);
  const defaults = aiyunzhiFireflyRecord(modelAny.defaults);
  const assembly = aiyunzhiFireflyRecord(firstDefined(modelAny.modelAssembly, modelAny.model_assembly, protocol.modelAssembly, protocol.model_assembly, capabilities.modelAssembly, capabilities.model_assembly));
  const mode = [
    ctx.params.modelNameMode, ctx.params.model_name_mode, ctx.params.upstreamModelMode, ctx.params.upstream_model_mode,
    modelAny.modelNameMode, modelAny.model_name_mode, modelAny.upstreamModelMode, modelAny.upstream_model_mode,
    protocol.modelNameMode, protocol.model_name_mode, protocol.upstreamModelMode, protocol.upstream_model_mode,
    defaults.modelNameMode, defaults.model_name_mode,
    assembly.type, assembly.mode, assembly.modelNameMode, assembly.model_name_mode,
  ].map(value => String(value || '').trim().toLowerCase()).find(Boolean) || '';
  if (/^(?:literal|static|exact|raw|base|real|none|no[-_ ]?suffix|without[-_ ]?geometry)$/.test(mode)) return false;
  if (/^(?:template|geometry|suffix|dynamic)$/.test(mode)) return true;
  const template = String(firstDefined(assembly.template, assembly.pattern) || '').toLowerCase();
  if (template.includes('{resolution}') || template.includes('{aspect') || template.includes('{imagesize}')) return true;
  const providerKey = String(firstDefined(providerAny.providerKey, modelAny.providerKey, modelAny.channelKey) || '').toLowerCase();
  if (providerKey.includes('firefly-gpt-image')) return true;
  return true;
}

function normalizeAiyunzhiFireflyLiteralModel(value: unknown) {
  return fireflyGptImageBaseModel(value || 'firefly-gpt-image');
}

function validAiyunzhiFireflyModelName(value: unknown) {
  const raw = String(value || '').trim().toLowerCase();
  const match = raw.match(/^(firefly-gpt-image)-((?:1|2|4)k)-([0-9]+x[0-9]+)$/i);
  if (!match) return '';
  const allowed = new Set(['16x9', '1x1', '21x9', '2x3', '3x2', '3x4', '4x3', '4x5', '5x4', '9x16']);
  if (!allowed.has(match[3].toLowerCase())) return '';
  return \`\${match[1].toLowerCase()}-\${match[2].toLowerCase()}-\${match[3].toLowerCase()}\`;
}

function aiyunzhiFireflyRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}`;
}

function jsResolver() {
  return `function resolveAiyunzhiFireflyModelName(ctx) {
    // ${marker}: backend model management can choose literal model names or Firefly geometry suffixes.
    const configured = firstDefined(ctx.model.name, ctx.provider.defaultModel);
    const paramModel = firstDefined(ctx.params.model, ctx.params.image_model, ctx.params.imageModel);
    if (!shouldAssembleAiyunzhiFireflyDirectModel(ctx)) {
        return normalizeAiyunzhiFireflyLiteralModel(firstDefined(configured, paramModel));
    }
    const explicit = String(firstDefined(paramModel, configured) || '').trim();
    const explicitModel = validAiyunzhiFireflyModelName(explicit);
    if (explicitModel)
        return explicitModel;
    const base = fireflyGptImageBaseModel(explicit || configured || 'firefly-gpt-image');
    const resolution = resolveOpenAiImageResolution(ctx.params).toLowerCase();
    const aspectRatio = resolveOpenAiImageAspectRatio(ctx.params) || '1:1';
    return \`\${base}-\${resolution}-\${aspectRatio.replace(':', 'x')}\`;
}
function shouldAssembleAiyunzhiFireflyDirectModel(ctx) {
    const modelAny = ctx.model;
    const providerAny = ctx.provider;
    const protocol = aiyunzhiFireflyRecord(firstDefined(modelAny.protocol, providerAny.protocol));
    const capabilities = aiyunzhiFireflyRecord(modelAny.capabilities);
    const defaults = aiyunzhiFireflyRecord(modelAny.defaults);
    const assembly = aiyunzhiFireflyRecord(firstDefined(modelAny.modelAssembly, modelAny.model_assembly, protocol.modelAssembly, protocol.model_assembly, capabilities.modelAssembly, capabilities.model_assembly));
    const mode = [
        ctx.params.modelNameMode, ctx.params.model_name_mode, ctx.params.upstreamModelMode, ctx.params.upstream_model_mode,
        modelAny.modelNameMode, modelAny.model_name_mode, modelAny.upstreamModelMode, modelAny.upstream_model_mode,
        protocol.modelNameMode, protocol.model_name_mode, protocol.upstreamModelMode, protocol.upstream_model_mode,
        defaults.modelNameMode, defaults.model_name_mode,
        assembly.type, assembly.mode, assembly.modelNameMode, assembly.model_name_mode,
    ].map(value => String(value || '').trim().toLowerCase()).find(Boolean) || '';
    if (/^(?:literal|static|exact|raw|base|real|none|no[-_ ]?suffix|without[-_ ]?geometry)$/.test(mode))
        return false;
    if (/^(?:template|geometry|suffix|dynamic)$/.test(mode))
        return true;
    const template = String(firstDefined(assembly.template, assembly.pattern) || '').toLowerCase();
    if (template.includes('{resolution}') || template.includes('{aspect') || template.includes('{imagesize}'))
        return true;
    const providerKey = String(firstDefined(providerAny.providerKey, modelAny.providerKey, modelAny.channelKey) || '').toLowerCase();
    if (providerKey.includes('firefly-gpt-image'))
        return true;
    return true;
}
function normalizeAiyunzhiFireflyLiteralModel(value) {
    return fireflyGptImageBaseModel(value || 'firefly-gpt-image');
}
function validAiyunzhiFireflyModelName(value) {
    const raw = String(value || '').trim().toLowerCase();
    const match = raw.match(/^(firefly-gpt-image)-((?:1|2|4)k)-([0-9]+x[0-9]+)$/i);
    if (!match)
        return '';
    const allowed = new Set(['16x9', '1x1', '21x9', '2x3', '3x2', '3x4', '4x3', '4x5', '5x4', '9x16']);
    if (!allowed.has(match[3].toLowerCase()))
        return '';
    return \`\${match[1].toLowerCase()}-\${match[2].toLowerCase()}-\${match[3].toLowerCase()}\`;
}
function aiyunzhiFireflyRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}`;
}

patch('src/modules/generation/adapters/registry.ts', tsResolver(), { required: false });
patch('dist/modules/generation/adapters/registry.js', jsResolver(), { required: true });
