# RunningHub 图像 Agent 协作建议

> 本文用于说明 RunningHub 图像能力接入后，哪些 Agent 应在职责中吸收这些能力，以及建议怎么吸收，避免职责混乱。

当前纳入协作体系的模式包括：
- `banana2`
- `banana2-edit`
- `banana-pro-edit`
- `portrait-upscale`

---

## 1. prompt-lab
### 建议补充职责
- 支持 RunningHub Banana2 的参考图驱动图像实验
- 支持单图编辑任务的 prompt 设计与 AB 比稿规划
- 判断当前任务属于“生成 / 编辑 / 增强”哪一层
- 将人物图 / 服装图 / 场景图 + prompt 组织成标准任务卡
- 区分角色展示图、封面图、探索图三类目标
- 对结果记录主版本 / 备选版 / 失败版 / 观察版

### 建议补充输入
- `05-prompts/runninghub/`
- `docs/runninghub-banana2-workflow-map.md`
- `docs/runninghub-image-edit-upscale-workflow-map.md`
- `docs/runninghub-image-pipeline-integration-spec.md`

---

## 2. generation-executor
### 建议补充职责
- 支持执行 RunningHub 图像任务
- 使用 `tools/runninghub_client.py` 作为标准入口
- 按模式区分归档：
  - `banana2`
  - `banana2-edit`
  - `banana-pro-edit`
  - `portrait-upscale`
- 同步记录版本差异、失败记录与输出路径

### 建议补充输出位置
- `06-generated/runninghub/banana2/characters/`
- `06-generated/runninghub/banana2/covers/`
- `06-generated/runninghub/banana2/explorations/`
- `06-generated/runninghub/image-edit/banana2-edit/`
- `06-generated/runninghub/image-edit/banana-pro-edit/`
- `06-generated/runninghub/image-edit/portrait-upscale/`

---

## 3. asset-librarian
### 建议补充职责
- 将 RunningHub 结果纳入资产索引体系
- 增加 `@封面 / @角色展示 / @探索图 / @服装变体 / @场景变体 / @高清增强` 等标签
- 识别可跨项目复用的稳定图像资产
- 保留编辑版与高清增强版的版本链关系

---

## 4. quality-control
### 建议补充职责
- 对 Banana2 结果审核：
  - 人物一致性
  - 服装迁移是否自然
  - 场景是否压住主体
  - 是否适合作为封面 / 定妆 / 探索图
- 对单图编辑结果审核：
  - 是否换脸
  - 是否跑偏
  - 是否更接近目标用途
- 对高清增强结果审核：
  - 是否真的更清晰
  - 是否出现蜡像感、毛刺、假细节
- 对失败版建议补写到学习记录或 QA 失败项中

---

## 5. publisher
### 建议补充职责
- 若 RunningHub 结果通过 QA 且属于封面 / 宣发图，则接入 `09-publish/`
- 负责判断是否需要二次加字、裁切、平台比例适配
- 默认只接收已经通过 QA 的 final 版或 final-upscale 版

---

## 6. master
### 建议补充职责
- 决定当前任务是资产沉淀、风格探索、正式封面还是发布物料
- 决定当前任务优先走生成、编辑还是增强链
- 决定最终结果是否升级为全局案例或共享母版

---

## 推荐执行原则
1. 所有 RunningHub 图像任务必须先有任务模板，再执行生成或编辑
2. 所有结果必须带用途标签，不得裸生成后散落目录
3. 失败样本不直接丢弃，需保留最小记录
4. `portrait-upscale` 只处理后处理增强，不替代编辑职责
5. RunningHub 只处理静态图像资产，不替代 Seedance 动态镜头链
