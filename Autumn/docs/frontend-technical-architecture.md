# VidFlow AI 复刻版 — 前端技术架构 & 技术选型
（**后台 API 与漫剧创作库工业化 Agent 流水线已接入后台管理系统，本文仅针对前端**，适配 Flova 三栏+底部时间线交互、AI 对话、画布编辑、视频剪辑全场景）

## 0. 后台流水线边界

Autumn 前端不是视频生成内核。

生成视频的真正内核依托后台管理系统中已经接入的“漫剧创作库工业化自动流水线 Agent 体系”。前端只作为创作工作台和流水线调度控制台：

- 通过 API 启动流水线任务。
- 通过 Socket / SSE 订阅流水线进度。
- 将后台流水线阶段映射为 `CF-*`、`PW-*`、`MG-*` UI 状态。
- 展示文档、故事板、素材、音频、视频、时间线和导出结果。
- 支持确认、修改、重试、停止、导出等用户操作。

详细接入方案见：`docs/backend-pipeline-integration.md`

## 一、整体前端架构设计
### 1. 架构模式
采用 **React + 模块化分层架构**，结合**组件拆分 + 全局状态管理 + 统一接口层 + 路由管理**，完全解耦视图、状态、网络、工具逻辑。
整体分层自上而下：
```
页面入口 Page
  ├─ 布局层（全局三栏+底栏固定布局）
  ├─ 业务组件层（故事板、AI对话、画布、时间线、参数面板）
  ├─ 通用组件层（按钮、弹窗、上传、进度条、卡片等）
  ├─ 状态管理层（全局状态 + 局部状态）
  ├─ API 请求层（统一封装后台管理系统和漫剧创作库流水线接口）
  ├─ 工具/常量/类型层（工具函数、枚举、TS 类型、样式变量）
  └─ 第三方 SDK 适配层（画布、视频、时间线、Socket 通信）
```

### 2. 页面整体布局结构（固定布局，不随路由变化）
全局单页固定布局，无多页面跳转，符合 Flova 桌面端创作软件形态：
1. **顶部导航栏**（全局操作、项目、导出、用户信息）
2. **主体区域（Flex 横向三栏）**
   - 左侧面板：资产库 + 故事板（Tab 切换）
   - 中间主画布：视频/图片预览、圈选编辑、视图切换
   - 右侧面板：AI 对话助手 + 高级参数面板（Tab 切换）
3. **底部栏**：可折叠视频时间线剪辑轴

### 3. 核心通信逻辑（对接现有后端 API 与流水线事件）
- 普通增删改查：`Axios` 调用后端 RESTful API
- AI 任务进度、流水线阶段、实时联动、消息推送：`Socket.io` 长连接（对接后端 WebSocket 接口）
- 文件/素材上传：Axios 分片上传 + 后端上传接口
- 全模块联动：**单一数据源驱动**，状态变更自动同步到 故事板 / 画布 / 时间线 / 对话面板
- 后台流水线事件通过 `adapters/pipeline` 转换成前端领域状态，业务组件不得直接依赖后台流水线 DTO。
- Agent 数据包通过 `api/agent-packages`、`adapters/agent-packages`、`services/agent-packages` 接入；本地导入包必须标记为 `storageScope=device`，只保存在当前设备。
- Skill 库通过 `api/skills`、`adapters/skills`、`services/skills` 接入；本地导入 Skill 同样必须标记为 `storageScope=device` 与 `syncStatus=localOnly`。

---

## 二、核心技术栈选型（正式生产版）
### 2.1 基础框架 & 语言
| 技术 | 选型 | 说明 |
|------|------|------|
| 核心框架 | **React 18** | 主流稳定生态，组件化拆分复杂界面，支持并发渲染，流畅应对多模块联动 |
| 语法/类型 | **TypeScript 5.x** | 强类型约束，统一接口入参/出参、参数（seed/iw/cref/sref）类型，减少线上 bug，对接后端 API 更安全 |
| 构建工具 | **Vite 6** | 相比 Webpack 启动更快、热更新秒级，适合本地高频调试复杂编辑界面 |

