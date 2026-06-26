# 灵境 · 智能匹配系统（Auto-Match System）

> 源自 `soullensV69更新.html` 中：
> - `autoMatchStyle()` · 风格智能匹配（第 950 行附近）
> - `Ku(script)` · 视频时长估算（第 940 行附近）
> - `Rl(script, beat)` · 题材自动识别（第 907 行附近）
> - `Vu[]` · 30 条题材-导演-视觉风格映射表

这是灵境的"一键推荐"大脑：剧本文本 In → 题材 + 节奏 + Top3 导演 + 视觉风格 + 推荐时长 Out。

---

## 一、三层识别链

```
剧本文本
   │
   ├──①──→ Rl() 题材识别      → action/thriller/dialogue/lyrical/balanced
   │                              （驱动 narrative-pace-presets.json）
   │
   ├──②──→ autoMatchStyle() → Top3 {directorId, visualStyle, label, hitCount}
   │                              （驱动 director-styles.json + visual-styles.json）
   │
   └──③──→ Ku() 时长估算     → {total, breakdown, confidence}
                                  （驱动视频时长输入框）
```

---

## 二、① 题材识别（Rl 函数）

```
text = (script + " " + (beat.beatName||"")).toLowerCase()

if /(追逐|打斗|枪战|爆炸|战斗|搏斗|动作|逃亡|冲刺|对决|生死|危机|高速|追车)/.test(text):
    return "action"
if /(悬疑|惊悚|恐怖|诡异|凶案|密室|追凶|反转|谜团|真相|压迫)/.test(text):
    return "thriller"
if /(对话|谈判|争吵|辩论|审讯|采访|会议|课堂|独白|旁白)/.test(text):
    return "dialogue"
if beat.narrativeMode === "mood"
   or /(回忆|抒情|浪漫|温柔|诗意|治愈|宁静|唯美|思念|感伤|情绪)/.test(text):
    return "lyrical"
return "balanced"
```

正则全文存于 `wordlists/genre-keywords.json` → `genreRegex`。

---

## 三、② 风格匹配（autoMatchStyle 函数）

```
// Step 1: 统计每条题材库的命中次数
matches = []
for entry in Vu:                // 30 条 {keywords, directorId, visualStyle, label}
    hitCount = sum(1 for k in entry.keywords if k in script)
    if hitCount > 0:
        matches.push({ ...entry, hitCount })

// Step 2: 按命中次数降序排序
matches.sort((a, b) => b.hitCount - a.hitCount)

// Step 3: 去重 directorId 取 Top3
result = []
seen = new Set()
for m in matches:
    if not seen.has(m.directorId):
        seen.add(m.directorId)
        result.push(m)
    if result.length >= 3:
        break

// Step 4: 无命中回落
if matches.length === 0:
    result = [{ label:"🎬 标准电影感", directorId:"generic", visualStyle:"cinematic", hitCount:0 }]

return { recommendations: result, message: `检测到 ${matches.length} 个匹配题材` }
```

题材-风格全表见 `wordlists/genre-keywords.json` → `styleKeywords`（30 条）。

---

## 四、③ 时长估算（Ku 函数）

输入剧本文本，输出推荐视频总时长（秒）与分解。

### 公式

```
if script.length < 10:
    return { total: 15, breakdown: null }

// ① 台词字数 / 3.5s 每字
dialogueChars  = 所有 "「『""" 包裹内容的总字数
dialogueSec    = round(dialogueChars / 3.5)

// ② 动作动词命中 × 3.5s
actionVerbs    = /跑|走|跳|打|砍|挥|踢|飞|冲|追|闪|躲|推|拉|转|站|坐|倒|摔|握|抓|举|扔|拔|刺|劈|挡|滚|翻|爬|游|骑|开车|驾驶|射|瞄准|拳|掌|指|掐|撕|切|砸|敲|踏|蹬|弯腰|起身|回头|低头|抬头|侧身|俯身|跪|拥抱|亲吻|挥手|点头|摇头|叹气|深呼吸/g
actionCount    = matches(actionVerbs).length
actionSec      = round(actionCount × 3.5)

// ③ 场景切换 × 3s
sceneMarkers   = /\n\n|\n—|\n#|场景|地点[：:]|[室内外]|[日夜]|切到|转场|——|【.{1,8}】/g
sceneCount     = clamp(matches(sceneMarkers).length, 1, 20)
sceneSec       = sceneCount × 3

// ④ 描述性文字 / 18
descChars      = script.length - dialogueChars
descSec        = round(descChars / 18)

// 合计 + 下限保护
total          = dialogueSec + actionSec + sceneSec + descSec
total          = max(total, sceneCount × 8)
total          = ceil(total / 5) × 5          // 对齐 5 秒
total          = clamp(total, 15, 300)        // 最终区间 [15s, 300s]
```

### 置信度

```
confidence = script.length > 300 ? "high"
           : script.length > 100 ? "medium"
           : "low"
isShortText = script.length < 100
```

### 输出

```json
{
  "total": 45,
  "breakdown": {
    "dialogueSec": 14,
    "actionSec": 10,
    "sceneSec": 6,
    "descSec": 12,
    "sceneCount": 2,
    "dialogueChars": 49,
    "actionCount": 3
  },
  "isShortText": false,
  "confidence": "high"
}
```

---

## 五、合并调用（autoMatchStyle 主入口）

```
function autoMatchStyle(script):
    if not script: alert("请先输入剧本"); return

    pace     = Rl(script, currentBeat)                       // → paceKey
    match    = styleMatch(script)                            // → { recommendations, message }
    duration = Ku(script)                                    // → { total, breakdown, confidence }

    return { pace, match, duration }
```

---

## 六、UI 反馈策略（Wu 函数要点）

| 置信度 | 提示文案 | 行为 |
|---|---|---|
| `high` | 📊 高置信度 | 直接建议采纳 Top1 |
| `medium` | 📊 中置信度（建议确认） | 展示 Top3 让用户选 |
| `low` | 💡 文本较短，建议扩写后重新匹配 | 提示先用「自动扩写」再匹配 |

breakdown 展示：`台词14s · 动作10s · 场景6s · 描述12s`

---

## 七、一句话调用

```
@lingjing 智能匹配：给我推荐 Top3 导演风格和视频时长
@lingjing 识别这段剧本的题材节奏
@lingjing 帮我估算这段情节需要多少秒视频
```

Agent 执行步骤：
1. 读入核心情节文本
2. 串行调用 `Rl` → `styleMatch` → `Ku`
3. 输出结构化推荐报告（Markdown 表格）
4. 询问用户是否一键应用 Top1 推荐到 `lingjing-agent` 的当前项目配置

---

## 八、与其他模块的依赖

| 上游 | 下游 |
|---|---|
| `wordlists/genre-keywords.json` 提供题材正则 + styleKeywords | `narrative-pace-presets.json` 接 pace 驱动切镜 |
| `wordlists/director-styles.json` (47 位) | `lingjing-storyboard-skill.md` 接 Top1 导演写入系统提示词 |
| `wordlists/visual-styles.json` (13 种) | `seedance-format-standard.md` 接 visualStyle 生成画面描述 |

**禁止**：跳过匹配直接指定风格——会失去剧本-风格语义一致性。
