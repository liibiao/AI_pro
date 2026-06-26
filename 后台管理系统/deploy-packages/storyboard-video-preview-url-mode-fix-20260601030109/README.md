# storyboard-video-preview-url-mode-fix-20260601030109

修复内容：

- 视频节点 / 生视频节点点击“查看大图”后，如果当前地址可播放，不再误报“当前预览读取失败”。
- 视频大图预览会按当前地址、本地地址、代理地址、远端地址依次回退，全部失败后才提示错误。
- 文本提示词节点移除独立 `URL` 按钮，将 `URL内容提取` 收拢到第二个模式下拉列表。
- 文本提示词节点运行时会自动从输入框识别 URL，提取网页正文并加入上下文。

部署：

```bash
scp /tmp/storyboard-video-preview-url-mode-fix-20260601030109.tar.gz ubuntu@124.156.137.236:/tmp/ && ssh ubuntu@124.156.137.236 "bash -s" < /Users/billy/Documents/AI_pro/后台管理系统/deploy-packages/storyboard-video-preview-url-mode-fix-20260601030109/deploy/apply-storyboard-video-preview-url-mode-fix-20260601030109-on-server.sh
```
