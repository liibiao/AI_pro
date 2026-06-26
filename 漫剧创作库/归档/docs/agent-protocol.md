# Agent Protocol — Agent 协作协议

## 核心角色分工 (精益版)

| 核心 Agent | 职责 |
|-----------|------|
| **Producer (制片人)** | 项目调度、阶段门禁、成本控制、发布运营。整合了原 master/operations/publisher。 |
| **Writer (编剧)** | 故事大纲、人物设定、剧本正文、格式自检。整合了原 scriptwriter/script-auditor。 |
| **Director (导演)** | 导演讲戏、视觉风格、美术指导、视觉连续性。整合了原 director/art-director/continuity，与独立 Storyboard Artist 协作完成分镜。 |
| **Storyboard Artist (分镜师)** | 分镜拆解、镜头排序、节拍控制、故事板生产包总装。独立角色，承接 Director 讲戏意图，服务 Studio 生成执行。 |
| **Librarian (制片库)** | 资产管理、跨集一致性、故事板资产引用矩阵、项目状态快照。整合了原 asset-librarian/context-loader。 |
| **Studio (工作室)** | AI 生成执行、故事板图生成、模型适配实验。整合了原 executor/prompt-lab/technical-dir。 |
| **Reviewer (审片员)** | 剪辑组装、故事板/业务 QA、成片质检。整合了原 quality-control/editor。 |

## 协作规则

### 1. 总控优先
所有专业 Agent 不直接跳步骤，统一由 `master` 调度。

### 2. 产物先落文件，再汇报
每个 Agent 完成工作后，应先生成对应文档，再汇报结果，避免信息只停留在聊天里。

### 2.1 记忆系统文件化保存
任何 Agent 在吸收新方法论、修改工作流、改变产出物标准、更新项目状态、形成复盘结论或新增协作规则时，必须把可复用结论写入项目文件。对话中的临时总结、外部持久记忆或口头汇报只作为辅助，不替代项目内文件化记忆。统一遵循 `docs/project-memory-system.md`。

### 3. 上下文最小化原则
每个 Agent 只读取完成当前任务所必需的文件，避免上下文过载。

### 4. 命名一致
- 集数统一：`ep001`
- 场景统一：`scene-001`
- 角色统一：`char-001`
- 道具统一：`prop-001`
- 镜头统一：`shot-001`

## 推荐消息类型

| 消息类型 | 用途 | 示例 |
|---------|------|------|
| task_request | 下发任务 | 请完成 ep001 分镜 |
| task_complete | 完成通知 | ep001 分镜已完成 |
| review_request | 请求审核 | 请审核 ep001 剧本 |
| revision_request | 请求修改 | 根据审核意见调整第3场 |
| asset_ready | 资产就绪 | char-001 三视图已完成 |
| experiment_ready | 提示词实验完成 | shot-003 推荐使用 v02 |
| continuity_alert | 连续性告警 | ep002 右臂伤势前后不一致 |
| storyboard_board_ready | 导演故事板图就绪 | board-001 D12/D15 故事板图与适配包已完成 |
| video_adaptation_ready | 视频模型适配包就绪 | Sora2/Seedance2 参考图职责矩阵已完成 |
| generation_ready | 素材生成完成 | ep001 可用镜头已归档 |
| edit_ready | 剪辑版完成 | ep001 v1 样片可审 |

## 交接规范

### 编剧 → 导演
必须交付：
- 分集剧本
- 人物关系说明
- 本集情绪重点

### 导演 → 分镜师
必须交付：
- 导演讲戏本
- 动作链/调度说明
- 光影与镜头语言要求
- D12-Sora2 / D15-Seedance2 目标版本策略
- 影片基调、风格、光影、镜头节奏速度和视频模型适配方向

### 美术 → 分镜师
必须交付：
- 人物参考图标签
- 场景 @引用标签
- 道具索引

### 分镜师 → 生成执行
必须交付：
- 分镜表
- D12-Sora2 / D15-Seedance2 专业导演故事板图或故事板图输入包
- Panel 格数、每格时长、总时长求和和连续性卡
- Sora2 / Seedance2-Stable / Seedance2-Extended 视频适配包
- 内部提示词 / 模型建议（仅作引擎与适配说明，不默认作为主交付）

### 生成执行 → 剪辑
必须交付：
- 原始素材文件夹
- 镜头命名清单
- 废弃镜头说明
- 生成版本记录
- D12-Sora2 / D15-Seedance2 故事板图生成记录
- Sora2 / Seedance2 参考图职责矩阵与失败回退说明

### 剪辑 → 质检
必须交付：
- 剪辑说明
- 当前版本信息
- 待确认问题清单（如有）