### 2.2 路由管理
- **React Router v6**
  用途：项目列表页、创作编辑页、设置页、模板页路由切换；
  编辑主界面为**单路由内部布局**，不做路由拆分。

### 2.3 全局状态管理（核心，多面板联动关键）
- **Zustand**
  选型理由：
  1. 轻量、API 简洁，比 Redux 更适合中后台/编辑器类项目；
  2. 模块化拆分 Store：项目状态、故事板状态、画布状态、时间线状态、对话状态、用户配置；
  3. 支持状态订阅，一处修改自动同步全界面，完美实现「故事板 ↔ 画布 ↔ 时间线」联动。

**拆分 Store 规划**
1. `useProjectStore`：当前项目信息、分辨率、帧率、全局生成约束
2. `useStoryboardStore`：分镜列表、镜头状态、排序、选中镜头
3. `useCanvasStore`：画布视图、缩放、圈选区域、预览资源
4. `useTimelineStore`：时间线轨道、片段、转场、播放状态
5. `useChatStore`：AI 对话消息、输入内容、指令解析结果
6. `useParamStore`：模型选择、seed / iw / cref / sref / cw / sw 等生成参数
7. `useAssetStore`：资产库素材、角色/场景参考图
8. `useAgentPackageStore`：当前 Agent 数据包、后台导入包、本地导入包、数据包切换和本地设备作用域
9. `useSkillLibraryStore`：项目 Skill 库、启用 Skill、后台 Skill、本地 Skill、数据包内置 Skill

### 2.4 UI 组件 & 样式方案
1. **组件库**：`Ant Design 5.x`
   选用：表格、卡片、标签页、弹窗、表单、下拉、上传、进度条、提示框等通用组件。
2. **样式方案**：**CSS Modules + 全局主题变量**
   - 隔离组件样式，防止样式污染；
   - 统一夜间模式和白天模式主题变量，支持一键切换；
   - 全局预设布局宽高、间距、圆角，保证界面统一。
3. **图标**：`@ant-design/icons`

### 2.5 网络请求（对接后端现成 API）
1. **HTTP 请求**：`Axios`
   - 统一请求/响应拦截器：鉴权 Token、统一错误码解析、后端报错转成前端友好提示；
   - 封装通用请求方法，所有业务接口统一管理。
2. **WebSocket 实时通信**：`Socket.io-client`
   - 对接后端 Socket 服务，接收 AI 生成进度、任务状态、实时消息；
   - 断线重连、心跳检测，保证长连接稳定性。
3. **文件上传**：Axios 分片上传
   支持图片、视频、音频大文件上传，对接后端现成上传接口。

### 2.6 核心业务第三方库（重点，对应 Flova 交互）
#### （1）画布编辑 & 圈选改图（中间主画布）
- **Fabric.js**
  能力覆盖：
  - 图片/视频封面画布渲染、平移、滚轮缩放；
  - 鼠标框选区域（圈选改图核心交互）；
  - 绘制选区、清空选区、选区坐标导出传给后端。

#### （2）视频播放 & 预览
- **Video.js**
  能力：多格式视频预览、播放/暂停、进度拖拽、音量控制、全屏预览；
  轻量稳定，兼容 AI 生成视频格式。

#### （3）底部时间线 / 视频剪辑轨道（核心组件）
- **@xzdarcy/react-timeline-editor**（React 专用时间线编辑器）
  能力全覆盖：
  - 多轨道：视频轨道、音频轨道、字幕轨道；
  - 片段拖拽排序、拉伸修改时长、切割、删除；
  - 转场配置、时间轴缩放、播放指针联动；
  无需从零开发剪辑轴，大幅降低开发成本。

#### （4）富文本 / 指令输入
- 原生 Textarea + 自定义样式，搭配 AntD 提示框，满足长提示词、自然语言指令输入。

