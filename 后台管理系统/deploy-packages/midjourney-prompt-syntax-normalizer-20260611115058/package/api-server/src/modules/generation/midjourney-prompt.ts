const MIDJOURNEY_PARAMETER_ALIASES: Record<string, string> = {
  aspect: 'ar',
  chaos: 'c',
  character: 'cref',
  characterweight: 'cw',
  quality: 'q',
  repeat: 'r',
  stylize: 's',
  styleweight: 'sw',
  version: 'v',
  weird: 'w',
};

const MIDJOURNEY_PARAMETER_NAMES = new Set([
  'ar', 'aspect', 'bs', 'c', 'chaos', 'cref', 'cw', 'draft', 'end', 'exp',
  'fast', 'hd', 'iw', 'loop', 'motion', 'niji', 'no', 'oref', 'ow', 'p',
  'profile', 'public', 'q', 'quality', 'r', 'raw', 'relax', 'repeat', 's',
  'seed', 'sref', 'stealth', 'stop', 'style', 'stylize', 'sw', 'tile', 'turbo',
  'v', 'version', 'video', 'w', 'weird',
]);

const MIDJOURNEY_SPACED_PARAMETER = new RegExp(
  `--\\s+(${Array.from(MIDJOURNEY_PARAMETER_NAMES).sort((a, b) => b.length - a.length).join('|')})\\b`,
  'gi',
);

type MidjourneyPromptPart = {
  key: string;
  value: string;
};

export function normalizeMidjourneyPromptSyntax(value: unknown) {
  const source = String(value || '')
    .replace(/\r?\n+/g, ' ')
    .replace(MIDJOURNEY_SPACED_PARAMETER, '--$1')
    .replace(/--\s+(?=[\p{L}\p{N}])/gu, '; ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!source) return '';

  const matches = Array.from(source.matchAll(/--([a-z][a-z0-9-]*)\b/gi));
  if (!matches.length) return tidyMidjourneyPromptBody(source);

  const bodyParts: string[] = [];
  const parameters: MidjourneyPromptPart[] = [];
  const noTerms: string[] = [];
  const firstIndex = matches[0].index || 0;
  if (firstIndex > 0) bodyParts.push(source.slice(0, firstIndex));

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    const start = match.index || 0;
    const end = index + 1 < matches.length ? (matches[index + 1].index || source.length) : source.length;
    const name = String(match[1] || '').toLowerCase();
    const segment = source.slice(start, end).trim();
    const remainder = source.slice(start + match[0].length, end).trim();
    if (!MIDJOURNEY_PARAMETER_NAMES.has(name)) {
      bodyParts.push([name, remainder].filter(Boolean).join(' '));
      continue;
    }
    const key = MIDJOURNEY_PARAMETER_ALIASES[name] || name;
    if (key === 'no') {
      noTerms.push(...splitMidjourneyNoTerms(remainder));
      continue;
    }
    parameters.push({ key, value: segment });
  }

  const deduped = new Map<string, string>();
  for (const parameter of parameters) {
    if (deduped.has(parameter.key)) deduped.delete(parameter.key);
    deduped.set(parameter.key, parameter.value);
  }
  const body = tidyMidjourneyPromptBody(bodyParts.join('; '));
  const suffixes = Array.from(deduped.values());
  const normalizedNoTerms = uniqueCaseInsensitive(noTerms);
  if (normalizedNoTerms.length) suffixes.push(`--no ${normalizedNoTerms.join(', ')}`);
  return [body, ...suffixes].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function splitMidjourneyNoTerms(value: string) {
  return String(value || '')
    .split(/[,，、;；]+/)
    .map(item => item.replace(/^[\s:：-]+|[\s,，、;；]+$/g, '').trim())
    .filter(Boolean);
}

function uniqueCaseInsensitive(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = String(value || '').trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function tidyMidjourneyPromptBody(value: string) {
  return String(value || '')
    .replace(/\s*;\s*;+/g, '; ')
    .replace(/\s+([，。！？、；：,.!?;:])/g, '$1')
    .replace(/^[\s,，;；:：-]+|[\s;；]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
