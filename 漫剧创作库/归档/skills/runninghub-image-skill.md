# RunningHub 图像生成技能 — runninghub-image-skill

## 技能定位
统一封装 RunningHub 平台的全部图像生成能力，覆盖从任务卡编写、CLI 执行、产出归档到资产索引回填的完整闭环。

---

## 适用场景
- 需要生成角色定妆图、封面图、场景氛围图、道具设计图
- 需要对已有图片做编辑修正或高清增强
- 需要使用 MJ-V7 / MJ-Niji7 / MJ-Niji6 做风格探索
- 需要批量执行 RunningHub 图像任务并归档

---

## 能力清单

### 一、工作流模式（Workflow）
| 模式 | CLI 参数 | 用途 | 输入 |
|------|----------|------|------|
| Banana2 三图生成 | `--banana2` | 角色图 / 封面草稿 / 探索图 | 角色图 + 服装图 + 场景图 + 提示词 |
| Banana2 单图编辑 | `--banana2-edit` | 主链修正，保持主体不变 | 输入图 + 提示词 |
| BananaPRO 单图编辑 | `--banana-pro-edit` | AB 对照修正 | 输入图 + 提示词 |
| Portrait 高清增强 | `--portrait-upscale` | 最终图高清化 | 输入图 + 超分模型 |

### 二、标准模型 API 模式
| 模式 | CLI 参数 | 用途 | 特点 |
|------|----------|------|------|
| MJ-V7 | `--mj-v7` | 写实 / 电影级文生图 | 支持 sref/oref/iw 等高级参数 |
| MJ-Niji7 | `--mj-niji7` | 动漫插画风格 | 适合漫剧角色和场景 |
| MJ-Niji6 | `--mj-niji6` | 复古动漫风格 | 适合经典日漫风格角色 |

---

## 标准执行流程

### 第一步：编写任务卡
在 `05-prompts/runninghub/` 对应子目录下创建任务卡 `.md` 文件：
- Banana2 → `05-prompts/runninghub/banana2/`
- 单图编辑 → `05-prompts/runninghub/image-edit/`
- 标准 API → `05-prompts/runninghub/standard-api/`

任务卡必须包含：
- 任务名称与目标
- 产品类型 / 风格类型 / 场景类型判定（如写实人像、3D手办、微缩模型、国风海报、科幻机械、自然风光、字体海报）
- 提示词（中英文）
- 参数配置（比例、分辨率、种子等）
- 预期输出路径
- 状态标记（待执行 / 已完成）

### 第二步：Dry-Run 验证
```bash
python3 tools/runninghub_client.py \
  --<模式> \
  --prompt "提示词" \
  [其他参数] \
  --dry-run
```

### 第三步：正式执行
去掉 `--dry-run`，加上 `--output-dir` 和 `--task-meta-file`：
```bash
python3 tools/runninghub_client.py \
  --<模式> \
  --prompt "提示词" \
  --output-dir "projects/<项目>/06-generated/images/<分类>/" \
  --task-meta-file "projects/<项目>/06-generated/images/<分类>/<前缀>.task.json" \
  --print-mode-summary
```

### 第四步：归档与回填
1. 确认图片已下载到 `06-generated/images/` 对应子目录
2. 回填任务卡：状态改为"已完成"，写入 taskId、输出路径、费用
3. 更新 `06-generated/asset-index.md` 登记新资产条目

---

## 资产文件中文命名规范

### 命名格式
```
<用途>-<对象>-<版本>-<日期>[-序号].<扩展名>
```

### 用途前缀对照表
| 中文前缀 | 说明 | 示例 |
|----------|------|------|
| 角色定妆 | 角色正式定妆图 | `角色定妆-男主-v1-20260412.png` |
| 角色头像 | 角色头像特写 | `角色头像-女主-v1-20260412.png` |
| 角色三视图 | 角色正侧背三视图 | `角色三视图-反派-v1-20260412.png` |
| 封面探索 | 封面风格探索图 | `封面探索-第1集-v1-20260412-1.png` |
| 封面定稿 | 封面最终版 | `封面定稿-第1集-v1-20260412.png` |
| 场景氛围 | 场景概念氛围图 | `场景氛围-古镇夜景-v1-20260412.png` |
| 道具设计 | 道具设计图 | `道具设计-龙纹剑-v1-20260412.png` |
| 测试图 | 流程验证测试图 | `测试图-mjv7风格验证-v1-20260412-1.png` |
| 风格探索 | 非定向风格实验 | `风格探索-赛博朋克-v1-20260412-1.png` |

### 版本后缀
- `v1` / `v2`：迭代版本
- `-1` / `-2`：同批次多张图序号

---

## 推荐图像生产链路

### 角色定妆图链路
```
Banana2 三图生成 → 筛选最佳 → Banana2-Edit 微调 → Portrait-Upscale 高清 → 入库
```

