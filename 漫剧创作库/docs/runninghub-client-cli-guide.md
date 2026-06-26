# RunningHub 客户端 CLI 使用指南

## 适用范围
本指南对应脚本：

- `tools/runninghub_client.py`

它是创作库内统一的 RunningHub 图像执行入口，用于：
- `banana2` 三参考图生成
- `banana2-edit` 单图编辑主链
- `banana-pro-edit` 单图编辑 AB 备选链
- `portrait-upscale` 人物高清增强
- 手动 workflow / nodeInfoList 调试模式

---

## 一、运行前准备

### 1. 环境变量
先设置 RunningHub API Key：

```bash
export RUNNINGHUB_API_KEY="你的 API Key"
```

### 2. 推荐调用方式
统一从项目根目录执行：

```bash
python3 tools/runninghub_client.py ...
```

---

## 二、支持的模式

### 1. `--banana2`
用途：
- 三参考图生成
- 角色图 / 封面草稿 / 探索图

### 2. `--banana2-edit`
用途：
- 单图编辑主链
- 在保持主体基础上修正内容表达

### 3. `--banana-pro-edit`
用途：
- 单图编辑 AB 备选链
- 与 `banana2-edit` 做对照试稿

### 4. `--portrait-upscale`
用途：
- 后处理高清增强
- 不改内容，只提高清晰度

### 5. `--mj-v7`
用途：
- RunningHub 标准模型 API 文生图
- 快速测试图
- 封面探索图 / 风格探索图
- 不依赖 workflowId / nodeInfoList 的直接出图场景

### 6. `--mj-niji7`
用途：
- RunningHub 标准模型 API 动漫插画风格
- 漫剧角色设计探索
- 动漫风格场景图
- 适合现代日漫 / 插画风格

### 7. `--mj-niji6`
用途：
- RunningHub 标准模型 API 复古动漫风格
- 经典日漫角色风格探索
- 复古动漫场景图
- 适合 90 年代 / 经典日漫风格

### 8. manual 模式
用途：
- 不指定上述模式时
- 适合传入 `--workflow-id` + `--node-info-list`
- 用于高级调试或临时实验

---

## 三、通用参数

### 基础执行参数
- `--workflow-id`：指定 workflowId
- `--workflow-file`：指定本地 workflow JSON
- `--node-info-list`：手动传入 JSON 字符串格式的 nodeInfoList
- `--upload-file`：手动上传文件，可多次传入
- `--webhook-url`：任务完成回调地址
- `--instance-type`：实例类型
- `--use-personal-queue`：独占队列
- `--disable-metadata`：关闭 addMetadata
- `--interval`：轮询间隔秒数
- `--timeout`：总超时时间秒数
- `--output-dir`：输出下载目录
- `--download-prefix`：下载文件名前缀

### 工程化参数
- `--dry-run`：只生成和校验，不发起任务
- `--save-node-info-list`：把最终 nodeInfoList 保存为 JSON
- `--task-meta-file`：把本次任务元信息保存为 JSON
- `--print-mode-summary`：打印当前模式用途摘要

---

## 四、各模式专用参数

### A. `banana2`
- `--prompt`
- `--ratio`
- `--resolution`
- `--seed`
- `--filename-prefix`
- `--char-file`
- `--cloth-file`
- `--scene-file`

### B. `banana2-edit`
- `--input-file`
- `--prompt`
- `--ratio`
- `--resolution`
- `--seed`
- `--filename-prefix`

### C. `banana-pro-edit`
- `--input-file`
- `--prompt`
- `--ratio`
- `--resolution`
- `--seed`
- `--filename-prefix`

### D. `portrait-upscale`
- `--input-file`
- `--upscale-model`
- `--filename-prefix`

> 注意：当前脚本对 `portrait-upscale` 建议显式传 `--upscale-model`，避免超分模型不确定。

### E. `mj-v7`
- `--prompt`
- `--negative-prompt`
- `--aspect-ratio`
- `--quality`
- `--chaos`
- `--stylize`
- `--weird`
- `--raw`
- `--image-url`
- `--iw`
- `--sref`
- `--sw`
- `--sv`
- `--oref`
- `--ow`
- `--tile`

### F. `mj-niji7`
- `--prompt`
- `--negative-prompt`
- `--aspect-ratio`
- `--quality`
- `--chaos`
- `--stylize`
- `--weird`
- `--raw`
- `--image-url`
- `--iw`
- `--sref`
- `--sw`
- `--sv`
- `--oref`
- `--ow`
- `--tile`

### G. `mj-niji6`
- `--prompt`
- `--negative-prompt`
- `--aspect-ratio`
- `--quality`
- `--chaos`
- `--stylize`
- `--weird`
- `--niji`（Niji6 特有参数）
- `--image-url`
- `--iw`
- `--sref`
- `--sw`
- `--oref`
- `--ow`
- `--tile`

---

