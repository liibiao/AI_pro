# 新项目启动检查清单

本清单用于新项目从模板复制完成后，快速检查 RunningHub 出图能力、图片目录、资产索引、QA 入口与 API Key 是否都已就位。

适用对象：
- 新建短剧项目
- 需要接入 RunningHub workflow / standard-api 的项目
- 需要把图片资产沉淀到 `06-generated/images/` 的项目

---

## 一、创建项目后的第一步

### 1. 复制项目模板
```bash
cp -r templates/_project-template projects/你的项目名_001
```

### 2. 填写项目基础信息
至少检查：
- `project.json`
- 项目名
- 类型
- 目标平台
- 主模型 / 辅助模型
- 当前状态

### 3. 开剧前风格母版检查
必须确认：
- [ ] 是否已确定整剧视觉风格
- [ ] 是否已确定编剧师风格
- [ ] 是否已确定导演风格
- [ ] 是否已确定分镜师风格
- [ ] 若使用 HZW大师风格，是否已从 `templates/_shared/hzw-master-style-template.md` 建立 `03-assets/style/hzw-style-bible.md`
- [ ] 后续提示词、资产图片、分镜图、视频是否都明确引用该风格母版

---

## 二、目录检查

### 1. RunningHub 任务卡目录是否存在
应包含：
```text
05-prompts/runninghub/
├── banana2/
├── image-edit/
└── standard-api/
```

### 2. 图片目录是否存在
应包含：
```text
06-generated/images/
├── characters/
├── props/
├── scenes/
└── others/
```

说明：
- 角色图放 `characters/`
- 道具图放 `props/`
- 场景图放 `scenes/`
- 测试图 / 探索图 / 临时图放 `others/`

### 3. asset-index 是否存在
应存在：
- `03-assets/asset-index.md`：设计资产索引
- `06-generated/asset-index.md`：生成资产索引

### 4. QA 入口是否存在
建议至少确认：
- `08-qa/`
- 生成审核模板
- 项目内 RunningHub 图像审核记录入口

---

## 三、RunningHub 使用分工检查

### 1. workflow 链用于什么
适合：
- `banana2`
- `banana2-edit`
- `banana-pro-edit`
- `portrait-upscale`

适用场景：
- 三参考图生成
- 单图编辑修正
- AB 对照修正
- 高清增强

### 2. standard-api 链用于什么
当前默认：
- `mj-v7`

适用场景：
- 快速测试图
- 封面探索图
- 风格探索图
- prompt 方向验证

### 3. 推荐决策顺序
- 先探索：`mj-v7`
- 再定向生成：`banana2`
- 再精修：`banana2-edit` / `banana-pro-edit`
- 最后增强：`portrait-upscale`

---

## 四、API Key 检查

### 1. 必须确认环境变量已存在
```bash
echo $RUNNINGHUB_API_KEY
```

如果为空，先配置：
```bash
export RUNNINGHUB_API_KEY="你的 API Key"
```

如需长期生效，再写入 shell 配置文件。

### 2. 不要做的事
- 不要把 API Key 写进项目文档
- 不要把 API Key 提交到仓库
- 不要把 API Key 写进任务卡正文

---

## 五、第一次跑图建议

### 1. 先跑一张测试图
建议优先：
- `05-prompts/runninghub/standard-api/mj-v7-task-template.md`

输出先放：
- `06-generated/images/others/`

### 2. 第一张图通过后再进入正式链
建议顺序：
1. 跑测试图
2. 记录 task metadata
3. 做 QA 判断
4. 回填 `06-generated/asset-index.md`
5. 再进入角色图 / 场景图 / 封面图正式制作

---

## 六、第一次归档必须检查的文件

至少保留：
- 对应任务卡
- 实际输出图
- `task.json` / `task-meta.json`
- `06-generated/asset-index.md` 记录
- `08-qa/` 审核记录

---

## 七、推荐入口文档
新项目启动后，建议优先看：
- `README.md`
- `05-prompts/runninghub/README.md`
- `06-generated/images/README.md`
- `docs/runninghub-client-cli-guide.md`
- `docs/runninghub-mj-v7-api-guide.md`

---

## 八、最终判断标准
一个新项目如果满足以下条件，就算 RunningHub 图片链路已启动完成：
- RunningHub 任务卡目录已存在
- 图片目录四分类已存在
- API Key 可用
- 第一张测试图已生成
- 测试图已进入 `06-generated/images/others/`
- 已有 task metadata
- 已在 `06-generated/asset-index.md` 登记
- 已有 QA 记录入口
