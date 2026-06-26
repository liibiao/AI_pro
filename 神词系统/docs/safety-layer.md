# 灵境 · 审核安全层（Safety Layer）

> 源自 `soullensV69更新.html` 第 3766/3774 行 `autoSafetyCheck` + `sanitizePrompt` 函数
> 这是灵境的"内容合规保障"：红区词检测 + 自动替换 + 拦截机制，确保生成的提示词能通过平台审核。

---

## 一、核心能力

**输入**：用户输入的剧本文本 / 生成的提示词

**输出**：
- **检测结果**：`{ detectedRedZone: [...], replacements: [...], isSafe: boolean }`
- **净化文本**：替换敏感词后的安全版本

**触发时机**：
1. 用户点击"生成分镜"前（剧本预检）
2. AI 生成提示词后（提示词后检）
3. 用户手动点击"🛡 安全预检"按钮

---

## 二、红区词库（示例）

```javascript
const redZoneKeywords = [
    // 政治敏感
    "习近平", "政变", "六四", "法轮功", "台独", "藏独",
    
    // 暴力血腥
    "砍头", "肢解", "虐杀", "活埋", "凌迟", "开膛破肚",
    
    // 色情低俗
    "裸体", "性交", "强奸", "卖淫", "色情", "淫秽",
    
    // 违法犯罪
    "制毒", "贩毒", "走私", "洗钱", "绑架勒索", "恐怖袭击",
    
    // 封建迷信
    "跳大神", "巫蛊", "降头", "养小鬼", "诅咒杀人",
    
    // 其他高危
    "自杀教唆", "邪教", "人体炸弹", "生化武器"
]

const safeReplacements = {
    "砍头": "击败",
    "肢解": "重伤",
    "虐杀": "击倒",
    "裸体": "轻装",
    "制毒": "制药",
    "贩毒": "走私",
    "自杀": "牺牲",
    // ... 更多映射
}
```

**注意**：实际词库应从平台审核规则动态更新，此处仅为示例。

---

## 三、检测函数（sanitizePrompt）

```javascript
function sanitizePrompt(text) {
    const detectedRedZone = []
    const replacements = []
    let cleanText = text
    
    // Step 1: 检测红区词
    for (const keyword of redZoneKeywords) {
        const regex = new RegExp(keyword, 'gi')
        const matches = text.match(regex)
        if (matches) {
            detectedRedZone.push({
                keyword,
                count: matches.length,
                positions: findAllPositions(text, keyword)
            })
        }
    }
    
    // Step 2: 自动替换（如果开启 autoSafety）
    if (autoSafetyEnabled) {
        for (const keyword of detectedRedZone.map(d => d.keyword)) {
            const replacement = safeReplacements[keyword] || "[已屏蔽]"
            const regex = new RegExp(keyword, 'gi')
            cleanText = cleanText.replace(regex, replacement)
            replacements.push({ original: keyword, replacement })
        }
    }
    
    return {
        detectedRedZone,
        replacements,
        isSafe: detectedRedZone.length === 0,
        cleanText
    }
}
```

---

## 四、三种工作模式

### 模式 1 · 拦截模式（默认）

**行为**：检测到红区词立即中止生成，弹窗提示

```javascript
if (autoSafetyEnabled && result.detectedRedZone.length > 0) {
    alert(`⚠️ 审核拦截
检测到 ${result.detectedRedZone.length} 个敏感词：
${result.detectedRedZone.map(d => `- ${d.keyword} (${d.count}次)`).join('\n')}

请修改剧本后重试，或关闭"自动安全审核"（风险自负）。`)
    return  // 中止生成
}
```

**适用场景**：商业项目、平台分发、需要严格合规

---

### 模式 2 · 替换模式

**行为**：自动替换敏感词为安全词，继续生成

```javascript
if (autoSafetyEnabled && result.detectedRedZone.length > 0) {
    console.warn(`[Safety] 自动替换 ${result.replacements.length} 个敏感词`)
    script = result.cleanText  // 使用净化后的文本
    showToast(`🛡 已自动替换 ${result.replacements.length} 个敏感词`)
}
```

**适用场景**：个人创作、快速迭代、可接受语义微调

---

### 模式 3 · 仅提示模式

**行为**：检测到敏感词仅提示，不拦截不替换

```javascript
if (result.detectedRedZone.length > 0) {
    showWarning(`⚠️ 检测到 ${result.detectedRedZone.length} 个潜在敏感词，建议修改`)
}
// 继续生成
```

**适用场景**：内部测试、艺术创作、用户自行承担风险

---

## 五、UI 交互

### 5.1 开关控件（第 3766 行）

```html
<label>
    <input type="checkbox" id="autoSafetyCheck" checked>
    <span>自动安全审核</span>
</label>
<div id="wordFilterDesc">
    开启：自动将敏感词替换为安全词
</div>
```

**状态持久化**：
```javascript
localStorage.setItem('autoSafetyEnabled', autoSafetyCheck.checked)
```

---

### 5.2 安全预检按钮（第 3406 行）

```html
<button id="safetyPreCheckBtn" title="内容安全审核">
    🛡 安全预检
</button>
```

**点击行为**：
```javascript
safetyPreCheckBtn.onclick = () => {
    const script = document.getElementById('plotInput').value
    const result = sanitizePrompt(script)
    
    if (result.isSafe) {
        showModal('✅ 安全检查通过', '未检测到敏感词，可以安全生成。')
    } else {
        showSafetyReport(result)  // 显示详细报告
    }
}
```

---

### 5.3 安全报告弹窗（第 3885 行）

```html
<div id="safetyModal" class="hidden">
    <div id="safetyReport"></div>
</div>
```