### 封面图链路
```
MJ-V7/Niji7 风格探索 → 确定方向 → Banana2 精细生成 → Banana2-Edit 修正 → Portrait-Upscale → 入库
```

### 场景氛围图链路
```
MJ-V7 文生图 → 筛选 → Banana2-Edit 修正（可选）→ 入库
```

---

## 关联文档
- HZW大师风格系统：`docs/hzw-master-style-system.md`
- GPT 生图专项规范：`docs/gpt-image-prompt-methodology.md`
- CLI 指南：`docs/runninghub-client-cli-guide.md`
- 集成规范：`docs/runninghub-image-integration-spec.md`
- 标准模型指南：`docs/runninghub-standard-models-guide.md`
- Banana2 指南：`docs/runninghub-banana2-guide.md`
- 编辑增强指南：`docs/runninghub-image-edit-upscale-guide.md`
- 工作流映射：`docs/runninghub-banana2-workflow-map.md`
- Agent 集成说明：`docs/runninghub-image-agent-integration-notes.md`

---

## 关联 Agent
- `generation-executor`：主要调用者
- `art-director`：提供资产引用
- `prompt-lab`：提供提示词优化
- `quality-control`：审核生成结果
- `asset-librarian`：管理资产索引

---

## 生图模板选择规则
- **HZW大师风格项目**：优先调用 `docs/hzw-master-style-system.md` 与 `skills/hzw-master-style-skill.md`，所有角色、场景、封面、首帧、尾帧和静态分镜板必须继承同一套角色锚点、场景锚点、光影锚点、色彩锚点和镜头锚点。
- **写实人像 / 写真 / 头像**：优先调用 `docs/gpt-image-prompt-methodology.md` 的人像摄影双段式，必须包含整体场景段与面部特写锚点段。
- **角色定妆 / 三视图 / 资产设定**：优先调用角色设定表公式，确保同一角色、同一服装、同一比例。
- **角色卡 / 卡牌合集 / 多姿势参考**：优先调用角色参考卡或动作分解参考表模板，锁定角色视觉锚点、编号、格数、动作说明与一致性红线。
- **静态分镜板 / 多格漫画 / 动作分解表**：优先调用多面板分镜模板，必须写清 4×4 / 3×3 / 9-panel / 长卷等结构、面板编号、阅读顺序、分隔线、角色一致性和每格任务。
- **UI / App / 游戏界面**：优先调用 Prompt-as-Code JSON 模板，明确 header、sidebar、content、navigation、按钮数量、文字语言和可读性。
- **信息图 / 图表 / 数据可视化**：优先调用信息图模板，明确模块数量、图标、标签、标注线、阅读顺序，禁止小字乱码。
- **商品电商 / 商业广告 / 品牌 KV**：优先调用商品广告模板，明确产品、品牌、卖点、材质、Logo 保真、标语和电商版式。
- **品牌视觉 / Logo / 物料合集 / 出版物**：优先调用品牌资产模板，明确色板、字体、Logo 位置、物料数量、封面/内页层级。
- **Q版角色 / 摆件 / 神像 / 潮玩**：优先调用 3D 手办 / 潮玩角色模板，强调材质、底座、棚拍光和真实接触阴影。
- **树屋 / 古建 / 岛屿 / 剖面空间**：优先调用 3D 微缩模型模板，强调等距视角、垂直分层、尺度一致和空间可读。
- **城市 / 节气 / 字体 / 活动海报**：优先调用字体海报 / 城市文化模板，文字必须清晰可读。
- **机甲 / 反应堆 / 超跑 / 雨夜霓虹**：优先调用科幻机械 / 赛博竞速模板，主体结构必须清晰。
- **海浪 / 昆虫 / 森林 / 生态**：优先调用自然风光 / 微距生态模板，明确主体、前中后景和光线。

## 质量标准
- **环境交互 (Atmosphere & Interaction)**：提示词必须包含物理介质（风雨雾雪等）对人物或环境的物理影响。
- **光影与色彩 (Lighting & Color)**：严禁平光棚拍感，提示词必须明确主光源（如伦勃朗光、轮廓光）和色彩基调。
- **构图留白 (Composition)**：使用 `non-centered composition` 和 `negative space`，打破居中死板构图。
- **角色成长 (Character Visual Arc)**：生成的角色必须带有与其当前阶段匹配的战损、服装材质特征。
- 每次生成必须保留 task.json 元数据
- 任务卡状态必须及时回填
- 资产索引必须同步更新
- 文件命名必须符合中文命名规范
- **强制要求：不看到图落地，就不结束回合。必须主动监控任务执行进度，直到图像成功下载到本地并验证无误，方可结束当前对话。**
- 失败图不删除，标注原因后归入 `others/`
