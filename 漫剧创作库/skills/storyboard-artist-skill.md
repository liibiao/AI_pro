# storyboard-artist-skill — 分镜师技能

## 技能定位
把 `Director` 的讲戏、调度、动作逻辑、人物走位与视觉意图，拆成**可执行的故事板生产包**。核心目标不是写漂亮话，也不是以提示词为主交付，而是稳定产出可以直接进入 `04-storyboard/`、`director-boards/` 与下游生成说明的镜头级结构，让后续生成、改稿、校验都有统一底座。

> `storyboard-artist-skill` 负责整场戏的分镜总装；当任务聚焦“单镜怎么拍、怎么动、为什么停在这里”时，应调用独立的 `shot-design-skill` 作为专项镜头能力层。

## 适用任务
- 基于导演讲戏本输出分镜表
- 把复杂动作、复杂情绪动作、多人调度拆成稳定镜头组
- 设计镜头顺序、景别差、信息差和主读点路径
- 建立站位 / 朝向 / 距离 / 高低位 / 前后景关系
- 生成故事板生产包，并在需要时派生下游配套生成说明
- 修复已有分镜稿中的节拍混乱、镜头漂移、位置关系不清、爆点无结果等问题
- 为 `Studio` 提供可直接执行的故事板、镜头说明和模型适配说明
- 将视频分镜表转换为 GPT 生图可执行的静态分镜板、9-panel storyboard、4×4 动作分解参考表和长卷叙事图资产
- 基于剧本、分镜表、资产图和导演讲戏，规划 D12-Sora2 / D15-Seedance2 专业导演故事板图的格数、每格时长、站位、空间关系、运动关系、声音和连续性

## 不负责的事
- 不负责重写故事与核心戏剧冲突（那是 `Writer` / `Director` 的职责）
- 不负责角色美术定型与风格设定（那是 `Director` / 美术职责）
- 不负责最终生成与平台投递（那是 `Studio` 的职责）
- 不擅自篡改导演已锁定的戏核、关系核和角色成长阶段

## ⚠️ 强制前置检查（写任何提示词之前必须执行）

**以下方法论文档必须根据任务类型自动加载，不需要用户提醒。违反本节的行为等同于不合格输出。**

> **元规则：当 `docs/` 下新增任何方法论文档时，必须自动评估其归属分类并纳入下方对应表格。评估标准：该文档是否包含可在提示词编写中直接执行的视觉/听觉/镜头/动作/环境/转场规则。新增后同步更新本节、`seedance-action-skill.md` 强制前置检查、`docs/workflow.md` Phase 3 门禁表。**

### 通用必读（所有提示词任务）
| 文档 | 用途 |
|------|------|
| `docs/storyboard-methodology.md` | 分镜总方法论（戏核→空间→镜头任务→节拍→平台执行五层模型） |
| `docs/gpt-image-director-storyboard-methodology.md` | GPT-image-2 专业导演故事板图体系（D12-Sora2 / D15-Seedance2 主交付链路） |
| `docs/director-storyboard-deliverable-standard.md` | 专业导演故事板图交付物规范 |
| `docs/storyboard-continuity-standard.md` | 故事板板内 / 板间 / 集间连续性规范 |
| `docs/storyboard-video-model-adaptation-standard.md` | Sora2 / Seedance2 视频模型适配规范 |
| `docs/scene-storyboard-formulas.md` | 分场景分镜公式库（文戏/对峙/悬疑/动作/追逐/转场的骨架公式） |
| `docs/prompt-standards.md` | 抽象词拆解、推荐结构、配套生成说明写法 |
| `docs/seedance-prompt-engineering.md` | Seedance 模型适配说明（时长策略、变量系统、镜头密度） |
| `docs/seedance-multimodal-guide.md` | Seedance 多模态创作指南（图/视频/音频/文本四模态调度） |
| `docs/dual-format-prompt-methodology.md` | 下游配套生成说明方法论（由故事板生产包派生） |
| `docs/long-prompt-detail-gate.md` | 下游生成说明详细度质检门禁（不作为中游主交付） |
| `docs/camera-shot-methodology.md` | 运镜与镜头运用总方法论（镜头任务→景别→视角→运镜→起幅落幅→结果兑现） |
| `docs/camera-language-dictionary.md` | 景别/运镜/角度统一命名 |
| `docs/perspective-system-emotional-mapping.md` | 视角情绪映射八大体系 + 三种切换节奏流 |
| `docs/lighting-dynamics-prompt-guide.md` | 光动态化（光怎么动、怎么随时间变化） |
| `docs/lighting-color-aesthetics-standard.md` | 光影与色彩美学（消除平亮棚拍感、用光影塑造情绪） |
| `docs/atmosphere-interaction-standard.md` | 环境氛围与物理互动（人物必须与环境介质发生真实交互） |
| `docs/blocking-camera-geometry-methodology.md` | 站位/轴线/几何约束（读点保护、轴线连续性、禁止跳轴） |
| `docs/framing-aspect-ratio-standard.md` | 构图与画幅比例美学（负空间、黄金分割、电影级格局） |
| `docs/style-guide.md` | 全局视觉风格规范（防风格漂移） |
| `docs/hzw-master-style-system.md` | HZW大师风格系统（生图/场景/分镜/视频提示词的整剧统一风格模板） |
| `docs/transition-montage-standard.md` | 视听转场与蒙太奇（消除 PPT 幻灯片感） |
| `docs/shot-duration-and-density-standard.md` | 镜头时长与节拍密度（镜头信息承载量匹配叙事任务） |
| `docs/jimeng-anti-collapse-core.md` | 即梦 2.0 防崩核心规范（图生视频/连续人物/动作文戏片段稳定性参数） |

