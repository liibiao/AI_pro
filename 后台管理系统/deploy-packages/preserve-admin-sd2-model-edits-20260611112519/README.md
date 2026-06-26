# Preserve Admin SD2 Model Edits

- 画布模型能力改为数据库配置优先，代码预设仅在字段缺失时兜底。
- 已有模型不再被 `SYNC_CANVAS_MODELS_OVERWRITE*` 单独覆盖。
- 真正需要重置后台配置时，必须额外设置：
  `SYNC_CANVAS_MODELS_ALLOW_ADMIN_RESET=true`
- 部署脚本不会运行模型同步，不修改数据库现有值。
