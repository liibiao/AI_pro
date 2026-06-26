# Banana2 workflow mapping

## 来源
根据你提供的 RunningHub / ComfyUI workflow JSON 片段手工提炼。

## workflow 概览
该工作流是一个 **三图输入 + 文本提示词 + Banana2 节点生成 + SaveImage 输出** 的结构。

### 节点结构
- `id: 2` `LoadImage`
  - 作用：主人物参考图
  - 可改字段：`image`
- `id: 3` `LoadImage`
  - 作用：服装参考图
  - 可改字段：`image`
- `id: 4` `LoadImage`
  - 作用：场景参考图
  - 可改字段：`image`
- `id: 9` `JjkText`
  - 作用：提示词文本
  - 可改字段：`text`
- `id: 1` `RH_Nano_Banana2_Gemini31Flash`
  - 作用：核心 Banana2 生成节点
  - 可改字段：
    - `prompt`
    - `seed`
    - `aspectRatio`
    - `resolution`
    - `skip_error`
    - `channel`
- `id: 5` `SaveImage`
  - 作用：保存输出
  - 可改字段：`filename_prefix`

## 推荐字段映射

### 方案 A：只改上游输入节点（更稳）
推荐你优先改这些节点：

1. 人物图
```json
{"nodeId":"2","fieldName":"image","fieldValue":"openapi/xxx.png"}
```

2. 服装图
```json
{"nodeId":"3","fieldName":"image","fieldValue":"openapi/xxx.png"}
```

3. 场景图
```json
{"nodeId":"4","fieldName":"image","fieldValue":"openapi/xxx.png"}
```

4. 提示词
```json
{"nodeId":"9","fieldName":"text","fieldValue":"近景构图（膝盖以上），图1女孩穿着图2的衣服，身处图3场景中，自信展示自我，姿态酷飒随性，眼神冷艳有气场，保持人物五官一致性，高级电影质感，光影干净柔和，细节超清，氛围感拉满，酷女孩风格，画面自然高级"}
```

### 方案 B：直接改 Banana2 核心节点
如果确认 RunningHub 接口支持这些字段，也可以直接改核心节点：

1. prompt
```json
{"nodeId":"1","fieldName":"prompt","fieldValue":"近景构图（膝盖以上），图1女孩穿着图2的衣服，身处图3场景中，自信展示自我，姿态酷飒随性，眼神冷艳有气场，保持人物五官一致性，高级电影质感，光影干净柔和，细节超清，氛围感拉满，酷女孩风格，画面自然高级"}
```

2. seed
```json
{"nodeId":"1","fieldName":"seed","fieldValue":829788543}
```

3. aspectRatio
```json
{"nodeId":"1","fieldName":"aspectRatio","fieldValue":"9:16"}
```

4. resolution
```json
{"nodeId":"1","fieldName":"resolution","fieldValue":"2k"}
```

5. skip_error
```json
{"nodeId":"1","fieldName":"skip_error","fieldValue":false}
```

6. channel
```json
{"nodeId":"1","fieldName":"channel","fieldValue":"Third-party"}
```

7. 输出前缀
```json
{"nodeId":"5","fieldName":"filename_prefix","fieldValue":"banana2_cover"}
```

## 推荐实战策略
优先采用：
- 改 `2/3/4` 的 `image`
- 改 `9` 的 `text`
- 如需改画幅，再补 `1` 的 `aspectRatio`
- 如需固定随机性，再补 `1` 的 `seed`

原因：
- 上游输入节点含义最清晰
- 可读性强
- 出问题时更容易定位

## 这个 workflow 当前默认值
- prompt 节点：`9.text`
- 人物参考图：`2.image`
- 服装参考图：`3.image`
- 场景参考图：`4.image`
- 核心模型：`1 = RH_Nano_Banana2_Gemini31Flash`
- 默认 seed：`829788543`
- 默认画幅：`9:16`
- 默认分辨率：`2k`
- 默认 channel：`Third-party`

## 后续建议
拿到真正的 `workflowId` 后，可直接配合 `tools/runninghub_client.py` 使用。
