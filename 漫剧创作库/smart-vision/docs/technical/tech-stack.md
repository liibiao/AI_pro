# 智能视界技术选型

## 1. 当前迁移阶段

本阶段以稳定迁移为核心，不重写无限画布。

- 前端画布：保留现有 HTML / CSS / 原生 JavaScript。
- 画布引擎：保留 `workbench-engine.js`。
- 本地服务：保留 Python `http.server` + 自定义 API handler 形态。
- 配置：保留 `model-registry.json`、`models/`、`wordlists/mj-image/`。
- 存储：优先使用本地工程目录、JSON、Markdown、输出文件夹。
- 平台大脑：`AI / 大模型`，不绑定 GPT。

## 2. 第一阶段不采用的方案

- 不把重后端、数据库、队列作为前置依赖。
- 不在迁移阶段强制改造为 React / TypeScript。
- 不把原无限画布业务逻辑拆散重写。
- 不迁移与无限画布无直接依赖的项目批处理脚本。

## 3. 后续平台壳层演进建议

后续可逐步引入：

- React / TypeScript / Vite：建设智能视界平台壳层。
- Zustand 或轻量状态机：管理 UI 状态和任务状态。
- JSON Schema：约束 Workflow、Recipe、工程记忆。
- 本地文件桥接层：读写 `.smart-vision/` 与项目产物。
- 可选 SQLite / 云存储：用于多人协作或大型项目增强，不作为 MVP 前置。

## 4. 兼容策略

迁移版无限画布作为 legacy 能力保存。平台壳层通过 iframe、路由跳转或后续 adapter 接入，不直接破坏 legacy 文件。
