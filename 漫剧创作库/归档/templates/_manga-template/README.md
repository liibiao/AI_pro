# 漫剧项目模板说明

这是用于 AI 漫剧项目的标准模板。

## 与短剧模板的主要区别

1. 更强调静帧一致性
2. `06-generated/images/comic-panels/` 用于存放分格图
3. 剧本可按“话”或“章节”推进，而不是必须按短视频节奏拆分
4. 分镜更强调阅读顺序、对白气泡区和镜头转场

## 建议流程

灵感 → 角色设定 → 场景设定 → 分话脚本 → 分格分镜 → 生成格图 / 动效小样 → D12-Sora2 / D15-Seedance2 导演故事板图 → Sora2 / Seedance2 视频适配包 → 生成审核 → 排版 / 剪辑 → 质检

## 本轮已补齐的执行模板
- `04-storyboard/director-boards/README.md`：D12-Sora2 / D15-Seedance2 导演故事板图目录与视频化交付骨架
- `05-prompts/seedance-multimodal-plan-template.md`：漫剧版多模态执行方案
- `05-prompts/prompt-troubleshooting-template.md`：漫剧版提示词排障模板
- `08-qa/generation-review-template.md`：漫剧版生成审核模板

## 推荐方法
- 外部视频参考只吸收关系、受力、节奏、结果，不照搬表面速度
- 提示词先写 baseline，再写强化版
- 一旦漂移，优先执行回退策略
- 分格生成时优先保证阅读顺序、角色稳定与对白区可用
