# Autumn 进度跟进看板

更新日期：2026-06-19  
维护者：软件工程师 Agent  

## 1. 当前阶段

当前阶段：Run 001 / Sprint 0 已启动  
当前目标：把 `docs` 需求输入多 Agent 流水线，建立工程化基线、组件库、工作台布局和状态联动底座，并把 UI 效果图 1:1 还原作为前端推进硬门禁。

## 2. 总体进度

| Epic | 状态 | 完成度 | 当前说明 |
| --- | --- | --- | --- |
| E00 工程化基线 | IN_PROGRESS | 50% | Vite/TS/ESLint 可运行，生产构建已通过 |
| E01 内部组件库与主题 | IN_PROGRESS | 50% | Panel、ToolbarButton、EmptyState、Composer Popover 与双主题变量已落地；Composer 弹窗 v12 暗 / 亮候选截图已补齐 |
| E02 编辑器工作台布局 | UI_PASS_READY_FOR_CODE | 95% | v24 正式 UI/UX 复验全包 PASS；已补浏览器窗口自适应缩放、工作台密集区域字号可读性调整，`stage` URL 可直接进入编辑器验收 |
| E03 状态模型与联动底座 | IN_PROGRESS | 85% | `workspaceStore` 已接管 storyboard/timeline/asset 运行态；`chatStore`、`paramStore`、`generationTaskStore` 已落地并接入 Composer / 生产摘要；seed / iw / cw / sw 统一参数校验已补齐；故事板参数绑定、复制、删除、排序、重生成任务路由、slot 回写、失败态和重试入口已接入 |
| E04 项目与用户接入 | IN_PROGRESS | 77% | 项目 API 合同、DTO adapter、mock/API 数据源开关、auth API / profile 合同、userStore profile loading、登录/注册/忘记密码入口、Home 用户资料展示、项目入口、project snapshot 自动保存、打开项目恢复工作台状态、`openProject.latest_snapshot` 兼容、Canvas/Admin 共用账号积分桥接、后台管理系统模型配置列表、data-pack / Skill 列表、生成任务 API adapter/repository、Composer 提交入口、Agent/Skill payload 和结果回写底座已落地 |
| E05 资产库 | IN_PROGRESS | 58% | 已生成素材列表、类型筛选、未分配过滤、素材选中预览、资产库统计、本地上传、上传 repository/API adapter、上传进度占位、object URL 生命周期回收、收藏 / 删除、批量选择 / 删除、资产详情抽屉和 Composer CRef/SRef 引用联动落地；Composer 参考参数面板支持 IW/CW/SW/Seed 可视化调节，并可绑定到故事板卡片 |
| E06 故事板 | IN_PROGRESS | 36% | 故事板卡片支持选择、名称/描述编辑、添加分镜、参数绑定、复制、删除、拖拽/按钮排序、重生成任务创建、失败提示和重试入口；时间线 clip 同步和 target slot 精准回写已接入 |
| E07 AI 对话流 | IN_PROGRESS | 54% | 结果卡、问题卡、确认卡和进度卡可展示；Composer 模型选择已直连后台管理系统启用的图片模型 / 视频模型 / 大语言模型；Agent/Skill 选择已接入漫剧创作库等后台 data-pack；发送后按后台联调页 payload 创建真实任务并在对话流输出任务卡 |
| E08 生图模块 | IN_PROGRESS | 13% | 生图内核走后台漫剧创作库流水线，前端已具备 IMAGE 生成任务创建入口、sourceElementId 路由、失败态和结果 URL -> 目标资产槽位回写底座 |
| E09 生视频模块 | IN_PROGRESS | 16% | 生视频内核走后台漫剧创作库流水线，前端已具备 VIDEO 生成任务创建入口、sourceElementId/targetAssetSlot 路由、失败重试和结果 URL -> 分镜/时间线精准回写底座 |
| E10 中间画布与视频预览 | IN_PROGRESS | 46% | 空态、生成进度、图片、音频、分镜脚本卡片、视频预览占位已落地；生产态 v16 已补视频播放器、规格文档卡和分镜脚本大卡 |
| E11 底部时间线 | IN_PROGRESS | 36% | 多轨时间线 mock 已可展示；时间线片段支持选中态，并可反向同步到故事板选中元素 |
| E12 保存、版本与导出 | IN_PROGRESS | 38% | project snapshot、TopBar 保存状态、版本菜单、手动保存、导出任务 DTO/repository/hook、导出配置、SSE 事件适配、fixture/contract、进度和下载入口已接入；真实后端联调待接入 |
| E13 测试与质量 | IN_PROGRESS | 50% | E13-T01 参数校验、E13-T02 状态联动、E13-T12 故事板操作联动、E13-T13 生成任务路由回写、E13-T14 失败重试、E13-T15 故事板排序、E13-T16 添加分镜、E13-T17 分镜文本编辑和 E13-T18 对话模型/Agent payload 测试已完成；E13-T06 已完成 Home、timeline_ready、empty workspace 1280x720 浏览器视觉回归；project snapshot / restore / export adapter、mock repository、自定义导出配置、导出事件 adapter、open project latest snapshot 映射、共享平台 auth 映射、模型配置 adapter、data-pack / Skill adapter、生成任务 adapter/repository、结果 URL 抽取和 workspace 回写单元测试已补 |

