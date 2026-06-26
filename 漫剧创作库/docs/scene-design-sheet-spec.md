# scene-design-sheet-spec — 场景设定稿 / 720度全景图 / 12宫格视角图交付规范

## 1. 定位

本规范用于把剧本中的核心大场景转化为可复用的空间资产。场景图不再只是氛围参考图，而是后续人物站位、分镜、镜头调度、视频生成和连续性检查的空间母图。

每个核心大场景必须从剧本中提取完整环境、设施、道具、建筑、群众 / NPC / 怪物 / 动物与主角站位，并使用 `gpt-image-2` 生成两张最终交付物：

1. `720度全景场景母图`
2. `12宫格固定视角图`

## 2. 交付物定义

| 交付物 | 文件建议 | 生成模型 | 作用 |
|---|---|---|---|
| 720度全景场景母图 | `03-assets/scenes/场景ID_720-panorama_vN.png` | `gpt-image-2` | 建立完整空间、设施、道具、人物、群众、NPC、怪物、动物和动作路径分布 |
| 12宫格固定视角图 | `03-assets/scenes/场景ID_12-view-grid_vN.png` | `gpt-image-2` | 从同一空间母图派生 12 个可拍摄方向，供分镜、导演故事板图和视频模型引用 |
| 元数据 | `03-assets/scenes/场景ID_scene-sheet_meta.json` | — | 记录剧本来源、场景提取表、生成模型、版本、引用标签与质量检查结论 |

## 3. 720度全景图的项目定义

本项目中的 `720度全景场景母图` 不是普通 VR 摄影意义的 360° 风景图，而是：

> 水平方向 360° 环视 + 垂直 / 俯视空间信息 + 人物 / 道具 / 设施 / 群演站位分布图。

它必须回答：

- 这个地方整体长什么样；
- 前后左右、入口、出口、高低层分别有什么；
- 主角、反派、重要配角站在哪里；
- 群众、群演、NPC、怪物、动物如何分布；
- 桌椅板凳、灯、建筑、街道、摊位、门窗、障碍物、剧情关键道具在哪里；
- 动作路径、逃跑路径、攻击方向、群众避让方向是否清楚；
- 后续 12宫格视角图可以从哪些方向派生。

## 4. 剧本提取规则

在生成场景图前，必须先建立场景空间母表。

### 4.1 基础字段

- 场景 ID：
- 场景名称：
- 首次出现集数 / 场次：
- 剧本来源段落：
- 场景类型：室内 / 室外 / 半室内 / 地下 / 街道 / 广场 / 战场 / 庭院 / 宫殿 / 学院 / 山林 / 洞窟等
- 剧情功能：对峙 / 追逐 / 打斗 / 觉醒 / 审判 / 交易 / 伏击 / 群众围观 / 悬念揭示 / 转场
- 时间与天气：白天 / 黄昏 / 夜晚 / 雨 / 雾 / 雪 / 战损 / 火灾等
- 项目风格与子风格：如 HZW大师风格、国漫写实、古风、科幻、废土等

### 4.2 空间结构字段

- 前区 / 中区 / 后区
- 左区 / 右区
- 入口 / 出口 / 暗门 / 通道
- 高低差：台阶、楼梯、二层平台、屋顶、桥、山坡、坑洞
- 遮挡物：柱子、屏风、车辆、摊位、树、墙角、巨石、废墟
- 可拍摄通道：镜头能穿过或停留的位置
- 危险区 / 空白区 / 群众避让区

### 4.3 设施、道具、建筑字段

室内必须提取：桌、椅、板凳、灯、柜子、床、门窗、屏风、帘子、炉火、架子、牌匾、地毯、台阶、器皿、墙面纹样、剧情关键道具。

室外必须提取：建筑外立面、街道、巷道、路灯、摊位、桥、栏杆、牌楼、旗帜、树木、石碑、车辆、广告牌、杂物堆、废墟、地面材质、远景建筑、天空元素。

奇幻 / 科幻 / 战斗场景还必须提取：能量装置、符文阵、机甲残骸、怪物巢穴、结界边界、破坏痕迹、火花烟尘来源、危险地形。

### 4.4 人物与生物站位字段

- 主角站位：位置、朝向、与入口 / 关键道具 / 反派的距离
- 反派站位：位置、朝向、压迫方向
- 重要配角：分组、与主角关系、是否遮挡主角
- 群众 / 群演：聚集区、空白区、避让方向、视线朝向
- NPC：功能性站位，如守卫、店主、路人、弟子、裁判
- 怪物 / 动物：巢穴、攻击范围、运动路线、与主角距离
- 禁止项：不得让群众遮挡主角第一读点；不得让怪物或关键 NPC 随机漂移到无意义位置。

### 4.5 动线字段

- 主角进入路径
- 主角撤退 / 逃跑路径
- 敌人压迫方向
- 攻击 / 追逐 / 伏击路径
- 群众避让路径
- 关键道具被拿取 / 激活 / 损毁的位置
- 可用于镜头推进、横移、低机位、俯拍的机位区

## 5. 720度全景场景图提示词骨架

