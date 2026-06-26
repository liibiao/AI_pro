import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { prisma } from './db.js';
import { errorHandler } from './middleware.js';
import authRoutes from './modules/auth/routes.js';
import userRoutes from './modules/users/routes.js';
import walletRoutes from './modules/wallets/routes.js';
import modelRoutes from './modules/models/routes.js';
import usageRoutes from './modules/usage/routes.js';
import generateRoutes from './modules/generate/routes.js';
import generationRoutes, { startGenerationTaskReconciler } from './modules/generation/routes.js';
import membershipRoutes from './modules/memberships/routes.js';
import agentRoutes from './modules/agents/routes.js';
import settlementRoutes from './modules/settlements/routes.js';
import trialCardRoutes from './modules/trial-cards/routes.js';
import canvasRoutes from './modules/canvas/routes.js';
import adminLogRoutes from './modules/admin-logs/routes.js';
import rechargeRoutes, { payNotifyRouter } from './modules/recharge/routes.js';
import workbenchCompatRoutes, { fileUploadCompatRouter } from './modules/workbench-compat/routes.js';
import systemSettingRoutes from './modules/system-settings/routes.js';
import agentCreditRoutes from './modules/agent-credit/routes.js';
import personalApiTokenRoutes from './modules/personal-api-tokens/routes.js';
import { openEnterpriseRoutes, openPersonalRoutes } from './modules/open-api/routes.js';
import { enterpriseAdminRoutes, enterpriseRouter } from './modules/enterprise/routes.js';
import dataPackRoutes from './modules/data-packs/routes.js';

const app = express();
const appDir = path.dirname(fileURLToPath(import.meta.url));
const integrationsDir = path.resolve(appDir, '..', '..', 'integrations');
const docsDir = path.resolve(appDir, '..', '..', 'docs');

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin(origin, callback) {
    const isLocalFileOrigin = origin === 'null' || origin === 'file://' || origin?.startsWith('file://');
    const isLocalDevOrigin = (() => {
      if (config.nodeEnv === 'production' || !origin) return false;
      try {
        const url = new URL(origin);
        return ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
      } catch {
        return false;
      }
    })();
    if (!origin || isLocalFileOrigin || isLocalDevOrigin || config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use('/integrations', express.static(integrationsDir));
app.use('/docs', express.static(docsDir));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'ai-admin-platform-api', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api', modelRoutes);
app.use('/api/usage', usageRoutes);
app.use('/api/generate', generateRoutes);
app.use('/api/generation', generationRoutes);
app.use('/api/personal-api-tokens', personalApiTokenRoutes);
app.use('/api/open/personal', openPersonalRoutes);
app.use('/api/open/enterprise', openEnterpriseRoutes);
app.use('/api/admin/enterprise', enterpriseAdminRoutes);
app.use('/api/enterprise', enterpriseRouter);
app.use('/api/membership', membershipRoutes);
app.use('/api', membershipRoutes);
app.use('/api', agentRoutes);
app.use('/api', settlementRoutes);
app.use('/api', trialCardRoutes);
app.use('/api', agentCreditRoutes);
app.use('/api', canvasRoutes);
app.use('/api', adminLogRoutes);
app.use('/api', systemSettingRoutes);
app.use('/api', workbenchCompatRoutes);
app.use('/api', dataPackRoutes);
app.use('/api/recharge', rechargeRoutes);
app.use('/api/pay', payNotifyRouter);
app.use('/v1/files', fileUploadCompatRouter);

app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`API server listening on http://127.0.0.1:${config.port}`);
  startGenerationTaskReconciler();
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