## 3. 当前 Sprint 建议

Sprint 0：工程底座与 UI 骨架。

| Task ID | 任务 | Owner | 状态 | 验收 |
| --- | --- | --- | --- | --- |
| E00-T01 | 安装生产依赖 | Agent | READY | build 通过 |
| E00-T02 | 配置路径别名 | Agent | READY | `@/` 可解析 |
| E00-T03 | 建立源码目录结构 | Agent | READY | 目录符合架构 |
| E00-T04 | 建立全局主题变量 | Agent | READY | 深色主题变量可用 |
| E01-T01 | AppButton / IconButton | Agent | READY | 基础状态完整 |
| E01-T02 | Panel / PanelHeader | Agent | READY | 可复用 |
| E02-T01 | EditorShell 布局 | Agent | READY | 工作台可见 |
| S0-012 | 主页暗 / 亮 4K 效果图 | UI/UX Agent | DONE | 3840 x 2160 |
| S0-013 | 新建项目空态与面板状态定义 | UI/UX + 前端 Agent | DONE | EWS-00 到 EWS-05 |
| S0-013-LIGHT | 新建项目空态白天模式补齐 | UI/UX Agent | DONE | 暗 / 亮成对 |
| S0-014 | Flova 录屏抽帧分析与状态图谱 | UI/UX + 产品 Agent | DONE | CF/PW/MG |
| S0-015 | 对话流 / 生产态 / 媒体生成态成对效果图 | UI/UX Agent | DONE | 6 张 4K |
| S0-016 | Sprint 0 前端工作台骨架 | 前端 Agent | FUNCTIONAL_READY / UI_REDO | 类型、Lint、Build、浏览器冒烟通过；视觉需按效果图 1:1 返工 |
| S0-017 | 主页到编辑器交互闭环 | 前端 Agent | FUNCTIONAL_READY / UI_REDO | 创建项目、对话推进、返回项目页通过；视觉需 UI/UX Agent PASS |
| S0-018 | Agent 数据包切换与导入骨架 | 前端 Agent | FUNCTIONAL_READY / UI_REDO | 后台导入、本地导入、本设备作用域类型已具备；弹窗视觉需 1:1 返工 |
| S0-019 | Skill 库支持骨架 | 前端 Agent | FUNCTIONAL_READY / UI_REDO | 数据包内置、后台导入、本地导入、启用/停用已具备；选择弹窗视觉需 1:1 返工 |
| S0-020 | UI 1:1 视觉还原门禁落盘 | 总架构师 + UI/UX + 前端 Agent | DONE | 质量门禁、Agent、Skill、模板和验收计划已更新 |
| S0-021 | 已开发界面按效果图 1:1 返工 | 前端 Agent + UI/UX Agent | UI_PASS_READY_FOR_CODE | v24 正式复验全包 PASS；Home v19、EmptyWorkspace v19、EmptyPanels v17、Production v18、Composer v12 均可作为后续代码开发视觉基线 |
| S0-022 | E03 状态联动底座首轮代码开发 | 前端 Agent | FUNCTIONAL_READY | storyboard/timeline 进入 reducer state；分镜选中、时间线选中和分镜同步时间线服务通过类型、Lint、构建验证 |
| S0-023 | E03 Composer / 参数 / 任务状态底座 | 前端 Agent | FUNCTIONAL_READY | `chatStore`、`paramStore`、`generationTaskStore` 已接入 ChatPanel；模型选择、素材弹窗、发送态和生产摘要通过浏览器冒烟 |
| S0-024 | 浏览器窗口自适应与状态联动测试 | 前端 Agent | DONE | 已补 2560 基准 UI 缩放、`stage` URL 直达编辑器、E13-T02 最小状态联动测试和 E13-T06 1280x720 浏览器视觉回归 |
| S0-025 | E04 项目 API 合同与 adapter | 前端 Agent | DONE | `listProjects`、`createProject`、`openProject` 合同、项目 DTO adapter、mock repository、项目列表状态和浏览器新建项目冒烟通过 |
| S0-026 | E04 项目数据源配置与 auth 骨架 | 前端 Agent | DONE | `VITE_PROJECT_DATA_SOURCE` mock/api 开关、`VITE_PROJECT_API_BASE` 文档、auth session/userStore 骨架、项目 repository API 切换和浏览器新建项目冒烟通过 |
| S0-027 | E04 auth API 与 user profile 合同 | 前端 Agent | DONE | `getCurrentUser` 合同、`VITE_AUTH_DATA_SOURCE` mock/api 开关、UserProfile DTO adapter、auth repository、userStore profile loading 和浏览器新建项目冒烟通过 |
| S0-028 | E04 Home 用户资料显示接入 | 前端 Agent | DONE | Home 顶部 plan / credit / avatar 读取 `UserProfile`，匿名 fallback 保持视觉基线，authenticated mock profile 浏览器验证通过 |
| S0-029 | E12 project snapshot 与自动保存底座 | 前端 Agent | DONE | snapshot payload/DTO/adapter/repository、mock localStorage 版本追加、Editor autosave hook 接线、单元测试和浏览器写入验证通过 |
| S0-030 | E12 保存状态 UI 与 Composer 输入高度反馈 | 前端 Agent | DONE | TopBar 保存状态 / 版本菜单 / 手动保存入口接入；Composer textarea 44px -> 88px，浏览器 computed style 验证通过 |
| S0-031 | E12 导出任务闭环底座 | 前端 Agent | DONE | export task DTO/adapter/repository/hook、TopBar 导出进度、mock 进度轮询和下载入口接入；浏览器导出到 100% 验证通过 |
| S0-032 | E12 导出配置面板 | 前端 Agent | DONE | TopBar 导出菜单支持 MP4/GIF/MOV、720P/1080P/4K、24/30/60fps、字幕和压缩；自定义 GIF/4K/60fps 浏览器导出验证通过 |
| S0-033 | E12 导出 SSE 进度事件适配 | 前端 Agent | DONE | `export:progress/succeeded/failed` SSE DTO/socket/adapter 已接入；API 模式优先事件流，失败回退轮询；mock 轮询持续到 100% 浏览器验证通过 |
| S0-034 | E12 导出事件 fixture 与 contract | 前端 Agent | DONE | `src/mock/projectExportMock.ts` 和 `docs/api-contracts/project-export-events.md` 已落地；fixture 驱动 adapter 测试，后端联调字段合同明确 |
| S0-035 | E04 打开项目恢复 workspace snapshot | 前端 Agent | DONE | 打开已有项目时加载最新版 project snapshot 并 hydrate workspace；stage/storyboard/timeline/credit/标题恢复，浏览器验证 `skill_matched` URL 可恢复到保存的 `timeline_ready` 状态 |
| S0-036 | E04 open project latest_snapshot 兼容 | 前端 Agent | DONE | `OpenProjectResponseDto.latest_snapshot`、`ProjectListItem.latestSnapshot` 和 `mapOpenProjectResponse` 已接入；打开项目优先使用项目详情快照恢复，缺省回退 snapshot list |
| S0-037 | E04 共享 Canvas/Admin 账号积分桥接 | 前端 Agent | DONE | Autumn 读取无限画布同名 `canvas_platform_token` / `canvas_platform_api_base`；API 模式优先 `GET /api/account/summary` 映射用户、积分、会员和代理绑定，`/api/auth/me` 保留兼容 fallback |
| S0-038 | E04 共享后台模型配置列表 | 前端 Agent | DONE | 新增 model config DTO/API/adapter/store；读取 Canvas/Admin `/api/models`，Composer 模型弹窗展示后台启用模型 |
| S0-039 | E04 共享后台 data-pack / Skill 列表 | 前端 Agent | DONE | `VITE_AGENT_PACKAGE_DATA_SOURCE=api` / `VITE_SKILL_LIBRARY_DATA_SOURCE=api` 时读取 Canvas/Admin `/api/data-packs`；data pack 映射为 AgentPackage，Skill 从 data pack `skills` roots 派生，本地导入仍为 device-only |
| S0-040 | E04 共享后台生成任务 API 入口 | 前端 Agent | DONE | 新增 generation task DTO/API/adapter/repository；API 模式复用后台 token 读取 `/api/generation/tasks` 并映射任务状态，创建/查询接口已预留给 Composer 提交流程 |
| S0-041 | E07 Composer 创建共享后台生成任务 | 前端 Agent | DONE | ChatPanel 发送 prompt 时构建 `channelKey/modelId/type/mode/prompt/params/clientRequestId`，Editor 调用 `createConfiguredGenerationTask` 并把返回任务 upsert 到 `generationTaskStore`；mock 模式保持本地 pending |
| S0-042 | E08/E09 生成任务结果回写底座 | 前端 Agent | DONE | 抽取后台 `resultUrlsJson` / `resultJson.outputs/url`，生成 AssetItem；workspaceStore 支持资产 state 和 generated assets upsert，视频结果会挂到当前分镜并写入视频时间线 |
| S0-043 | E05 资产库首轮可操作面板 | 前端 Agent | DONE | 媒体文件面板支持类型筛选、未分配过滤、资产统计、已绑定标记和选中素材预览；中间画布可响应资产库选中；单元测试、Lint、类型检查、构建和 1280x720 浏览器冒烟通过 |
| S0-044 | E05 资产库上传 / 收藏 / 删除与 Composer 引用 | 前端 Agent | DONE | 本地文件上传映射为 `uploaded` 资产，支持收藏筛选、删除资产并清理故事板绑定 / 视频时间线 clip；Composer 素材弹窗支持 CRef/SRef 引用切换；测试、Lint、类型检查、构建和 1280x720 冒烟通过 |
| S0-045 | E05 资产库详情抽屉与批量操作 | 前端 Agent | DONE | 媒体文件面板支持当前筛选全选、批量删除、卡片勾选状态和选中资产详情抽屉；workspaceStore 支持批量删除纯函数；测试、Lint、类型检查、构建和 1280x720 冒烟通过 |
| S0-046 | E05 资产上传 repository/API adapter | 前端 Agent | DONE | 新增资产上传 DTO/API/adapter/runtime/repository；上传流程先插入 running 占位资产并通过 repository 回写完成 / 失败状态，API 模式支持 XHR 上传进度；测试、Lint、类型检查、构建和 1280x720 冒烟通过 |
| S0-047 | E05 object URL 生命周期管理 | 前端 Agent | DONE | 新增 object URL 提取 / 去重 / revoke 工具；上传占位被完成资产替换、用户删除资产、删除上传中资产和 Editor 卸载时回收 blob URL；测试、Lint、类型检查、构建和 1280x720 冒烟通过 |
| S0-048 | E05 Composer 参考素材与权重参数面板 | 前端 Agent | DONE | `seed/iw/cw/sw` 统一参数校验；素材弹窗支持垫图、CRef、SRef、IW/CW/SW/Seed 可视化调节，引用仅允许图片素材；测试、Lint、类型检查、构建和 1280x720 冒烟通过 |
| S0-049 | E06 故事板卡片操作首轮 | 前端 Agent | DONE | 故事板卡片支持当前参数绑定、复制、删除和重生成状态标记；workspace 纯函数同步时间线 clip 与选中态；测试、Lint、类型检查、构建和 1280x720 冒烟通过 |
| S0-050 | E06/E08/E09 故事板重生成任务路由 | 前端 Agent | DONE | 新增故事板重生成 payload builder；generation task adapter/mock 保留 `sourceElementId` / `targetAssetSlot`；任务完成后按目标卡片和资产槽位精准回写；测试、Lint、类型检查、构建和 1280x720 冒烟通过 |
| S0-051 | E06/E08/E09 生成任务失败态与重试合同 | 前端 Agent | DONE | 故事板重生成创建失败和后台 failed 任务会回写卡片错误态；failed 卡片显示“重试”；成功回写清除旧错误；`targetAssetSlot` / 失败字段 API 合同已落地；测试、Lint、类型检查、构建和 1280x720 冒烟通过 |
| S0-052 | E02 工作台密集区域字号可读性调整 | 前端 Agent | DONE | 故事板卡片、右侧对话摘要、素材列表和 Composer 操作按钮字号上调；类型检查、Lint、构建和 2048x1152 浏览器冒烟通过 |
| S0-053 | E06 故事板拖拽与按钮排序 | 前端 Agent | DONE | 故事板卡片支持拖拽排序和上下移动按钮；workspace 纯函数同步故事板顺序、时间线 clip 顺序和选中态；测试、Lint、类型检查、构建和 2048x1152 冒烟通过 |
| S0-054 | E06 添加分镜真实入口 | 前端 Agent | DONE | “+ 添加分镜”创建 pending shot 卡片并绑定当前参数快照；新卡自动选中并同步到视频时间线；测试、Lint、类型检查、构建和 2048x1152 冒烟通过 |
| S0-055 | E06 分镜名称与描述编辑 | 前端 Agent | DONE | 故事板卡片新增编辑入口，保存后更新卡片名称/描述并同步视频时间线 clip 标题；测试、Lint、类型检查、构建和浏览器冒烟通过 |
| S0-056 | E07 对话中枢模型/Agent/Skill 闭环 | 前端 Agent | DONE | Composer 模型选择按后台启用能力分组；Agent/Skill 选择接入漫剧创作库等 data-pack；发送后创建生成任务并在对话流输出任务卡；测试、Lint、类型检查、构建和浏览器冒烟通过 |
| S0-057 | E07 真实后台管理系统模型与任务接口纠偏 | 前端 Agent | DONE | Composer 模型选择改为默认读取 `http://124.156.137.236/admin/` 同源后台接口：`/api/models?type=IMAGE|VIDEO|LLM`，分类为空时 fallback `/api/admin/models`；移除本地假模型兜底；开发代理 `/api` 指向 `124.156.137.236`；对话任务 mode 对齐后台联调页 `txt2img/text-to-video/chat`；测试、Lint、类型检查、构建通过 |
| S0-058 | E04 账号入口与认证 UI | 前端 Agent | DONE | 新增全局 AuthDialog，主页和编辑器顶栏支持登录 / 注册 / 忘记密码入口；登录注册调用后台账号 API 并写入统一 AuthSession；忘记密码表单完成 UI 状态闭环；登录后模型 store 可接收实时 session 重新拉取后台模型；测试、Lint、类型检查、构建和浏览器冒烟通过 |

