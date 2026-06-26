# RunningHub 图像编辑与高清增强使用指南

## 适用范围
本指南对应 RunningHub 复合 workflow：`2043088500844662785`。

在项目实现层，这个 workflow 不作为一个笼统能力使用，而是拆成三个独立模式：

- `banana2-edit`
- `banana-pro-edit`
- `portrait-upscale`

请始终把它们当成三种不同职责：
- `banana2-edit`：做内容编辑
- `banana-pro-edit`：做平行编辑试稿
- `portrait-upscale`：做后处理高清增强

这样拆分的原因不是“好看”，而是为了保证：
- **合理性**：创作阶段和后处理阶段不混淆
- **灵活性**：同一输入图可以做 AB 比稿
- **易用性**：脚本、任务卡、归档、QA 都能统一

---

## 一、三种模式怎么选

### 1. `banana2-edit`
适合：
- 角色图轻改妆造
- 同角色换服装 / 换表情 / 换局部风格
- 已有图的二次编辑，且仍希望保留人物一致性
- 封面草稿在不推翻主体的前提下做氛围修正

一句话判断：
**内容还要改，就优先走 `banana2-edit`。**

### 2. `banana-pro-edit`
适合：
- 需要与 `banana2-edit` 做 AB 比稿
- 想尝试另一条编辑模型链路
- 同样的输入图在 Banana2 上不够理想，想快速试另一种结果

一句话判断：
**它是 Banana2 的平行备选链，不是默认更高级。**

### 3. `portrait-upscale`
适合：
- 内容和构图都满意，只需要提高清晰度
- 人物海报、角色卡、封面图定稿前增强
- 宣发图的细节补强
- 需要进入裁切、加字、发布前的高清化处理

一句话判断：
**不改内容，只做画质增强，就走 `portrait-upscale`。**

---

## 二、最重要的判断规则

### 规则 1：edit 和 upscale 绝不能混为一谈
- `edit`：改内容、改气质、改镜头表达、改视觉重心
- `upscale`：不改核心内容，只提高细节和清晰度

如果还在纠结人物是否好看、服装是否对、氛围是否成立，就说明还在 **edit 阶段**，不要过早做 upscale。

### 规则 2：先定内容，再做高清增强
推荐顺序：
1. 先跑 `banana2-edit`
2. 有必要时再跑 `banana-pro-edit` 做 AB 对比
3. 选定主版本
4. 最后再跑 `portrait-upscale`

### 规则 3：BananaPRO 不是“升级版默认主链”
它更合理的定位是：
- 与 Banana2 平行的另一条编辑通道
- 适合做对照测试
- 是否默认使用，要靠项目经验沉淀，不要预设结论

### 规则 4：一切结果都必须可追溯
任何一次 edit / upscale：
- 都必须记录输入图来源
- 都必须记录 prompt 或增强参数
- 都必须记录输出目录和版本名
- 都必须在 QA 中留下至少最小结论

---

## 三、脚本入口

统一脚本：

```bash
python3 tools/runninghub_client.py
```

运行前先配置：

```bash
export RUNNINGHUB_API_KEY="你的API_KEY"
```

脚本当前支持：
- `--banana2`
- `--banana2-edit`
- `--banana-pro-edit`
- `--portrait-upscale`

默认 workflowId：
- Banana2 三图生成：`2043087373063430146`
- 图像编辑 / 高清增强复合工作流：`2043088500844662785`

---

## 四、最常用命令模板

### A. Banana2 单图编辑

```bash
python3 tools/runninghub_client.py \
  --banana2-edit \
  --input-file /绝对路径/your_input.png \
  --prompt "保持人物身份一致，提升服装层次和镜头表现，增强电影感光影" \
  --ratio 9:16 \
  --resolution 2k \
  --seed 829788543 \
  --filename-prefix banana2_edit_test \
  --output-dir /绝对路径/your_output_dir
```

### B. BananaPRO 单图编辑

```bash
python3 tools/runninghub_client.py \
  --banana-pro-edit \
  --input-file /绝对路径/your_input.png \
  --prompt "保持人物五官一致，提升服装质感与海报级视觉冲击" \
  --ratio 9:16 \
  --resolution 2k \
  --seed 829788543 \
  --filename-prefix banana_pro_edit_test \
  --output-dir /绝对路径/your_output_dir
```

### C. 人物高清增强

```bash
python3 tools/runninghub_client.py \
  --portrait-upscale \
  --input-file /绝对路径/your_portrait.png \
  --upscale-model 4x-UltraSharp.pth \
  --filename-prefix portrait_upscale_test \
  --output-dir /绝对路径/your_output_dir
```

---

## 五、项目内推荐目录标准

建议在项目内形成统一落点，而不是临时散落：

```text
05-prompts/runninghub/
  banana2/
  image-edit/

06-generated/runninghub/
  banana2/
  image-edit/
    banana2-edit/
    banana-pro-edit/
    portrait-upscale/

08-qa/
  runninghub-image-review.md
```

### 目录职责

#### `05-prompts/runninghub/`
保存：
- 本次使用的 prompt
- 模式（banana2-edit / banana-pro-edit / portrait-upscale）
- 输入图来源
- ratio / resolution / seed / upscale-model
- 决策理由：为什么用这个模式

#### `06-generated/runninghub/`
保存：
- 原始输出图
- 不同版本输出
- 同一任务的 AB 结果
- 文件名中保留任务名 / shot 名称 / 模式 / 版本号

#### `08-qa/`
保存：
- 比稿结果
- 是否通过
- 缺陷记录
- 是否回炉 edit
- 是否可进入 upscale
- 是否可升级为正式资产

