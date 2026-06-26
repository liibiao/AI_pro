# text-prompt-agent-name-fix-20260601041419

修复内容：

- 文本提示词节点底部 Agent 数据包下拉中，`manju-creation-library` 的显示名从“漫剧创作库”改为“智能推演”。
- 保留内部 id 不变，避免影响已有工作流和后端路由。

部署：

```bash
scp /tmp/text-prompt-agent-name-fix-20260601041419.tar.gz ubuntu@124.156.137.236:/tmp/ && ssh ubuntu@124.156.137.236 "bash -s" < /Users/billy/Documents/AI_pro/后台管理系统/deploy-packages/text-prompt-agent-name-fix-20260601041419/deploy/apply-text-prompt-agent-name-fix-20260601041419-on-server.sh
```
