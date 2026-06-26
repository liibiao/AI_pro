# 漫剧创作库

欢迎来到 AI 漫剧/短剧创作工作区。

## 快速开始

### 新建短剧项目
```bash
cp -r templates/_project-template projects/你的剧名_001
```

### 新建漫剧项目
```bash
cp -r templates/_manga-template projects/你的漫剧名_001
```

然后编辑 `projects/你的项目名/project.json` 填写基本信息，开始创作。

新项目创建后，建议立即检查：
- `docs/project-memory-system.md` — 项目文件化记忆总规范，新工具接手、跨工具迁移、工作流恢复时必须先读
- `docs/project-bootstrap-checklist.md`

### 启动工作台

```bash
./studio start        # 启动工作台（自动打开浏览器 http://127.0.0.1:8766/workbench.html）
./studio stop         # 停止工作台
./studio status       # 查看运行状态
```

### 配置参考图上传链路

Image Studio 当前支持三种参考图上传策略。画布页右上角 `FILES / COS` 按钮仍保留原来的手动切换；后台模型配置也可以通过 `uploadMode` 指定渠道：

- `FILES`：默认模式。参考图上传到本地 `POST /v1/files`，前端和生图请求维护 `file-xxx`，后端转发 `/v1/images/edits` 时解析为模型可用的 `image[] / mask`。
- `COS`：对象存储模式。参考图上传到 `POST /api/workbench/image-studio/upload-reference`，后端使用腾讯云 COS / S3 / R2 / OSS 兼容链路返回公网 `http(s)` URL，生图请求直接使用公网 URL 多图数组。
- `local_cache_async_cos`：推荐综合策略。导入后立即用本地 URL 预览、拖动和连线，同时后台异步上传 COS；执行前会等待上传完成，上传失败时要求重试，不会静默丢参考图。

推荐最终规则：

- 图片 / 音频 / 视频节点、图生图 / 故事板 / 资产设计里的参考图：导入后本地预览，后台异步上传 COS。
- `txt/md/json/doc/pdf` 等文件：优先解析文本，只有被当作下游参考资源时再上传。
- 截帧、截图、分离音频等临时资产：默认本地缓存；被下游引用时再上传。

### 配置参考图对象存储

对象存储链路用于需要公网图片 URL 的场景；默认 `FILES` 模式不依赖这些变量。视频参考图或切换到 `COS` 模式后的图片参考图，会在用户上传时先传到对象存储，再把公网 HTTPS URL 写入最终服务商 JSON 的 `image_url` / `reference_image_urls` / `image[]`，不会把 `base64/dataUrl` 传给服务商。

```bash
pip install -r requirements.txt
cp .env.object-storage.example .env
```

`./studio start` 会自动加载项目根目录 `.env`。

按你选择的服务填写环境变量：

- Cloudflare R2 / 腾讯云 COS：使用 S3 兼容接口，依赖 `boto3`
- 阿里 OSS：依赖 `oss2`

必填项：

```bash
export OBJECT_STORAGE_PROVIDER="r2"       # r2 / cos / oss / s3
export OBJECT_STORAGE_ENDPOINT_URL="https://..."
export OBJECT_STORAGE_ACCESS_KEY_ID="..."
export OBJECT_STORAGE_SECRET_ACCESS_KEY="..."
export OBJECT_STORAGE_BUCKET="..."
export OBJECT_STORAGE_PUBLIC_BASE_URL="https://你的公网图片域名"
export OBJECT_STORAGE_PREFIX="mjb-reference"
```

`OBJECT_STORAGE_PUBLIC_BASE_URL` 必须是服务商云端能访问的公网 HTTPS 地址，不能使用 `127.0.0.1` 或本地地址。

工作台功能：
- **粘贴剧本文本** → 自动识别题材、推荐导演/视觉风格、估算时长 → 生成故事板生产方案
- **选择已有项目 + 集数** → 一键触发当前流水线（分镜 → 故事板生产包 → 校验）
- **结果查看器** → 查看分镜表、导演故事板图、连续性卡、资产引用矩阵与配套生成说明

### 从剧本生成故事板生产方案

```bash
./studio generate "第1话 灵纹觉醒：少年在废弃实验室中意外触碰到神秘灵纹…"
./studio generate -f projects/无限强化_漫剧_001/01-story/scripts/第1话-xxx-剧本正文.md
```

### 运行项目流水线

```bash
./studio pipeline projects/无限强化_漫剧_001 --ep 001 --style 纪实克制 --skip-assets
```

### CodeBuddy 快捷指令

在 CodeBuddy 对话中可直接使用 `#LJ` 指令：

| 指令 | 等同于 |
|---|---|
| `#LJ start` | `./studio start` |
| `#LJ stop` | `./studio stop` |
| `#LJ 剧本文本` | `./studio generate "剧本文本"` |
| `#LJ -f 文件路径` | `./studio generate -f 文件路径` |
| `#LJ pipeline 项目目录 --ep 001` | `./studio pipeline ...` |

在 CodeBuddy 对话中也可使用 `#image` / `#canvas` 指令：

