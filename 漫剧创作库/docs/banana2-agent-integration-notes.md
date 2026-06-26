# 兼容说明：Banana2 Agent 协作文档已迁移

本文件保留仅用于兼容旧引用。

后续请统一以以下文档为准：
- `docs/runninghub-image-agent-integration-notes.md`
- `docs/runninghub-image-integration-spec.md`
- `docs/runninghub-image-pipeline-integration-spec.md`

## 迁移原因
原文件名只覆盖 `banana2`，但当前项目里的 RunningHub 图像能力已经扩展为完整体系：
- `banana2`
- `banana2-edit`
- `banana-pro-edit`
- `portrait-upscale`

继续沿用旧命名，容易让人误以为文档只适用于 Banana2 三图生成，不利于 Agent 做统一理解和调度。

## 当前建议
- 如果你在补 Agent 职责：优先看 `docs/runninghub-image-agent-integration-notes.md`
- 如果你在补接入规范：优先看 `docs/runninghub-image-integration-spec.md`
- 如果你在看工作流总分层：补看 `docs/runninghub-image-pipeline-integration-spec.md`
