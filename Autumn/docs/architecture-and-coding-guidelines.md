# Autumn 开发架构与编码规范设计文档

文档版本：V1.0  
更新日期：2026-06-14  
适用项目：Autumn 前端工程  
定位：项目长期开发指导文档，用于约束架构分层、模块拆分、组件设计、公共库沉淀和代码评审标准。

## 1. 核心设计原则

Autumn 是一个复杂的 AI 视频创作工作台，包含生视频、生图、对话流、资产库、故事板、画布编辑、时间线、导出等多个高交互模块。项目开发必须优先保证可维护性、可读性、可扩展性和可复用性。

重要边界：

- 生成视频的真正内核依托后台管理系统中已经接入的“漫剧创作库工业化自动流水线 Agent 体系”。
- 前端不得实现或复制该工业化 Agent 流水线。
- 前端只实现工作台、状态展示、用户确认、任务调度入口、进度订阅和结果回写。
- 所有流水线事件必须通过 `api/pipeline`、`adapters/pipeline`、`services/pipeline` 消化后再进入 UI。

必须遵守以下原则：

- 高内聚：同一个模块只负责一类明确业务能力，模块内部围绕同一目标组织代码。
- 低耦合：模块之间通过类型、接口、store action、service 方法通信，不直接互相读取内部实现。
- 单一职责：一个组件、hook、store、service、utils 文件只承担一个清晰职责。
- 分层清晰：业务代码按数据层、逻辑层、交互层、展示层拆分。
- 可替换：AI 模型、生成服务、时间线组件、画布库、上传服务必须通过适配层接入，避免业务组件绑定第三方实现。
- 可测试：复杂逻辑必须从 UI 组件中抽离，进入 hooks、services、utils 或 store actions。
- 渐进复用：公共能力先在业务中验证，再下沉到组件库或公用类库，避免过早抽象。

## 1.1 UI 1:1 还原原则

Autumn 的 UI 开发必须以已确认效果图为唯一视觉合同。前端工程师不能把效果图当成“方向参考”，必须逐项还原页面样式、布局、交互逻辑、字体字号、色调、颜色、组件间交互、控件尺寸、线条粗细颜色、圆角、阴影和状态反馈。

执行要求：

- 每个页面、弹窗、面板和状态必须有暗色 / 白天两套效果图。
- 开发前必须拆解视觉 token、组件尺寸、布局比例、字体、边框、圆角、阴影和交互状态。
- 开发后必须输出同 viewport、同主题的实现截图。
- UI/UX Agent 必须先做 1:1 视觉验收，结论为 `PASS` 后才能进入测试工程师 Agent 验收。
- 视觉可见差异零容忍；未通过时任务状态为 `UI_REDO`，必须返工。
- 当前已开发界面在 UI/UX Agent 验收通过前，只能视为功能原型，不能作为最终 UI 交付。

## 2. 总体架构分层

前端代码按四层组织：数据层、逻辑层、交互层、展示层。

```text
展示层 Presentation
  React UI 组件、布局组件、纯展示组件

交互层 Interaction
  hooks、事件处理、拖拽、快捷键、上传交互、画布交互、时间线交互

逻辑层 Domain Logic
  业务服务、生成任务编排、参数校验、状态联动、错误映射、权限判断

数据层 Data Access
  API 请求、Socket 事件、DTO 适配、本地缓存、上传下载
```

依赖方向必须单向：

```text
展示层 -> 交互层 -> 逻辑层 -> 数据层
```

禁止反向依赖：

- 数据层不得 import React 组件。
- service 不得操作 DOM。
- UI 组件不得直接拼接复杂请求参数。
- 业务组件不得直接依赖第三方接口原始返回字段。
- 展示组件不得直接调用 Axios、Socket 或浏览器存储。

## 3. 推荐目录结构

```text
src/
├── api/                    # 数据层：HTTP、Socket、上传、下载
├── services/               # 逻辑层：业务服务、任务编排、适配器
├── store/                  # 逻辑层：Zustand 状态与 action
├── hooks/                  # 交互层：UI 行为、订阅、拖拽、快捷键
├── components/             # 展示层：项目级通用组件库
├── business-components/    # 展示层：业务组件，按领域归档
├── pages/                  # 页面入口，只负责组合布局
├── types/                  # 全局类型、DTO、领域模型
├── utils/                  # 无业务依赖的通用工具
├── constants/              # 枚举、配置、静态常量
├── adapters/               # 第三方库与后端 DTO 适配
└── assets/                 # 静态资源和全局样式
```

