# 图像编辑与高清增强工作流映射

## 来源
根据你提供的 RunningHub workflow JSON 手工拆解整理，workflowId：`2043088500844662785`。

## 结论先说
这个 workflow **不是一个单纯的“放大工作流”**，而是把三类能力串在同一个大图里：

1. **Banana2 图像编辑链**
2. **BananaPRO 图像编辑链**
3. **人物高清增强链（portrait upscale）**

因此在项目接入层，最合理的方式不是给它取一个笼统的“upscale”名字，而是拆成三个独立子能力：

- `banana2-edit`
- `banana-pro-edit`
- `portrait-upscale`

这样做的好处：
- 对应项目工作流时语义更清楚
- Agent/Skill 调度时更容易选能力
- CLI 参数和任务卡更容易标准化
- 后面如果换 workflow，也只需要替换某个子能力的映射

---

## 一、工作流全局结构

### 1. Banana2 图像编辑链
用途：
- 基于输入图做二次编辑
- 更偏“参考图改造 / 局部风格调整 / 角色造型变化 / 构图微调”

核心节点：
- `1261` `LoadImage`：输入图
- `1262` `JjkText`：编辑提示词
- `1260` `RH_Nano_Banana2_Image2Image`：Banana2 图像编辑核心
- `1263` `SaveImage`：输出保存
- `1265` `PreviewImage`：预览

### 2. BananaPRO 图像编辑链
用途：
- 同样是图像编辑，但定位可与 Banana2 分开管理
- 适合放在“更强指令编辑 / 不同模型风格偏好”的备用链路

核心节点：
- `841` `LoadImage`：输入图
- `842` `JjkText`：编辑提示词
- `848` `RH_Nano_BananaPRO_Image2Image`：BananaPRO 编辑核心
- `843` `SaveImage`：输出保存
- `847` `PreviewImage`：预览

### 3. 人物高清增强链
用途：
- 面向人物图的细节增强、清晰度提升、皮肤/五官/材质质感提升
- 更适合“定稿前高清化”“角色海报增强”“封面图精修前处理”

核心节点：
- `675` `LoadImage`：输入图
- `408` `ImageScaleByAspectRatioV2`：按目标比例/尺寸放大
- `396` `UpscaleModelLoader`：加载超分模型
- `397` `ImageUpscaleWithModel`：执行超分
- `399` `ImageComparingSlider`：前后对比
- `387` `PreviewImage`：结果预览
- `402` `SaveImage`：保存高清结果
- `404` `easy imageRemBg`：可选去底/抠图后处理

---

## 二、推荐能力拆分

### A. `banana2-edit`

#### 适用场景
- 角色参考图改妆造
- 同角色换服装/换发型/换表情
- 场景图轻度改构图或气质
- 已生成图二次调整但仍希望保留主体一致性

#### 推荐输入映射
- `1261.image`：输入图文件名
- `1262.text`：编辑提示词
- `1260.seed`：可选，固定随机性
- `1260.aspectRatio`：可选，目标画幅
- `1260.resolution`：可选，目标分辨率
- `1263.filename_prefix`：保存前缀

#### 推荐 nodeInfoList
```json
[
  {"nodeId":"1261","fieldName":"image","fieldValue":"openapi/your_input.png"},
  {"nodeId":"1262","fieldName":"text","fieldValue":"保持人物身份一致，提升服装层次与镜头表现，增强电影感光影"},
  {"nodeId":"1260","fieldName":"aspectRatio","fieldValue":"9:16"},
  {"nodeId":"1260","fieldName":"resolution","fieldValue":"2k"},
  {"nodeId":"1260","fieldName":"seed","fieldValue":829788543},
  {"nodeId":"1263","fieldName":"filename_prefix","fieldValue":"banana2_edit"}
]
```

#### 接入建议
项目里把它定位成：
**参考图驱动的中层图像编辑能力**，不是最终高清定稿器。

---

### B. `banana-pro-edit`

#### 适用场景
- 与 Banana2 并行试稿
- 同一输入图做另一种模型风格尝试
- 需要把“编辑模型选择权”暴露给 Agent 或人工操作者

#### 推荐输入映射
- `841.image`：输入图文件名
- `842.text`：编辑提示词
- `848.seed`：可选
- `848.aspectRatio`：可选
- `848.resolution`：可选
- `843.filename_prefix`：保存前缀

#### 推荐 nodeInfoList
```json
[
  {"nodeId":"841","fieldName":"image","fieldValue":"openapi/your_input.png"},
  {"nodeId":"842","fieldName":"text","fieldValue":"保持人物五官一致，提升服装质感与画面高级感，增强海报级视觉冲击"},
  {"nodeId":"848","fieldName":"aspectRatio","fieldValue":"9:16"},
  {"nodeId":"848","fieldName":"resolution","fieldValue":"2k"},
  {"nodeId":"848","fieldName":"seed","fieldValue":829788543},
  {"nodeId":"843","fieldName":"filename_prefix","fieldValue":"banana_pro_edit"}
]
```

