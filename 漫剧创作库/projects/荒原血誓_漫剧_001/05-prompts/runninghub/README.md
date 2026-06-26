# RunningHub 提示词目录

本目录存放漫剧项目中使用 RunningHub 平台生成图片的任务卡。

## 子目录

### `banana2/`
Banana2 三参考图生成任务卡。

### `image-edit/`
单图编辑（Banana2-Edit / BananaPRO-Edit）和人物高清增强（Portrait-Upscale）任务卡。

### `standard-api/`
标准模型 API（MJ-V7 / MJ-Niji7 / MJ-Niji6）任务卡。

## 使用说明
1. 每个任务卡是一个 `.md` 文件，包含提示词、参数、状态和输出路径
2. 执行工具：`tools/runninghub_client.py`
3. 详细指南：`docs/runninghub-client-cli-guide.md`