## 五、推荐使用方式

### 1. 先 dry-run，再正式执行
建议先做：
- 参数校验
- 文件上传
- nodeInfoList 确认
- metadata 预生成

示例：
```bash
python3 tools/runninghub_client.py \
  --banana2-edit \
  --input-file "/绝对路径/input.png" \
  --prompt "保持人物身份一致，增强封面中心感" \
  --ratio 9:16 \
  --resolution 2k \
  --seed 829788543 \
  --filename-prefix "ep001_cover_banana2_edit_v01" \
  --output-dir "projects/demo_shortdrama_001/06-generated/runninghub/image-edit/banana2-edit/" \
  --save-node-info-list "projects/demo_shortdrama_001/06-generated/runninghub/image-edit/banana2-edit/ep001_cover_banana2_edit_v01.node-info.json" \
  --task-meta-file "projects/demo_shortdrama_001/06-generated/runninghub/image-edit/banana2-edit/ep001_cover_banana2_edit_v01.task-meta.json" \
  --print-mode-summary \
  --dry-run
```

确认没问题后，再去掉 `--dry-run` 正式执行。

---

## 六、常用命令示例

### 1. Banana2 三图生成
```bash
python3 tools/runninghub_client.py \
  --banana2 \
  --char-file "/绝对路径/char.png" \
  --cloth-file "/绝对路径/cloth.png" \
  --scene-file "/绝对路径/scene.png" \
  --prompt "半身到近景构图，主角站在画面中心，逆光勾边，整体呈现高级电影海报质感。" \
  --ratio 9:16 \
  --resolution 2k \
  --seed 829788543 \
  --filename-prefix "ep001_cover_banana2_v01" \
  --output-dir "projects/demo_shortdrama_001/06-generated/runninghub/banana2/covers/" \
  --save-node-info-list "projects/demo_shortdrama_001/06-generated/runninghub/banana2/covers/ep001_cover_banana2_v01.node-info.json" \
  --task-meta-file "projects/demo_shortdrama_001/06-generated/runninghub/banana2/covers/ep001_cover_banana2_v01.task-meta.json" \
  --print-mode-summary
```

### 2. Banana2 单图编辑
```bash
python3 tools/runninghub_client.py \
  --banana2-edit \
  --input-file "/绝对路径/input.png" \
  --prompt "保持人物身份一致，不改变主角五官与主体构图，增强封面级视觉中心感。" \
  --ratio 9:16 \
  --resolution 2k \
  --seed 829788543 \
  --filename-prefix "ep001_cover_banana2_edit_v01" \
  --output-dir "projects/demo_shortdrama_001/06-generated/runninghub/image-edit/banana2-edit/" \
  --save-node-info-list "projects/demo_shortdrama_001/06-generated/runninghub/image-edit/banana2-edit/ep001_cover_banana2_edit_v01.node-info.json" \
  --task-meta-file "projects/demo_shortdrama_001/06-generated/runninghub/image-edit/banana2-edit/ep001_cover_banana2_edit_v01.task-meta.json" \
  --print-mode-summary
```

### 3. BananaPRO 单图编辑
```bash
python3 tools/runninghub_client.py \
  --banana-pro-edit \
  --input-file "/绝对路径/input.png" \
  --prompt "保持人物五官一致，提升服装质感与海报级视觉冲击。" \
  --ratio 9:16 \
  --resolution 2k \
  --seed 829788543 \
  --filename-prefix "ep001_cover_banana_pro_edit_v01" \
  --output-dir "projects/demo_shortdrama_001/06-generated/runninghub/image-edit/banana-pro-edit/" \
  --save-node-info-list "projects/demo_shortdrama_001/06-generated/runninghub/image-edit/banana-pro-edit/ep001_cover_banana_pro_edit_v01.node-info.json" \
  --task-meta-file "projects/demo_shortdrama_001/06-generated/runninghub/image-edit/banana-pro-edit/ep001_cover_banana_pro_edit_v01.task-meta.json" \
  --print-mode-summary
```

### 4. portrait-upscale 高清增强
```bash
python3 tools/runninghub_client.py \
  --portrait-upscale \
  --input-file "/绝对路径/final_input.png" \
  --upscale-model "4x-UltraSharp.pth" \
  --filename-prefix "ep001_cover_portrait_upscale_v01" \
  --output-dir "projects/demo_shortdrama_001/06-generated/runninghub/image-edit/portrait-upscale/" \
  --save-node-info-list "projects/demo_shortdrama_001/06-generated/runninghub/image-edit/portrait-upscale/ep001_cover_portrait_upscale_v01.node-info.json" \
  --task-meta-file "projects/demo_shortdrama_001/06-generated/runninghub/image-edit/portrait-upscale/ep001_cover_portrait_upscale_v01.task-meta.json" \
  --print-mode-summary
```

