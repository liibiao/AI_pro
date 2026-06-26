import type { Response } from 'express';

export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = 'ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function ok(res: Response, data: Record<string, unknown> = {}) {
  res.json({ ok: true, ...data });
}

export function fail(status: number, message: string, code = 'ERROR'): never {
  throw new HttpError(status, message, code);
}

export function routeParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] || '' : value || '';
}
