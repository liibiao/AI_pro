import type { NextFunction, Request, Response } from 'express';
import { prisma } from './db.js';
import { HttpError } from './http.js';
import { hashApiToken, verifyEnterpriseUserToken } from './security.js';

function bearerToken(req: Request) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

export async function requirePersonalApiAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = bearerToken(req);
    if (!token) throw new HttpError(401, '缺少个人 API Token', 'OPEN_API_TOKEN_REQUIRED');
    const apiToken = await prisma.personalApiToken.findUnique({
      where: { tokenHash: hashApiToken(token) },
      include: { user: true },
    });
    if (!apiToken || apiToken.status !== 'ACTIVE') throw new HttpError(401, '个人 API Token 无效', 'OPEN_API_TOKEN_INVALID');
    if (apiToken.user.status !== 'ACTIVE') throw new HttpError(403, '账号已被禁用', 'USER_DISABLED');
    req.openApiPrincipal = {
      type: 'PERSONAL_API',
      billingUserId: apiToken.userId,
      userId: apiToken.userId,
      apiTokenId: apiToken.id,
      discountMode: 'FOLLOW_USER_MEMBERSHIP',
    };
    await prisma.personalApiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireEnterpriseApiAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = bearerToken(req);
    if (!token) throw new HttpError(401, '缺少企业 API Token', 'ENTERPRISE_API_TOKEN_REQUIRED');
    const apiToken = await prisma.enterpriseApiToken.findUnique({
      where: { tokenHash: hashApiToken(token) },
      include: { enterprise: true },
    });
    if (!apiToken || apiToken.status !== 'ACTIVE') throw new HttpError(401, '企业 API Token 无效', 'ENTERPRISE_API_TOKEN_INVALID');
    if (apiToken.expiredAt && apiToken.expiredAt <= new Date()) throw new HttpError(401, '企业 API Token 已过期', 'ENTERPRISE_API_TOKEN_EXPIRED');
    if (apiToken.enterprise.status !== 'ACTIVE') throw new HttpError(403, '企业账号已被禁用', 'ENTERPRISE_DISABLED');
    req.openApiPrincipal = {
      type: 'ENTERPRISE_API',
      billingUserId: apiToken.enterprise.billingUserId,
      enterpriseId: apiToken.enterpriseId,
      apiTokenId: apiToken.id,
      discountMode: 'FORCE_MEMBER_40_OFF',
    };
    await prisma.enterpriseApiToken.update({ where: { id: apiToken.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireEnterpriseUserAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = bearerToken(req);
    if (!token) throw new HttpError(401, '请先登录企业后台', 'ENTERPRISE_UNAUTHORIZED');
    let payload: ReturnType<typeof verifyEnterpriseUserToken>;
    try {
      payload = verifyEnterpriseUserToken(token);
    } catch {
      throw new HttpError(401, '企业后台登录已过期', 'ENTERPRISE_TOKEN_EXPIRED');
    }
    if (payload.kind !== 'ENTERPRISE_USER' || payload.status !== 'ACTIVE') throw new HttpError(401, '企业后台登录无效', 'ENTERPRISE_TOKEN_INVALID');
    const user = await prisma.enterpriseUser.findUnique({ where: { id: payload.id }, include: { enterprise: true } });
    if (!user || user.status !== 'ACTIVE') throw new HttpError(403, '企业用户已被禁用', 'ENTERPRISE_USER_DISABLED');
    if (user.enterprise.status !== 'ACTIVE') throw new HttpError(403, '企业账号已被禁用', 'ENTERPRISE_DISABLED');
    req.enterpriseUser = {
      id: user.id,
      enterpriseId: user.enterpriseId,
      role: user.role,
      status: 'ACTIVE',
      nickname: user.nickname,
    };
    next();
  } catch (err) {
    next(err);
  }
}
