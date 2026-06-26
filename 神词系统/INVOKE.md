# 灵境一句话调用指令总表

> **用途**：在主项目任意对话中通过一句话触发灵境工作流  
> **隔离承诺**：所有触发都只读取/写入 `lingjing/` 目录，不触碰主项目任何文件

---

## 🎯 标准触发前缀

所有指令以 **`@lingjing`** 开头，系统自动识别后切换到灵境工作流。

### 工作台快捷口令别名

除了 `@lingjing ...` 主指令外，工作台启动允许使用一个更短的快捷别名：

```text
@LJ start
```

统一实现约定如下：

1. **优先执行**：`cd /Users/billy/Documents/AI_pro/漫剧创作库/lingjing && ./lingjing-workbench start`
2. **等价目标**：启动本地 HTML 工作台并打开 `http://127.0.0.1:8766/workbench.html`
3. **降级策略**：仅当启动器脚本不可用时，才允许直接调用 `python3 lingjing/tools/workbench_server.py`

这条别名只用于启动工作台，不替代 `@lingjing` 的生成、查询、优化等主工作流指令。

---

## 📜 核心指令模板（按用途分类）

### 1. 完整三版本生成（最常用）

```
@lingjing 根据 [剧本路径或剧情文字] 生成三版本提示词
```

**可选参数**（追加在句尾）：
- `导演风格：[导演名或@id]`
- `视觉风格：[风格名或id]`
- `总时长：[秒数]`
- `平台：[seedance/jimeng/narrative/all]`

**示例**：
```
@lingjing 根据 projects/无限强化_漫剧_001/02-script/ep001-script.md 生成三版本提示词 导演风格：诺兰 视觉风格：电影写实 总时长：90秒
```

---

### 2. 快速生成（最短路径）

```
@lingjing 快速生成：[一句话剧情]
```

**示例**：
```
@lingjing 快速生成：雨夜天台告别戏，男主角脱下风衣披在女主角肩上
```

默认使用：电影写实 + 标准电影导演风格 + 15-30 秒。

---

### 3. 单版本定向生成

```
@lingjing 生成 [版本名]：[剧情]
```

版本名支持：`seedance` / `即梦` / `叙事` / `jimeng` / `narrative`

**示例**：
```
@lingjing 生成 即梦：深夜便利店，少女在货架间穿梭挑选饮料
@lingjing 生成 seedance：高能打斗，男主破天剑斩向BOSS
@lingjing 生成 叙事：黄昏海边，老人独自面对大海
```

---

### 4. 风格查询

```
@lingjing 查询 [导演名]
@lingjing 查询 视觉风格：[风格关键词]
@lingjing 推荐导演：[剧情类型]
```

**示例**：
```
@lingjing 查询 诺兰
@lingjing 查询 视觉风格：仙侠
@lingjing 推荐导演：科幻悬疑
```

---

### 5. 分镜重写/优化

```
@lingjing 优化分镜：[粘贴分镜或文件路径]
@lingjing 转叙事版：[粘贴 Seedance 长版或文件路径]
@lingjing 转即梦版：[粘贴 Seedance 长版或文件路径]
```

---

### 6. 词库查询

```
@lingjing 列出所有导演
@lingjing 列出所有视觉风格
@lingjing 列出运镜方式
@lingjing 列出光影布光方式
```

---

## 🔧 高级指令

### 智能匹配系统

```
@lingjing 智能匹配：给我推荐 Top3 导演风格和视频时长
@lingjing 识别这段剧本的题材节奏
@lingjing 帮我估算这段情节需要多少秒视频
```

### 镜头时长分配

```
@lingjing 用 action 节奏把这段 30s 剧本切成 6 镜
@lingjing 按 lyrical 节奏给 45s 抒情段落分配镜头
@lingjing 全片 180s 按链式拼接切镜，每场自动累加 offset
```

### 链式引擎（长剧本专用）

```
@lingjing 链式生成：把这段 180s 剧本切成 5 场，分段生成后拼接
@lingjing 从断点恢复上次中断的链式生成
@lingjing 取消当前链式生成，保存断点
```

### 资产提取

```
@lingjing 提取资产：从这段剧本生成人物卡、场景卡、道具卡
@lingjing 查看当前项目的资产库
@lingjing 在分镜生成时自动引用资产库
```

### 安全审核

```
@lingjing 安全预检：检查这段剧本是否有敏感词
@lingjing 自动替换：把所有敏感词替换为安全词
@lingjing 生成安全报告：列出所有检测到的问题
```

### 台词锁定验证

```
@lingjing 检查分镜表的台词锁定是否通过
@lingjing 提取剧本中所有台词并生成锁定清单
@lingjing 开启忠实模式，禁止改写台词
```

### 批量场景生成

