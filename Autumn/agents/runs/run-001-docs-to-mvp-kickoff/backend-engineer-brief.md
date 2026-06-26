# 后端工程师 Agent 首轮任务

## 输入

- `docs/development-implementation-plan.md`
- `docs/product-requirements.md`
- `agents/templates/api-design-template.md`
- `agents/templates/database-design-template.md`

## Sprint 0 后端任务

Sprint 0 不要求立刻实现真实服务，但必须输出前端可并行开发的契约草案。

## 首批接口契约草案

| 模块 | 接口 |
| --- | --- |
| User | `GET /api/user/profile` |
| ModelConfig | `GET /api/model-configs` |
| Project | `GET /api/projects`, `POST /api/projects`, `GET /api/projects/:projectId`, `PATCH /api/projects/:projectId` |
| Asset | `GET /api/projects/:projectId/assets`, `POST /api/projects/:projectId/assets/upload` |
| Storyboard | `GET /api/projects/:projectId/shots`, `PATCH /api/shots/:shotId`, `POST /api/shots/:shotId/regenerate` |
| Chat | `GET /api/projects/:projectId/chat/messages`, `POST /api/projects/:projectId/chat/messages` |
| Generation | `POST /api/projects/:projectId/generation-tasks`, `GET /api/generation-tasks/:taskId` |
| Timeline | `GET /api/projects/:projectId/timeline`, `PATCH /api/projects/:projectId/timeline` |
| Export | `POST /api/projects/:projectId/export-tasks`, `GET /api/export-tasks/:taskId` |

## 首批 Socket 事件

- `project:join`
- `project:leave`
- `generation:created`
- `generation:progress`
- `generation:succeeded`
- `generation:failed`
- `export:progress`
- `export:succeeded`
- `export:failed`

## 数据库实体草案

- users：复用现有用户系统。
- projects。
- project_snapshots。
- assets。
- shots。
- chat_messages。
- generation_tasks。
- timeline_tracks。
- timeline_clips。
- export_tasks。

## 待确认

- 现有后台管理系统项目位置。
- 鉴权 Token 方案。
- 文件服务返回 URL 还是 assetId。
- 生成任务服务现有错误码。

