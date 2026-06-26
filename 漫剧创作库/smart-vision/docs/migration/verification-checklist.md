# 无限画布迁移验收清单

## 1. 服务启动

推荐从仓库根目录运行：

```bash
smart-vision/scripts/run-legacy-workbench.sh
```

然后检查：

- `http://127.0.0.1:8766/api/workbench/health`
- 返回 `ok: true`
- 返回 `workbenchUrl`
- 返回 `imageStudioUrl`
- 返回 `imageStudioCanvasUrl`

## 2. 页面加载

访问：

- `http://127.0.0.1:8766/workbench.html`
- `http://127.0.0.1:8766/image-studio.html`
- `http://127.0.0.1:8766/image-studio-canvas.html`
- `http://127.0.0.1:8766/workbench-engine.js`

验收：

- 页面无 404。
- `workbench-engine.js` 可加载。
- 控制台无关键资源缺失。
- 无限画布可拖动、缩放、展开节点面板。

## 3. 模型配置

访问：

- `http://127.0.0.1:8766/api/workbench/image-studio/models`

验收：

- 返回 `ok: true`。
- `models` 非空。
- 能读取 `model-registry.json` 与 `models/*.json`。

## 4. 词库配置

访问：

- `http://127.0.0.1:8766/api/workbench/image-studio/wordlist`
- `http://127.0.0.1:8766/api/workbench/image-studio/wordlist?id=preset-recipes`

验收：

- 返回 `ok: true`。
- 能读取 `wordlists/mj-image/` 词库。

## 5. 文件上传与缓存

检查：

- `data/files/` 自动存在。
- 上传参考图后产生 `file-*.bin` 与 `file-*.json`。
- `/api/workbench/image-studio/file?path=...` 能读取文件。

## 6. 生图接口

前置：

- 在目标环境配置 `IMAGE_STUDIO_API_KEY`、`IMAGE_STUDIO_BASE_URL`、`IMAGE_STUDIO_MODEL`、`IMAGE_STUDIO_SIZE`。

验收：

- 页面点击生成后 `/api/workbench/image-studio/generate` 返回 `ok: true`。
- 输出写入 `runninghub_outputs/image-studio` 或兼容输出目录。

## 7. 对象存储可选链路

访问：

- `http://127.0.0.1:8766/api/workbench/image-studio/object-storage-status`

验收：

- 未配置时明确提示缺配置。
- 配置后 FILES / COS 等链路可切换。

## 8. 原始能力不破坏

仍需验证原始入口：

```bash
./studio status
./studio image
```

原始 `tools/` 与根 `studio` 未被移动或删除。
