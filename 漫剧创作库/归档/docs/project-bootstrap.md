# Project Bootstrap — 新项目初始化指南

## 适用对象
第一次搭建 AI 漫剧/短剧项目的小白用户。

## 初始化步骤

### 1. 复制模板

#### 新建短剧项目
```bash
cp -r templates/_project-template projects/你的剧名_001
```

#### 新建漫剧项目
```bash
cp -r templates/_manga-template projects/你的漫剧名_001
```

### 2. 修改项目根目录中的 `project.json`
建议填写：
- 项目名
- 类型（短剧 / 漫剧）
- 总集数
- 目标平台
- 主模型
- 主风格
- 当前状态
- 如需接入兼容 API 文本模型，可在 `llm_models` 中登记 `id / name / base_url / api_key_env / purpose`，API Key 建议只放环境变量，不直接写入仓库

### 2.5 开剧前确定整剧风格

正式写剧、生成资产、拆分镜或做视频提示词之前，必须先确定本剧风格母版。若使用 HZW大师风格，优先复制：

```bash
cp templates/_shared/hzw-master-style-template.md projects/你的剧名_001/03-assets/style/hzw-style-bible.md
```

风格母版必须明确：
- 整剧视觉风格是什么
- 编剧师风格是什么
- 导演风格是什么
- 分镜师风格是什么
- 后续提示词、资产图片、分镜图、视频必须共同遵守哪些锚点和红线

### 3. 先完成这 4 个文件
优先级最高：
1. `01-story/logline.md`
2. `01-story/character-bible.md`
3. `01-story/outline-100ep.md`
4. `03-assets/scenes/scene-index.md`

### 4. 再做导演与分镜
等故事和资产基本明确后，再开始：
- `02-director/`
- `04-storyboard/`
- `05-prompts/`

## 推荐最小启动法（小白专用）

如果你怕太复杂，不要一上来做完整项目。
推荐只做：
- 1 个主角
- 1 个反派
- 2 个场景
- 1 集完整样片

路径示例：
- `scripts/ep001.md`
- `04-storyboard/ep001-storyboard.md`
- `05-prompts/seedance/ep001.md`

## 常见错误

### 错误 1：先做图，后补故事
会导致素材越做越乱。

### 错误 2：角色没定就开始大量生成
会导致角色跨集不一致。

### 错误 3：提示词不分类
会导致 Seedance、可灵、海螺的提示词混在一起，后期很难维护。

## 建议节奏

### 第一天
- 定题材
- 写 logline
- 建角色关系

### 第二天
- 写 ep001 剧本
- 设计主角和主场景

### 第三天
- 出 ep001 分镜
- 生成样片素材

### 第四天
- 剪样片
- 做复盘