### 动作戏额外必读（出现打斗/追逐/法术/坠落时自动加载）
| 文档 | 用途 |
|------|------|
| `docs/action-methodology.md` | 动作戏总方法论（看得清、打得实、结果狠） |
| `docs/action-combat-design-standard.md` | 全品类武打动作戏设计规范（对抗关系/身体受力/镜头节奏） |
| `docs/action-enhancement-guidelines.md` | 动作戏增强规范（力的闭环四层级） |
| `docs/action-prompt-guidelines.md` | 动作戏提示词补充规范（力的闭环：受力→节奏→环境→镜头） |
| `docs/action-speed-design-standard.md` | 动作速度表现规范（快切 + 运动模糊的速度感体系） |
| `docs/action-vocabulary.md` | 动作戏镜头与受力词库（直接查阅字典） |
| `docs/action-case-opposition-force-camera.md` | 强对抗场景镜头节奏（压制/反扑/失衡/再稳住） |
| `docs/staging-impact-audiovisual-methodology.md` | 视听打击与对峙调度（动作/镜头/速度/音效/特效同一条链路） |
| `docs/zero-gravity-parkour-standard.md` | 失重/飞行/坠落的物理视觉法则（滞空悬停+四肢代偿+破风阻力） |
| `docs/shot-language-library.md` | 镜头语言速查（含 FPV 穿越三段式、动作戏镜头公式） |
| `docs/dance-rhythm-aesthetics-standard.md` | 舞蹈律动与唯美动作（高光慢镜、剑舞、曲线美、呼吸感） |
| `docs/environmental-destruction-standard.md` | 非人物理破坏与崩塌（不同材质的物理碎裂逻辑） |

### 文戏/对白额外必读（出现对话、情绪戏、关系戏时自动加载）
| 文档 | 用途 |
|------|------|
| `docs/drama-tension-design-standard.md` | 文戏与戏剧张力总规范（权力高低、表里反差、时间留白） |
| `docs/dialogue-voice-design-standard.md` | 对白配音轻量流程（台词/旁白/气口/口型节奏） |
| `docs/sound-design-montage-standard.md` | 听觉设计与声音蒙太奇（立体声音建物理/心理空间） |

### FPV 穿越额外必读（出现追逐/钻缝/穿洞/贴地高速时自动加载）
| 文档 | 用途 |
|------|------|
| `skills/fpv-director-skill.md` | FPV 运镜策略 + Trinity 三帧流 + 双语提示词 |
| `docs/camera-psychology-movement-standard.md` §2.6 | FPV 穿越与压迫（入口/穿越介质/擦身关系/出口/结果兑现） |

