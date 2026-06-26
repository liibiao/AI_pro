# Artifex Seedance 2 Full Chain

三档渠道：

- `seedance-2-fast`: 720p，4-15 秒，450 积分/次
- `seedance-2`: 720p，4-15 秒，600 积分/次
- `seedance-2-pro-1080p`: 1080p，4-15 秒，700 积分/次

覆盖范围：

- 画布视频节点模型、能力、素材限制与 8 秒轮询
- 124 `/api/generation/tasks` 到 Artifex `/v1/videos`
- 完成/失败状态、视频 URL、封面 URL、自动退款
- 固定按次计费和后台模型管理配置
- 生产画布、源码镜像与 Python 兼容服务

部署脚本会复用数据库中已有 Artifex 加密 API Key。若服务器没有可复用密钥，部署时需提供 `ARTIFEX_API_KEY`，否则脚本会终止。

部署文件：

```bash
/tmp/artifex-seedance2-full-chain-20260611040410.tar.gz
```

服务器执行：

```bash
bash /tmp/deploy-artifex-seedance2-full-chain-on-124.sh \
  /tmp/artifex-seedance2-full-chain-20260611040410.tar.gz
```
