import fs from 'node:fs';
import path from 'node:path';

const apiRoot = process.cwd();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

function backup(file) {
  fs.copyFileSync(file, `${file}.bak-aiyunzhi-sd2-preview-merge-${stamp}`);
}

function replaceAllOrThrow(text, needle, replacement, label, file) {
  if (text.includes(replacement)) return text;
  if (!text.includes(needle)) throw new Error(`${label} target not found in ${file}`);
  return text.split(needle).join(replacement);
}

function replaceFunction(text, functionName, nextFunctionName, replacement, file) {
  const start = text.indexOf(`function ${functionName}`);
  if (start < 0) throw new Error(`${functionName} not found in ${file}`);
  const end = text.indexOf(`\nfunction ${nextFunctionName}`, start);
  if (end < 0) throw new Error(`${nextFunctionName} marker not found in ${file}`);
  const current = text.slice(start, end);
  if (current.includes('resolutionTiers') && current.includes('memberCreditsPerGeneration') && current.includes('input?: CreditInput')) {
    return text;
  }
  return `${text.slice(0, start)}${replacement.trimEnd()}\n${text.slice(end)}`;
}

const tsBillingFunction = `
function videoFlatPriceForInput(
  model: { defaults?: Prisma.JsonValue | null; unit?: string | null; salePrice: number; costPrice: unknown },
  input?: CreditInput,
) {
  const pricing = recordValue(recordValue(model.defaults)?.pricing);
  const unit = String(pricing?.unit || model.unit || '').trim().toLowerCase();
  const billingMode = String(pricing?.billingMode || pricing?.billing_mode || '').trim().toLowerCase();
  const perGeneration = ['generation', 'per_generation', 'per-generation', 'flat', 'request', 'per_request', 'per-request'].includes(unit)
    || ['generation', 'per_generation', 'per-generation', 'flat', 'request', 'per_request', 'per-request'].includes(billingMode);
  if (!perGeneration) return null;
  const resolution = normalizeVideoResolution(input?.resolution || stringParam(input?.params, ['resolution', 'requestedResolution', 'quality']));
  const tiers = Array.isArray(pricing?.resolutionTiers) ? pricing.resolutionTiers : [];
  const matched = tiers
    .map(item => recordValue(item))
    .find(item => normalizeVideoResolution(String(item?.resolution || item?.label || item?.quality || '')) === resolution);
  const source = matched || pricing;
  const configuredMember = Number(
    source?.memberCreditsPerGeneration ??
    source?.chargedCreditsPerGeneration ??
    source?.creditsPerGeneration ??
    source?.pricePerGeneration ??
    source?.memberCreditsPerRequest ??
    source?.chargedCreditsPerRequest ??
    source?.creditsPerRequest ??
    source?.pricePerRequest ??
    NaN
  );
  const modelMember = Number(model.salePrice);
  const member = Number.isFinite(configuredMember) && configuredMember >= 0
    ? configuredMember
    : (Number.isFinite(modelMember) && modelMember >= 0 ? modelMember : 0);
  const original = Number(
    source?.originalCreditsPerGeneration ??
    source?.listCreditsPerGeneration ??
    source?.standardCreditsPerGeneration ??
    source?.originalCreditsPerRequest ??
    NaN
  );
  const cost = Number(
    source?.costCreditsPerGeneration ??
    source?.costCreditsPerRequest ??
    source?.costPerGeneration ??
    source?.costPerRequest ??
    NaN
  );
  return {
    memberCredits: member,
    originalCredits: Number.isFinite(original) && original >= member ? original : originalCreditsFromMember(member),
    costCredits: Number.isFinite(cost) && cost >= 0 ? cost : (numberValue(model.costPrice) || roundCredits(member * 0.7)),
  };
}
`;

