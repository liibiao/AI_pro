# Skill — prompt-sync-skill (资产同步)

## 技能描述
自动将 `03-assets/asset-index.md` 中锁定的角色、场景、道具版本同步到 `05-prompts/seedance/` 下的镜头执行稿中，确保生成时不引用错误的资产。

## 执行逻辑
1. **读取锁定版本**：
   - 从 `asset-index.md` 或 `ep001-execution-plan.md` 中获取核心角色的“推荐引用”路径（如 `角色设计图-林天-v4-1.png`）。
2. **批量更新**：
   - 扫描 `ep*-shots.md` 中的 `## SHOT *` 块。
   - 自动在 `### 推荐引用` 下方按角色名补全资产文件路径。
3. **一致性检查**：
   - 如果 `asset-index.md` 更新了资产版本，提示 `Director` 或 `Studio` 同步更新相关提示词脚本。

## 价值
- 避免 `Studio` 每次手动去查资产路径。
- 保证一个 Phase 内的所有镜头使用完全一致的基础参考图。

## 适用 Agent
- `Studio` (正式生成前同步)
- `Director` (编写镜头脚本时自动补完)
