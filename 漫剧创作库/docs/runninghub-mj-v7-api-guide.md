# RunningHub MJ-V7 标准模型 API 接入说明

## 适用范围
本说明用于 RunningHub 标准模型 API 中的 MJ-V7（`youchuan/text-to-image-v7`）文本生图接口。

适合场景：
- 快速测试图
- 封面探索图
- 风格探索图
- 不依赖 workflowId / nodeInfoList 的直接出图场景

不适合场景：
- 需要工作流节点编排
- 需要 Banana2 三参考图控制
- 需要 banana2-edit / banana-pro-edit / portrait-upscale 这类 workflow 链路

---

## 一、鉴权方式
使用环境变量：

```bash
export RUNNINGHUB_API_KEY="你的 API Key"
```

请求头：

```bash
Authorization: Bearer ${RUNNINGHUB_API_KEY}
```

---

## 二、提交接口

### Endpoint
```text
POST https://www.runninghub.cn/openapi/v2/youchuan/text-to-image-v7
```

### 最小请求体
```json
{
  "prompt": "迷雾古老森林中的生物发光白鹿，柔和的微光颗粒，电影级光影，超写实纹理"
}
```

### 常用请求参数
- `prompt`：必填，正向提示词
- `negativePrompt`：可选，负向提示词
- `quality`：可选，建议值 `1` / `2` / `4`
- `chaos`：可选，0-100
- `stylize`：可选，0-1000
- `weird`：可选，0-3000
- `raw`：可选，布尔值
- `aspectRatio`：可选，推荐 `3:4`、`2:3`、`9:16`
- `imageUrl`：可选，垫图 URL
- `iw`：可选，垫图权重
- `sref`：可选，风格参考图 URL
- `sw`：可选，风格权重
- `sv`：可选，风格版本
- `oref`：可选，万物引用图 URL
- `ow`：可选，万物引用权重
- `tile`：可选，是否平铺

---

## 三、查询接口

### Endpoint
```text
POST https://www.runninghub.cn/openapi/v2/query
```

### 请求体
```json
{
  "taskId": "${RUNNINGHUB_TASKID}"
}
```

### 关键返回字段
- `taskId`
- `status`：`QUEUED` / `RUNNING` / `SUCCESS` / `FAILED`
- `results[].url`
- `results[].outputType`
- `errorCode`
- `errorMessage`
- `usage.taskCostTime`

---

## 四、与 workflow 模式的区别

### 1. 标准模型 API（MJ-V7）
适合：
- 直接 prompt 出图
- 快速探索
- 简化调用

特点：
- 不需要 `workflowId`
- 不需要 `nodeInfoList`
- 接口更轻
- 结果通过 `/openapi/v2/query` 查询

### 2. workflow 模式
适合：
- Banana2
- 单图编辑
- 高清增强
- 多节点控制

特点：
- 需要 `workflowId`
- 可能需要 `nodeInfoList`
- 更适合工程化稳定链路

---

## 五、项目落地目录规范
图片统一放在：

```text
06-generated/images/
```

推荐子目录：
- `06-generated/images/characters/`
- `06-generated/images/props/`
- `06-generated/images/scenes/`
- `06-generated/images/others/`

如果是测试图、探索图、临时验证图，优先放：
- `06-generated/images/others/`

---

## 六、推荐任务卡归档位置
建议在项目中新增：

```text
05-prompts/runninghub/standard-api/
```

例如：
- `05-prompts/runninghub/standard-api/mj-v7-test-cover.md`

---

## 七、推荐命名

### 图片文件
- `mjv7-test-cover-v1-20260412.png`
- `mjv7-forest-style-v1-20260412.png`

### 元信息文件
- `mjv7-test-cover-v1-20260412.task.json`

---

## 八、建议使用方式
1. 先做一张测试图验证 API 可用
2. 再用于封面探索 / 风格探索
3. 正式入选后登记到 `06-generated/asset-index.md`
4. 若后续需要精修，再转入 workflow 编辑链
