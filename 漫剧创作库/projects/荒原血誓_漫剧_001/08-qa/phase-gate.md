# Phase Gate — ep001《黑风荒原》

## Gate 0 创作源 / 风格

- [x] 创作源输入已识别
- [x] 风格母版 `visual-style-bible.md` 已建立
- [x] 主风格、光影、色彩、材质、禁止项明确
- 结论：放行

## Gate 1 Story → Director

- [x] Logline 完成
- [x] Character Bible 完成
- [x] 结构方案完成
- [x] 剧本正文完成
- [x] 剧本含目标、牺牲、温存、Boss 战和钩子
- 结论：放行

## Gate 2 Director → Assets / Storyboard

- [x] 导演讲戏本完成
- [x] 动作设计完成
- [x] 场景空间关系明确
- [x] Boss 战节奏链路明确
- 结论：放行

## Gate 3 Assets → Storyboard

- [x] 角色文本资产卡完成
- [x] 场景文本资产卡完成
- [x] 道具文本资产卡完成
- [x] `asset-index.md` 和 Seedance `@引用` 映射完成
- [ ] 真实资产图未生成
- 结论：文本生产包放行；真实图像资产生成前需复审

## Gate 4 Storyboard → Prompt / Generation

- [x] 分镜表完成
- [x] D12-Sora2 输入包完成
- [x] D15-Seedance2 输入包完成
- [x] 连续性卡完成
- [x] fullref 15 秒片段完成
- [x] Seedance/即梦/叙事三版已由本地脚本派生
- [x] 红线校验通过
- 结论：放行到 Studio 实验

## Pipeline 命令记录

```bash
python3 tools/seedance_prompt_validate.py --project-dir projects/荒原血誓_漫剧_001 --ep 001
python3 tools/project_pipeline_run.py --project-dir projects/荒原血誓_漫剧_001 --ep 001 --style 热血爆点 --skip-assets --no-scene-angle
```

## Runtime 备注

`./studio generate` 当前未能执行，原因是 `tools/workbench_cli.py` 引用了缺失模块 `export_current_outputs`。本轮改用本地 Agent/Skill/模板文件和流水线脚本完成生产包，未影响最终分镜与 Seedance 派生校验。
