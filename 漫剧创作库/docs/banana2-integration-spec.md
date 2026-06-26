# 兼容说明：Banana2 接入规范已迁移

本文件保留仅用于兼容旧引用。

后续请统一以以下文档为准：
- `docs/runninghub-image-integration-spec.md`
- `docs/runninghub-image-pipeline-integration-spec.md`
- `docs/runninghub-image-edit-upscale-guide.md`
- `docs/runninghub-client-cli-guide.md`

## 迁移原因
原文件名只覆盖 `banana2`，但当前项目里的 RunningHub 图像能力已经扩展为完整体系：
- `banana2`
- `banana2-edit`
- `banana-pro-edit`
- `portrait-upscale`

继续沿用旧命名，容易把“参考图驱动生成”误认为整个图像执行层的全部能力，不利于项目长期维护。

## 当前建议
- 如果你在看图像接入总规范：优先看 `docs/runninghub-image-integration-spec.md`
- 如果你在看能力分层与项目落地：优先看 `docs/runninghub-image-pipeline-integration-spec.md`
- 如果你在看编辑 / 增强策略：优先看 `docs/runninghub-image-edit-upscale-guide.md`
- 如果你在看脚本参数和运行方式：优先看 `docs/runninghub-client-cli-guide.md`
