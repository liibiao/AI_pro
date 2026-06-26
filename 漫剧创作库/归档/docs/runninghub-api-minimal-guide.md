# RunningHub 最小脚本使用说明

## 位置
- 脚本：`tools/runninghub_client.py`

## 功能
- 上传本地文件到 RunningHub
- 发起 workflow 任务
- 轮询任务结果
- 下载生成文件到本地目录

## 前置条件
1. 你已经在 RunningHub 网页端把目标 workflow 跑通过至少一次
2. 你有可用的 `API_KEY`
3. 你知道目标 `workflowId`
4. 若需要改节点参数，你已从 RunningHub 导出了 workflow 的 API JSON，并知道 `nodeId / fieldName`

## 环境变量
```bash
export RUNNINGHUB_API_KEY="你的API_KEY"
```

## 最小示例：只运行 workflow 默认参数
```bash
python3 tools/runninghub_client.py \
  --workflow-id 1904136902449209346 \
  --output-dir projects/demo_shortdrama_001/06-generated/runninghub
```

## 示例：修改提示词节点
```bash
python3 tools/runninghub_client.py \
  --workflow-id 1904136902449209346 \
  --node-info-list '[{"nodeId":"6","fieldName":"text","fieldValue":"dramatic short drama cover, elegant heroine, cinematic lighting, 3:4"}]' \
  --output-dir projects/demo_shortdrama_001/06-generated/runninghub
```

## 示例：先上传参考图，再把返回的 fileName 填进节点
先上传：
```bash
python3 tools/runninghub_client.py \
  --upload-file /absolute/path/to/reference.png
```

脚本会打印类似：
```json
{"type":"image","download_url":"...","fileName":"openapi/xxx.png","size":"3490"}
```

再把 `fileName` 用作 `fieldValue`：
```bash
python3 tools/runninghub_client.py \
  --workflow-id 1904136902449209346 \
  --node-info-list '[{"nodeId":"10","fieldName":"image","fieldValue":"openapi/xxx.png"}]' \
  --output-dir projects/demo_shortdrama_001/06-generated/runninghub
```

## 示例：直接传本地 workflow JSON
如果你不想只依赖 `workflowId`，也可以传本地导出的 workflow JSON：
```bash
python3 tools/runninghub_client.py \
  --workflow-file /absolute/path/to/api.json \
  --node-info-list '[{"nodeId":"6","fieldName":"text","fieldValue":"short drama poster, luxury banquet hall, heroine returns"}]' \
  --output-dir projects/demo_shortdrama_001/06-generated/runninghub
```

## 可选参数
- `--webhook-url`：任务完成回调地址
- `--instance-type plus`：指定实例类型
- `--use-personal-queue`：独占队列模式
- `--disable-metadata`：关闭 addMetadata
- `--interval 5`：轮询间隔秒数
- `--timeout 1800`：超时秒数
- `--download-prefix cover_`：下载文件名前缀

## 推荐接入你当前创作库的方式
### 目录建议
- 生成结果：`projects/<项目名>/06-generated/runninghub/`
- 工作流说明：`projects/<项目名>/05-prompts/runninghub/`
- 资产回填：`projects/<项目名>/06-generated/asset-index.md`

### 最小闭环建议
1. 在 `05-prompts/runninghub/` 记录：
   - workflowId
   - 节点映射表（nodeId / fieldName / 作用）
   - 常用命令样例
2. 每次生成后，把结果文件落到 `06-generated/runninghub/`
3. 再把可用结果回填到 `06-generated/asset-index.md`
4. 若是实验镜头，回填到 `08-qa/generation-review.md`

## 注意事项
- 上传接口返回的 `download_url` 不是长期图床，正式资产请下载回本地
- WebSocket 返回字段 `netWssUrl` 官方不推荐依赖
- 最稳妥的方式仍是：创建任务 → 轮询状态/结果 → 下载文件
