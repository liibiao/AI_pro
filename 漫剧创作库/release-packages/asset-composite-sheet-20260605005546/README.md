# asset-composite-sheet-20260605005546

变更内容：

- 在推演资产确认弹窗增加“合成资产图”选项。
- 勾选后显示模型、分辨率、比例工具栏。
- 无底图时创建并执行文生图节点；有资产底图时创建并执行图生图节点。
- 新增“合成资产图 · 白底三视图总览”模板提示词，用于把全部资产合成一张纯白背景三视图总览图。
- 后续分镜 / 故事板 / 视频推演链路会把成功生成的合成资产图作为额外资产参考图。

部署：

```bash
scp /tmp/asset-composite-sheet-20260605005546.tar.gz ubuntu@124.156.137.236:/tmp/ && \
ssh -tt ubuntu@124.156.137.236 "sudo bash -s -- /tmp/asset-composite-sheet-20260605005546.tar.gz" < "/Users/billy/Documents/AI_pro/漫剧创作库/release-packages/asset-composite-sheet-20260605005546/deploy/apply-asset-composite-sheet-20260605005546-on-server.sh"
```
