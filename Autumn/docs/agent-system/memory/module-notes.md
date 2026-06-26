# Autumn Module Notes

本文件记录各业务模块的长期注意事项。模块开始实际开发后，按模块追加内容。

## Project

- 负责项目创建、打开、保存、版本快照。
- 不直接处理生图、生视频或时间线细节。

## User

- 负责用户资料、权限、套餐和额度。
- TopBar 只展示用户状态，权限判断应在 service 或 store 中完成。

## ModelConfig

- 负责后台模型配置读取和参数范围定义。
- 参数面板使用前端领域模型，不直接依赖后台 DTO。

## Asset

- 负责图片、视频、音频、角色、场景、剧本资产。
- `cref`、`sref`、`iw` 只能引用资产库中有效 asset。

## Storyboard

- 负责分镜列表、顺序、状态和进度。
- 不直接调用生成 API；重生成动作交给 orchestration service。

## ChatFlow

- 负责消息流、输入、附件和历史记录。
- 创建生成任务时调用 orchestration service，不直接串多个 API。

## ImageGeneration

- 负责生图、改图、圈选局部修改。
- 画布选区坐标转换必须通过 adapter 或 service。

## VideoGeneration

- 负责视频生成任务创建、进度、失败重试和结果映射。
- 生成结果写入故事板和时间线必须通过统一编排函数。

## Canvas

- 负责预览、缩放、平移、圈选和截图。
- Fabric.js API 必须封装在 `adapters/fabric`。

## Timeline

- 负责轨道、片段、playhead、缩放和片段编辑。
- 第三方时间线组件必须封装在 `adapters/timeline`。

## Export

- 负责导出任务、进度和下载。
- 导出前应读取项目、故事板、时间线和字幕状态生成导出 payload。