页面文件只做装配，不承载复杂业务：

```tsx
function EditorPage() {
  return (
    <EditorShell
      topBar={<TopBar />}
      leftPanel={<LeftPanel />}
      centerCanvas={<CenterCanvas />}
      rightPanel={<RightPanel />}
      timeline={<BottomTimeline />}
    />
  );
}
```

## 4. 功能模块边界

每个核心业务能力必须形成独立模块，不能把所有业务堆到 `Editor`、`App`、单个 store 或单个 service 中。

### 4.1 生视频模块 Video Generation

职责：

- 调用后台漫剧创作库 Agent 流水线创建视频相关阶段任务。
- 将前端项目、分镜、素材、参数转换为后台流水线所需请求。
- 接收后台流水线的视频任务进度事件。
- 失败重试和错误提示。
- 生成结果写入故事板和时间线。

建议目录：

```text
src/services/video-generation/
├── createVideoTask.ts
├── mapVideoTaskDto.ts
├── buildVideoGenerationPayload.ts
├── handleVideoTaskProgress.ts
└── videoGenerationErrors.ts
```

不得包含：

- 对话输入框 UI。
- 时间线组件渲染。
- 资产库网格渲染。
- 具体 Axios 实例配置。
- 底层模型调用。
- 工业化 Agent 编排内核。

### 4.2 生图模块 Image Generation

职责：

- 图片生成、改图、圈选局部修改。
- `iw`、`seed`、`cref`、`sref` 等参数校验和转换。
- 画布选区坐标转换为后端所需格式。
- 图片结果入库和预览更新。

建议目录：

```text
src/services/image-generation/
├── createImageTask.ts
├── buildImageGenerationPayload.ts
├── mapCanvasSelectionToMask.ts
├── mapImageTaskDto.ts
└── imageGenerationErrors.ts
```

### 4.3 对话流模块 Chat Flow

职责：

- 对话消息展示数据建模。
- 用户指令提交。
- AI 回复、任务拆解、进度消息写入。
- 附件与参考图绑定。
- 历史记录加载。

建议目录：

```text
src/business-components/ChatPanel/
├── ChatPanel.tsx
├── ChatMessageList.tsx
├── ChatComposer.tsx
├── AttachmentBar.tsx
└── ChatPanel.module.css

src/services/chat/
├── submitChatCommand.ts
├── mapChatMessageDto.ts
├── extractGenerationIntent.ts
└── buildChatContext.ts
```

### 4.4 故事板模块 Storyboard

职责：

- 分镜列表展示。
- 分镜选中、排序、复制、删除、重生成入口。
- 分镜状态、进度、模型标签展示。
- 与时间线片段保持一一对应关系。

建议目录：

```text
src/business-components/Storyboard/
├── StoryboardPanel.tsx
├── StoryboardList.tsx
├── StoryboardCard.tsx
├── StoryboardToolbar.tsx
└── Storyboard.module.css
```

### 4.5 画布模块 Canvas Editor

职责：

- 当前镜头预览。
- Fabric.js 画布初始化。
- 缩放、平移、圈选、截图。
- 选区坐标输出。

画布模块必须通过 adapter 包装 Fabric.js，业务组件不直接散落第三方 API 调用。

```text
src/adapters/fabric/
├── createFabricCanvas.ts
├── bindCanvasZoom.ts
├── bindCanvasSelection.ts
└── disposeFabricCanvas.ts
```

### 4.6 时间线模块 Timeline

职责：

- 轨道和片段展示。
- 片段选中、拖动、拉伸、删除。
- 时间轴缩放、播放指针。
- 与故事板选中状态联动。

时间线模块必须通过 adapter 包装第三方时间线组件，避免未来替换时间线库时影响全项目。

```text
src/adapters/timeline/
├── mapClipsToTimelineRows.ts
├── mapTimelineRowsToClips.ts
├── timelineEvents.ts
└── timelineTheme.ts
```

### 4.7 资产库模块 Asset Library

职责：

- 图片、视频、音频、剧本、角色、场景资产展示。
- 上传、预览、重命名、删除、收藏。
- 为 `cref`、`sref`、`iw` 提供可选择资产。

资产库不得直接知道生图或生视频请求格式，只返回 assetId、URL、类型和元数据。

## 5. 业务分层规范

### 5.1 数据层

数据层只负责和外部世界通信：

