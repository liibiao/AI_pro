# director-stage-node-20260601130752

新增独立 `3D导演台` 节点首版。

## 内容

- 新增 `directorStage` 节点定义，节点显示名为 `3D导演台`。
- 接入 Three.js 3D 画布，支持地面网格、背景图、低模角色、道具和机位标记。
- 支持添加角色、添加道具、添加机位、移动/旋转/缩放、复位视角、保存机位截图。
- 新增导演台数据结构 `directorSpec`，并输出生图提示词与生视频提示词。
- 机位截图会作为图片输出，可继续连接到图片节点或下游生图/生视频节点。

## 验证

```bash
node --check image-studio-canvas-next.html
```

实际验证使用脚本提取 HTML 中的 4 段 `<script>` 后逐段执行 `node --check`，结果为 `script_syntax_ok 4`。