```
@lingjing 批量生成：
场景1：[剧情A]
场景2：[剧情B]
场景3：[剧情C]
统一风格：[导演+视觉风格]
```

### 镜头合并建议

```
@lingjing 合并建议：[粘贴多镜段]
```

### 提示词降级（长 → 短）

```
@lingjing 降级：[粘贴长提示词]  # 适合从 seedance 降级到 5s 单镜
```

---

## 📂 工作流自动路径

| 指令类型 | 读取路径 | 输出路径 |
|---|---|---|
| 完整生成 | 用户提供的剧本路径 | `lingjing/outputs/[项目目录]/seedance/` `即梦/` `叙事/` + `index.html` |
| 快速生成 | 无（纯文字输入） | `lingjing/outputs/[自动提炼目录]/...` |
| 风格查询 | `lingjing/wordlists/*.json` | 对话返回 |
| 分镜优化 | 用户提供的分镜 | `lingjing/outputs/[优化目录]/...` |

---

## 🔒 隔离保证

灵境工作流执行时：

1. **只读资源**：`lingjing/wordlists/*.json`、`lingjing/docs/*.md`、`lingjing/skills/*.md`、`lingjing/templates/*.md`
2. **只写路径**：`lingjing/outputs/`（不存在会自动创建）
3. **不触碰**：
   - `projects/*`（主项目创作库）
   - `agents/*`（主项目 agents）
   - `skills/*`（主项目 skills，除非用户显式要求）
   - `docs/*`（主项目方法论）
   - `templates/*`（主项目模板）
   - `tools/*`（主项目工具脚本）
4. **可读剧本**：仅当用户显式传入 `projects/` 下的剧本路径时，**只读不写**

---

## 💡 调用检测逻辑

系统收到用户消息时：

```python
if message.startswith("@lingjing"):
    # 进入灵境工作流
    load_agent("lingjing/agents/lingjing-agent.md")
    load_skills([
        "lingjing/skills/lingjing-director-skill.md",
        "lingjing/skills/lingjing-storyboard-skill.md",
        "lingjing/skills/lingjing-integrate-skill.md",
    ])
    load_wordlists("lingjing/wordlists/")
    # 解析指令 → 执行对应流程
else:
    # 主项目正常工作流，灵境不介入
    pass
```

---

## 📖 完整文档索引

| 文件 | 用途 |
|---|---|
| `lingjing/README.md` | 项目总览 |
| `lingjing/INVOKE.md` | **本文件（一句话调用总表）** |
| `lingjing/agents/lingjing-agent.md` | 主控 Agent 定义 |
| `lingjing/skills/lingjing-director-skill.md` | 导演讲戏技能 |
| `lingjing/skills/lingjing-storyboard-skill.md` | 分镜生成技能 |
| `lingjing/skills/lingjing-integrate-skill.md` | 三版本整合技能 |
| `lingjing/skills/lingjing-asset-extraction-skill.md` | 资产提取技能（人物/场景/道具卡） |
| `lingjing/docs/three-version-methodology.md` | 三版本方法论 |
| `lingjing/docs/seedance-format-standard.md` | Seedance 格式标准 |
| `lingjing/docs/narrative-prompt-rules.md` | 叙事提示词规则 |
| `lingjing/docs/shot-duration-algorithm.md` | 镜头时长分配算法（jl 函数） |
| `lingjing/docs/auto-match-system.md` | 智能匹配系统（题材识别+时长估算） |
| `lingjing/docs/chain-engine-workflow.md` | 链式引擎工作流（三阶段+断点续传） |
| `lingjing/docs/dialogue-lock-rules.md` | 台词锁定规则（最高优先级） |
| `lingjing/docs/safety-layer.md` | 审核安全层（红区词检测） |
| `lingjing/wordlists/director-styles.json` | 47 位导演词库 |
| `lingjing/wordlists/visual-styles.json` | 13 种视觉风格 |
| `lingjing/wordlists/camera-language.json` | 运镜语言库 |
| `lingjing/wordlists/lighting-atmosphere.json` | 光影氛围库 |
| `lingjing/wordlists/narrative-pace-presets.json` | 5 种叙事节奏预设 |
| `lingjing/wordlists/genre-keywords.json` | 题材关键词库（30 条风格映射） |
| `lingjing/templates/seedance-template.md` | Seedance 模板 |
| `lingjing/templates/jimeng-template.md` | 即梦精简模板 |
| `lingjing/templates/narrative-template.md` | 叙事模板 |

---

## 🚀 立即试用

复制以下任一指令到对话框：

```
@lingjing 快速生成：深夜地铁末班车，陌生男女对视的三秒沉默
```

```
@lingjing 查询 王家卫
```

```
@lingjing 列出所有导演
```

---

**版本**：灵境 6.9 · INVOKE 入口 v2.0（方案 A 全量补齐版）  
**更新**：2026-04-20
