# RunningHub 图像工作流接入规范（最终版）

## 定位
RunningHub 在本创作库中的角色不是单一模型入口，而是：

> **静态图像资产生成、图像编辑、高清增强的外部执行层**

它主要服务三类任务：
- **参考图驱动生成**：如 Banana2 三图生成
- **单图二次编辑**：如 `banana2-edit`、`banana-pro-edit`
- **后处理高清增强**：如 `portrait-upscale`

它不替代：
- Seedance 的动态镜头执行链
- 分镜生成链
- 视频剪辑链

---

## 一、能力分层

### 1. 生成层
代表：`banana2`

职责：
- 根据人物图、服装图、场景图生成静态图像资产
- 服务于角色图、封面图、探索图等参考图驱动任务

### 2. 编辑层
代表：
- `banana2-edit`
- `banana-pro-edit`

职责：
- 基于已有图像做内容改造
- 解决“主体基本正确，但还需要优化表达”的问题

### 3. 增强层
代表：`portrait-upscale`

职责：
- 不改变核心内容，只提升细节和清晰度
- 用于定稿、宣发、发布前处理

---

## 二、最核心的接入原则

### 1. 合理性
- 生成、编辑、增强三层职责必须分开
- 不允许用 upscale 代替 edit
- 不允许用 edit 假装做最终发布增强
- 任何能力都不能越权替代 Seedance 的动态镜头职责

### 2. 灵活性
- 允许同一输入图进入两条编辑链做 AB 测试
- 允许同一主版本再走高清增强形成最终发布版
- 允许未来替换 workflowId，但不改变项目内的能力命名

### 3. 易用性
- 人与 Agent 都优先使用“模式名 + 任务模板”
- 不鼓励直接手写 `nodeInfoList`
- 所有结果都必须落到固定目录并进入 QA

---

## 三、统一命名标准

项目内统一使用以下能力名：
- `banana2`
- `banana2-edit`
- `banana-pro-edit`
- `portrait-upscale`

禁止使用这些模糊叫法：
- “放大工作流”
- “修图工作流”
- “高清工作流”
- “增强版模型”

因为这些说法都不足以支撑 Agent 做自动决策。

---

## 四、项目目录规范

建议在每个项目内形成如下结构：

```text
05-prompts/runninghub/
  banana2/
  image-edit/

06-generated/runninghub/
  banana2/
    characters/
    covers/
    explorations/
  image-edit/
    banana2-edit/
    banana-pro-edit/
    portrait-upscale/

08-qa/
  runninghub-image-review.md
```

### 各目录职责

#### `05-prompts/runninghub/banana2/`
记录：
- Banana2 三图生成任务卡
- prompt
- ratio / resolution / seed
- 输入参考图来源

#### `05-prompts/runninghub/image-edit/`
记录：
- 单图编辑任务卡
- 高清增强任务卡
- 编辑 / 增强的决策理由

#### `06-generated/runninghub/banana2/`
记录：
- 角色图
- 封面图
- 探索图

#### `06-generated/runninghub/image-edit/`
记录：
- `banana2-edit`
- `banana-pro-edit`
- `portrait-upscale`
各模式下的原始输出和版本链

#### `08-qa/runninghub-image-review.md`
记录：
- 比稿结论
- QA 放行结论
- 是否升级正式资产
- 是否进入发布包装

---

## 五、Agent 职责边界

### prompt-lab
负责：
- 判断任务应走生成 / 编辑 / 增强哪一层
- 产出任务模板和 prompt
- 决定是否需要 AB 比稿

### generation-executor
负责：
- 调用 `tools/runninghub_client.py`
- 上传输入图
- 发起任务、拉取结果、落盘归档
- 保留运行参数

### art-director
负责：
- 判断输入图是否适合作为本轮任务基础
- 审核角色、服装、构图、光影方向是否统一

### quality-control
负责：
- 做结构一致性审核
- 做画面用途适配审核
- 做高清增强伪影审核
- 给出放行 / 回退 / 重做建议

### asset-librarian
负责：
- 回填 `06-generated/asset-index.md`
- 记录版本链和资产标签
- 判断是否可跨项目复用

### publisher
负责：
- 对已经通过 QA 的图像做裁切、加字、平台包装
- 不负责模型链选择

---

## 六、标准执行顺序

### A. 生成任务（Banana2）
1. 准备人物 / 服装 / 场景参考图
2. 填 Banana2 任务模板
3. 执行 `--banana2`
4. 结果进 QA
5. 回填资产索引

### B. 编辑任务（banana2-edit / banana-pro-edit）
1. 确认输入图是可编辑基础版
2. 填单图编辑任务模板
3. 先执行 `banana2-edit`
4. 必要时执行 `banana-pro-edit` 做 AB 比稿
5. 通过 QA 后升级主版本
6. 如有必要再进入 `portrait-upscale`

### C. 增强任务（portrait-upscale）
1. 仅在主版本已经成立时执行
2. 填高清增强任务模板
3. 执行 `portrait-upscale`
4. QA 检查伪影与清晰度收益
5. 合格后进入发布或正式资产目录

---

## 七、版本管理规则

建议统一保留：
- `baseline-v1`
- `alt-v1`
- `final-v1`
- `final-upscale-v1`
- `failure-v1`

原则：
- 不覆盖旧版
- 不删除失败版最小记录
- 所有最终版都要能回溯到对应输入和任务卡

---

## 八、QA 最低要求

### 生成 / 编辑类
必须确认：
- 人物身份一致
- 构图清楚
- 服装、道具、场景关系成立
- 结果符合任务目标

### 高清增强类
必须确认：
- 细节提升真实有效
- 没有明显蜡像感
- 没有发丝毛刺和脏边
- 没有背景错误锐化

---

## 九、失败信号

以下情况说明接入仍不合理：
- 一上来就做 upscale，没有先判断 edit 是否完成
- 结果散落目录，无法知道从哪张图来的
- 只保存最好的一版，AB 过程全丢失
- 没有任务模板，只有命令历史
- QA 不区分“能看”和“可入正式资产”

---

## 十、当前最终建议

如果目标是形成长期可复用的最终版体系，那么 RunningHub 在本项目里应被固定为：

- 一个**标准化静态图像执行层**
- 以 `banana2 / banana2-edit / banana-pro-edit / portrait-upscale` 四种模式提供服务
- 通过**任务模板 + 固定目录 + QA + 资产索引**形成稳定闭环

这样后续无论换模型、换 workflow、换项目，都不需要重写整套工作方法，只需要替换底层映射即可。
