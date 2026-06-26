# 灵境 (SoulLens) 提示词生成工作流

> **完全隔离的三版本提示词生成系统**  
> 从剧本/故事自动生成 **即梦精简版** / **Seedance 长版母稿** / **叙事性提示词** 三个版本

---

## 📦 目录结构

```
lingjing/
├── README.md              # 本文件
├── INVOKE.md              # 一句话调用指令总表（20+ 指令）
├── agents/                # Agent 定义
│   └── lingjing-agent.md
├── skills/                # 技能文件
│   ├── lingjing-director-skill.md
│   ├── lingjing-storyboard-skill.md
│   ├── lingjing-integrate-skill.md
│   └── lingjing-asset-extraction-skill.md  # 资产提取（人物/场景/道具卡）
├── docs/                  # 方法论文档
│   ├── three-version-methodology.md
│   ├── seedance-format-standard.md
│   ├── narrative-prompt-rules.md
│   ├── shot-duration-algorithm.md          # 镜头时长分配算法
│   ├── auto-match-system.md                # 智能匹配系统
│   ├── chain-engine-workflow.md            # 链式引擎（三阶段+断点续传）
│   ├── dialogue-lock-rules.md              # 台词锁定规则（最高优先级）
│   └── safety-layer.md                     # 审核安全层
├── wordlists/             # 词库系统
│   │  # ── 基础六大词库（v1）──
│   ├── director-styles.json                # 47 位导演风格
│   ├── visual-styles.json                  # 13 种视觉风格
│   ├── camera-language.json                # 运镜语言（景别/运镜/角度/构图）
│   ├── lighting-atmosphere.json            # 光影氛围（布光/色温/大气效果）
│   ├── narrative-pace-presets.json         # 5 种叙事节奏预设
│   ├── genre-keywords.json                 # 30 条题材-风格映射
│   │  # ── 视觉系统词库（v2·扩展）──
│   ├── perspective-system.json             # 八大叙事视角体系（POV/OTS/行为观察/上帝/鱼眼/动态/虫视角/窥视）
│   ├── camera-psychology.json              # 六大心理运镜 + 运动模糊分级 + 变速协议（Hit Stop/升格/降格/子弹时间）
│   ├── lighting-dynamics.json              # 光动态化（光源运动/遮挡物运动/主体运动/叙事光功能）
│   ├── vfx-design.json                     # 视觉特效（光源绑定/热畸变/余韵残留/能量类型）
│   ├── atmosphere-interaction.json         # 环境介质互动（风/雨/雾尘/雪寒 + 绿幕测试）
│   ├── environmental-destruction.json      # 材质破坏物理（石材/木材/玻璃/金属 + 崩塌三阶段）
│   ├── action-speed.json                   # 动作速度（速度节奏6阶段/身体力学/环境联动/镜头反应/高张力构图/模板库）
│   ├── composition-geometry.json           # 构图几何（9:16坐标/三层空间/轴线/队形模板/群戏分组/读点保护）
│   ├── transition-montage.json             # 转场蒙太奇（Match Cut/Action Match/J-Cut/L-Cut/遮挡/拉焦）
│   │  # ── 听觉系统词库（v2·扩展）──
│   ├── sound-design.json                   # 声音设计（环境底噪/拟音/特效音/状态音/BGM克制/混音）
│   └── dialogue-voice.json                 # 对白配音（任务分类/承载方式/声线参数/角色绑定/模板）
├── templates/             # 提示词模板
│   ├── seedance-template.md
│   ├── jimeng-template.md
│   └── narrative-template.md
├── tools/                 # 输出目录初始化工具
│   └── init_outputs.py
└── outputs/               # 正式输出目录（自动创建项目子目录）
    ├── README.md
    └── index.html
```

---

## 🚀 一句话调用

在主项目任意位置，使用以下指令触发灵境工作流：

```
@lingjing 根据 [剧本文件路径或剧情描述] 生成三版本提示词
```

**示例：**
```
@lingjing 根据 projects/无限强化_漫剧_001/02-script/ep001-script.md 生成三版本提示词
```

或直接粘贴剧情：
```
@lingjing 生成提示词：林天在深夜办公室独自加班，突然灵纹觉醒...
```

