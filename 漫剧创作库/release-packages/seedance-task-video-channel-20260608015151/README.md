# seedance-task-video-channel-20260608015151

变更内容：

- 新增视频模型配置 `seedance-2-0`，真实模型为 `doubao-seedance-2-0-260128`。
- 新增后台视频适配器 `seedance-task`，调用 `https://api.aiid.edu.kg/api/v3/contents/generations/tasks`。
- 生视频节点会把文本、参考图、参考视频、参考音频转换为 Seedance 文档要求的 `content` 多模态数组。
- 状态查询兼容 `items[].status`、`items[].progress`、`items[].error`、`items[].content.video_url` / `items[].video_url`。
- 更新模型 registry，让后台模型配置可选择并加载 Seedance 渠道。

部署包：

```bash
release-packages/seedance-task-video-channel-20260608015151.tar.gz
```

部署脚本：

```bash
release-packages/seedance-task-video-channel-20260608015151/deploy/apply-seedance-task-video-channel-20260608015151-on-server.sh
```
