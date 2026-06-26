import fs from 'node:fs';
import path from 'node:path';

const apiRoot = process.cwd();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

function backup(file) {
  fs.copyFileSync(file, `${file}.bak-video-flat-billing-${stamp}`);
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
  if (current.includes('resolutionTiers') && current.includes('memberCreditsPerGeneration') && current.includes('input')) {
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
    callNeedle: 'const flatPrice = videoFlatPriceForInput(model);',
    callReplacement: 'const flatPrice = videoFlatPriceForInput(model, input);',
    functionReplacement: tsBillingFunction,
  },
  {
    rel: 'dist/billing.js',
    callNeedle: 'const flatPrice = videoFlatPriceForInput(model);',
    callReplacement: 'const flatPrice = videoFlatPriceForInput(model, input);',
    functionReplacement: jsBillingFunction,
  },
];

let changed = 0;
let seen = 0;
for (const item of files) {
  const file = path.join(apiRoot, item.rel);
  if (!fs.existsSync(file)) continue;
  seen += 1;
  const before = fs.readFileSync(file, 'utf8');
  let after = replaceAllOrThrow(before, item.callNeedle, item.callReplacement, 'video flat billing call', item.rel);
  after = replaceFunction(after, 'videoFlatPriceForInput', 'normalizeVideoResolution', item.functionReplacement, item.rel);
  if (after !== before) {
    backup(file);
    fs.writeFileSync(file, after);
    changed += 1;
    console.log(`[patch-video-flat-billing] patched ${item.rel}`);
  } else {
    console.log(`[patch-video-flat-billing] unchanged ${item.rel}`);
  }
}

if (!seen) throw new Error('No billing source/dist files found to verify video flat billing');
console.log(`[patch-video-flat-billing] changed=${changed}`);