### 群戏/人群额外必读（出现多人场面、围观、围攻时自动加载）
| 文档 | 用途 |
|------|------|
| `docs/crowd-choreography-standard.md` | 群体调度与走位美学（焦点让渡、空间纵深、防假人群/穿模） |

### 角色视觉弧线额外必读（涉及角色成长/状态变化/伤痕/换装时自动加载）
| 文档 | 用途 |
|------|------|
| `docs/character-visual-arc-standard.md` | 角色视觉成长弧线（外貌/服装/伤痕/武器的视觉演变映射成长） |
| `docs/texture-aging-standard.md` | 材质做旧与岁月痕迹（消除崭新塑料感、历史磨损纹理） |

### 后期/VFX 额外必读（涉及特效、发光、魔法、能量波时自动加载）
| 文档 | 用途 |
|------|------|
| `docs/vfx-design-standard.md` | VFX 视觉特效（光源绑定法则、防光污染、特效物理反馈） |
| `docs/post-production-aesthetics-standard.md` | 后期视听总规范（克制、空间、引导） |

### 参考图/题材额外必读（使用参考图或确定题材视觉方向时自动加载）
| 文档 | 用途 |
|------|------|
| `docs/reference-image-analysis-standard.md` | 参考图八维分析（结构化拆解外部参考为可复用视觉知识） |
| `docs/genre-visual-playbook.md` | 题材视觉方法论手册（不同题材的视觉参数包） |

### 判定规则
- **打斗/动作戏** → 通用必读 + 动作戏额外必读
- **含飞行/坠落/失重** → 通用必读 + 动作戏额外必读 + `zero-gravity-parkour-standard.md` 重点段落
- **含追逐/穿越/穿洞** → 通用必读 + FPV 穿越额外必读
- **含多人场面/围攻** → 通用必读 + 群戏/人群额外必读
- **含对话/情绪戏** → 通用必读 + 文戏/对白额外必读
- **含特效/魔法/能量** → 通用必读 + 后期/VFX 额外必读
- **含角色成长/状态变化** → 通用必读 + 角色视觉弧线额外必读
- **纯文戏/对白** → 通用必读 + 文戏/对白额外必读
- **即梦 / 图生视频 / 连续人物片段** → 通用必读 + `jimeng-anti-collapse-core.md`，强制锁定参考强度75、seed、人物描述、单段2-3秒、首尾帧、光线、比例、运动速度6、采样步数40
- **所有项目进入资产 / 分镜 / 导演故事板图 / 视频生成前** → 通用必读 + 项目级 `visual-style-bible.md`，强制继承已锁定的主风格、副风格、光影、色彩、材质、画质、镜头、声音气质和禁止项
- **HZW大师风格项目 / 风格化模板任务** → 通用必读 + `hzw-master-style-system.md`，先判断 HZW 是主风格还是风格控制方法论，再锁定角色锚点、场景锚点、光影锚点、色彩锚点、镜头锚点，并让生图、分镜、场景提示词、视频提示词同源
- **使用参考图** → 通用必读 + 参考图额外必读

## 输入要求
1. `project.json`
2. `02-director/ep*-director-notes.md`
3. `02-director/action-design/ep*-fight-scenes.md`（如有）
4. `03-assets/scenes/scene-index.md`
5. `03-assets/props/prop-design-table.md`
6. `03-assets/asset-index.md`（如有）
7. `docs/prompt-standards.md`
8. `docs/seedance-prompt-engineering.md`
9. `docs/camera-language-dictionary.md`
10. 当前集已有分镜 / 提示词文件（若是修订任务）
11. **上方「强制前置检查」中根据任务类型自动匹配的方法论文档**

## 输出位置
- `04-storyboard/ep*-storyboard.md`
- `04-storyboard/director-boards/第XX集/board-*-d12-sora2.png`
- `04-storyboard/director-boards/第XX集/board-*-d15-seedance2.png`
- `04-storyboard/director-boards/第XX集/board-*-continuity.md`
- `04-storyboard/director-boards/第XX集/board-*-qc.md`
- `04-storyboard/director-boards/第XX集/board-*-video-adaptation-pack.md`
- `05-prompts/seedance/ep*-shots.md`
- `05-prompts/seedance/ep*-fullref-15s.md`
- `05-prompts/seedance/第XX集/seedance/*.md`
- `05-prompts/seedance/第XX集/即梦/*.md`
- `05-prompts/seedance/第XX集/叙事/*.md`