- REST API。
- Socket。
- 上传下载。
- localStorage/sessionStorage。
- DTO 类型定义。

示例：

```text
src/api/generation.ts
src/api/project.ts
src/api/asset.ts
src/api/socket.ts
```

规则：

- API 文件只返回 DTO 或基础响应，不处理复杂 UI 状态。
- 所有 Axios 配置集中在 `request.ts`。
- 所有 Socket 初始化集中在 `socketClient.ts`。
- 后端字段变化必须通过 adapter 消化，不能扩散到 UI。

### 5.2 逻辑层

逻辑层负责业务规则：

- 生成任务 payload 构建。
- 参数校验。
- prompt 约束拼接。
- 任务状态机。
- 错误码映射。
- 权限与额度判断。
- 故事板与时间线同步。

规则：

- 复杂业务逻辑不得写在 JSX 中。
- 同一个 service 文件超过 200 行时，需要考虑拆分。
- 一个函数超过 60 行时，需要考虑拆分。
- 一个函数最多只做一层抽象的事，不混合请求、状态更新和 UI 提示。

### 5.3 交互层

交互层用 hooks 承载用户行为：

- `useCanvasEditor`
- `useTimelineSync`
- `useChatComposer`
- `useAssetUploader`
- `useKeyboardShortcuts`
- `useAutoSave`

规则：

- hook 可以连接 store、service 和 UI 事件。
- hook 不直接渲染 UI。
- hook 返回稳定的状态和动作，例如 `{ value, actions, status }`。
- 多组件共享的交互逻辑必须抽到 hook。

### 5.4 展示层

展示层负责 UI 和布局：

- 通用组件。
- 业务组件。
- 页面组合。

规则：

- 展示组件优先使用 props 输入，不直接读取全局 store。
- 容器组件负责连接 store 和 service。
- 纯展示组件必须可复用、可 Storybook 化。
- CSS Modules 按组件隔离样式。

## 6. 组件库设计规范

项目初期必须先沉淀一套内部组件库，避免每个业务模块重复造按钮、卡片、标签、弹窗。

### 6.1 组件分级

```text
components/
├── primitives/       # 最基础 UI 原语
├── feedback/         # 反馈类组件
├── data-display/     # 数据展示
├── data-entry/       # 表单输入
├── overlay/          # 弹窗、抽屉、菜单
└── layout/           # 布局组件
```

### 6.2 第一批公共组件

| 组件 | 职责 |
| --- | --- |
| `AppButton` | 统一按钮尺寸、图标、loading、disabled |
| `IconButton` | 工具栏图标按钮，统一 tooltip 和 aria-label |
| `Panel` | 左栏、右栏、底栏的基础容器 |
| `PanelHeader` | 面板标题、操作区、折叠按钮 |
| `SegmentedTabs` | 面板内 Tab 切换 |
| `StatusBadge` | pending/generating/completed/failed 状态展示 |
| `ProgressBar` | 生成进度、上传进度 |
| `EmptyState` | 空资产、空故事板、空对话 |
| `ErrorNotice` | 友好错误提示 |
| `AssetThumbnail` | 统一图片/视频/音频缩略图 |
| `ConfirmDialog` | 删除、清空、覆盖等确认动作 |
| `FormField` | 参数输入的 label、help、error 结构 |

### 6.3 组件设计要求

每个公共组件必须满足：

- props 类型清晰，不接收模糊的 `any`。
- 默认样式符合深色主题。
- 支持 disabled、loading、error 等常见状态。
- 不绑定具体业务 store。
- 不直接请求接口。
- 不包含业务文案，业务文案由调用方传入。

示例：

```tsx
interface StatusBadgeProps {
  status: 'pending' | 'generating' | 'completed' | 'failed';
  label?: string;
}
```

## 7. 公用类库沉淀规范

### 7.1 utils

`utils` 只能放无副作用、无业务状态依赖的纯函数。

适合放入：

- 时间格式化。
- 文件大小格式化。
- 数字范围裁剪。
- 参数校验。
- URL 处理。
- 错误码映射。

不适合放入：

- React hook。
- Axios 请求。
- Zustand 状态更新。
- 依赖 DOM 的逻辑。
- 某个业务页面专用逻辑。

### 7.2 constants

集中管理静态常量：

```text
src/constants/
├── model.ts
├── generation.ts
├── timeline.ts
├── routes.ts
└── theme.ts
```

### 7.3 adapters

