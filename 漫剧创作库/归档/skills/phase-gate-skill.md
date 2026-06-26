# Skill — phase-gate-skill (门禁自动化)

## 技能描述
自动检查项目各阶段的入口/出口准则（Checklist），评估是否可以进入下一 Phase。

## 执行逻辑
1. **读取 Phase Gate 标准**：
   - 参考 `docs/workflow.md` 与 `docs/phase-gate-checklist.md`。
2. **自动打分系统 (10分制)**：
   - 检查 `01-story` (脚本完整性、格式合规性)。
   - 检查 `02-director` (讲戏本是否包含动作链、光影参数，以及强对抗段落的站位/朝向/距离/主读点说明)。
   - 检查 `03-assets` (资产是否具备设计图、是否已入库)。
   - 检查 `04-storyboard` (分镜是否对应剧本、节拍密度是否合规，关键爆点是否具备速度反差、Hit Stop、音效/特效同步与结果镜头)。
3. **输出门禁结果**：
   - **PASS (≥ 8分)**：允许 `Producer` 放行。
   - **REVISION (6-7.9分)**：小修后放行，标记“条件通过”。
   - **FAIL (< 6分)**：阻塞，打回重做。

## 价值
- 降低 `Producer` 的审核负担。
- 确保项目始终保持高质量。

## 适用 Agent
- `Producer` (最高审核决策)
- `Reviewer` (终审辅助)
