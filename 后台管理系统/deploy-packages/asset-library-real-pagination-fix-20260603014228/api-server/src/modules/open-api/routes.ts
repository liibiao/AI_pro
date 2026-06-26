import { Router } from 'express';
import { ok, routeParam } from '../../http.js';
import { asyncHandler } from '../../middleware.js';
import { requireEnterpriseApiAuth, requirePersonalApiAuth } from '../../open-auth.js';
import {
  createGenerationTaskForPrincipal,
  getGenerationTaskForPrincipal,
  listGenerationTasksForPrincipal,
  queryGenerationTaskForPrincipal,
} from '../generation/routes.js';

export const openPersonalRoutes = Router();
export const openEnterpriseRoutes = Router();

openPersonalRoutes.post('/generation/tasks', requirePersonalApiAuth, asyncHandler(async (req, res) => {
  ok(res, await createGenerationTaskForPrincipal(req, req.openApiPrincipal!));
}));
openPersonalRoutes.get('/generation/tasks', requirePersonalApiAuth, asyncHandler(async (req, res) => {
  ok(res, await listGenerationTasksForPrincipal(req.openApiPrincipal!, req.query.limit, req.query.offset));
}));
openPersonalRoutes.get('/generation/tasks/:id', requirePersonalApiAuth, asyncHandler(async (req, res) => {
  ok(res, { task: await getGenerationTaskForPrincipal(routeParam(req.params.id), req.openApiPrincipal!) });
}));
openPersonalRoutes.post('/generation/tasks/:id/query', requirePersonalApiAuth, asyncHandler(async (req, res) => {
  ok(res, await queryGenerationTaskForPrincipal(routeParam(req.params.id), req.openApiPrincipal!));
}));

openEnterpriseRoutes.post('/generation/tasks', requireEnterpriseApiAuth, asyncHandler(async (req, res) => {
  ok(res, await createGenerationTaskForPrincipal(req, req.openApiPrincipal!));
}));
openEnterpriseRoutes.get('/generation/tasks', requireEnterpriseApiAuth, asyncHandler(async (req, res) => {
  ok(res, await listGenerationTasksForPrincipal(req.openApiPrincipal!, req.query.limit, req.query.offset));
}));
openEnterpriseRoutes.get('/generation/tasks/:id', requireEnterpriseApiAuth, asyncHandler(async (req, res) => {
  ok(res, { task: await getGenerationTaskForPrincipal(routeParam(req.params.id), req.openApiPrincipal!) });
}));
openEnterpriseRoutes.post('/generation/tasks/:id/query', requireEnterpriseApiAuth, asyncHandler(async (req, res) => {
  ok(res, await queryGenerationTaskForPrincipal(routeParam(req.params.id), req.openApiPrincipal!));
}));