所有第三方库必须经 adapter 接入：

- Fabric.js。
- Video.js。
- Timeline editor。
- Socket.io。
- 后端 DTO。

业务代码只依赖 adapter 暴露的稳定方法，不依赖第三方库内部细节。

## 8. 状态管理规范

Zustand store 按业务域拆分，禁止创建一个巨大 store 承载全部业务。

推荐 store：

```text
projectStore       # 当前项目、保存状态、项目级配置
userStore          # 登录用户、套餐、权限
assetStore         # 资产列表、上传状态
storyboardStore    # 分镜列表、选中镜头、排序
canvasStore        # 画布视图、缩放、选区
timelineStore      # 轨道、片段、播放状态
chatStore          # 消息流、输入状态、附件
paramStore         # 模型、seed、iw、cref、sref 等参数
taskStore          # 生成任务和导出任务状态
```

规则：

- store 暴露 state 和 actions，不暴露内部辅助函数。
- action 命名使用动词，例如 `selectShot`、`updateShotProgress`、`reorderShots`。
- 跨 store 联动必须集中在 service 或专门的 orchestration action 中。
- 禁止在组件中连续调用多个 store action 拼复杂业务流程。
- 持久化只保存必要字段，不把临时 UI 状态写入后端。

## 9. 接口与 DTO 规范

前端领域模型和后端 DTO 必须分离。

```text
Backend DTO -> adapter -> Frontend Domain Model
Frontend Domain Model -> payload builder -> Backend Request Payload
```

规则：

- `types/api.ts` 放后端 DTO。
- `types/project.ts`、`types/storyboard.ts` 放前端领域模型。
- adapter 负责字段命名转换、默认值补齐、异常字段兜底。
- UI 组件只能使用领域模型，不直接使用后端 DTO。

示例：

```ts
export function mapShotDtoToShot(dto: ShotDto): Shot {
  return {
    id: dto.id,
    projectId: dto.project_id,
    title: dto.title || `镜头 ${dto.order}`,
    order: dto.order,
    duration: dto.duration_seconds,
    status: mapShotStatus(dto.status),
    progress: dto.progress ?? 0,
    thumbnailUrl: dto.thumbnail_url,
    videoUrl: dto.video_url,
    params: mapGenerationParamsDto(dto.params),
  };
}
```

## 10. 文件大小与复杂度约束

为避免“一个文件写所有业务”，后续开发必须遵守以下约束：

| 对象 | 建议上限 | 超过后处理 |
| --- | --- | --- |
| React 组件文件 | 200 行 | 拆分子组件、hook、utils |
| service 文件 | 200 行 | 按动作或业务流程拆分 |
| store 文件 | 250 行 | 拆分 slice 或业务域 |
| 单个函数 | 60 行 | 提取小函数 |
| 单个组件 props | 15 个 | 考虑组合对象或拆组件 |
| JSX 嵌套层级 | 5 层 | 提取子组件 |

这些不是机械限制，但 code review 时必须解释为什么需要超过。

## 11. 命名规范

### 11.1 文件命名

- React 组件：`PascalCase.tsx`
- hook：`useXxx.ts`
- service：`verbNoun.ts`
- 类型：按领域命名，例如 `storyboard.ts`
- CSS Modules：`ComponentName.module.css`
- 常量：`camelCase.ts` 或领域名，例如 `generation.ts`

### 11.2 变量与函数命名

- 布尔值使用 `is`、`has`、`can`、`should` 前缀。
- 事件处理使用 `handle` 前缀。
- store action 使用动词。
- API 方法使用业务语义，不使用模糊命名。

示例：

```ts
const isGenerating = shot.status === 'generating';
const canExportProject = user.permissions.includes('project:export');
const handleSubmitCommand = () => {};
const createGenerationTask = () => {};
```

## 12. 错误处理规范

所有错误必须分层处理：

```text
api 层：捕获网络错误和后端错误码
adapter 层：转换错误结构
service 层：决定业务恢复策略
UI 层：展示友好提示和可操作按钮
```

规则：

- 禁止直接把后端原始错误展示给用户。
- 必须为生成失败、上传失败、导出失败、权限不足提供用户可理解文案。
- 可重试错误必须提供重试入口。
- 不可重试错误必须说明下一步动作。

## 13. 交互与展示解耦规范

交互逻辑不得直接塞进展示组件。

推荐模式：

