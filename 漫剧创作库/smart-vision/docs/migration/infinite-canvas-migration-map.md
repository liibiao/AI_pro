# 无限画布迁移清单

## 1. 迁移目标

将原无限画布相关代码完整复制到 `smart-vision/` 独立平台工程，方便后续智能视界进行能力对接和代码接口调用。

本轮迁移不移动、不删除、不重构原始 `tools/` 与根 `studio`。

## 2. 已迁移的必须文件与目录

| 源路径 | 目标路径 | 类型 | 说明 |
|---|---|---|---|
| `tools/workbench-web/` | `smart-vision/canvas/legacy-workbench/workbench-web/` | UI / JS / 静态配置 | 无限画布页面、工作台页面、画布 JS 引擎、模型配置与静态资源。 |
| `tools/workbench_server.py` | `smart-vision/services/workbench/workbench_server.py` | 后台服务 | 本地工作台与无限画布 API 服务。 |
| `tools/workbench_core.py` | `smart-vision/services/workbench/workbench_core.py` | 逻辑层 | 工作台核心逻辑。 |
| `tools/image_studio_backend.py` | `smart-vision/services/workbench/image_studio_backend.py` | 后台能力 | 图像生成、文件处理与相关 API 支撑。 |
| `tools/init_outputs.py` | `smart-vision/services/workbench/init_outputs.py` | 支撑脚本 | 输出目录初始化。 |
| `tools/object_storage_uploader.py` | `smart-vision/services/workbench/object_storage_uploader.py` | 可选能力 | 对象存储上传链路，作为 FILES / COS 等可切换保留能力。 |
| `tools/workbench_cli.py` | `smart-vision/services/workbench/workbench_cli.py` | CLI 入口 | 保留副本；存在 `export_current_outputs.py` 缺失依赖风险时不作为主启动入口。 |
| `tools/workbench-web/model-registry.json` | `smart-vision/config/model-registry.json` | 配置 | 模型 registry 副本。 |
| `wordlists/mj-image/` | `smart-vision/config/wordlists/mj-image/` | 词库配置 | 无限画布生图工具词库依赖。 |

## 3. 暂未迁移 / 不应迁移

| 路径 | 处理 | 原因 |
|---|---|---|
| `tools/auto_generate_*.py` | 暂不迁移 | 项目批处理链路，不属于无限画布最小运行边界。 |
| `tools/seedance_*.py` | 暂不迁移 | 视频提示词 / Seedance 流水线，不属于画布 UI 主链。 |
| `tools/runninghub_client.py` | 暂不迁移 | RunningHub 项目生产能力，非无限画布最小运行必需。 |
| `tools/prompt_*validate.py` | 暂不迁移 | 提示词校验工具，不属于画布运行主链。 |
| `projects/` | 暂不迁移 | 项目产物目录，后续如接入项目流水线再按需挂载。 |
| `runninghub_outputs/` | 暂不复制实体产物 | 输出目录体量较大，本轮只保留启动脚本自动创建目录。 |
| `.env` | 不复制 | 含环境密钥风险，目标环境应重新配置。 |

## 4. 路径适配风险

迁移副本中的 `workbench_server.py` 原本假设自身位于仓库根的 `tools/` 下，并通过：

```python
SCRIPT_DIR = Path(__file__).resolve().parent
STUDIO_DIR = SCRIPT_DIR.parent
WORKSPACE_ROOT = STUDIO_DIR.parent
```

推导资源路径。因此直接从 `smart-vision/services/workbench/` 运行会导致资源目录指向 `smart-vision/services/`，不符合原目录层级。

本轮采用 `scripts/run-legacy-workbench.sh` 创建临时兼容运行目录的方式启动迁移副本，尽量不改动 legacy 服务代码。

## 5. 后续接口化建议

- 优先在 `runtime/` 或未来 `app/` 中新增 adapter。
- 不直接改写 `canvas/legacy-workbench/workbench-web/workbench-engine.js`。
- Workflow JSON Builder 必须保证节点类型已注册到原 `NODE_DEFS`，否则导入后会被过滤。
