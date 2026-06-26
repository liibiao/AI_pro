# Autumn 需求拆解与开发任务 Backlog

文档版本：V1.0  
更新日期：2026-06-19  
状态说明：`TODO`、`READY`、`IN_PROGRESS`、`BLOCKED`、`REVIEW`、`DONE`。

## 1. Epic 总览

| Epic ID | Epic | 来源 | 目标状态 |
| --- | --- | --- | --- |
| E00 | 工程化基线 | 技术架构、编码规范 | IN_PROGRESS |
| E01 | 内部组件库与主题 | UI 文档、编码规范 | READY |
| E02 | 编辑器工作台布局 | PRD、UI 文档 | READY |
| E03 | 状态模型与联动底座 | 技术架构、实施方案 | READY |
| E04 | 项目与用户接入 | PRD、后台复用要求 | TODO |
| E05 | 资产库 | PRD、UI 文档 | IN_PROGRESS |
| E06 | 故事板 | PRD、UI 文档 | IN_PROGRESS |
| E07 | AI 对话流 | PRD、UI 文档 | TODO |
| E08 | 生图模块 | PRD、架构规范 | IN_PROGRESS |
| E09 | 生视频模块 | PRD、架构规范 | IN_PROGRESS |
| E10 | 中间画布与视频预览 | UI 文档、技术架构 | TODO |
| E11 | 底部时间线 | PRD、技术架构 | TODO |
| E12 | 保存、版本与导出 | PRD | IN_PROGRESS |
| E13 | 测试、验收与质量加固 | 实施方案、编码规范 | IN_PROGRESS |

## 2. E00 工程化基线

| Task ID | 任务 | 分层 | 产物 | 依赖 | 验收 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| E00-T01 | 安装生产依赖 | 工程 | package.json | 无 | build 通过 | READY |
| E00-T02 | 配置路径别名 | 工程 | vite.config.ts, tsconfig | E00-T01 | `@/` 可解析 | READY |
| E00-T03 | 建立源码目录结构 | 工程 | src 目录 | 无 | 目录符合架构文档 | DONE |
| E00-T04 | 建立全局主题变量 | 展示层 | assets/styles | E00-T03 | 深色主题变量可用 | DONE |
| E00-T05 | 建立 Mock 数据机制 | 数据层 | mock, fixtures | E00-T03 | 无后台可开发 UI | DONE |

## 3. E01 内部组件库与主题

| Task ID | 任务 | 分层 | 产物 | 依赖 | 验收 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| E01-T01 | AppButton / IconButton | 展示层 | components/primitives | E00 | 状态覆盖 loading/disabled | IN_PROGRESS |
| E01-T02 | Panel / PanelHeader | 展示层 | components/layout | E00 | 可复用到左右栏和底栏 | DONE |
| E01-T03 | SegmentedTabs | 展示层 | components/data-entry | E00 | 支持受控模式 | READY |
| E01-T04 | StatusBadge / ProgressBar | 展示层 | components/feedback | E00 | 生成状态展示一致 | READY |
| E01-T05 | EmptyState / ErrorNotice | 展示层 | components/feedback | E00 | 空态和错误态统一 | IN_PROGRESS |
| E01-T06 | AssetThumbnail | 展示层 | components/data-display | E00 | 图片/视频/音频统一展示 | TODO |

## 4. E02 编辑器工作台布局

| Task ID | 任务 | 分层 | 产物 | 依赖 | 验收 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| E02-T01 | EditorShell 布局 | 展示层 | pages/Editor, components/Layout | E01 | 三栏 + 时间线可见 | DONE |
| E02-T02 | TopBar | 展示层 | business-components/TopBar | E01 | 项目名、保存状态、导出入口 | DONE |
| E02-T03 | LeftPanel | 展示层 | business-components/WorkspacePanels | E01 | 资产 / 故事板 Tab | IN_PROGRESS |
| E02-T04 | CenterCanvas shell | 展示层 | CanvasEditor shell | E01 | 预览区域占位 | DONE |
| E02-T05 | RightPanel | 展示层 | Chat / Params shell | E01 | 对话 / 参数 Tab | IN_PROGRESS |
| E02-T06 | BottomTimeline shell | 展示层 | Timeline shell | E01 | 可折叠 | IN_PROGRESS |
| E02-T07 | 面板尺寸约束 | 交互层 | layout css/hook | E02-T01 | 1920x1080 无重叠 | IN_PROGRESS |
| E02-T08 | HomeProjectDashboard | 展示层 | pages/Home | E01,E04 Mock | 项目网格、新建项目卡片、左侧主导航 | LOCAL_VISUAL_READY |
| E02-T09 | EmptyProjectWorkspace | 展示层 | pages/Editor empty state | E01,E03 | 默认空态与右侧对话常驻 | LOCAL_VISUAL_READY |
| E02-T10 | WorkspacePanelStates | 交互层 | components/WorkspacePanels | E02-T01,E03 | EWS-00 到 EWS-05 状态可切换 | LOCAL_VISUAL_READY |
| E02-T11 | ProductionWorkspaceStates | 交互层 | pages/Editor production states | E02,E03 | PW-01 到 PW-05 可切换 | LOCAL_VISUAL_READY |
| E02-T12 | MediaGenerationWorkspaceStates | 交互层 | pages/Editor media states | E02,E03,E08,E09 | MG-01 到 MG-06 可展示 | LOCAL_VISUAL_READY |