## 核心工作流
1. **读懂导演意图**：确认这场戏的戏核、压迫关系、情绪杠杆、关键动作、结果镜头。
2. **先判场景类型**：判断当前段落更接近文戏 / 对峙 / 悬疑 / 动作 / 追逐 / 转场哪类，优先套用 `scene-storyboard-formulas.md` 的基础骨架。
3. **先搭主镜骨架**：先浓缩一句话主镜，再拆出 3-5 个关键主镜节点，区分骨架镜头与补充镜头。
4. **先搭骨架**：按起承转合 / 动作单元切段，每个动作单元先抓开始帧 / 高潮帧 / 结束帧。
5. **先建空间关系**：明确谁在中轴、谁在左右翼、谁在前后景、谁高谁低、谁面向主要威胁。
6. **再拆镜头组**：把一个复杂段落拆成关系建立镜头、动作推进镜头、爆点镜头、结果镜头。
7. **锁节拍与衔接**：决定哪里停，哪里推，哪里硬切，哪里顺接，哪里留 Beat，并检查动作匹配 / 视线匹配 / 方向匹配。
8. **做高级叙事控制**：检查视觉焦点是否稳定、空间层次是否清晰、运镜是否有动机、主客观视角是否统一、蒙太奇组接是否成立。
9. **做合规校验**：检查轴向、过机位、视高、景别、焦点过渡与信息传递是否成立，并给出必要修复。
10. **挂载资产引用**：给镜头绑定正确的 `@人物 / @场景 / @道具 / @视频 / @音频`。
11. **先出故事板生产包**：完成分镜表、导演故事板图、Panel 时长、连续性卡、资产引用矩阵、参考图职责矩阵和视频模型适配说明。
12. **再派生配套生成说明**：如需即梦 / Seedance / 叙事类说明，必须从故事板生产包压缩派生，保证同源。

## 分镜师六大硬规则
### 1. 一个镜头一个核心任务
- 不要让一个镜头同时承担建关系、打爆点、交代结果、展示台词四件事。
- 一个镜头只做一件最重要的视觉任务。

### 2. 先关系后爆点
- 强对抗段落先交代站位、朝向、距离、主读点，再上冲击。
- 不能一开场就只写“雷光爆炸”“一拳轰飞”，却没交代谁压谁、谁在何处、谁看向谁。

### 3. 镜头动作必须融合
- 帧率切换、运镜、景别变化必须绑定动作发生点。
- 禁止独立列出“镜头与构图”板块。
- 禁止写空泛的“镜头缓慢推进”“镜头快速摇动”而不说明绑定的是哪个动作/表演节点。

### 4. 强爆点必须有速度链路
- 重击 / 终结技 / 觉醒 / 巨物压迫 / 龙啸 / 怪物围攻等段落，优先拆为：
  - 关系建立
  - 蓄力
  - 骤静
  - Hit Stop
  - 爆裂释放
  - 结果兑现
- 结果镜头不能省。
- 强对抗镜头组必须逐镜写清站位 / 朝向 / 距离、谁压谁、接触点、受力方向、被迫位移、止退 / 回稳、镜头停推切留拍、关键清晰点、环境与音效反馈；禁止只写速度词和爆炸词。
- 瞬移 / 影分身 / 闪现 / 残影瞬杀镜头组必须逐镜写清：空间锚点、消失点、再出现点、目标切换、残影数量 / 透明度 / 持续时间、命中清晰帧、结果倒地、残影回收与收势落幅；连续快切必须切信息点，不得切成空间混乱。

### 5. 位置关系必须显式化
- 关键段落必须写 `位置关系`。
- 明确中轴、左右翼、前后景、高低位、朝向、禁穿轴规则。
- 不能只给模糊坐标，不写站位语义。

### 6. 故事板与生成说明必须同源
- 即梦 / Seedance / 叙事类说明必须从同一故事板生产包压缩派生。
- 禁止绕过故事板各写各的。
- 禁止在配套生成说明里删掉会破坏理解的核心关系信息。