## 4. 阻塞事项

| Blocker ID | 描述 | 影响 | 处理建议 | 状态 |
| --- | --- | --- | --- | --- |
| B-001 | 本地开发无法读取 `http://124.156.137.236/admin/` 源内 localStorage token | 接口联调 | 本地通过 Vite `/api` 代理调用真实后台；需要在 Autumn 当前源写入 `ai_admin_token` 或完成同源部署后复用后台登录态 | OPEN |
| B-002 | 可用模型配置接口字段已按后台管理系统 bundle 确认，仍需真实账号联调返回样本 | 参数面板 | 已适配 `displayName/name/provider/adapter/baseUrl/endpointPath/salePrice/pricePerSecond/creditsPerUsdCost/status`；拿到 token 后验截图里的启用模型 | IN_PROGRESS |
| B-003 | UI 效果图尚未生成 | 前端视觉细节 | 已生成主页、空态、对话流、生产态、媒体生成和视频预览 4K 参考图 | RESOLVED |
| B-004 | 当前已开发界面未完成 UI/UX Agent 正式 PASS | 前端 UI 交付 | v24 正式复验全包 PASS，S0-021 UI 阻塞已解除 | RESOLVED |

## 5. 当前 Run

| Run | 状态 | 目标 | 产物 |
| --- | --- | --- | --- |
| Run 001 | IN_PROGRESS | 将 docs 输入流水线，启动 Sprint 0 | `agents/runs/run-001-docs-to-mvp-kickoff/`，含 UI 资源日志和空态状态清单 |

## 6. 每次开发后必须更新

- 完成了哪些 Task。
- 哪些 Task 被拆分或新增。
- 哪些阻塞出现或解除。
- 当前验证结果。
- 下一步推荐任务。