---

## 六、推荐工作流

### 流程 1：已有图二次编辑
适用于角色形象微调、服装替换、镜头感增强。

建议顺序：
1. 先跑 `banana2-edit`
2. 如结果一般，再跑 `banana-pro-edit` 做 AB 比稿
3. 选定最好的一版
4. 最后再进 `portrait-upscale`

### 流程 2：已有图已满意，只想高清化
建议顺序：
1. 直接跑 `portrait-upscale`
2. QA 检查五官、头发边缘、服装纹理、皮肤质感
3. 合格后归档

### 流程 3：用于封面图 / 宣发图
建议顺序：
1. 先用 edit 模式把“内容”和“氛围”调满意
2. 再做高清增强
3. 最后进入宣发裁切与发布环节

---

## 七、决策矩阵

| 当前需求 | 推荐模式 | 是否需要 prompt | 是否建议固定 seed | 是否需要 QA 比稿 | 是否建议后续 upscale |
|---|---|---|---|---|---|
| 换服装 / 换表情 / 轻改造型 | `banana2-edit` | 是 | 是 | 是 | 视结果决定 |
| 同一张图做第二条编辑链试稿 | `banana-pro-edit` | 是 | 是 | 是 | 视结果决定 |
| 已经满意，只想更清晰 | `portrait-upscale` | 否 | 否 | 是 | 不需要再 edit |
| 封面图定稿前精修 | `banana2-edit` → `portrait-upscale` | 是 | 是 | 是 | 是 |
| 宣发海报 AB 试稿 | `banana2-edit` + `banana-pro-edit` | 是 | 是 | 是 | 选定后再做 |

---

## 八、Agent / Skill 配合建议

### 1. prompt-lab
负责：
- 写编辑提示词
- 判断本轮是“改内容”还是“提清晰度”
- 决定是否需要 AB 比稿

输出给执行层的最小结构建议：
- `mode`
- `input-file`
- `prompt`
- `ratio`
- `resolution`
- `seed`
- `filename-prefix`
- `output-dir`
- `reason`

### 2. generation-executor
负责：
- 调用 `tools/runninghub_client.py`
- 上传输入图
- 拉取 outputs
- 结果落盘
- 保留原始运行参数

### 3. asset-librarian
负责：
- 归档输入图与结果图
- 记录使用模式
- 记录参数
- 标记是否为 AB 测试样本
- 判断是否可沉淀为复用资产

### 4. quality-control
负责：
- 检查一致性
- 检查结构失真
- 检查放大伪影
- 判断是否能进入定稿或宣发

### 5. publisher
负责：
- 对通过 QA 的封面 / 海报结果做裁切、加字、平台适配
- 不参与前面的模型链选择

---

## 九、命名规则建议

建议固定使用：
- `banana2-edit`
- `banana-pro-edit`
- `portrait-upscale`

文件名前缀建议包含：
- 项目名 / 集数 / 镜头号
- 能力模式
- 版本号

例如：

```text
ep12_shot03_banana2_edit_v01
ep12_shot03_banana_pro_edit_v02
ep12_cover_portrait_upscale_v01
```

这样后面归档、比稿和回溯都会非常清楚。

---

## 十、QA 放行标准

### A. `banana2-edit` / `banana-pro-edit` 放行标准
至少满足：
- 主体身份没有明显漂移
- 五官没有崩坏
- 服装和肢体逻辑成立
- 构图比原图更清楚或更适合用途
- 提示词目标基本兑现

### B. `portrait-upscale` 放行标准
至少满足：
- 清晰度确实提升
- 没有明显蜡像感
- 头发边缘没有严重毛刺
- 睫毛 / 皮肤 / 衣物纹理没有假细节过载
- 背景没有出现不自然锐化

### C. 不放行的典型信号
- 人物脸被“换人”
- 衣服逻辑变形
- 手部、耳朵、发际线异常
- 放大后反而更假
- 结果虽然清晰，但不再符合项目人设或镜头目标

---

## 十一、版本策略建议

建议同一任务至少保留三类关系：
- `baseline-v1`：首个可用版本
- `alt-v1`：AB 比稿对照版
- `final-v1`：最终放行版

如果后面又做高清增强，可以追加：
- `final-upscale-v1`

不建议直接覆盖旧结果。
应当保留版本链，方便后面回看：
- 为什么 A 优于 B
- 为什么不做 upscale
- 为什么最终选择这版

---

## 十二、实操注意事项

### 1. 不要为了“看起来高级”过早上高清增强
如果人物还没定型，upscale 只会放大问题。

### 2. 不要默认 BananaPRO 一定优于 Banana2
两者更适合作为：
- 两条平行编辑链
- 由项目题材和图像状态决定优先级

### 3. 所有 upscale 结果都必须经过 QA
尤其检查：
- 脸部是否蜡化
- 睫毛 / 发丝是否脏乱
- 衣服边缘是否起毛刺
- 皮肤细节是否假
- 背景是否被错误锐化

### 4. 进入比稿阶段后建议固定 seed
这样有利于复现、回退和归因。

### 5. 失败版不要直接删除
至少保留最小记录：
- 输入图
- 模式
- prompt
- 失败原因
- 是否建议回退到另一条链路

---

## 十三、当前阶段建议

当前脚本已经可用，但要达到项目级“最终版本”标准，合理路径应是：

1. 先用统一模板记录任务
2. 再按模式执行脚本
3. 把结果归档到固定目录
4. 在 QA 中判断是否进入正式资产
5. 最终由 asset-librarian 回填资产索引

这样才能从“脚本能跑”真正升级到“工作流稳定可复用”。