```text
Container Component
  读取 store
  调用 hook
  组织业务动作
  向纯展示组件传 props

Presentational Component
  只接收 props
  只负责渲染
  通过 callback 通知外部
```

示例：

```tsx
function StoryboardPanelContainer() {
  const shots = useStoryboardStore((state) => state.shots);
  const selectedShotId = useStoryboardStore((state) => state.selectedShotId);
  const { selectShot, reorderShots } = useStoryboardActions();

  return (
    <StoryboardPanel
      shots={shots}
      selectedShotId={selectedShotId}
      onSelectShot={selectShot}
      onReorderShots={reorderShots}
    />
  );
}
```

## 14. AI 业务模块编排规范

AI 生成相关业务必须用编排层统一收口，禁止在 UI 组件中直接串多个接口。

推荐流程：

```text
ChatComposer submit
  -> chat service 解析上下文
  -> generation orchestration service 创建任务
  -> storyboardStore 插入占位镜头
  -> timelineStore 插入占位片段
  -> socket 接收进度
  -> task service 更新状态
```

建议目录：

```text
src/services/orchestration/
├── submitGenerationCommand.ts
├── applyGenerationProgress.ts
├── syncShotToTimeline.ts
└── retryFailedGeneration.ts
```

## 15. 样式规范

样式使用 CSS Modules + 全局主题变量。Autumn 必须支持夜间模式和白天模式两套主题。

规则：

- 全局颜色、间距、字体、圆角、阴影只在主题文件定义。
- 组件样式写在同名 `.module.css`。
- 禁止在组件里大量写 inline style。
- 禁止业务组件随意定义新颜色，必须使用主题变量。
- 布局尺寸使用变量和约束，避免内容溢出和重叠。
- 组件不得只适配单一主题，新增组件必须同时检查 light / dark 两套变量。

建议主题变量：

```css
:root {
  --color-bg-page: #f7f8fb;
  --color-bg-panel: #ffffff;
  --color-text-primary: #162033;
  --color-text-secondary: #516070;
  --color-accent-blue: #0f52ba;
  --color-accent-purple: #7b68ee;
  --radius-panel: 8px;
  --topbar-height: 56px;
  --timeline-height: 180px;
}

[data-theme="dark"] {
  --color-bg-page: #1a1a2e;
  --color-bg-panel: #16213e;
  --color-text-primary: #ffffff;
  --color-text-secondary: #b0b0b0;
}
```

## 16. Code Review 检查清单

每次提交前必须自查：

- 是否把数据层、逻辑层、交互层、展示层拆开。
- 是否有组件直接调用 Axios 或 Socket。
- 是否有 JSX 中出现复杂业务判断。
- 是否出现单个文件过大或函数过长。
- 是否有可复用 UI 被重复实现。
- 是否将第三方库调用封装在 adapter 中。
- 是否有后端 DTO 泄漏到 UI 组件。
- 是否有错误提示直接展示后端原始信息。
- 是否存在跨模块直接 import 内部文件。
- 是否有必要的类型定义和参数校验。
- 是否能在未来替换模型、时间线库、画布库而不大改业务组件。

## 17. 禁止事项

以下写法禁止进入主分支：

- 在 `App.tsx` 或单个页面中堆积所有业务。
- 一个巨大 store 管全部状态。
- UI 组件直接拼接生成任务请求参数。
- UI 组件直接处理 Socket 原始事件。
- 生图、生视频、对话流、时间线逻辑混在同一个文件。
- 重复实现按钮、状态标签、上传框、弹窗等通用组件。
- 业务组件直接依赖后端字段名，例如 `project_id`、`thumbnail_url`。
- 第三方库 API 散落在业务组件中。
- 用 `any` 绕过关键业务类型。
- 为了赶进度跳过错误处理和空状态。

## 18. 后续执行方式

后续开发 Autumn 时，建议按以下节奏推进：

1. 先建立组件库和主题变量。
2. 再建立目录结构、类型、store 和 adapter。
3. 使用 Mock 数据完成三栏 + 时间线联动。
4. 接入 API 和 Socket。
5. 最后接入真实 AI 生图、生视频、导出链路。

任何新功能都必须先回答三个问题：

- 它属于哪个业务域。
- 它处于数据层、逻辑层、交互层还是展示层。
- 它是否应该沉淀为公共组件、hook、service、utils 或 adapter。

这份规范作为 Autumn 后续开发的架构基线。实现功能时可以根据实际业务演进补充，但不得降低分层、解耦和可维护性要求。
