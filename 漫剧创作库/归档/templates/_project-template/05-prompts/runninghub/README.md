# 项目 RunningHub 接入说明

## 目的
本文件用于把 RunningHub 图像能力接入当前项目，让项目具备可复用、可追踪、可 QA 的出图闭环。

新项目默认保留两条可并行使用的图像链路：

### A. workflow 链
适合：
- `banana2`
- `banana2-edit`
- `banana-pro-edit`
- `portrait-upscale`

用途：
- 三参考图生成
- 单图编辑修正
- AB 对照编辑
- 定稿前高清增强

### B. standard-api 链
适合：
- `mj-v7`

用途：
- 快速测试图
- 封面探索图
- 风格探索图
- 不依赖 `workflowId` / `nodeInfoList` 的直接 prompt 出图

---

## 当前目录落点

### 1. 提示词与任务卡
```text
05-prompts/runninghub/banana2/
05-prompts/runninghub/image-edit/
05-prompts/runninghub/standard-api/
```

### 2. workflow 过程结果
如需保留 workflow 链路过程文件，可使用：

```text
06-generated/runninghub/banana2/characters/
06-generated/runninghub/banana2/covers/
06-generated/runninghub/banana2/explorations/
06-generated/runninghub/image-edit/banana2-edit/
06-generated/runninghub/image-edit/banana-pro-edit/
06-generated/runninghub/image-edit/portrait-upscale/
```

### 3. 项目正式图片目录
项目中的正式图片统一收口到：

```text
06-generated/images/
├── characters/
├── props/
├── scenes/
└── others/
```

说明：
- 测试图、探索图、临时验证图优先放 `06-generated/images/others/`
- 角色图放 `06-generated/images/characters/`
- 道具图放 `06-generated/images/props/`
- 场景图放 `06-generated/images/scenes/`

---

## 什么时候用 workflow，什么时候用 standard-api

### 优先用 workflow 的情况
- 需要 Banana2 三参考图控制
- 需要单图编辑或高清增强
- 需要更稳定的工程化节点控制
- 需要保留 nodeInfoList 以便复现和 QA

### 优先用 standard-api 的情况
- 只是想快速试一张图
- 想做风格探索或封面方向探索
- 不想先准备 workflowId / nodeInfoList
- 想快速验证 prompt 是否有方向感

### 推荐决策
- **先探索**：`mj-v7`
- **再定向生成**：`banana2`
- **再精修**：`banana2-edit` / `banana-pro-edit`
- **最后增强**：`portrait-upscale`

---

## 推荐使用顺序

### 1. 快速测试图 / 风格探索图
优先：`mj-v7`

### 2. 角色展示图 / 封面草稿
优先：`banana2`

### 3. 已有图二次修正
优先：`banana2-edit`
必要时补：`banana-pro-edit`

### 4. 定稿前高清增强
使用：`portrait-upscale`

---

## 最小执行闭环
1. 在 `05-prompts/runninghub/` 选择对应任务卡类型
2. 用 `tools/runninghub_client.py` 执行对应模式
3. 图片统一放到 `06-generated/images/` 对应子目录
4. workflow 结果若需要工程链复盘，保留 `06-generated/runninghub/` 过程文件
5. 在 `08-qa/` 记录审核结论
6. 在 `06-generated/asset-index.md` 回填正式资产状态

---

## 推荐文档入口
- CLI 使用指南：`docs/runninghub-client-cli-guide.md`
- MJ-V7 接入说明：`docs/runninghub-mj-v7-api-guide.md`
- 图像接入规范：`docs/runninghub-image-integration-spec.md`
- 图像编辑 / 增强指南：`docs/runninghub-image-edit-upscale-guide.md`
- workflow 映射：`docs/runninghub-image-edit-upscale-workflow-map.md`