## 标准输出结构
### A. 分镜表
推荐字段：
- 镜号
- 时长
- 镜头类型 / 景别
- 视角身份
- 动作与表演
- 位置关系
- 运镜与帧率（与动作绑定）
- 对抗关系 / 身体受力
- 光影
- 分镜衔接方式
- 主读点 / 清晰爽点
- `@引用`
- 音效 / 对白配音
- 提示词备注

### B. 故事板生产包
必须包含：
- 分镜表
- 导演故事板图结构或正式图
- Panel 时长表
- 板内 / 板间连续性卡
- 资产引用矩阵
- 参考图职责矩阵
- 视频模型适配说明

故事板生产包输出前必须通过完整性门禁：每个 Panel 都要写清主体、动作、景别、视角、运镜、帧率或节拍、人物/主体站位、朝向、距离、环境联动、光线、对白配音、音效设计、画质读点和负面风险。镜头、景别、帧率变化必须绑定动作节点；声音、环境、光线必须能追溯到分镜与资产图。缺任一关键接口、Panel 时长未铺满、站位/动作/镜头/声音/画质描述过粗，必须打回重写，不允许进入下游生成。

### C. 配套生成说明
- 即梦 / Seedance / 叙事类说明只作为下游模型适配与投喂说明
- 必须从同一故事板生产包派生
- 可以压缩表达，但不得删掉主体关系、站位朝向、动作因果、结果镜头、声音结构和连续性约束

### D. GPT 生图静态分镜资产
用于首帧、动作参考、分镜预览和资产归档，不替代视频分镜表。输出前必须：
- 判断产品类型：静态分镜板 / 9-panel storyboard / 4×4 动作分解参考表 / 长卷叙事图
- 写清格数、编号、阅读顺序、分隔线、留白和每格任务
- 每格绑定原分镜镜号、景别、角色位置、动作、结果点和短说明
- 保持同一角色、同一服装、同一比例、同一主光源和同一场景空间
- 禁止换脸、服装漂移、面板数量错误、画格溢出、文字乱码和阅读顺序混乱

### E. D12-Sora2 / D15-Seedance2 专业导演故事板图
作为视频生成前主交付物，替代默认提示词交付。输出前必须：
- 判断目标模型：D12-Sora2 / D15-Seedance2 / 双版本
- D12-Sora2 总时长必须 ≤ 12s，视频生成阶段使用一张故事板图 + 简短动态风格叙事提示词
- D15-Seedance2 总时长必须 ≤ 15s，视频生成阶段使用故事板图 + 角色 / 场景 / 道具参考图 + 简短模型适配提示词
- Seedance2-Stable 必须限制在 4图 + 1视频，优先级为：导演故事板图 > 关键角色图 > 场景图 > 关键道具图
- Seedance2-Extended 必须限制在 9图 + 1视频 + 1音频，默认仅在稳定版不足时启用
- 每张故事板必须输出 Panel 时长表、连续性卡、QC 记录和视频适配包
- 提示词只作为内部生成引擎和模型适配说明，不默认输出长版提示词

## 特殊场景策略
### 高张力对峙
- 先定权力高低位
- 先定空间屏障
- 先定主读点
- 再定爆点与压迫释放

### 多人 / 群戏
- 群像站位必须服务主读点
- 不允许路人切断核心人物关系线
- 群众后撤、围拢、分列两翼时要写清方向和限制

### FPV / 穿越镜头
- 先判断是否真的需要 `FPV`
- 启用后必须写清入口、穿越介质、擦身关系、出口、结果镜头
- 空间不清时回退到观察式镜头，不强做

## 常见失败信号
- 一镜塞太多动作
- 只有文学描写，没有镜头任务
- 没先交代空间关系就直接爆点
- 位置关系缺失，人物站位飘
- 只有过程，没有结果镜头
- 帧率切换没绑定具体动作时刻
- 只会堆 motion blur / 特效，不会做清晰帧保护
- 即梦 / Seedance / 叙事三稿互相打架

## 协作接口
- 向上承接 `Director`
- 横向对齐 `Librarian` 的资产映射
- 向下服务 `Studio` 的生成执行
- 最终接受 `Reviewer` 对节拍、清晰帧、站位逻辑和可执行性的审核
