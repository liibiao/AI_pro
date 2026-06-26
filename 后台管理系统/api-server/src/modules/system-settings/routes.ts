import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { fail, ok } from '../../http.js';
import { asyncHandler, requireAuth, requireRole } from '../../middleware.js';
import { adminRoles } from '../../types.js';
import { getSystemSettingDefinition, listSystemSettings, upsertSystemSetting } from './service.js';

const router = Router();

const updateSchema = z.object({
  settings: z.array(z.object({
    key: z.string().min(1),
    value: z.string().optional(),
  })).min(1),
});

router.get('/admin/system-settings', requireAuth, requireRole(adminRoles), asyncHandler(async (_req, res) => {
  ok(res, { items: await listSystemSettings() });
}));

router.patch('/admin/system-settings', requireAuth, requireRole(adminRoles), asyncHandler(async (req, res) => {
  const body = updateSchema.parse(req.body);
  const updatedKeys: string[] = [];
  await prisma.$transaction(async tx => {
    for (const item of body.settings) {
      const def = getSystemSettingDefinition(item.key);
      if (!def) fail(400, `不支持的系统配置：${item.key}`, 'SYSTEM_SETTING_NOT_SUPPORTED');
      if (def.isSecret && !item.value) continue;
      if (item.value === undefined) continue;
      if (item.key === 'payment.mode' && !['mock', 'alipay', 'voucher'].includes(item.value)) {
        fail(400, '支付模式只能是 mock、alipay 或 voucher', 'PAYMENT_MODE_INVALID');
      }
      if (def.valueType === 'NUMBER' && !Number.isFinite(Number(item.value))) {
        fail(400, `${def.label} 必须是数字`, 'SYSTEM_SETTING_NUMBER_INVALID');
      }
      if (def.valueType === 'BOOLEAN' && !['true', 'false'].includes(item.value)) {
        fail(400, `${def.label} 必须是 true 或 false`, 'SYSTEM_SETTING_BOOLEAN_INVALID');
      }
      await upsertSystemSetting(tx, item.key, item.value);
      updatedKeys.push(item.key);
    }
    if (updatedKeys.length > 0) {
      await tx.adminLog.create({
        data: {
          adminUserId: req.user!.id,
          action: 'SYSTEM_SETTINGS_UPDATE',
          targetType: 'SYSTEM_SETTING',
          targetId: updatedKeys.join(','),
          remark: `${updatedKeys.length} settings`,
        },
      });
    }
  });
  ok(res, { items: await listSystemSettings(), updatedKeys });
}));

export default router;