| 指令 | 等同于 |
|---|---|
| `#image` | `./studio image`（启动工作台并打开生图工具） |
| `#canvas` | `./studio canvas`（启动工作台并打开无限画布） |

## 目录说明

| 目录 | 用途 |
|------|------|
| `agents/` | AI 智能体定义（含 master、编剧、导演、美术、分镜、生成、发布、资产管理、运营分析） |
| `docs/` | 工作流规范、项目文件化记忆系统、模型指南、提示词标准、镜头库、案例库、排期与成本文档 |
| `skills/` | 可复用技能模块索引 |
| `templates/` | 项目模板（短剧/漫剧）+ 三版本输出模板 |
| `tools/` | 自动化工具（工作台服务、流水线、校验器、资产生成） |
| `projects/` | 实际项目文件与样板项目 |
| `wordlists/` | 提示词词库（visual/×9 + audio/×2 + style/×6，共 17 个 JSON） |

## 创作流程

```
灵感 → 剧本 → 导演讲戏 → 资产设计 → 分镜 → 提示词 → AI生成 → 剪辑 → 质检 → 发布 → 复盘
```

## 当前已补齐的专业模块
- 创作中枢：master / context-loader / continuity-supervisor
- 生产执行：scriptwriter / director / art-director / storyboard-artist / prompt-lab / generation-executor / editor（注：`storyboard-artist` 已从 Director 中独立为 `Storyboard Artist` 角色，详见 `agents/storyboard-artist/`）
- 运营管理：publisher / asset-librarian / operations-analyst / quality-control
- 全局资产：global-character-library / global-scene-library
- 方法沉淀：workflow / phase-gate / publish-workflow / shot-language-library / camera-language-dictionary / shot-rhythm-casebook / shot-duration-and-density-standard / action-speed-design-standard / action-case-opposition-force-camera / action-asset-casebook / reference-image-analysis-standard / learning-from-failure / prompt-casebook / cover-promo-casebook / cost-and-schedule / staging-impact-audiovisual-methodology
- **三大引擎方法论 (New)**：
  - **武戏引擎**：`action-combat-design-standard.md` / `crowd-choreography-standard.md` / `environmental-destruction-standard.md` / `zero-gravity-parkour-standard.md`
  - **文戏引擎**：`drama-tension-design-standard.md` / `dance-rhythm-aesthetics-standard.md`
  - **视听引擎**：`post-production-aesthetics-standard.md` / `vfx-design-standard.md` / `sound-design-montage-standard.md` / `framing-aspect-ratio-standard.md` / `typography-ui-standard.md`
- **高张力段落总装方法论 (New)**：`staging-impact-audiovisual-methodology.md`（站位对峙 + 速度反差 + Hit Stop + 视听同步 + 结果兑现）
- 模板落地：动作速度设计模板（短剧 / 漫剧）已接入 storyboard 阶段
- 样板验证：`projects/demo_shortdrama_001`

## 推荐先看
1. `docs/workflow.md`
2. `docs/workspace-status.md`
3. `docs/staging-impact-audiovisual-methodology.md`
4. `docs/action-speed-design-standard.md`
5. `docs/action-case-opposition-force-camera.md`
6. `docs/action-asset-casebook.md`
7. `docs/reference-image-analysis-standard.md`
8. `docs/shot-duration-and-density-standard.md`
9. `docs/learning-from-failure.md`
10. `docs/action-speed-design-example.md`
11. `docs/global-character-library.md`
12. `docs/global-scene-library.md`
13. `projects/demo_shortdrama_001/README.md`

## 动作方法快速入口

### 如果你要吸收外部视频参考
先看：
1. `docs/action-case-opposition-force-camera.md`
2. `docs/action-speed-design-standard.md`

重点看：
- 外部视频只吸收关系 / 受力 / 节奏 / 结果
- 倍速素材只作为节奏与镜头结构参考
- 不直接照搬表面速度、快切频率、blur 强度

### 如果你要写 baseline 提示词
先看：
1. `docs/action-speed-design-standard.md`
2. `templates/_shared/action-speed-design-template.md`
3. `templates/_project-template/04-storyboard/action-speed-design-template.md`
4. `templates/_manga-template/04-storyboard/action-speed-design-template.md`

重点看：
- 先写主体
- 先写对抗关系
- 先写身体受力
- 先写镜头节奏与结果镜头
- baseline 稳了再强化

### 如果你要做强化版迭代
先看：
1. `projects/demo_shortdrama_001/04-storyboard/ep001-storyboard.md`
2. `projects/demo_shortdrama_001/04-storyboard/director-boards/`
3. `projects/demo_shortdrama_001/05-prompts/`（仅作下游配套生成说明）

重点看：
- 每次只加一层强化信息
- 先加镜头节奏，再加 blur 与质感
- 不让强化破坏清晰爽点、台词、表情和关系表达

### 如果你遇到生成漂移，需要回退
先看：
1. `projects/demo_shortdrama_001/04-storyboard/` 的故事板生产包
2. `projects/demo_shortdrama_001/05-prompts/` 的配套生成说明
3. `docs/action-speed-design-standard.md`

重点看：
- 先删最近一层强化
- 优先保留主体 / 关系 / 受力 / 结果镜头
- 不稳就直接回退 baseline