> 📌 **完整指令清单请查看 [`INVOKE.md`](./INVOKE.md)**（包含快速生成、单版本生成、风格查询、词库查询、批量生成等 10+ 指令）
>
> 🧭 **工作台入口**：
> - 在 `lingjing/` 目录中一条命令启动：`./lingjing-workbench`
> - 网页交互工作台：`http://127.0.0.1:8766/workbench.html`
> - 命令行交互工作台：`python3 lingjing/tools/workbench_cli.py`
> - 双工作台使用文档：[`docs/workbench-usage.md`](./docs/workbench-usage.md)
>
> 💬 **聊天快捷口令约定**：你也可以直接对我说 `@LJ start`，我会优先执行 `cd /Users/billy/Documents/AI_pro/漫剧创作库/lingjing && ./lingjing-workbench start`，启动本地 Python 服务并打开 HTML 工作台预览；只有在启动器不可用时，才降级为直接调用 `workbench_server.py`。

---

## 🎯 核心特性

### 1. 三版本自动生成
- **即梦精简版**：去除 @标签、简化描述、适合即梦平台直接投喂
- **Seedance 长版母稿**：完整字段（主体/空间/光影/镜头/台词/音效）+ @标签引用
- **叙事性提示词**：段落式叙事描述，适合 Seedance 2.0 / 可灵 / Wan 等平台

### 2. 智能匹配系统（新增）
- **题材自动识别**：action / thriller / dialogue / lyrical / balanced
- **时长智能估算**：台词×3.5s + 动作×3.5s + 场景×3s + 描述/18
- **风格智能推荐**：30 条题材关键词 → Top3 导演+视觉风格（含置信度）

### 3. 镜头时长分配算法（新增）
- **5 种节奏预设**：action / thriller / dialogue / lyrical / balanced
- **phase × pattern 权重**：起承转合 × 长短交替循环
- **自动分配时长**：总时长 ÷ shotDivisor → 镜头数 → 按权重分配每镜秒数

### 4. 链式引擎（新增，≥180s 长剧本专用）
- **三阶段流程**：A·剧本切分 → B·分段生成 → C·无缝拼接
- **断点续传**：中途中断可从失败场次恢复
- **动作桥接**：每场最后一镜的动作/朝向/情绪传递给下一场

### 5. 资产提取（新增）
- **人物卡**：外貌、服装、性格、关系 → @标签引用
- **场景卡**：空间三层、光影氛围、适用题材
- **道具卡**：外观、材质、功能、象征意义

### 6. 台词锁定（新增，最高优先级）
- **三阶段锁定**：剧本切分时 → 分镜生成时 → 质量检查时
- **一字不差**：台词原文强制保留，凌驾于所有其他规则
- **忠实模式**：关闭 AI 扩写，1:1 视觉化

### 7. 审核安全层（新增）
- **红区词检测**：政治敏感/暴力血腥/色情低俗/违法犯罪
- **自动替换**：敏感词 → 安全词（如"砍头"→"击败"）
- **三种模式**：拦截模式 / 替换模式 / 仅提示模式

### 8. 导演风格库（47 位大师）
- 诺兰（非线性叙事、IMAX 构图）
- 王家卫（色彩诗意、慢镜头）
- 宫崎骏（手绘质感、自然光）
- 昆汀（暴力美学、复古配乐）
- ...（完整列表见 `wordlists/director-styles.json`）

### 9. 视觉风格库（13 种）
- 电影写实 / 日系动画 / 3D 国风仙侠 / 水墨国风 / 水彩画 / 油画 / 漫画 / 像素风 / 黑白电影 / 奇幻 / 赛博朋克 / 3D 渲染 / 概念艺术

### 10. 运镜语言库
- 推轨 (Dolly In) / 跟拍 (Tracking) / 横移 (Truck) / 环绕 (Arc) / 升降 (Crane) / 手持 (Handheld) / 定镜 (Static) / 拉焦 (Rack Focus)
- 景别：ELS 极远景 / LS 远景 / FS 全景 / MS 中景 / MCU 中近景 / CU 近景 / ECU 特写
- 机位角度：平视 / 微仰 / 微俯 / 倾斜 / 顶拍 / 鸟瞰

### 11. 光影氛围库
- 自然光三点布光 / 高对比冷蓝钢灰调 / 沙漠黄金时刻 / 霓虹灯暗调 / 青橙双色调 / 柔光暖色调 / 剪影光 / 冷白荧光灯