### 5. MJ-V7 标准模型 API 测试图
```bash
python3 tools/runninghub_client.py \
  --mj-v7 \
  --prompt "迷雾古老森林中的生物发光白鹿，柔和的微光颗粒，电影级光影，超写实纹理" \
  --negative-prompt "low quality, blurry, watermark, text, logo" \
  --quality 1 \
  --chaos 0 \
  --stylize 0 \
  --weird 0 \
  --aspect-ratio 3:4 \
  --output-dir "projects/demo_shortdrama_001/06-generated/images/others/" \
  --download-prefix "测试图-mjv7风格验证-v1-" \
  --task-meta-file "projects/demo_shortdrama_001/06-generated/images/others/mjv7-test-cover-v1.task.json" \
  --print-mode-summary
```

### 6. MJ-Niji7 动漫插画风格测试图
```bash
python3 tools/runninghub_client.py \
  --mj-niji7 \
  --prompt "动漫风格少年剑客，黑发飘逸，手持长刀，站在樱花纷飞的古桥上，逆光剪影" \
  --negative-prompt "low quality, blurry, watermark, text" \
  --quality 1 \
  --aspect-ratio 3:4 \
  --output-dir "projects/demo_shortdrama_001/06-generated/images/others/" \
  --download-prefix "测试图-niji7动漫探索-v1-" \
  --task-meta-file "projects/demo_shortdrama_001/06-generated/images/others/niji7-test.task.json" \
  --print-mode-summary
```

### 7. MJ-Niji6 复古动漫风格测试图
```bash
python3 tools/runninghub_client.py \
  --mj-niji6 \
  --prompt "90年代日漫风格少女战士，大眼睛，飘逸长发，手持魔法杖，星空背景" \
  --negative-prompt "low quality, blurry, watermark, text" \
  --quality 1 \
  --aspect-ratio 3:4 \
  --output-dir "projects/demo_shortdrama_001/06-generated/images/others/" \
  --download-prefix "测试图-niji6复古探索-v1-" \
  --task-meta-file "projects/demo_shortdrama_001/06-generated/images/others/niji6-test.task.json" \
  --print-mode-summary
```

---

## 七、输出文件说明

### 1. 生成图片
保存在 `--output-dir` 中。

### 2. nodeInfoList 文件
通过 `--save-node-info-list` 保存，建议命名：
- `xxx.node-info.json`

作用：
- 保留本次实际注入的节点参数
- 方便 QA、复盘、复现

### 3. task metadata 文件
通过 `--task-meta-file` 保存，建议命名：
- `xxx.task-meta.json`

内容通常包括：
- mode
- workflowId
- 参数摘要
- 上传文件信息
- 下载文件信息
- taskId
- 生成时间

作用：
- 方便归档
- 方便后续复现和问题追踪

---

## 八、推荐命名规范

### 资产图片文件（中文命名）
统一使用中文命名，格式：
```text
<用途>-<对象>-<版本>-<日期>[-序号].<扩展名>
```

示例：
- `角色定妆-男主-v1-20260412.png`
- `封面探索-第1集-v1-20260412-1.png`
- `场景氛围-古镇夜景-v1-20260412.png`
- `测试图-mjv7风格验证-v1-20260412-1.png`

### CLI --download-prefix 建议
```text
<用途>-<对象>-<版本>-
```

示例：
- `--download-prefix "角色定妆-男主-v1-"`
- `--download-prefix "封面探索-第1集-v1-"`
- `--download-prefix "测试图-niji7动漫探索-v1-"`

### 元数据文件（保持英文）
nodeInfoList 和 task metadata 文件继续使用英文命名：
- `ep001_cover_banana2_v01.node-info.json`
- `ep001_cover_banana2_v01.task-meta.json`

---

## 九、常见建议

### 1. 先定内容，再做增强
- 还在改内容：走 `banana2-edit` / `banana-pro-edit`
- 内容已经稳定：再走 `portrait-upscale`

### 2. 一定保留 metadata
如果你想把这套链路长期用于正式项目，`task-meta.json` 基本应视为必留。

### 3. 不要只保存最终图
至少应同时保留：
- 输出图
- nodeInfoList
- task metadata
- 对应任务卡

### 4. 推荐先 dry-run
尤其是：
- 新模式首次接入
- 新 workflowId 首次使用
- 新同事 / 新 Agent 第一次跑命令

---

## 十、与项目文档的关系
推荐配合这些文档一起使用：
- `docs/runninghub-image-integration-spec.md`
- `docs/runninghub-image-agent-integration-notes.md`
- `docs/runninghub-image-edit-upscale-guide.md`
- `docs/runninghub-image-edit-upscale-workflow-map.md`
- `docs/runninghub-mj-v7-api-guide.md`
- `projects/demo_shortdrama_001/05-prompts/runninghub/image-edit/ep001-cover-full-pipeline.md`

这样脚本层、项目层、QA 层、归档层才是闭环的。