### 2.7 工具类 & 辅助库
| 库 | 用途 |
|----|------|
| `dayjs` | 时间格式化、时长计算（镜头时长、总视频时长） |
| `lodash-es` | 防抖、节流、深拷贝、数据处理（频繁联动场景防抖动） |
| `nprogress` | 全局顶部加载进度条 |
| `js-file-download` | 前端触发视频/图片导出下载 |

---

## 三、目录结构（标准工程化目录，可直接落地）
```
src/
├── assets/                # 静态资源：图片、全局样式、主题变量
├── components/            # 通用公共组件（全局复用）
│   ├── Common/            # 按钮、卡片、空状态、提示、加载、上传
│   ├── Layout/            # 全局布局组件：Header、LeftPanel、CenterCanvas、RightPanel、FooterTimeline
├── business-components/   # 业务专属组件（不通用，业务强关联）
│   ├── AssetLib/          # 资产库组件
│   ├── Storyboard/        # 故事板/分镜卡片
│   ├── CanvasEditor/      # Fabric 画布、圈选编辑
│   ├── VideoPlayer/       # 视频预览播放器
│   ├── ChatPanel/         # AI 对话面板
│   ├── ParamPanel/        # 高级参数面板（seed / iw / cref / sref 等）
│   └── Timeline/          # 底部时间线剪辑轴
├── hooks/                 # 自定义 React Hooks
│   ├── useSocket.ts       # Socket 长连接封装
│   ├── useCanvas.ts       # 画布操作封装
│   ├── useTimeline.ts     # 时间线逻辑封装
│   └── 各类业务 hook
├── store/                 # Zustand 全局状态（按模块拆分）
│   ├── projectStore.ts
│   ├── storyboardStore.ts
│   ├── canvasStore.ts
│   ├── timelineStore.ts
│   ├── chatStore.ts
│   ├── paramStore.ts
│   └── assetStore.ts
├── api/                   # 接口层（对接后端现成 API，统一管理）
│   ├── request.ts         # Axios 实例、拦截器、基础配置
│   ├── project.ts         # 项目相关接口
│   ├── storyboard.ts      # 分镜/任务接口
│   ├── asset.ts           # 素材上传/管理接口
│   ├── chat.ts            # AI 对话指令接口
│   └── timeline.ts        # 剪辑相关接口
│   └── pipeline/          # 漫剧创作库 Agent 流水线接口与事件
│   └── agent-packages/    # Agent 数据包列表、导入、切换接口
│   └── skills/            # Skill 库列表、导入、启用接口
├── types/                 # TS 全局类型定义
│   ├── project.ts
│   ├── agentPackage.ts
│   ├── skillLibrary.ts
│   ├── storyboard.ts
│   ├── params.ts          # 生成参数类型：Seed、iw、cref、sref、cw、sw
│   └── common.ts
├── utils/                 # 工具函数
│   ├── format.ts          # 时长、文本、格式处理
│   ├── validate.ts        # 参数校验（Seed 数值、权重范围校验）
│   └── helper.ts
├── pages/                 # 页面入口
│   ├── Home/              # 项目列表、首页
│   ├── Editor/            # 主编辑页（三栏+时间线主页面）
│   └── Setting/           # 设置页
├── router/                # React Router 路由配置
├── App.tsx
└── main.tsx               # 入口文件
```

### 3.1 流水线接入目录补充

```text
src/api/pipeline/
├── pipelineApi.ts
├── pipelineSocket.ts
└── pipelineDto.ts

src/adapters/pipeline/
├── mapPipelineChatEvent.ts
├── mapPipelineAsset.ts
├── mapPipelineStoryboard.ts
├── mapPipelineTimeline.ts
└── mapPipelineTask.ts

src/services/pipeline/
├── startCreativePipeline.ts
├── answerPipelineQuestion.ts
├── confirmPipelineScript.ts
├── stopPipelineTask.ts
└── applyPipelineEvent.ts
```

### 3.2 Agent 数据包接入目录

