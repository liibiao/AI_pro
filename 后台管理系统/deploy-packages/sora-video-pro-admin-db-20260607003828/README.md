# sora-video-pro-admin-db-20260607003828

变更内容：

- 后台 generation adapter 新增 `sora-video-pro`，按 Artifex `/v1/videos` 文档提交 `video-pro-720p`。
- 管理端模型能力识别新增 `sora-video-pro`：720p、4-15 秒、6 种画幅、9 图/3 视频/3 音频参考。
- 兼容层保留 `extra_images`、`extra_videos`、`extra_audios` 参数。
- 部署时 upsert `sora-video-pro` 渠道和 `canvas-sora-video-pro` 视频模型到数据库。

部署包：

```bash
deploy-packages/sora-video-pro-admin-db-20260607003828.tar.gz
```

部署脚本：

```bash
deploy-packages/sora-video-pro-admin-db-20260607003828/deploy/apply-sora-video-pro-admin-db-20260607003828-on-server.sh
```