### 12. 视觉系统扩展词库（v2·新增）
- **八大叙事视角**（perspective-system.json）：POV/OTS/行为观察/上帝视角/鱼眼/动态/虫视角/窥视 + 权力映射 + 切换情绪杠杆
- **心理运镜**（camera-psychology.json）：侵入施压/疏离遗弃/偷窥焦虑/迷失失控/环绕宿命/FPV穿越 + 运动模糊分级 + Hit Stop/升格/降格/子弹时间
- **光动态化**（lighting-dynamics.json）：光源自身运动/遮挡物运动/主体运动导致光影变化 + 叙事光功能（情绪信号/注意力引导/时间节奏）
- **视觉特效**（vfx-design.json）：光源绑定/热畸变冲击波/余韵残留（余烬+硝烟+环境疤痕）/能量类型（灵力/雷电/火焰/冰霜/暗影）
- **环境介质**（atmosphere-interaction.json）：风/雨/雾尘/雪寒的物理交互 + 绿幕测试
- **材质破坏**（environmental-destruction.json）：石材/木材/玻璃/金属的物理碎裂 + 巨型崩塌三阶段
- **动作速度**（action-speed.json）：速度节奏6阶段/身体力学5类/环境联动/镜头反应/高张力构图/经典模板
- **构图几何**（composition-geometry.json）：9:16坐标系/三层空间/180°轴线/队形模板/群戏分组锁定/读点保护
- **转场蒙太奇**（transition-montage.json）：Match Cut/Action Match/J-Cut/L-Cut/遮挡转场/拉焦转场

### 13. 听觉系统扩展词库（v2·新增）
- **声音设计**（sound-design.json）：环境底噪（5种空间类型）/拟音（脚步/衣料/武器/身体）/特效音（蓄力→骤静→命中→余波）/状态音（呼吸/心跳/耳鸣）/BGM克制与留白/混音指导
- **对白配音**（dialogue-voice.json）：对白任务分类/分镜承载方式/声线参数（说话人+情绪+语速+停顿+贴口型）/角色绑定（年龄+身份+性格+阶段+权力动态）

---

## 📋 工作流程

```
剧本输入
    ↓
【灵境 Agent】分析剧情 + 选择导演风格 + 视觉风格
    ↓
【Director Skill】生成分镜表（含时间轴、景别、运镜、画面描述、光影氛围）
    ↓
【Storyboard Skill】转换为 Seedance 长版母稿（六个固定段 + @标签）
    ↓
【Integrate Skill】并行生成三版本
    ├─ 即梦精简版（去 @标签 + 精简描述）
    ├─ Seedance 长版母稿（完整字段）
    └─ 叙事性提示词（段落式叙事）
    ↓
输出到 lingjing/outputs/
```

---

## 🔧 技术细节

### Seedance 长版母稿格式
```
【0s–5s】
主体：@人物1（情绪状态）[朝向：面朝XX] 正在 [连续动作链] 
空间：前景-[元素] 中景-[主体] 背景-[氛围] 
光影：[光源方向+色温+明暗反差] 
镜头：[景别，叙事性运镜，机位高度] 
台词：第2s @人物1："台词原文" 
音效：环境层-[底噪] 动作层-[声响] 情绪层-[配乐]
```

### 六个固定段
1. **环境联动**：场景与动作的互动关系
2. **光线**：光源、色温、明暗比
3. **对白配音**：台词原文 + 语气指导
4. **音效设计**：环境层 + 动作层 + 情绪层
5. **画质**：视觉风格 + 画面质感
6. **负面提示词**：禁止元素列表

---

## ⚠️ 隔离说明

- **完全独立**：不依赖主项目任何文件，不修改主项目任何配置
- **词库独立**：灵境词库与主项目词库完全分离
- **输出独立**：生成结果输出到 `lingjing/outputs/[项目目录]/`，目录名可从剧本/小说正文自动提炼，不污染主项目 `projects/`
- **调用独立**：通过 `@lingjing` 前缀触发，不影响主项目工作流

---

## 📝 版本信息

- **灵境版本**：6.9 链式引擎版（方案 A 全量补齐）
- **提取日期**：2026-04-20
- **来源**：soullensV69更新 (1).html（4236 行 / 806KB）
- **适配平台**：即梦 / Seedance 2.0 / 可灵 / Wan / Luma / Runway
- **新增能力**：智能匹配 + 镜头算法 + 链式引擎 + 资产提取 + 台词锁定 + 安全审核

---

## 📞 使用示例

### 示例 1：从剧本文件生成
```
@lingjing 根据 projects/test/script.md 生成三版本提示词，导演风格：诺兰，视觉风格：电影写实
```

### 示例 2：直接输入剧情
```
@lingjing 生成提示词：
深夜办公室，林天独自加班。突然，他手腕上的灵纹开始发光，整个房间的物体开始漂浮...
导演风格：诺兰，视觉风格：科幻电影
```

### 示例 3：快速生成（使用默认风格）
```
@lingjing 快速生成：一场雨中的告别戏
```

---

**注意**：首次使用需确保已配置 API Key（在主项目设置中配置即可，灵境会自动读取）