```text
src/api/agent-packages/
├── agentPackageApi.ts
└── agentPackageDto.ts

src/adapters/agent-packages/
└── mapAgentPackage.ts

src/services/agent-packages/
└── importLocalAgentPackage.ts

src/store/
└── agentPackageStore.ts
```

```text
src/api/skills/
├── skillLibraryApi.ts
└── skillLibraryDto.ts

src/adapters/skills/
└── mapSkillLibraryItem.ts

src/services/skills/
└── importLocalSkill.ts

src/store/
└── skillLibraryStore.ts
```

约束：

- 后台导入包：`source=backend`，`storageScope=account`，可账号同步。
- 本地导入包：`source=local`，`storageScope=device`，`syncStatus=localOnly`，只能保存在当前设备。
- UI 组件不得把本地导入包自动上传后台，除非用户显式执行“发布 / 上传到后台”流程。
- UI 组件不得把本地导入 Skill 自动上传后台，除非用户显式执行“发布 / 上传到后台”流程。

---

## 四、关键模块技术实现要点（对接后端 API 重点）
### 4.1 接口层统一封装（对接现有后端）
1. 所有请求统一在 `src/api` 管理，**不散落业务组件**；
2. 拦截器统一处理：
   - 请求头携带 Token；
   - 后端错误码统一解析，把后端原始报错（如 `Lingdong video task failed`）转为前端友好文案；
3. 参数类型由 TS 严格约束，保证 `seed / iw / cref / sref` 等参数传给后端格式正确。

### 4.2 多模块联动实现（核心体验）
**数据流单向：Store 为唯一数据源**
1. 用户操作故事板 → 更新 `storyboardStore`；
2. Store 变更 → 自动同步 **画布预览、时间线片段、右侧参数**；
3. 时间线拖拽/剪辑 → 更新 `timelineStore` → 反向同步故事板与预览；
4. AI 对话生成新镜头 → 后端返回数据 → 更新 Store → 全界面自动刷新。

### 4.3 AI 生成参数处理（seed / iw / cref / sref / cw / sw）
1. 前端表单收集所有生成参数，做**前端预校验**：
   - Seed：必须为 0 ~ 4294967295 整数；
   - iw：0.5 ~ 3；
   - cw / sw：对应权重区间校验；
2. 全局约束（如「固定4人、禁止第五人、无分身」）前端自动拼接进请求参数/Prompt，一并传给后端；
3. 项目级参数全局保存，新建镜头自动继承。

### 4.4 Socket 实时进度推送
1. 页面初始化建立长连接，绑定当前项目 ID；
2. 后端推送「镜头生成中 / 进度 / 成功 / 失败」；
3. 前端接收消息 → 更新对应镜头状态、进度条、预览图；
4. 异常重连机制：断网自动重试，给出网络提示。

### 4.5 素材上传
1. 图片/视频/音频使用 `react-dropzone + Axios` 分片上传；
2. 上传成功后，将后端返回的素材 URL 存入资产库 Store，可直接选为 `cref/sref` 参考图。

---

## 五、浏览器 & 兼容性要求
- 支持：Chrome ≥ 110、Edge ≥ 110、Firefox ≥ 109（主流现代浏览器）
- 不兼容 IE
- 适配桌面端 1920×1080 及以上分辨率（创作类软件优先桌面）

---

## 六、可直接落地的精简技术栈总结（对外交付版）
> 纯前端、后端 API 已就绪
- 构建：Vite + TypeScript
- 框架：React 18
- 状态：Zustand
- 路由：React Router v6
- UI：Ant Design 5
- 网络：Axios + Socket.io-client
- 画布：Fabric.js
- 视频播放：Video.js
- 时间线剪辑：react-timeline-editor
- 样式：CSS Modules + 主题变量
- 工具：lodash、dayjs、js-file-download

这套架构完全贴合 Flova 交互逻辑，分工清晰、易维护、易迭代，所有业务逻辑、交互、参数、联动都由前端承接，只依赖现有后端 API 完成数据交互。