**报告内容**：
```javascript
function showSafetyReport(result) {
    const html = `
        <h3>🛡 安全审核报告</h3>
        <p>检测到 ${result.detectedRedZone.length} 个敏感词：</p>
        <ul>
            ${result.detectedRedZone.map(d => `
                <li>
                    <strong>${d.keyword}</strong> 
                    (出现 ${d.count} 次，位置：${d.positions.join(', ')})
                    ${safeReplacements[d.keyword] ? 
                        `→ 建议替换为「${safeReplacements[d.keyword]}」` : 
                        '→ 建议删除'}
                </li>
            `).join('')}
        </ul>
        <button onclick="applyAutoReplace()">一键替换</button>
        <button onclick="closeModal()">手动修改</button>
    `
    document.getElementById('safetyReport').innerHTML = html
    document.getElementById('safetyModal').classList.remove('hidden')
}
```

---

## 六、分级审核策略

### Level 1 · 硬拦截（红区词）

**触发**：政治敏感、暴力血腥、色情低俗

**行为**：立即中止，强制修改

**示例**：
```
输入："主角砍下敌人的头颅"
检测：命中"砍头"（红区词）
输出：❌ 拦截，提示"请修改为'击败敌人'"
```

---

### Level 2 · 软提示（灰区词）

**触发**：武侠打斗、恐怖氛围、争议话题

**行为**：提示风险，允许继续

**示例**：
```
输入："鬼魂从墙壁中穿出"
检测：命中"鬼魂"（灰区词）
输出：⚠️ 提示"灵异题材可能被限流，建议改为'幻影'"
```

---

### Level 3 · 白名单（安全词）

**触发**：正能量、主旋律、科普教育

**行为**：加速审核，优先推荐

**示例**：
```
输入："主角弘扬传统文化"
检测：命中"传统文化"（白名单）
输出：✅ 安全，建议突出此主题
```

---

## 七、一句话调用

```
@lingjing 安全预检：检查这段剧本是否有敏感词
@lingjing 自动替换：把所有敏感词替换为安全词
@lingjing 生成安全报告：列出所有检测到的问题
```

Agent 执行步骤：
1. 读入剧本文本
2. 调用 `sanitizePrompt(script)`
3. 如 `isSafe === false`，输出详细报告
4. 如开启自动替换，应用 `cleanText`
5. 询问用户是否继续生成

---

## 八、与其他模块的依赖

| 上游 | 下游 |
|---|---|
| 剧本文本（用户输入） | `lingjing-storyboard-skill.md` 生成前预检 |
| `dialogue-lock-rules.md` 台词锁定 | 替换敏感词后需重新验证台词一致性 |
| `seedance-format-standard.md` 提示词 | 生成后对提示词再次检测 |

**禁止**：绕过安全层直接生成——会导致内容被平台拦截或账号封禁。

---

## 九、高级功能（可选）

### 9.1 动态词库更新

```javascript
async function updateRedZoneKeywords() {
    const response = await fetch('https://api.example.com/safety/keywords')
    const data = await response.json()
    redZoneKeywords = data.keywords
    safeReplacements = data.replacements
    localStorage.setItem('redZoneKeywords', JSON.stringify(data))
}

// 每 24 小时自动更新
setInterval(updateRedZoneKeywords, 24 * 60 * 60 * 1000)
```

---

### 9.2 上下文语义分析

**问题**：单纯关键词匹配会误判

**示例**：
```
"主角学习制药技术" → 误判"制毒"
"历史纪录片讲述六四运动" → 误判政治敏感
```

**解决**：引入语义分析

```javascript
async function semanticSafetyCheck(text) {
    const response = await callAI(`
        请判断以下文本是否包含违规内容（政治敏感/暴力血腥/色情低俗）：
        ${text}
        
        输出 JSON：{"isSafe": true/false, "reason": "..."}
    `)
    return JSON.parse(response)
}
```

---

### 9.3 用户自定义词库

```javascript
// 用户可添加项目特定的敏感词
const userCustomKeywords = [
    "公司机密项目名",
    "真实人名",
    "品牌商标"
]

// 合并到检测词库
const finalKeywords = [...redZoneKeywords, ...userCustomKeywords]
```

---

## 十、错误示例与正确示例

### ❌ 错误示例 1：直接使用敏感词

**输入**：
```
"反派残忍地砍下主角的头颅，鲜血喷涌而出。"
```

**检测**：
```
❌ 命中红区词："砍头"（1次）
❌ 命中红区词："鲜血喷涌"（1次）
```

---

### ✅ 正确示例 1：替换为安全词

**输入**：
```
"反派一剑击败主角，主角倒地不起。"
```

**检测**：
```
✅ 安全，未检测到敏感词
```

---

### ❌ 错误示例 2：政治敏感

**输入**：
```
"故事背景设定在某国政变期间..."
```

**检测**：
```
❌ 命中红区词："政变"（1次）
```

---

### ✅ 正确示例 2：改为虚构设定

**输入**：
```
"故事背景设定在架空王国的权力更迭期间..."
```

**检测**：
```
✅ 安全，未检测到敏感词
```

---

## 十一、日志示例

```
[Safety] 开始安全预检...
[Safety] 检测到 2 个红区词：
  - "砍头" (1次，位置：第45字)
  - "鲜血喷涌" (1次，位置：第52字)
[Safety] 自动替换模式已开启
[Safety] 替换："砍头" → "击败"
[Safety] 替换："鲜血喷涌" → "倒地"
[Safety] ✅ 净化完成，可安全生成
```

**拦截日志**：
```
[Safety] ❌ 审核拦截
[Safety] 检测到 1 个红区词："政变"
[Safety] 建议修改为："权力更迭" 或 "王位争夺"
[Safety] 生成已中止，请修改后重试
```
