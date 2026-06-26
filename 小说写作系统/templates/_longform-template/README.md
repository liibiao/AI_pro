# _longform-template — 长篇连载模板

适用于：
- 起点男频/女频连载
- 番茄长篇
- 50万字以上的长线项目

## 目录结构

```
_longform-template/
├── 01-positioning/          # 定位与立项
│   ├── logline.md           # 一句话故事核
│   ├── market-positioning.md # 市场定位
│   └── topic-scorecard.md   # 选题评分卡
├── 02-characters/           # 角色系统
│   ├── character-bible.md   # 角色圣经
│   ├── relationship-map.md  # 人物关系图
│   └── arc-tracker.md       # 弧线追踪表
├── 03-outline/              # 结构与大纲
│   ├── story-architecture.md # 故事骨架
│   ├── volume-plan.md       # 卷/篇章规划
│   ├── chapter-plan.md      # 章节计划
│   ├── hook-map.md          # 钩子分布图
│   └── tension-curve.md     # 张力曲线
├── 04-draft/                # 正文
│   ├── chapter-index.md     # 章节索引与状态
│   └── chapters/            # 章节文件
├── 05-edit/                 # 编辑改稿
│   ├── revision-log.md      # 改稿日志
│   └── rewrite-plan.md      # 重写计划
├── 06-review/               # 审校
│   ├── logic-review.md      # 逻辑审校
│   ├── continuity-check.md  # 连续性检查
│   └── final-qa.md          # 终审报告
├── 07-worldbuilding/        # 世界观（长篇专属）
│   ├── world-rules.md       # 世界规则
│   ├── power-system.md      # 力量体系
│   ├── geography.md         # 地理设定
│   └── history.md           # 历史背景
├── 08-publish/              # 包装发布
│   ├── title-options.md     # 标题候选
│   ├── blurb.md             # 简介
│   ├── tag-strategy.md      # 标签策略
│   └── platform-notes.md    # 平台适配
├── 09-retro/                # 复盘
│   ├── release-retro.md     # 发布复盘
│   └── what-to-reuse.md     # 可复用沉淀
├── project.json             # 项目配置
└── README.md                # 项目说明
```

## 使用方法

1. 复制本模板到 `projects/` 下
2. 修改项目名和 `project.json`
3. 先完成 `01-positioning/`
4. 通过 Phase 1 门禁后进入 `02-characters/` + `03-outline/`
5. 长篇必须先完成 `07-worldbuilding/` 的核心设定
6. 按卷/篇章分批推进正文

## 长篇专属规则

1. 必须有卷/篇章规划（`volume-plan.md`）
2. 必须有世界观文档（`07-worldbuilding/`）
3. 每 10 章做一次连续性检查
4. 每卷结束做一次阶段门禁
5. 角色弧线追踪表必须持续更新

## 核心原则

- 先稳世界观，再写正文
- 先稳主线，再开支线
- 中段防塌腰——每卷必须有独立高潮
- 长线伏笔必须有回收计划
