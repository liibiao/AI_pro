# RunningHub 标准模型 API 总指南

## 适用范围
本指南用于统一管理 RunningHub 标准模型 API 的项目内接入方式。

当前已纳入：
- `mj-v7`
- `mj-niji7`
- `mj-niji6`

这些模型都属于 prompt 直出图链路，区别于 workflow 链路中的 `banana2`、`banana2-edit`、`banana-pro-edit`、`portrait-upscale`。

---

## 一、模型选择建议

| 模型 | Endpoint | 推荐用途 | 关键特点 |
|---|---|---|---|
| `mj-v7` | `youchuan/text-to-image-v7` | 通用风格探索、封面探索、测试图 | 通用性强，支持负向提示词、oref/ow 等参数 |
| `mj-niji7` | `youchuan/text-to-image-niji7` | 动漫插画、漫剧海报、风格冲击图 | 更偏动漫与插画海报，参数相对精简 |
| `mj-niji6` | `youchuan/text-to-image-niji6` | 动漫角色探索、角色参考控制、复古/赛璐璐风格 | 支持 `cref/cw` 与 `stop`，更适合角色参考实验 |

---

## 二、统一查询接口

提交任务后，统一通过：

```text
POST https://www.runninghub.cn/openapi/v2/query
```

查询字段：
```json
{
  "taskId": "${RUNNINGHUB_TASKID}"
}
```

---

## 三、项目统一落点

标准模型 API 生成的测试图、探索图，优先保存到：

```text
06-generated/images/others/
```

正式入选后，再按用途转入：

```text
06-generated/images/characters/
06-generated/images/props/
06-generated/images/scenes/
```

---

## 四、工具调用方式

统一使用：

```bash
python3 tools/runninghub_client.py --standard-model <模型名> ...
```

兼容快捷参数：
- `--mj-v7`
- `--mj-niji7`
- `--mj-niji6`

---

## 五、参数差异

### 1. `mj-v7`
支持：
- `prompt`
- `negativePrompt`
- `chaos`
- `quality`
- `stylize`
- `weird`
- `raw`
- `imageUrl`
- `iw`
- `sref`
- `sw`
- `sv`
- `oref`
- `ow`
- `tile`
- `aspectRatio`

### 2. `mj-niji7`
支持：
- `prompt`
- `chaos`
- `stylize`
- `weird`
- `raw`
- `imageUrl`
- `iw`
- `sref`
- `sw`
- `sv`
- `aspectRatio`

注意：
- 不使用 `negativePrompt`
- 不使用 `quality`
- 不使用 `cref/cw`
- 不使用 `oref/ow`
- 不使用 `tile`

### 3. `mj-niji6`
支持：
- `prompt`
- `chaos`
- `quality`
- `stylize`
- `weird`
- `raw`
- `imageUrl`
- `iw`
- `cref`
- `cw`
- `sref`
- `sw`
- `sv`
- `stop`
- `tile`
- `aspectRatio`

注意：
- 不使用 `negativePrompt`
- 不使用 `oref/ow`

---

## 六、推荐默认参数

### `mj-v7`
```text
quality=1
chaos=0
stylize=0
weird=0
raw=false
aspectRatio=3:4
```

### `mj-niji7`
```text
chaos=0
stylize=0
weird=0
raw=false
aspectRatio=1:1 或 3:4
```

### `mj-niji6`
```text
quality=1
chaos=0
stylize=0
weird=0
raw=false
stop=100
aspectRatio=1:1 或 3:4
```

---

## 七、推荐工作流

### 快速探索
1. 先用 `mj-v7` 或 `mj-niji7` 快速探索方向
2. 选出可用风格
3. 入 `06-generated/images/others/`
4. 回填 `06-generated/asset-index.md`

### 角色探索
1. 先用 `mj-niji6` 做角色风格探索
2. 如有角色参考图，再尝试 `cref/cw`
3. 入 `06-generated/images/characters/`
4. 通过 QA 后进入正式角色资产库

### 正式增强
1. 标准模型 API 先做探索
2. 稳定后进入 workflow 链：`banana2` / `banana2-edit`
3. 定稿后再走 `portrait-upscale`

---

## 八、归档要求
每次正式出图至少保留：
- 任务卡
- 输出图片
- task metadata
- `06-generated/asset-index.md` 登记
- QA 审核记录
