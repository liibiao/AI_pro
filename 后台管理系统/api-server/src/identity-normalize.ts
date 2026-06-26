const whitespace = /\s+/g;

export function stripAllSpaces(value: unknown) {
  return String(value ?? '').replace(whitespace, '');
}

export function normalizePhone(value: unknown) {
  const phone = stripAllSpaces(value);
  return phone || undefined;
}

export function normalizeEmail(value: unknown) {
  const email = stripAllSpaces(value).toLowerCase();
  return email || undefined;
}

export function normalizeNickname(value: unknown, fallback = '新用户') {
  return stripAllSpaces(value) || fallback;
}

export function normalizeLoginAccount(value: unknown) {
  return stripAllSpaces(value);
}
