# RunningHub 图像接入规范

## 定位
RunningHub 在本创作库中的定位不是通用底层图像引擎，而是：

> **静态图像资产生成、单图编辑、高清增强的外部执行层**

它适合用于：
- 角色展示图
- 定妆图 / 人设图
- 宣发封面图
- 视觉探索图
- 封面草稿修正
- 单图风格与气质微调
- 发布前高清增强

它不替代：
- Seedance 的动态镜头执行链
- 动作分镜主生成职责
- 视频剪辑与成片包装职责

---

## 一、接入原则
### 1. 合理性
- RunningHub 只处理“静态图像资产任务”
- 生成、编辑、增强三层职责必须分开
- 不与 Seedance 动态镜头链混用职责
- 不作为所有图片生成任务的统一入口

### 2. 灵活性
- 高频任务走标准模式：
  - `banana2`
  - `banana2-edit`
  - `banana-pro-edit`
  - `portrait-upscale`
- 特殊任务允许 seed / resolution / 手动 nodeInfoList 扩展
- 后续可演化为角色模板 / 封面模板 / 探索模板 / 发布前精修模板

### 3. 易用性
- 人类与 Agent 优先使用任务模板，而不是手写 nodeInfoList
- 统一调用入口：`tools/runninghub_client.py`
- 统一结果落点：`06-generated/runninghub/`
- 所有结果必须进入 QA 和资产索引

---

## 二、能力分层

### 1. 参考图驱动生成
- 模式：`banana2`
- 作用：三图输入生成角色图、封面图、探索图

### 2. 单图编辑
- 模式：`banana2-edit`
- 模式：`banana-pro-edit`
- 作用：对已有图像做内容修正与表达增强

### 3. 高清增强
- 模式：`portrait-upscale`
- 作用：不改内容，只提升清晰度与细节

---

## 三、目录建议
在项目内建议使用：

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
```

### 目录含义
- `banana2/characters/`：角色展示图 / 定妆图 / 人设图
- `banana2/covers/`：封面图 / 宣发海报 / 卡面图
- `banana2/explorations/`：风格探索图 / 草案图 / 观察版
- `image-edit/banana2-edit/`：主链单图编辑结果
- `image-edit/banana-pro-edit/`：AB 备选单图编辑结果
- `image-edit/portrait-upscale/`：最终高清增强结果

---

## 四、推荐工作流接法
### 上游输入层
- `03-assets/` 提供人物、服装、场景、已有候选图等参考资产
- `05-prompts/runninghub/` 记录任务卡、prompt 与命令样例

### 执行层
- `generation-executor` 调用 `tools/runninghub_client.py`
- 原始生成结果统一落到 `06-generated/runninghub/`

### 审核层
- `quality-control` 审核人物一致性、服装贴合、场景关系、用途适配性、高清增强伪影

### 资产层
- `asset-librarian` 回填 `06-generated/asset-index.md`
- 根据用途打标签：`@人物 / @服装变体 / @封面 / @探索图 / @高清增强`

### 发布层
- 若结果用于封面或宣发图，由 `publisher` 接入 `09-publish/`

---

## 五、任务类型建议
### 1. 角色展示图
- 目标：沉淀稳定人物形象
- 推荐模式：`banana2`
- 推荐 ratio：`3:4`
- 输出目录：`06-generated/runninghub/banana2/characters/`

### 2. 封面图
- 目标：强化视觉中心、人物气场和宣发张力
- 推荐路径：`banana2` → `banana2-edit` → `portrait-upscale`
- 推荐 ratio：`9:16`
- 输出目录：`06-generated/runninghub/banana2/covers/`

### 3. 视觉探索图
- 目标：寻找风格方向，不直接视为正式资产
- 推荐模式：`banana2`
- 推荐目录：`06-generated/runninghub/banana2/explorations/`
- 结果需进入观察记录，不默认入正式资产

### 4. 单图修正任务
- 目标：在已有候选图基础上提升用途适配性
- 推荐模式：`banana2-edit`，必要时补 `banana-pro-edit`

### 5. 发布前高清增强
- 目标：为正式发布物料做最后一步画质增强
- 推荐模式：`portrait-upscale`
- 前提：内容版本已经稳定

---

## 六、Agent 责任边界
### prompt-lab
- 把抽象风格词拆成可执行 prompt
- 控制任务变量数量
- 判断当前任务属于生成、编辑还是增强

### generation-executor
- 执行 RunningHub 任务
- 统一命名与目录归档
- 保留原始输出与失败记录

### art-director
- 审核输入图是否适配任务目标
- 确保人物、服装、场景与构图逻辑一致

### quality-control
- 审核人物一致性、服装贴合度、场景合理性、画面高级感、发布适配性
- 判断是主版本、备选版还是失败版

### asset-librarian
- 维护 RunningHub 生成资产索引
- 给结果打结构化标签
- 识别是否可跨项目复用

### publisher
- 仅在图像产物进入封面 / 宣发用途时介入

---

## 七、推荐执行顺序
1. 在 `03-assets/` 确认输入参考资产
2. 在 `05-prompts/runninghub/` 填写任务模板
3. `prompt-lab` 整理 prompt 与用途目标
4. `generation-executor` 执行对应命令
5. 结果落到 `06-generated/runninghub/`
6. `quality-control` 审核并判定用途
7. `asset-librarian` 回填资产索引与标签
8. 若属于封面 / 宣发图，再由 `publisher` 接入发布包装链

---

## 八、失败信号
以下情况说明接法不合理：
- 每次都直接手写 nodeInfoList，没有任务模板和记录
- edit 与 upscale 混为一谈
- 结果没有回填到资产索引或 QA 记录
- 角色图、封面图、探索图、增强图混在同一目录
- 失败版没有记录，不可回溯
