# 文本提示词反推与 URL 提取修复部署包

包含文件：
- `workbench-web/image-studio-canvas-next.html`
- `tools/workbench_server.py`

修复内容：
- 文本提示词节点图片反推改为输出可直接复现图片的生成提示词。
- 视频反推改为输出可直接复现视频片段的生成提示词。
- 文本提示词节点新增 URL 内容提取入口。
- 本地 workbench server 新增 `/api/workbench/url/extract`。

部署脚本：
- `deploy/apply-text-prompt-url-reverse-fix-20260601025207-on-server.sh`