#### 接入建议
把它作为：
**Banana2 的平行备选编辑链**。

不要在项目文档里把它写成“升级版一定更强”，而应该写成：
- 不同模型链路
- 适用于 AB 测试
- 由项目需要决定默认值

---

### C. `portrait-upscale`

#### 适用场景
- 人物立绘高清化
- 海报图精修前清晰度提升
- 封面图、宣发图、角色卡的清晰细节增强
- 已完成构图和内容，不再改内容，只提升画质

#### 推荐输入映射
- `675.image`：输入图文件名
- `408.aspect_ratio` 或相关放大控制字段：目标比例 / 尺寸策略
- `396.model_name`：超分模型名称
- `402.filename_prefix`：保存前缀
- `404` 相关字段：若需要去底再启用

> 注意：这里的具体字段名要以 RunningHub 在 OpenAPI 里实际允许覆盖的字段为准。当前根据 workflow JSON 可确认的是节点职责，字段名要以实测结果校准。

#### 推荐 nodeInfoList（概念示例）
```json
[
  {"nodeId":"675","fieldName":"image","fieldValue":"openapi/your_portrait.png"},
  {"nodeId":"396","fieldName":"model_name","fieldValue":"4x-UltraSharp.pth"},
  {"nodeId":"402","fieldName":"filename_prefix","fieldValue":"portrait_upscale"}
]
```

#### 接入建议
把它定位为：
**后处理高清增强能力**，而不是创作阶段的主生成器。

也就是说：
- 前面先用生成/编辑链拿到满意内容
- 最后再进 `portrait-upscale` 做高清增强

---

## 三、三种能力在项目流程里的位置

### 1. prompt-lab 阶段
负责：
- 明确任务目标
- 判断是“新生成”“编辑已有图”还是“高清增强”

决策规则：
- 从零生成参考图：优先旧有 Banana2 三图工作流
- 已有图改造：走 `banana2-edit` 或 `banana-pro-edit`
- 内容已确定只需提清晰度：走 `portrait-upscale`

### 2. generation-executor 阶段
负责：
- 上传输入图
- 选择 workflow mode
- 注入 nodeInfoList
- 拉取 outputs
- 存档产物

推荐暴露给执行层的统一参数：
- `mode`
- `input-file`
- `prompt`
- `ratio`
- `resolution`
- `seed`
- `filename-prefix`
- `output-dir`

### 3. asset-librarian 阶段
负责：
- 归档输入图 / 输出图
- 记录使用了哪条能力链
- 记录 seed / ratio / resolution / prompt
- 记录是否为 AB 测试结果

### 4. quality-control 阶段
重点检查：
- 角色一致性是否保持
- 脸部是否崩坏
- 衣物纹理是否异常
- 放大后是否出现伪细节、蜡像感、边缘毛刺
- 海报图是否达到宣发标准

---

## 四、命名建议

为了让项目目录、任务卡、脚本模式统一，建议固定使用以下名字：

- `banana2`：三参考图生成工作流
- `banana2-edit`：Banana2 单图编辑工作流
- `banana-pro-edit`：BananaPRO 单图编辑工作流
- `portrait-upscale`：人物高清增强工作流

不要混用这些容易歧义的名字：
- “放大工作流”
- “高清工作流”
- “修图工作流”

因为它们都太宽泛，不利于后期 Agent 自动决策。

---

## 五、CLI 层建议参数设计

建议后续在 `tools/runninghub_client.py` 中新增三种显式模式：

```bash
--banana2-edit
--banana-pro-edit
--portrait-upscale
```

### 统一参数
```bash
--input-file
--prompt
--ratio
--resolution
--seed
--filename-prefix
--output-dir
```

### 仅 portrait-upscale 可扩展参数
```bash
--upscale-model
```

如果后面确认 `ImageScaleByAspectRatioV2` 有稳定可控字段，还可以再加：
```bash
--target-long-edge
--target-ratio
```

---

## 六、推荐落地策略

### 第一阶段：先把能力跑通
- 先支持三个模式的 nodeInfoList 自动拼装
- 不急着把所有高级字段暴露出来
- 优先保证“最少参数即可跑通”

### 第二阶段：再补 AB 测试能力
- 同一输入图同时跑 `banana2-edit` / `banana-pro-edit`
- QA 阶段人工比稿
- 逐步形成不同题材下的默认模型偏好

### 第三阶段：再做流程整合
- 接到任务模板
- 接到资产归档规范
- 接到 Agent 角色职责里

---

## 七、当前接入结论

### 你现在已经有两个明确 workflowId
- Banana2 三图生成：`2043087373063430146`
- 图像编辑与高清增强复合工作流：`2043088500844662785`

### 但在项目实现层，不建议把第二个 workflow 当作一个能力
而应该拆成三种模式：
- `banana2-edit`
- `banana-pro-edit`
- `portrait-upscale`

这会让整个创作库在结构、工作流、Agent/Skill 配合上更稳定，也更方便后续扩展。
