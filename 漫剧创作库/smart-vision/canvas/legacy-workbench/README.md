# legacy-workbench

这里保存从原 `tools/workbench-web/` 迁移来的无限画布 UI、HTML 页面、JS 引擎、模型 registry 与静态配置。

## 迁移红线

- 本阶段只做完整复制和必要启动适配。
- 不重写 `workbench-engine.js` 的画布逻辑。
- 不改变原页面交互和 UI 能力。
- 如需接口化，应在智能视界平台壳层或 Runtime 中新增适配层，不直接破坏 legacy 副本。
