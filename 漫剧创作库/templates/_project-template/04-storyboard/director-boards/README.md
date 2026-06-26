# D12-Sora2 / D15-Seedance2 导演故事板图目录

本目录用于存放项目级专业导演故事板图交付物。故事板图是视频生成前主交付物，默认优先于长版提示词交付；提示词能力保留为内部引擎与模型适配说明。

## 目录建议

```text
director-boards/
├── 第01集/
│   ├── board-001-d12-sora2.png
│   ├── board-001-d15-seedance2.png
│   ├── board-001-input-pack.md
│   ├── board-001-panel-timing.md
│   ├── board-001-continuity.md
│   ├── board-001-video-adaptation-pack.md
│   ├── board-001-qc.md
│   ├── board-001-delivery-index.md
│   └── board-001-generation-log.md
└── 第02集/
```

## 使用模板

从共享模板复制：

```text
templates/_shared/director-storyboard/
```

推荐文件：

- `director-storyboard-input-pack-template.md`
- `director-storyboard-d12-sora2-template.md`
- `director-storyboard-d15-seedance-template.md`
- `director-storyboard-panel-timing-template.md`
- `director-storyboard-continuity-card-template.md`
- `director-storyboard-video-adaptation-pack-template.md`
- `director-storyboard-qc-template.md`
- `director-storyboard-delivery-index-template.md`

## 硬门禁

- D12-Sora2 单张故事板总时长 `≤12s`
- D15-Seedance2 单张故事板总时长 `≤15s`
- Panel 格数不固定，按剧情、动作、文戏、悬疑、追逐、战争等戏型合理规划
- `Σ Panel Duration` 必须等于故事板总时长，且不得超过模型上限
- 板内、板间、集间连续性卡必须可追溯
- Sora2 输出：一张 D12 故事板图 + 简短动态风格叙事提示词
- Seedance2-Stable 输出：限制在 `4图+1视频`
- Seedance2-Extended 输出：限制在 `9图+1视频+1音频`
- Seedance2 参考图优先级：故事板图 > 关键角色图 > 场景图 > 关键道具图
