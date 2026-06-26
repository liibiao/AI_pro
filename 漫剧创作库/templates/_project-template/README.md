# 项目模板

这是短剧项目默认模板，复制后即可作为新项目起点。

## 创建方式
```bash
cp -r templates/_project-template projects/你的项目名_001
```

复制完成后，优先编辑：
- `project.json`
- `04-storyboard/director-boards/README.md`
- `05-prompts/runninghub/README.md`
- `06-generated/images/README.md`
- `06-generated/asset-index.md`

---

## 新项目启动必查
建议创建项目后立即按以下文档检查：
- `docs/project-bootstrap-checklist.md`

重点确认：
- `04-storyboard/director-boards/` D12-Sora2 / D15-Seedance2 导演故事板图目录是否存在
- RunningHub 任务卡目录是否存在
- `06-generated/images/` 四类图片目录是否存在
- `06-generated/asset-index.md` 是否存在
- `08-qa/` 审核入口是否存在
- `RUNNINGHUB_API_KEY` 是否已配置

---

## 资产文件命名规范
所有生成的图片资产统一使用中文命名：

```text
<用途>-<对象>-<版本>-<日期>[-序号].<扩展名>
```

示例：
- `角色定妆-男主-v1-20260412.png`
- `封面探索-第1集-v1-20260412-1.png`
- `场景氛围-古镇夜景-v1-20260412.png`
- `测试图-mjv7风格验证-v1-20260412-1.png`

---

## 当前模板已内置的 RunningHub 能力

### 1. workflow 链
- `banana2`：三参考图生成
- `banana2-edit`：单图编辑主链
- `banana-pro-edit`：单图编辑 AB 备选链
- `portrait-upscale`：人物高清增强

### 2. standard-api 链
- `mj-v7`：写实 / 电影级文生图
- `mj-niji7`：动漫插画风格
- `mj-niji6`：复古动漫风格

### 3. 统一图片归档目录
```text
06-generated/images/
├── characters/  — 角色图
├── props/       — 道具图
├── scenes/      — 场景图
└── others/      — 测试图 / 探索图
```

### 4. RunningHub 任务卡目录
```text
05-prompts/runninghub/
├── banana2/       — Banana2 三图生成
├── image-edit/    — 编辑 / 增强
└── standard-api/  — MJ-V7 / Niji7 / Niji6
```

### 5. 生成结果索引
```text
06-generated/asset-index.md — 资产登记总索引
```
