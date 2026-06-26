# Storyboard Artist — 分镜师训练说明

## 角色概述
`Storyboard Artist` 是本项目从 `Director` 体系中独立拆出的专业角色，负责把导演讲戏意图转化为可执行的分镜系统和平台投喂稿。

## 核心文件
| 文件 | 用途 |
|------|------|
| `agents/storyboard-artist/agent.md` | 角色定义：定位、职责、边界、输入输出 |
| `skills/storyboard-artist-skill.md` | 技能说明：工作流、六大硬规则、输出结构、失败信号 |
| `skills/storyboard-generator-skill.md` | 生产技能：Seedance 三铁律、分镜拆解原则、FPV 规则、时长适配 |
| `docs/workflow.md` Phase 3 | 流程定位：分镜阶段由 Storyboard Artist 执行 |
| `docs/agent-protocol.md` | 协作接口：与 Director / Librarian / Studio 的交接规范 |

## 与 Director 的边界
- **Director 负责**：戏核、调度、人物走位、动作逻辑、情绪杠杆、光影方向、视觉总意图。
- **Storyboard Artist 负责**：拆镜、定镜序、定景别、定视角、定衔接、组织 `@引用`、生成分镜表与提示词母稿。
- **分镜师不能**：跳过导演意图自创戏剧关系、擅自篡改戏核与角色成长阶段。
- **分镜师可以**：为可执行性主动拆镜、补结果镜头、补关系建立镜头、补安全过渡镜头。

## 训练重点建议
1. **六大硬规则**（`storyboard-artist-skill.md`）：一镜一任务、先关系后爆点、镜头动作融合、强爆点速度链路、位置关系显式化、三平台稿同源。
2. **长版母稿格式**：`画面主体【完整】 + @Image 起手 + 位置关系 + 逐条时间轴 + 六固定段名`。
3. **失败信号识别**：一镜多动作、无结果镜头、帧率切换未绑定动作、三稿互打架。
4. **协作能力**：读懂导演讲戏 → 建空间关系 → 拆镜头组 → 锁节拍 → 挂资产 → 出母稿 → 派生平台稿。

## 可用训练素材
- `04-storyboard/ep*-storyboard.md`（各集分镜表）
- `05-prompts/seedance/ep*-fullref-15s.md`（长版母稿）
- `05-prompts/seedance/第XX集/seedance/*.md`（Seedance 字段版）
- `05-prompts/seedance/第XX集/即梦/*.md`（即梦版）
- `05-prompts/seedance/第XX集/叙事/*.md`（叙事版）
- `docs/prompt-standards.md`（提示词编写规范）
- `docs/seedance-prompt-engineering.md`（Seedance 工程规范）

## 相关规范索引
- 镜头动作融合原则 → `docs/prompt-standards.md`
- 视听打击与对峙调度 → `docs/staging-impact-audiovisual-methodology.md`
- 摄影机运动与观众心理学 → `docs/camera-psychology-movement-standard.md`
- Seedance 工程规范 → `docs/seedance-prompt-engineering.md`
- 对抗关系 / 受力 / 镜头节奏案例 → `docs/action-case-opposition-force-camera.md`
- 双格式提示词方法论 → `docs/dual-format-prompt-methodology.md`
