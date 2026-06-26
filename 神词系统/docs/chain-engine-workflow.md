# 灵境 · 链式引擎工作流（Chain Engine Workflow）

> 源自 `soullensV69更新.html` 第 1519-1532 行 `qs()` / `cd()` / `$n()` / `ad()` 函数
> 这是灵境处理 **≥180s 长剧本** 的核心机制：自动切分 → 分段生成 → 断点续传 → 无缝拼接。

---

## 一、触发条件

```
if totalSec >= 180 && totalSec < 15:
    启动链式引擎
else:
    单次生成（直接调用 AI 一次性输出全部分镜）
```

**原因**：单次 AI 调用的上下文窗口有限，180s+ 剧本会导致：
- 后半段镜头质量下降（遗忘前文）
- 台词丢失或改写
- 动作连续性断裂

链式引擎通过"分而治之"保证全片质量一致。

---

## 二、三阶段流程（UI 标识：cstep-a/b/c）

```
🎬 A · 剧本切分（cstep-a）
   ↓
🎥 B · 分段生成（cstep-b）
   ↓
✂️ C · 无缝拼接（cstep-c）
```

### A 阶段 · 剧本切分（Nl 函数）

**输入**：完整剧本文本 + 总时长

**输出**：`k.scenes[]` 数组，每个元素为一个"场次"（scene）

```javascript
scene = {
  id: "scene_1713xxx",                    // 唯一标识
  title: "第1场",                         // 显示名
  beatKey: "opening",                     // 节拍类型
  beatName: "开场",                       // 节拍名
  beatTask: "建立世界观",                 // 叙事任务
  beatColorClass: "beat-opening",         // UI 色标
  narrativeMode: "action",                // 叙事模式（action/dialogue/lyrical）
  estimatedDuration: 25,                  // 预估时长（秒）
  contentSummary: "林天站在废墟中...",    // 内容摘要（150-300字）
  bridgeState: null,                      // 动作桥接状态（见第四节）
  error: null,                            // 错误信息
  content: ""                             // 生成的分镜表（初始为空）
}
```

**切分策略**：
1. 先用 AI 将剧本拆成 N 个"节拍"（beat），每个节拍 15-45s
2. 识别每个节拍的 `narrativeMode`（调用 `Rl()` 题材识别）
3. 为每个节拍生成 `contentSummary`（浓缩版剧情，保留台词原文）
4. 计算 `estimatedDuration`（调用 `Ku()` 时长估算）

**关键约束**：
- 台词必须原文保留在 `contentSummary` 中（见 `dialogue-lock-rules.md`）
- 所有 `estimatedDuration` 之和 ≈ 总时长 ±5%

---

### B 阶段 · 分段生成（ys 函数 + cd 断点恢复）

**核心循环**：
```javascript
globalOffset = 0
for (i = 0; i < scenes.length; i++) {
    scene = scenes[i]
    
    // 调用 AI 生成本场分镜表
    result = await generateSingleScene(scene, globalOffset, bridgeState)
    
    // 累加时间轴
    globalOffset += scene.estimatedDuration
    
    // 保存桥接状态（最后一镜的动作/朝向/情绪）
    bridgeState = scene.bridgeState
    
    // 存储结果
    k.sceneContents[scene.id] = result
    
    // 实时保存断点
    await saveRecoveryPoint()
}
```

**桥接状态（bridgeState）**：
```json
{
  "lastCharacter": "@林天",
  "lastAction": "握紧拳头",
  "lastEmotion": "愤怒",
  "lastDirection": "面朝右",
  "lastPosition": "画面右侧",
  "lastLighting": "逆光剪影"
}
```
传递给下一场的系统提示词，确保第一镜能无缝衔接。

**断点续传（cd 函数）**：
```javascript
function cd() {
    // 找到第一个未完成的场次
    let resumeIndex = 0
    for (let i = 0; i < k.scenes.length; i++) {
        if (!k.sceneContents[k.scenes[i].id] || k.scenes[i].error) {
            resumeIndex = i
            break
        }
        resumeIndex = i + 1
    }
    
    // 重新计算 globalOffset（前面已完成场次的时长总和）
    let offset = 0
    for (let i = 0; i < resumeIndex; i++) {
        offset += k.scenes[i].estimatedDuration
    }
    k.globalOffset = offset
    
    return resumeIndex
}
```

**恢复提示**：
```
检测到未完成的链式生成（5 个场次，最近更新：2026-04-20 00:30），是否从断点恢复？
[确定] → 从第 3 场继续
[取消] → 清空重新开始
```

---

### C 阶段 · 无缝拼接

**输入**：`k.sceneContents = { scene_1: "表格1", scene_2: "表格2", ... }`

**输出**：单个完整分镜表