```text
professional 720-degree panoramic scene design sheet, generated with gpt-image-2,
wide cinematic environment layout, full spatial coverage, readable production design,
complete environment map showing all directions around the location,

SCENE TYPE:
[室内 / 室外 / 半室内 / 地下 / 街道 / 广场 / 战场 / 庭院 / 宫殿 / 学院 / 山林 / 洞窟等]

STORY FUNCTION:
[本场景在剧本中的功能：对峙 / 追逐 / 打斗 / 觉醒 / 审判 / 交易 / 伏击 / 群众围观 / 悬念揭示]

ENVIRONMENT STRUCTURE:
[完整空间结构：前区、中区、后区、左区、右区、入口、出口、高低落差、道路、墙体、建筑、遮挡物]

FACILITIES AND PROPS:
[所有场景设施与道具：桌椅、灯、柜子、摊位、门窗、旗帜、路灯、石碑、建筑牌匾、废墟、车辆、武器架等]

CHARACTER BLOCKING:
[主角站位、反派站位、重要配角站位、群演/群众/NPC/怪物/动物分布，写清相对距离、朝向、聚集区、空白区]

ACTION PATHS:
[角色移动路径、冲突轴线、逃跑路线、攻击方向、群众避让方向、镜头可拍摄通道]

CAMERA REFERENCE:
mark 12 possible camera view directions around the scene,
front, front-right, right, back-right, back, back-left, left, front-left,
high angle overview, low angle ground view, entrance view, reverse view,

VISUAL STYLE:
[项目风格 / HZW风格 / 国漫写实 / 科幻 / 古风 / 废土 / 学院等]

LIGHTING:
[主光方向、辅助光、环境光、昼夜版本、灯具来源、室外天光、火光、霓虹、月光等]

COMPOSITION:
panoramic wide layout, all important elements visible, no cropped important objects,
clear spatial hierarchy, readable character positions, clean labels or subtle markers if needed,

NEGATIVE:
no random unrelated objects, no distorted architecture, no impossible perspective,
no missing entrances, no missing key props, no crowd blocking the main characters,
no inconsistent scale, no unreadable layout, no overly abstract atmosphere-only image
```

## 6. 12宫格固定视角图定义

12宫格必须从同一张 `720度全景场景母图` 派生，不能变成 12 个不同场景或 12 张动作漫画。它是固定机位库，核心价值是建立空间连续性和可拍摄方向。

| 宫格 | 视角 | 用途 |
|---|---|---|
| 01 | 正前方主视角 | 建立场景正面关系 |
| 02 | 前右 45° | 斜向看主角与空间 |
| 03 | 右侧视角 | 展示横向动线 |
| 04 | 后右 45° | 反向压迫 / 追逐 |
| 05 | 正后方 | 反打 / 背后威胁 |
| 06 | 后左 45° | 反向补空间 |
| 07 | 左侧视角 | 对称轴线 / 对峙 |
| 08 | 前左 45° | 主角侧前方英雄位 |
| 09 | 高机位俯视 | 空间总览 / 群众分布 |
| 10 | 低机位仰视 | 压迫 / 巨物 / 建筑高度 |
| 11 | 入口视角 | 角色进入场景 |
| 12 | 出口 / 反向视角 | 逃离、转场、结果镜头 |

## 7. 12宫格固定视角图提示词骨架

```text
12-panel scene view reference sheet, generated with gpt-image-2,
based on the same 720-degree panoramic scene design,
consistent environment, consistent props, consistent lighting, consistent character blocking,

LAYOUT:
3 rows × 4 columns grid,
thin black panel dividers,
each panel numbered 01 to 12,
small camera direction label in each panel,

PANEL 01: front master view,
PANEL 02: front-right 45-degree view,
PANEL 03: right side view,
PANEL 04: back-right 45-degree view,
PANEL 05: back view,
PANEL 06: back-left 45-degree view,
PANEL 07: left side view,
PANEL 08: front-left 45-degree view,
PANEL 09: high angle overhead view showing full blocking,
PANEL 10: low angle ground view emphasizing scale and pressure,
PANEL 11: entrance view showing where characters enter,
PANEL 12: exit / reverse view showing where characters leave or where the next shot can cut,

SCENE CONSISTENCY:
same buildings, same furniture, same props, same crowd positions, same NPC / monster / animal placement,
same protagonist and antagonist standing positions,
same light direction and time of day,

VISUAL REQUIREMENTS:
readable spatial relationship, clear camera direction, production design reference quality,
not a comic page, not action panels, not different scenes,
all panels are views of the same location from different camera positions,

NEGATIVE:
no changing architecture between panels, no changing character positions,
no missing key props, no different time of day, no style drift,
no random extra crowds, no distorted layout, no unreadable tiny details
```

## 8. 质量门禁

进入分镜前，场景资产必须通过以下检查：

- [ ] 当前集所有核心大场景已从剧本中提取完成
- [ ] 每个核心场景已列出空间结构、设施、道具、建筑、入口、出口、遮挡物、可拍摄区域
- [ ] 每个核心场景已列出主角、反派、配角、群众、NPC、怪物、动物的站位和朝向
- [ ] 每个核心场景已完成 `gpt-image-2` 生成的 `720度全景场景母图`
- [ ] 每个核心场景已基于 `720度全景场景母图` 生成 `12宫格固定视角图`
- [ ] 12宫格与 720全景图在建筑、设施、道具、人物站位、光线方向上保持一致
- [ ] 场景图已回填 `scene-index.md` 和 `asset-index.md`
- [ ] 分镜阶段优先引用场景 720全景图和 12宫格视角图，不得凭空重构场景

## 9. 与后续阶段的关系

- `Director`：负责判断核心大场景、场景功能、空间关系与视觉风格。
- `Studio`：负责按本规范执行 `gpt-image-2` 场景图生成。
- `Librarian`：负责回填 `scene-index.md`、`asset-index.md` 与 @引用标签。
- `Storyboard Artist`：必须优先引用场景 720全景图和 12宫格视角图进行分镜，不得凭空重构空间。
- `Camera Director`：基于 12宫格视角图选择机位、视角身份、起幅落幅和镜头运动。
- `Reviewer`：检查场景图与分镜、故事板图、视频提示词之间的空间连续性。
