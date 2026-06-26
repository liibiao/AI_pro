# 荒原血誓_漫剧_001

## 当前状态

第一话《黑风荒原》已完成本地 Agent 流水线的文本生产包：

- Phase 0：创作源识别
- Phase 1：logline、人设、结构方案、剧本正文
- Phase 2：导演讲戏、动作设计、视觉风格母版
- Phase 3：资产卡、分镜表、D12/D15 故事板输入包、fullref
- Phase 4：Seedance / 即梦 / 叙事三版提示词派生
- QA：Phase Gate 与 Storyboard QA 完成

## 已通过命令

```bash
python3 tools/seedance_prompt_validate.py --project-dir projects/荒原血誓_漫剧_001 --ep 001
python3 tools/project_pipeline_run.py --project-dir projects/荒原血誓_漫剧_001 --ep 001 --style 热血爆点 --skip-assets --no-scene-angle
```

## 下一步

1. 生成角色与场景真实资产图。
2. 生成 D12 / D15 专业导演故事板图 PNG。
3. 用 `05-prompts/seedance/第01集/seedance/ep001-seedance2-paste.short.md` 进入视频实验。
4. 根据真实输出回填 `06-generated/` 与 `08-qa/`。
