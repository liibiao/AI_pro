# asset-versioning-skill — 素材版本管理技能

## 技能定位
用于管理 AI 生成项目中的镜头版本、提示词版本、可用片 / 废片、文件命名和追溯关系，避免生成素材越来越多后失控。

## 适用任务
- 规范镜头命名
- 记录提示词版本与素材对应关系
- 标记可用片 / 备选片 / 废弃片
- 建立镜头版本表
- 控制重复试错成本

## 建议输出
- `06-generated/generation-log.md`
- `06-generated/rejected-log.md`
- `06-generated/shot-version-table.md`
- `05-prompts/seedance/ref-stability-report.md`（可选：检查 `ep*-shots.md` / `ep*-fullref-15s.md` 的引用路径是否失效、是否混用冲突版本）

## 管理原则
- 每个镜头对应唯一镜头号
- 每次生成对应唯一版本号
- 记录使用模型、提示词版本、生成结果评级
- 废片也要记录原因
- 文件命名必须可回溯到镜头与版本

## 推荐命名结构
- `ep001-shot-003-v01.mp4`
- `ep001-shot-003-v02-kling.mp4`
- `ep001-shot-003-v03-seedance.mp4`

## 失败信号
- 不知道哪个素材对应哪个提示词
- 废片没有记录
- 同镜头多个文件无法区分优先级
