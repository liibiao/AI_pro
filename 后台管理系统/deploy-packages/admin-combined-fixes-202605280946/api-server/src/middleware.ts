import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@prisma/client';
import { ZodError } from 'zod';
import { prisma } from './db.js';
import { HttpError } from './http.js';
import { verifyToken } from './security.js';

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  Promise.resolve(requireAuthInner(req, res, next)).catch(next);
}

async function requireAuthInner(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const queryToken = typeof req.query?.token === 'string' ? req.query.token : '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : queryToken;
  if (!token) throw new HttpError(401, '请先登录', 'UNAUTHORIZED');
  let payload: ReturnType<typeof verifyToken>;
  try {
    payload = verifyToken(token);
  } catch {
    throw new HttpError(401, '登录已过期，请重新登录', 'UNAUTHORIZED');
  }
  if (payload.status !== 'ACTIVE') throw new HttpError(403, '账号已被禁用', 'USER_DISABLED');
  const user = await prisma.user.findUnique({
    where: { id: payload.id },
    select: { currentSessionId: true, status: true },
  });
  if (!user) throw new HttpError(401, '登录已过期，请重新登录', 'UNAUTHORIZED');
  if (user.status !== 'ACTIVE') throw new HttpError(403, '账号已被禁用', 'USER_DISABLED');
  const clientType = payload.clientType || 'CANVAS';
  if (clientType === 'CANVAS' && user.currentSessionId && payload.sessionId !== user.currentSessionId) {
    throw new HttpError(401, '账号已在其他设备登录，当前设备已下线', 'SESSION_REPLACED');
  }
  req.user = {
    id: payload.id,
    role: payload.role,
    status: 'ACTIVE',
    nickname: payload.nickname,
    sessionId: payload.sessionId,
    clientType,
  };
  next();
}

export function requireRole(roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new HttpError(401, '请先登录', 'UNAUTHORIZED');
    if (!roles.includes(req.user.role)) throw new HttpError(403, '权限不足', 'FORBIDDEN');
    next();
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ ok: false, code: err.code, error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ ok: false, code: 'VALIDATION_ERROR', error: err.errors.map(item => item.message).join('；') || '参数错误' });
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  res.status(500).json({ ok: false, code: 'INTERNAL_ERROR', error: message });
}
