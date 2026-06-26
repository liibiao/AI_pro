# sora-video-pro-channel-20260607002115

变更内容：

- 新增视频模型配置 `sora-video-pro`，真实模型为 `video-pro-720p`。
- 打通新画布生视频节点的 `image_url`、`extra_images`、`extra_videos`、`extra_audios` 参数。
- 后台服务新增 `sora-video-pro` 异步任务提交、轮询、公开视频下载代理兼容。
- 更新模型 registry，让后台管理系统可选择并加载该渠道。

部署包：

```bash
release-packages/sora-video-pro-channel-20260607002115.tar.gz
```

部署脚本：

```bash
release-packages/sora-video-pro-channel-20260607002115/deploy/apply-sora-video-pro-channel-20260607002115-on-server.sh
```
