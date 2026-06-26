# Autumn 项目架构整体设计

文档版本：V1.0  
更新日期：2026-06-13  
依据：PRD、界面交互布局、前端技术架构、编码规范。

## 1. 业务架构

Autumn 是对话式 AI 视频创作工作台，业务主链路如下：

```text
项目创建
  -> 资产准备
  -> 参数配置
  -> 对话指令
  -> AI 任务拆解
  -> 生图 / 生视频
  -> 故事板编排
  -> 画布预览与局部修改
  -> 时间线剪辑
  -> 保存与导出
```

生成视频的真正内核不在 Autumn 前端。前端通过后台管理系统接口接入已经集成好的“漫剧创作库工业化自动流水线 Agent 体系”，只负责调度、确认、展示进度和回写结果。

## 2. 功能域划分

| 功能域 | 核心职责 | 主要分层 |
| --- | --- | --- |
| Project | 项目创建、打开、保存、版本快照 | api, services, store, pages |
| User | 用户信息、权限、套餐、模型额度 | api, store, TopBar |
| ModelConfig | 可用模型、参数范围、价格或额度 | api, services, ParamPanel |
| Asset | 图片、视频、音频、角色、场景、剧本 | api, services, store, AssetLibrary |
| Storyboard | 分镜列表、排序、复制、删除、状态 | store, services, Storyboard |
| ChatFlow | 对话消息、指令输入、AI 回复 | api, services, store, ChatPanel |
| ImageGeneration | 生图、改图、圈选区域修改 | services, adapters, CanvasEditor |
| VideoGeneration | 生视频、任务进度、失败重试 | api, services, store |
| CreativePipeline | 漫剧创作库 Agent 流水线接入、阶段事件映射 | api, adapters, services, store |
| Canvas | 当前镜头预览、缩放、平移、圈选 | adapters, hooks, CanvasEditor |
| Timeline | 多轨道片段、播放指针、缩放 | adapters, store, TimelineEditor |
| Export | 导出任务、导出进度、下载 | api, services, store, TopBar |

## 3. 分层模式

```text
Data Access Layer
  api/request.ts
  api/*.ts
  api/socketClient.ts

Domain Logic Layer
  services/*
  store/*
  adapters/*
  utils/validate.ts
  utils/errors.ts

Interaction Layer
  hooks/*

Presentation Layer
  pages/*
  business-components/*
  components/*
```

## 4. 业务模块内部结构

每个业务模块推荐按以下方式组织：

```text
ModuleName/
├── components/       # 业务展示子组件
├── hooks/            # 模块交互 hook
├── services/         # 模块业务逻辑
├── adapters/         # DTO 或第三方库适配
├── types.ts          # 模块专用类型
└── index.ts          # 对外出口
```

如果模块需要跨项目复用，优先沉淀到 `src/components`、`src/hooks`、`src/services` 或 `src/adapters`。

## 5. 状态架构

Zustand store 按业务域拆分：

| Store | 内容 |
| --- | --- |
| `projectStore` | 当前项目、保存状态、项目级配置 |
| `userStore` | 用户资料、权限、套餐 |
| `modelConfigStore` | 可用模型、参数范围、默认值 |
| `assetStore` | 资产列表、上传进度、选中资产 |
| `storyboardStore` | shots、selectedShotId、排序状态 |
| `canvasStore` | 视图模式、缩放、平移、选区 |
| `timelineStore` | tracks、clips、playhead、zoom |
| `chatStore` | messages、composer、attachments |
| `paramStore` | model、seed、iw、cref、sref、cw、sw |
| `taskStore` | generationTasks、exportTasks、socket status |
| `pipelineStore` | pipelineTaskId、stage、stage status、backend events |

跨 store 的复杂操作必须进入 `services/orchestration`。

## 6. 编排服务

复杂业务流程集中在编排层：

```text
src/services/orchestration/
├── submitGenerationCommand.ts
├── applyGenerationProgress.ts
├── syncShotToTimeline.ts
├── selectShotAcrossWorkspace.ts
├── retryFailedGeneration.ts
├── saveProjectSnapshot.ts
└── exportProjectVideo.ts
```

示例：

```text
submitGenerationCommand
  -> buildChatContext
  -> buildGenerationPayload
  -> createGenerationTask
  -> insertPendingShots
  -> insertTimelinePlaceholders
  -> appendAssistantProgressMessage
```

## 7. 模块依赖规范

### 7.1 推荐依赖

```text
business-components/ChatPanel
  -> hooks/useChatComposer
  -> services/chat
  -> services/orchestration
  -> store/chatStore

business-components/CanvasEditor
  -> hooks/useCanvasEditor
  -> adapters/fabric
  -> store/canvasStore

services/video-generation
  -> api/generation
  -> utils/validate
  -> adapters/generationDto
```

### 7.2 禁止依赖

- `api` 依赖 `store`。
- `api` 依赖 React 组件。
- `components` 直接依赖 `api`。
- `business-components` 直接依赖第三方库深层 API。
- 生图模块直接修改时间线状态。
- 时间线组件直接调用生成任务 API。

## 8. 设计原则落地

- 高内聚：每个业务域只处理自己的职责。
- 低耦合：跨模块通过 service、store action、adapter 和类型通信。
- 可测试：业务逻辑不写在 JSX 中。
- 可替换：第三方库全部有 adapter。
- 可复用：先沉淀公共组件，再实现业务组件。
- 可追踪：每个任务必须更新进度、日志和记忆。

## 9. 第一阶段目标架构

MVP 第一阶段先实现：

```text
src/
├── api/
├── adapters/
├── components/
├── business-components/
├── hooks/
├── pages/
├── services/
├── store/
├── types/
├── utils/
└── constants/
```

第一阶段不追求所有真实 API 完成，但必须保证 Mock 数据、状态联动和 UI 结构符合最终架构。
