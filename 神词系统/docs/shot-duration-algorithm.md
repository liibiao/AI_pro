# 灵境 · 镜头时长分配算法（Shot Duration Algorithm）

> 源自 `soullensV69更新.html` 第 907 行 `jl(totalSec, shotCount, offset, maxShotSec, paceKey)` 函数
> 这是灵境"智能切镜"的数学引擎，决定了一段剧本的每一镜从第几秒到第几秒、节奏快慢、连接方式。

---

## 一、函数签名

```
jl(totalSec, shotCount, offset=0, maxShotSec=15, paceKey="balanced")
  → [{ index, start, end, duration, pace, link }, ...]
```

| 参数 | 含义 | 默认 |
|---|---|---|
| `totalSec` | 本场总时长（秒） | — |
| `shotCount` | 希望切分的镜头数 | — |
| `offset` | 全局起始偏移（用于多场景拼接时 A→B→C 连续累加） | 0 |
| `maxShotSec` | 全局允许的最大单镜时长 | 15 |
| `paceKey` | 节奏预设 key，来自 `narrative-pace-presets.json` | `balanced` |

---

## 二、算法五步

### Step 1 · 加载节奏预设
```
preset = ps(paceKey)   // {shotDivisor, phase[], pattern[], links[], minShotSec, maxShotSec, cuttingGuide}
minSec = preset.minShotSec || 2
```

### Step 2 · 确定基础时长
```
baseSec = (totalSec >= shotCount * minSec) ? minSec : 1
durations = [baseSec, baseSec, ..., baseSec]   // 长度 = shotCount
remaining = totalSec - shotCount * baseSec
```
**含义**：先保证每镜至少能放下最小时长，剩余秒数按权重分配。

### Step 3 · 计算每镜权重（phase × pattern）
```
for b in [0, shotCount):
    t = (shotCount === 1) ? 0 : b / (shotCount - 1)     // 归一化位置 0~1
    phaseWeight = (t < 0.2) ? phase[0]       // 起
                : (t < 0.5) ? phase[1]       // 承
                : (t < 0.75) ? phase[2]      // 转
                : phase[3]                   // 合
    patternWeight = pattern[b % pattern.length]
    weight[b] = phaseWeight × patternWeight
```

**含义**：
- **phase 轴**（起承转合）让权重随剧作结构起伏
- **pattern 轴**（长短交替循环）让相邻镜头形成节奏呼吸

### Step 4 · 按权重分配剩余秒数
```
sumWeight = sum(weight)
for b in [0, shotCount):
    extra = floor(remaining × weight[b] / sumWeight)
    extra = min(extra, maxShotSec - baseSec)   // 不超上限
    durations[b] += extra
```

### Step 5 · 补齐余数 + 分类 pace
```
leftover = totalSec - sum(durations)
while leftover > 0:
    for b in [0, shotCount):
        if durations[b] < maxShotSec:
            durations[b] += 1
            leftover -= 1
            if leftover === 0: break
    if 一轮都没能加:  break   // 已全部触顶

// 输出
cursor = offset
shots = []
for b in [0, shotCount):
    start = cursor
    end   = start + durations[b]
    cursor = end
    pace  = durations[b] ≤ 4 ? "快"
          : durations[b] ≤ 7 ? "中"
          : durations[b] ≤ 10 ? "慢"
          : "长"
    link = preset.links[b % preset.links.length]
    shots.push({ index: b+1, start, end, duration: durations[b], pace, link })
```

---

## 三、输出结构示例

输入：`jl(30, 6, 0, 15, "action")`（30 秒动作戏切 6 镜）

| index | start | end | duration | pace | link |
|---|---|---|---|---|---|
| 1 | 0 | 3 | 3 | 快 | 动作承接 |
| 2 | 3 | 8 | 5 | 中 | 速度切换 |
| 3 | 8 | 11 | 3 | 快 | 空间跃迁 |
| 4 | 11 | 16 | 5 | 中 | 冲突升级 |
| 5 | 16 | 23 | 7 | 中 | 动作承接 |
| 6 | 23 | 30 | 7 | 中 | 速度切换 |

---

## 四、一句话调用

```
@lingjing 用 action 节奏把这段 30s 剧本切成 6 镜
@lingjing 按 lyrical 节奏给 45s 抒情段落分配镜头
@lingjing 全片 180s 按链式拼接切镜，每场自动累加 offset
```

Agent 应：
1. 先调用 `autoMatchPace`（见 `auto-match-system.md`）识别 paceKey
2. 根据时长估算推荐 shotCount（见第五节）
3. 执行算法并回填到分镜表 `时间段` 列
4. 将每一镜的 `link` 写入 `链接类型` 列（可选）
5. 将 `cuttingGuide` 注入系统提示词指导 AI

---

## 五、shotCount 推荐公式

```
shotCount ≈ ceil(totalSec / preset.shotDivisor)
```
- action: `totalSec / 2.8`
- thriller: `totalSec / 4`
- balanced: `totalSec / 5`
- dialogue: `totalSec / 7.2`
- lyrical: `totalSec / 7.8`

**例**：45s 对话戏 → `45 / 7.2 ≈ 6-7 镜`

---

## 六、关键不变量

- **单镜下限**：`baseSec = preset.minShotSec`（不能低于此值，否则观众无法读镜）
- **单镜上限**：`maxShotSec`（传入参数，默认 15；生成器一般用 `preset.maxShotSec`）
- **总和守恒**：`sum(durations) === totalSec`（Step 5 的 while 循环保证）
- **时间轴连续**：`shots[b].start === shots[b-1].end`（不允许跳秒）

## 七、与分镜生成器的对接点

灵境 `lingjing-storyboard-skill` 在生成表格前调用此算法，将结果缓存为 `k.shots[]`，再把：
- `start/end` → `时间段` 列
- `pace` → 影响 `景别` 和 `运镜` 的选择（快=特写/跳切、慢=中全景/推拉）
- `link` → 写入提示词 `（与上镜衔接：XX）` 子句
- `cuttingGuide` → 注入系统提示词第 8-10 行

**禁止**：绕过算法人工写时间段——会破坏节奏数学一致性。