## 5. E03 状态模型与联动底座

| Task ID | 任务 | 分层 | 产物 | 依赖 | 验收 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| E03-T01 | 定义领域类型 | 逻辑层 | types/*.ts | E00 | Shot/Asset/Project/Timeline 类型完整 | IN_PROGRESS |
| E03-T02 | projectStore | 逻辑层 | store/projectStore.ts | E03-T01 | 项目状态可读写 | IN_PROGRESS |
| E03-T03 | storyboardStore | 逻辑层 | store/storyboardStore.ts | E03-T01 | selectedShotId 可联动 | IN_PROGRESS |
| E03-T04 | timelineStore | 逻辑层 | store/timelineStore.ts | E03-T01 | clips/tracks 可维护 | IN_PROGRESS |
| E03-T05 | chatStore | 逻辑层 | store/chatStore.ts | E03-T01 | messages/composer 可维护 | DONE |
| E03-T06 | paramStore | 逻辑层 | store/paramStore.ts | E03-T01 | seed/iw/cref/sref 可维护 | DONE |
| E03-T07 | selectShotAcrossWorkspace | 逻辑层 | services/orchestration | E03-T03,E03-T04 | 选镜头同步画布/时间线/参数 | DONE |
| E03-T08 | syncShotToTimeline | 逻辑层 | services/orchestration | E03-T03,E03-T04 | 故事板排序同步时间线 | DONE |
| E03-T09 | workspacePanelStore | 交互层 | store/workspacePanelStore.ts | E03-T01 | `openPanels` 支持故事板 / 媒体 / 时间线 / 文档组合 | IN_PROGRESS |
| E03-T10 | chatFlowStore | 逻辑层 | store/chatFlowStore.ts | E03-T01 | CF-01 到 CF-06 对话状态可维护 | IN_PROGRESS |
| E03-T11 | generationTaskStore | 逻辑层 | store/generationTaskStore.ts | E03-T01 | 图片/音频/视频生成进度统一维护 | DONE |
| E03-T12 | agentPackageStore | 逻辑层 | store/agentPackageStore.ts | E03-T01 | 支持后台导入、本地导入、切换和本设备作用域 | IN_PROGRESS |
| E03-T13 | skillLibraryStore | 逻辑层 | store/skillLibraryStore.ts | E03-T01 | 支持 Skill 库、启用/停用、后台导入、本地导入 | IN_PROGRESS |

## 6. E04-E12 功能任务

| Epic | 首批任务 | 验收重点 | 状态 |
| --- | --- | --- | --- |
| E04 项目与用户 | auth API、userStore、project API、项目列表 | 项目 API、auth API / profile 合同、mock/api 数据源开关、userStore profile loading、Home 用户资料展示、project snapshot 自动保存、打开项目恢复工作台状态、`openProject.latest_snapshot` 兼容、Canvas/Admin 共用账号积分桥接、后台管理系统模型配置列表、data-pack / Skill 列表、生成任务 API adapter/repository、Composer 提交入口和结果回写底座已落地 | IN_PROGRESS |
| E04 Agent 数据包 | 后台数据包列表、本地导入、切换、作用域标记 | 本地包仅本设备可用，后台包账号同步 | IN_PROGRESS |
| E04 Skill 库 | 后台 Skill、本地 Skill、数据包内置 Skill、启用/停用 | 本地 Skill 仅本设备可用，启用 Skill 可传入流水线 | IN_PROGRESS |
| E05 资产库 | 上传、分类、预览、收藏、删除 | 已生成素材支持分类筛选、未分配过滤、选中预览、已绑定标记、本地上传、上传 repository/API adapter、上传进度占位、object URL 生命周期回收、收藏 / 删除、批量选择 / 删除、资产详情抽屉、Composer CRef/SRef 引用、IW/CW/SW/Seed 参数面板与图片素材引用限制 | IN_PROGRESS |
| E06 故事板 | 卡片、排序、复制、删除、重生成 | 名称/描述编辑、添加分镜、参数绑定、复制、删除、拖拽/按钮排序、重生成任务创建、sourceElementId 路由、target slot 回写、失败提示、重试入口和时间线同步已完成首轮 | IN_PROGRESS |
| E07 AI 对话流 | 消息流、问题卡、确认卡、结果卡、生成进度卡 | CF-01 到 CF-06 可展示和交互；Composer 输入区高度已按反馈加倍；模型直连后台管理系统启用的图片模型 / 视频模型 / 大语言模型，Agent/Skill 接入后台 data-pack，发送 prompt 按后台联调页 payload 创建真实任务并输出任务卡 | IN_PROGRESS |
| E08 生图模块 | payload、选区 mask、任务进度、素材写入 | MG-01/MG-02 图片生成状态闭环；IMAGE 任务 payload、sourceElementId / targetAssetSlot 路由、失败态和结果 URL -> 资产回写底座已具备 | IN_PROGRESS |
| E09 生视频模块 | payload、任务创建、失败重试、视频片段写入 | MG-05/MG-06 视频结果写入分镜与时间线；VIDEO 任务 payload、sourceElementId / targetAssetSlot 路由、失败重试和结果 URL -> 分镜/时间线精准回写底座已具备 | IN_PROGRESS |
| E10 画布与视频预览 | Fabric adapter、Video.js adapter、AudioPreview | 图片/音频/视频/进度预览一致 | READY |
| E11 时间线 | timeline adapter、轨道、片段、playhead | MG-06 成片预览和多轨联动 | READY |
| E12 保存与导出 | 自动保存、快照、导出任务 | project snapshot DTO/adapter/repository、mock 版本追加、Editor autosave hook、TopBar 保存状态、版本菜单、手动保存、导出配置、导出任务进度、下载入口、SSE 事件适配和 export event contract fixture 已落地；后续进行真实后端联调 | IN_PROGRESS |

## 7. E13 测试与验收

| Task ID | 任务 | 类型 | 验收 | 状态 |
| --- | --- | --- | --- | --- |
| E13-T01 | 参数校验单元测试 | unit | seed/iw/cw/sw 范围正确 | DONE |
| E13-T02 | 状态联动单元测试 | unit | 选中、排序、同步正确 | DONE |
| E13-T03 | 组件状态测试 | component | loading/empty/error 展示正确 | TODO |
| E13-T04 | 核心 E2E 流程 | e2e | 新建项目到导出闭环 | TODO |
| E13-T05 | UI/UX 1:1 视觉验收 | manual/design | 暗色 / 白天实现截图均被 UI/UX Agent 标记 PASS | READY |
| E13-T06 | 浏览器视觉回归 | manual/browser | 视觉已 PASS 的页面在目标视口无破版、无溢出、无控制台错误 | DONE |
| E13-T07 | 资产库筛选单元测试 | unit | 已绑定 / 未分配、类型筛选和统计正确 | DONE |
| E13-T08 | 资产库状态变更单元测试 | unit | 上传资产不自动绑定、收藏状态同步、删除清理故事板和时间线 | DONE |
| E13-T09 | 资产库批量删除单元测试 | unit | 批量删除资产会清理全局资产、故事板绑定和时间线片段 | DONE |
| E13-T10 | 资产上传 adapter/repository 单元测试 | unit | mock 上传完成、API DTO 映射、稳定 client asset id 和进度回调正确 | DONE |
| E13-T11 | object URL 生命周期单元测试 | unit | blob URL 可从 sourceUrl / thumbnail 提取去重，替换资产只回收旧 URL，revoke 调用去重 | DONE |
| E13-T12 | 故事板操作联动单元测试 | unit | 参数绑定、复制、删除和重生成会同步故事板、选中态和时间线 | DONE |
| E13-T13 | 生成任务路由回写单元测试 | unit | sourceElementId / targetAssetSlot 会进入 payload、task adapter、结果资产和目标故事板 / 时间线回写 | DONE |
| E13-T14 | 生成任务失败重试单元测试 | unit | 后台 failed 任务可回写故事板错误态和时间线状态，重试 / 成功结果会清除旧错误 | DONE |
| E13-T15 | 故事板排序联动单元测试 | unit | 故事板排序后卡片顺序、视频时间线 clip 顺序和当前选中态保持同步 | DONE |
| E13-T16 | 添加分镜联动单元测试 | unit | 新分镜携带当前参数快照，自动选中，并在视频时间线生成 pending clip | DONE |
| E13-T17 | 分镜文本编辑联动单元测试 | unit | 编辑分镜名称/描述后，故事板文本和视频时间线 clip 标题同步更新 | DONE |
| E13-T18 | 对话模型/Agent payload 单元测试 | unit | 后台启用模型按图片模型 / 视频模型 / 大语言模型分类，Composer payload 写入 Agent 包、Agent ids 和 Skill 名称 | DONE |
| E13-T19 | 真实后台管理系统模型接口纠偏测试 | unit/build | 模型默认 API、未登录不注入假模型、Composer 任务 mode 对齐 `txt2img/text-to-video/chat` | DONE |
