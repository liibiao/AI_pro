# D12-Sora2 / D15-Seedance2 导演故事板图目录

本目录用于存放漫剧项目的视频化导演故事板图交付物。它服务于“分话脚本 / 分格分镜 / 资产图 → 专业导演故事板图 → Sora2 或 Seedance2 视频生成”的链路。

## 目录建议

```text
director-boards/
├── 第01话/
│   ├── board-001-d12-sora2.png
│   ├── board-001-d15-seedance2.png
│   ├── board-001-input-pack.md
│   ├── board-001-panel-timing.md
│   ├── board-001-continuity.md
│   ├── board-001-video-adaptation-pack.md
│   ├── board-001-qc.md
│   ├── board-001-delivery-index.md
│   └── board-001-generation-log.md
└── 第02话/
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

## 漫剧专项注意

- 先保证静帧一致性、阅读顺序、对白气泡区和角色脸部稳定，再进入视频化故事板图
- 故事板图必须继承角色标准图、场景 12 宫格视角图、人物站位图和关键道具多视角图
- 板内 Panel 必须保留漫画分格的第一读点，同时补齐视频所需的镜头运动、动作方向、音效、对白和导演批注
- D12-Sora2 单张故事板总时长 `≤12s`
- D15-Seedance2 单张故事板总时长 `≤15s`
- Seedance2 参考图优先级：故事板图 > 关键角色图 > 场景图 > 关键道具图
