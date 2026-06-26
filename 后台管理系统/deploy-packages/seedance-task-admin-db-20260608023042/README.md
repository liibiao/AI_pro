# seedance-task-admin-db-20260608023042

变更内容：

- 后台 generation adapter 新增 `seedance-task`，按 AIID `/api/v3/contents/generations/tasks` 提交 Seedance 2.0 多模态视频任务。
- 工作台兼容层支持 `seedance-task` 视频模型，画布可从后台模型列表拿到该模型并发起调用。
- 后台管理模型编辑下拉框新增 `Seedance 2.0 Task` 适配器和 AIID Base URL 预设。
- 部署时 upsert `AIID Seedance 2.0 Task` 渠道和 `Seedance 2.0` 视频模型到数据库。

部署包：

```bash
deploy-packages/seedance-task-admin-db-20260608023042.tar.gz
```

部署脚本：

```bash
deploy-packages/seedance-task-admin-db-20260608023042/deploy/apply-seedance-task-admin-db-20260608023042-on-server.sh
```