const jsBillingFunction = `
function videoFlatPriceForInput(model, input) {
    const pricing = recordValue(recordValue(model.defaults)?.pricing);
    const unit = String(pricing?.unit || model.unit || '').trim().toLowerCase();
    const billingMode = String(pricing?.billingMode || pricing?.billing_mode || '').trim().toLowerCase();
    const perGeneration = ['generation', 'per_generation', 'per-generation', 'flat', 'request', 'per_request', 'per-request'].includes(unit)
        || ['generation', 'per_generation', 'per-generation', 'flat', 'request', 'per_request', 'per-request'].includes(billingMode);
    if (!perGeneration)
        return null;
    const resolution = normalizeVideoResolution(input?.resolution || stringParam(input?.params, ['resolution', 'requestedResolution', 'quality']));
    const tiers = Array.isArray(pricing?.resolutionTiers) ? pricing.resolutionTiers : [];
    const matched = tiers
        .map(item => recordValue(item))
        .find(item => normalizeVideoResolution(String(item?.resolution || item?.label || item?.quality || '')) === resolution);
    const source = matched || pricing;
    const configuredMember = Number(source?.memberCreditsPerGeneration ??
        source?.chargedCreditsPerGeneration ??
        source?.creditsPerGeneration ??
        source?.pricePerGeneration ??
        source?.memberCreditsPerRequest ??
        source?.chargedCreditsPerRequest ??
        source?.creditsPerRequest ??
        source?.pricePerRequest ??
        NaN);
    const modelMember = Number(model.salePrice);
    const member = Number.isFinite(configuredMember) && configuredMember >= 0
        ? configuredMember
        : (Number.isFinite(modelMember) && modelMember >= 0 ? modelMember : 0);
    const original = Number(source?.originalCreditsPerGeneration ??
        source?.listCreditsPerGeneration ??
        source?.standardCreditsPerGeneration ??
        source?.originalCreditsPerRequest ??
        NaN);
    const cost = Number(source?.costCreditsPerGeneration ??
        source?.costCreditsPerRequest ??
        source?.costPerGeneration ??
        source?.costPerRequest ??
        NaN);
    return {
        memberCredits: member,
        originalCredits: Number.isFinite(original) && original >= member ? original : originalCreditsFromMember(member),
        costCredits: Number.isFinite(cost) && cost >= 0 ? cost : (numberValue(model.costPrice) || roundCredits(member * 0.7)),
    };
}
`;

const files = [
  {
    rel: 'src/billing.ts',
    replacements: text => {
      let out = replaceAllOrThrow(text, 'const flatPrice = videoFlatPriceForInput(model);', 'const flatPrice = videoFlatPriceForInput(model, input);', 'billing call', 'src/billing.ts');
      out = replaceFunction(out, 'videoFlatPriceForInput', 'normalizeVideoResolution', tsBillingFunction, 'src/billing.ts');
      return out;
    },
  },
  {
    rel: 'dist/billing.js',
    replacements: text => {
      let out = replaceAllOrThrow(text, 'const flatPrice = videoFlatPriceForInput(model);', 'const flatPrice = videoFlatPriceForInput(model, input);', 'billing call', 'dist/billing.js');
      out = replaceFunction(out, 'videoFlatPriceForInput', 'normalizeVideoResolution', jsBillingFunction, 'dist/billing.js');
      return out;
    },
  },
  {
    rel: 'src/modules/generation/adapters/registry.ts',
    replacements: text => replaceAllOrThrow(
      text,
      "  if (/^sd2-full$/i.test(sdModel)) return `sd2-${requestedResolution}`;\n  if (/^sd2$/i.test(sdModel)) return 'seedance-2';",
      "  if (/^sd2-full$/i.test(sdModel)) return `sd2-${requestedResolution}`;\n  if (/^sd2-preview$/i.test(sdModel)) return `sd2-${requestedResolution}-preview`;\n  if (/^sd2$/i.test(sdModel)) return 'seedance-2';",
      'sd2-preview model assembly',
      'src/modules/generation/adapters/registry.ts',
    ),
  },
  {
    rel: 'dist/modules/generation/adapters/registry.js',
    replacements: text => replaceAllOrThrow(
      text,
      "    if (/^sd2-full$/i.test(sdModel))\n        return `sd2-${requestedResolution}`;\n    if (/^sd2$/i.test(sdModel))",
      "    if (/^sd2-full$/i.test(sdModel))\n        return `sd2-${requestedResolution}`;\n    if (/^sd2-preview$/i.test(sdModel))\n        return `sd2-${requestedResolution}-preview`;\n    if (/^sd2$/i.test(sdModel))",
      'sd2-preview model assembly',
      'dist/modules/generation/adapters/registry.js',
    ),
  },
];

let changed = 0;
for (const item of files) {
  const file = path.join(apiRoot, item.rel);
  if (!fs.existsSync(file)) throw new Error(`missing ${item.rel}`);
  const before = fs.readFileSync(file, 'utf8');
  const after = item.replacements(before);
  if (after !== before) {
    backup(file);
    fs.writeFileSync(file, after);
    changed += 1;
    console.log(`[patch-sd2-preview-merge] patched ${item.rel}`);
  } else {
    console.log(`[patch-sd2-preview-merge] unchanged ${item.rel}`);
  }
}

console.log(`[patch-sd2-preview-merge] changed=${changed}`);