**拼接规则**：
1. 合并所有表格的 `<tr>` 行（去掉重复表头）
2. 重新编号镜头序号（1, 2, 3, ...）
3. 校验时间轴连续性（`scenes[i].end === scenes[i+1].start`）
4. 注入"场次分隔线"（可选，UI 用虚线标注）

**最终写入**：
```javascript
document.getElementById("storyboardTable").innerHTML = mergedTable
chatHistory.push({
    role: "assistant",
    content: Object.values(k.sceneContents).join("\n\n---\n\n")
})
```

---

## 三、取消机制（isCancelled）

**触发**：用户点击"取消"按钮

**行为**：
```javascript
k.isCancelled = true   // 设置标志位

// 在 B 阶段循环中检测
for (i = resumeIndex; i < scenes.length; i++) {
    if (k.isCancelled) {
        await saveRecoveryPoint("interrupted")
        break   // 立即退出循环
    }
    // ... 生成逻辑
}
```

**状态保存**：
```json
{
  "status": "interrupted",
  "currentSceneId": "scene_3",
  "scenes": [
    {"id": "scene_1", "status": "done", "content": "..."},
    {"id": "scene_2", "status": "done", "content": "..."},
    {"id": "scene_3", "status": "loading", "content": ""},
    {"id": "scene_4", "status": "waiting", "content": ""},
    {"id": "scene_5", "status": "waiting", "content": ""}
  ]
}
```

下次启动时可从 `scene_3` 恢复。

---

## 四、存储结构（LocalStorage / IndexedDB）

**Key**: `chain_recovery_${projectId}`

**Value**:
```json
{
  "version": 1,
  "updatedAt": 1713600000000,
  "status": "running" | "interrupted" | "completed",
  "totalDuration": 180,
  "globalOffset": 50,
  "cleanPlot": "原始剧本文本",
  "currentSceneId": "scene_3",
  "scenes": [
    {
      "id": "scene_1",
      "title": "第1场",
      "beatName": "开场",
      "estimatedDuration": 25,
      "contentSummary": "...",
      "content": "完整分镜表 Markdown",
      "bridgeState": {...},
      "error": null,
      "status": "done"
    },
    ...
  ]
}
```

**清理时机**：
- 用户主动点击"清空历史"
- 切换到其他项目
- 生成完成后 24 小时自动清理

---

## 五、一句话调用

```
@lingjing 链式生成：把这段 180s 剧本切成 5 场，分段生成后拼接
@lingjing 从断点恢复上次中断的链式生成
@lingjing 取消当前链式生成，保存断点
```

Agent 执行步骤：
1. 检测 `totalSec >= 180` → 启动链式引擎
2. 调用 `Nl()` 切分场次 → 显示 A 阶段进度
3. 循环调用 `ys()` 生成每场 → 显示 B 阶段进度（1/5, 2/5, ...）
4. 每场完成后立即调用 `$n()` 保存断点
5. 全部完成后调用拼接函数 → 显示 C 阶段完成
6. 清理恢复点，标记 `status: "completed"`

---

## 六、与其他模块的依赖

| 上游 | 下游 |
|---|---|
| `auto-match-system.md` 的 `Rl()` 识别每场 narrativeMode | `shot-duration-algorithm.md` 的 `jl()` 为每场分配镜头 |
| `dialogue-lock-rules.md` 确保台词在切分时不丢失 | `lingjing-storyboard-skill.md` 接收 bridgeState 生成衔接镜头 |
| `narrative-pace-presets.json` 为每场提供节奏预设 | 最终拼接表写入 `seedance-format-standard.md` 格式 |

**禁止**：手动修改 `k.scenes[]` 或 `k.globalOffset`——会破坏断点恢复的时间轴一致性。

---

## 七、错误处理

| 错误类型 | 行为 | 恢复策略 |
|---|---|---|
| 单场生成失败 | 标记 `scene.error = "错误信息"`，继续下一场 | 用户可单独重试失败场次 |
| 网络中断 | 自动保存断点，提示"已中断" | 刷新页面后提示恢复 |
| API 超限 | 暂停 30s 后自动重试，3 次失败后中断 | 等待配额恢复后手动恢复 |
| 用户取消 | 立即保存断点，标记 `interrupted` | 下次启动提示恢复 |

**日志示例**：
```
[Chain] A·剧本切分 → 5 个场次（25s+30s+40s+35s+50s=180s）
[Chain] B·分段生成 → 1/5 完成（globalOffset=25s）
[Chain] B·分段生成 → 2/5 完成（globalOffset=55s）
[Chain] 用户取消 → 保存断点（currentSceneId=scene_3）
[Chain] 下次恢复 → 从 scene_3 开始（globalOffset=55s）
```
