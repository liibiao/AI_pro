# RunningHub Banana2 专用模式说明

## 当前已接入的 workflow
- `workflowId`: `2043087373063430146`
- 工作流链接：`https://www.runninghub.cn/workflow/2043087373063430146?source=workspace`

## Banana2 节点映射
- `2.image`：人物参考图
- `3.image`：服装参考图
- `4.image`：场景参考图
- `9.text`：提示词
- `1.aspectRatio`：画幅
- `1.resolution`：分辨率
- `1.seed`：种子
- `5.filename_prefix`：输出文件前缀

## 环境变量
```bash
export RUNNINGHUB_API_KEY="你的API_KEY"
```

## 1. 最小验证：只改 prompt 和 ratio
不上传新图，直接验证 workflow 是否可跑通：
```bash
python3 tools/runninghub_client.py \
  --banana2 \
  --prompt "近景构图（膝盖以上），图1女孩穿着图2的衣服，身处图3的场景中，自信展示自我，姿态酷飒随性，眼神冷艳有气场，保持人物五官一致性，高级电影质感，光影干净柔和，细节超清，氛围感拉满，酷女孩风格，画面自然高级" \
  --ratio 9:16 \
  --filename-prefix banana2_test \
  --output-dir projects/demo_shortdrama_001/06-generated/runninghub
```

说明：
- 开启 `--banana2` 后，如果你没传 `--workflow-id`，脚本会默认使用 `2043087373063430146`
- 该命令适合先确认 API key、workflow 和节点映射是否都正常

## 2. 三图替换版：上传人物图 / 服装图 / 场景图
```bash
python3 tools/runninghub_client.py \
  --banana2 \
  --char-file /absolute/path/to/character.png \
  --cloth-file /absolute/path/to/clothes.png \
  --scene-file /absolute/path/to/scene.png \
  --prompt "近景构图（膝盖以上），图1女孩穿着图2的衣服，身处图3的场景中，自信展示自我，姿态酷飒随性，眼神冷艳有气场，保持人物五官一致性，高级电影质感，光影干净柔和，细节超清，氛围感拉满，酷女孩风格，画面自然高级" \
  --ratio 9:16 \
  --resolution 2k \
  --seed 829788543 \
  --filename-prefix banana2_cover \
  --output-dir projects/demo_shortdrama_001/06-generated/runninghub
```

说明：
- 脚本会自动上传三张图
- 自动把上传返回的 `fileName` 写入对应节点：`2.image / 3.image / 4.image`
- 自动把 prompt 写入 `9.text`
- 自动把 ratio / resolution / seed / filename_prefix 拼入 nodeInfoList

## 3. Banana2 + 手动 nodeInfoList 混合模式
如果你还想在 Banana2 专用参数基础上，额外补字段，可以同时传 `--node-info-list`：
```bash
python3 tools/runninghub_client.py \
  --banana2 \
  --prompt "酷飒电影感人物海报" \
  --ratio 3:4 \
  --node-info-list '[{"nodeId":"1","fieldName":"channel","fieldValue":"Third-party"}]' \
  --output-dir projects/demo_shortdrama_001/06-generated/runninghub
```

脚本会自动合并两部分 nodeInfoList；如果同一个 `nodeId + fieldName` 重复，后者会覆盖前者。

## 推荐执行流程
### 第一轮：最小验证
先只跑：
- `--banana2`
- `--prompt`
- `--ratio`
- `--filename-prefix`

确认：
1. workflow 已网页端跑通
2. API key 正常
3. 任务能创建
4. 能拿到 outputs 并下载文件

### 第二轮：三图替换
在第一轮成功后，再加：
- `--char-file`
- `--cloth-file`
- `--scene-file`
- 可选 `--resolution`
- 可选 `--seed`

### 第三轮：接入项目资产管理
生成成功后建议：
1. 文件落到 `projects/<项目>/06-generated/runninghub/`
2. 可用成品回填 `06-generated/asset-index.md`
3. 试验结果回填 `08-qa/generation-review.md`

## 注意事项
- 上传返回的 `download_url` 不是长期图床，正式资产请保存在本地工作区
- 若你后续换 workflow，请重新检查节点映射，不要默认 Banana2 节点号仍然一致
- 如果任务失败，优先检查：
  - workflow 是否网页端跑通过
  - prompt / 图像输入节点号是否正确
  - RunningHub 账户权限与余额是否正常
