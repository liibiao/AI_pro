import fs from 'node:fs';
import path from 'node:path';

const filePath = path.resolve('src/main.tsx');
let source = fs.readFileSync(filePath, 'utf8');
const originalSource = source;
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const backupPath = `${filePath}.bak-video-flat-resolution-pricing-${stamp}`;

fs.copyFileSync(filePath, backupPath);

function replaceExact(label, before, after) {
  if (source.includes(after)) {
    console.log(`[skip] ${label}`);
    return;
  }
  if (!source.includes(before)) {
    throw new Error(`Cannot find block: ${label}`);
  }
  source = source.replace(before, after);
  console.log(`[patch] ${label}`);
}

function insertBefore(label, marker, insertion) {
  if (source.includes(insertion.trim())) {
    console.log(`[skip] ${label}`);
    return;
  }
  if (!source.includes(marker)) {
    throw new Error(`Cannot find marker: ${label}`);
  }
  source = source.replace(marker, `${insertion}${marker}`);
  console.log(`[patch] ${label}`);
}

function replaceBranchBefore(label, startMarker, endMarker, replacement) {
  if (source.includes(replacement.trim())) {
    console.log(`[skip] ${label}`);
    return;
  }
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Cannot find branch start: ${label}`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`Cannot find branch end: ${label}`);
  source = `${source.slice(0, start)}${replacement}\n\n${source.slice(end)}`;
  console.log(`[patch] ${label}`);
}

function replaceBalancedBlock(label, startMarker, replacement) {
  if (source.includes(replacement.trim())) {
    console.log(`[skip] ${label}`);
    return;
  }
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`Cannot find block start: ${label}`);
  const openBrace = source.indexOf('{', start);
  if (openBrace < 0) throw new Error(`Cannot find block brace: ${label}`);
  let depth = 0;
  let end = -1;
  for (let i = openBrace; i < source.length; i += 1) {
    const char = source[i];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) {
      end = i + 1;
      break;
    }
  }
  if (end < 0) throw new Error(`Cannot find balanced block end: ${label}`);
  source = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
  console.log(`[patch] ${label}`);
}

function ensureFlatTierValuesReturned() {
  const target = [
    '    videoFlatPrice: Number.isFinite(defaultVideoFlatPrice) ? defaultVideoFlatPrice : 0,',
    '    videoFlatTierPrices,',
  ].join('\n');
  if (source.includes(target)) {
    console.log('[skip] pricing form includes flat tier values');
    return;
  }
  const match = source.match(/^    videoFlatPrice:[^\n]*,\n(?!    videoFlatTierPrices,)/m)?.[0];
  if (!match) {
    throw new Error('Cannot find block: pricing form includes flat tier values');
  }
  source = source.replace(match, `${target}\n`);
  console.log('[patch] pricing form includes flat tier values');
}

replaceExact(
  'per-generation model list label uses resolution tiers',
  [
    "  if (videoBillingModeFromModel(model) === 'per_generation') {",
    '    const price = videoFlatMemberPrice(model);',
    '    return `${Number.isFinite(price) ? price : 0} 积分/次`;',
    '  }',
  ].join('\n'),
  [
    "  if (videoBillingModeFromModel(model) === 'per_generation') {",
    '    const tiers = Array.isArray(pricing?.resolutionTiers) ? pricing.resolutionTiers : [];',
    '    const tierText = tiers',
    '      .map((tier: any) => {',
    "        const label = String(tier?.resolution || tier?.label || tier?.quality || '').trim();",
    '        const price = videoFlatTierMemberPrice(tier);',
    "        if (!label || !Number.isFinite(price)) return '';",
    '        return `${label} ${price}`;',
    '      })',
    '      .filter(Boolean);',
    "    if (tierText.length) return `${tierText.join(' / ')} 积分/次`;",
    '    const price = videoFlatMemberPrice(model);',
    '    return `${Number.isFinite(price) ? price : 0} 积分/次`;',
    '  }',
  ].join('\n'),
);

replaceExact(
  'billing mode option label',
  "{ value: 'per_generation', label: '按次统一价' },",
  "{ value: 'per_generation', label: '按次计费' },",
);

replaceExact(
  'per-generation resolution price fields',
  [
    '          {isPerGeneration ? (',
    '            <Form.Item name="videoFlatPrice" label="按次会员积分/次" rules={[{ required: true, message: \'请填写按次价格\' }]}>',
    "              <InputNumber min={0} precision={0} style={{ width: '100%' }} />",
    '            </Form.Item>',
    '          ) : null}',
    '        </div>',
    '        {hasScenarioPricing ? (',
  ].join('\n'),
  [
    '          {isPerGeneration ? (',
    '            <Form.Item name="videoFlatPrice" label="默认会员积分/次" rules={[{ required: true, message: \'请填写默认按次价格\' }]}>',
    "              <InputNumber min={0} precision={0} style={{ width: '100%' }} />",
    '            </Form.Item>',
    '          ) : null}',
    '        </div>',
    '        {isPerGeneration ? (',
    '          <div className="formGrid2">',
    '            {resolutions.map(resolution => (',
    '              <Form.Item',
    '                key={resolution}',
    "                name={['videoFlatTierPrices', resolution]}",
    '                label={`${resolution}会员积分/次`}',
    '                rules={[{ required: true, message: `请填写 ${resolution} 按次价格` }]}',
    '              >',
    "                <InputNumber min={0} precision={0} style={{ width: '100%' }} />",
    '              </Form.Item>',
    '            ))}',
    '          </div>',
    '        ) : null}',
    '        {hasScenarioPricing ? (',
  ].join('\n'),
);

insertBefore(
  'flat per-generation tier helper',
  '\nfunction supportsVideoInputScenarioPricing(model: any) {',
  [
    '\nfunction videoFlatTierMemberPrice(tier: any) {',
    '  const value = Number(',
    '    tier?.memberCreditsPerGeneration ??',
    '      tier?.chargedCreditsPerGeneration ??',
    '      tier?.creditsPerGeneration ??',
    '      tier?.pricePerGeneration ??',
    '      tier?.memberCreditsPerRequest ??',
    '      tier?.chargedCreditsPerRequest ??',
    '      tier?.creditsPerRequest ??',
    '      tier?.pricePerRequest,',
    '  );',
    '  return Number.isFinite(value) && value >= 0 ? value : undefined;',
    '}',
    '',
  ].join('\n'),
);

replaceExact(
  'pricing form initial flat tier values',
  [
    '  const videoTierPrices = Object.fromEntries(videoPricingResolutionList(model).map(resolution => {',
    '    const item = videoPricingTier(model, resolution);',
    '    return [resolution, videoTierMemberPrice(item) ?? Number(model.pricePerSecond || 0)];',
    '  }));',
    '  const videoScenarioTierPrices = Object.fromEntries(videoPricingResolutionList(model).map(resolution => {',
  ].join('\n'),
  [
    '  const videoTierPrices = Object.fromEntries(videoPricingResolutionList(model).map(resolution => {',
    '    const item = videoPricingTier(model, resolution);',
    '    return [resolution, videoTierMemberPrice(item) ?? Number(model.pricePerSecond || 0)];',
    '  }));',
    '  const defaultVideoFlatPrice = videoFlatMemberPrice(model);',
    '  const videoFlatTierPrices = Object.fromEntries(videoPricingResolutionList(model).map(resolution => {',
    '    const item = videoPricingTier(model, resolution);',
    '    return [resolution, videoFlatTierMemberPrice(item) ?? (Number.isFinite(defaultVideoFlatPrice) ? defaultVideoFlatPrice : 0)];',
    '  }));',
    '  const videoScenarioTierPrices = Object.fromEntries(videoPricingResolutionList(model).map(resolution => {',
  ].join('\n'),
);

ensureFlatTierValuesReturned();

replaceExact(
  'pricing submit destructures flat tier values',
  '  const { imageTierPrices, videoTierPrices, videoScenarioTierPrices, videoBillingMode, videoFlatPrice, ...rest } = values;',
  '  const { imageTierPrices, videoTierPrices, videoFlatTierPrices, videoScenarioTierPrices, videoBillingMode, videoFlatPrice, ...rest } = values;',
);

replaceExact(
  'pricing submit passes flat tier values',
  '  if (type === \'VIDEO\') return normalizeVideoPricingSubmitValues(model, rest, videoTierPrices || {}, videoBillingMode, videoFlatPrice, videoScenarioTierPrices || {});',
  '  if (type === \'VIDEO\') return normalizeVideoPricingSubmitValues(model, rest, videoTierPrices || {}, videoBillingMode, videoFlatPrice, videoFlatTierPrices || {}, videoScenarioTierPrices || {});',
);

replaceExact(
  'video pricing submit signature accepts flat tier values',
  [
    '  videoTierPrices: Record<string, unknown>,',
    '  videoBillingMode: unknown,',
    '  videoFlatPrice: unknown,',
    '  videoScenarioTierPrices: Record<string, any>,',
  ].join('\n'),
  [
    '  videoTierPrices: Record<string, unknown>,',
    '  videoBillingMode: unknown,',
    '  videoFlatPrice: unknown,',
    '  videoFlatTierPrices: Record<string, unknown>,',
    '  videoScenarioTierPrices: Record<string, any>,',
  ].join('\n'),
);

replaceBalancedBlock(
  'per-generation submit writes resolutionTiers',
  "  if (String(videoBillingMode || '').trim() === 'per_generation') {",
  [
    "  if (String(videoBillingMode || '').trim() === 'per_generation') {",
    '    const fallbackMember = Math.max(0, Number(videoFlatPrice || 0));',
    '    const flatMembers = videoPricingResolutionList(model)',
    '      .map(resolution => ({ resolution, value: Number(videoFlatTierPrices?.[resolution]) }))',
    '      .filter(item => Number.isFinite(item.value) && item.value >= 0);',
    '    const resolutionTiers = (flatMembers.length ? flatMembers : [{ resolution: \'default\', value: fallbackMember }]).map(item => {',
    '      const originalCredits = memberOriginal(item.value);',
    '      const costCredits = memberCost(item.value);',
    '      return {',
    '        resolution: item.resolution,',
    '        chargedCreditsPerGeneration: item.value,',
    '        memberCreditsPerGeneration: item.value,',
    '        originalCreditsPerGeneration: originalCredits,',
    '        costCreditsPerGeneration: costCredits,',
    '      };',
    '    });',
    '    const firstTier = resolutionTiers[0] || {',
    '      chargedCreditsPerGeneration: fallbackMember,',
    '      memberCreditsPerGeneration: fallbackMember,',
    '      originalCreditsPerGeneration: memberOriginal(fallbackMember),',
    '      costCreditsPerGeneration: memberCost(fallbackMember),',
    '    };',
    '    return {',
    '      type: rest.type,',
    '      status: rest.status,',
    "      unit: 'generation',",
    '      salePrice: firstTier.chargedCreditsPerGeneration,',
    '      pricePerSecond: 0,',
    '      costPrice: firstTier.costCreditsPerGeneration,',
    '      defaults: {',
    '        ...existingDefaults,',
    '        pricing: {',
    '          ...existingPricing,',
    "          unit: 'generation',",
    "          billingMode: 'per_generation',",
    "          currency: existingPricing.currency || 'credits',",
    '          memberDiscountRate: 0.4,',
    '          chargedCreditsPerGeneration: firstTier.chargedCreditsPerGeneration,',
    '          memberCreditsPerGeneration: firstTier.memberCreditsPerGeneration,',
    '          originalCreditsPerGeneration: firstTier.originalCreditsPerGeneration,',
    '          costCreditsPerGeneration: firstTier.costCreditsPerGeneration,',
    '          resolutionTiers,',
    '        },',
    '      },',
    '    };',
    '  }',
  ].join('\n'),
);

if (source === originalSource) {
  console.log('[noop] main.tsx already up to date');
} else {
  fs.writeFileSync(filePath, source);
  console.log(`[ok] updated ${filePath}`);
}
console.log(`[backup] ${backupPath}`);
