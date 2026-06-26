# 灵境双工作台使用文档

## 目标

灵境现在提供两种工作台入口：

- **HTML 工作台**：适合可视化操作、复制调用文本、直接触发本地 Python 执行流程
- **CLI 工作台**：适合终端环境、批量流程、脚本化调用

两者遵循同一套交互规则：

- 粘贴小说原文或剧本正文
- 可手动选择 **导演风格 / 视觉风格 / 视频时长**
- 不选择时，默认进入 **AI 智能模式**
- 自动提炼项目目录名
- 生成统一的运行方案摘要、调用文本和参数结果

---

## 一、HTML 工作台

### 推荐启动方式

最简方式是进入 `lingjing/` 子项目根目录后执行：

```bash
cd /Users/billy/Documents/AI_pro/漫剧创作库/lingjing
./lingjing-workbench
```

这条命令会自动完成两件事：

1. 启动 `lingjing/tools/workbench_server.py`
2. 自动打开 `http://127.0.0.1:8766/workbench.html`

你也可以拆开单独执行：

```bash
python3 /Users/billy/Documents/AI_pro/漫剧创作库/lingjing/tools/workbench_server.py
```

默认启动后会提供统一入口：

- `http://127.0.0.1:8766/workbench.html`
- `http://127.0.0.1:8766/index.html`

> 如果你只开了静态服务、没启动 `workbench_server.py`，页面仍可本地生成方案预览，但无法执行 `plan / init / export`。
>
> 在当前聊天里，你也可以直接对我说：`@LJ start`。这条口令的统一实现约定是优先执行 `cd /Users/billy/Documents/AI_pro/漫剧创作库/lingjing && ./lingjing-workbench start`；只有启动器不可用时，才降级为直接启动 `workbench_server.py`。

### 启动器附加命令

以下命令均在 `lingjing/` 目录下执行：

- `./lingjing-workbench`：启动服务并打开网页
- `./lingjing-workbench server`：只启动服务
- `./lingjing-workbench open`：只打开网页
- `./lingjing-workbench status`：查看服务状态
- `./lingjing-workbench stop`：停止服务

### 使用步骤

1. 启动 `workbench_server.py`
2. 打开 `workbench.html`
3. 在输入框中粘贴小说原文、剧本正文或剧情梗概
4. 可选填写或选择：
   - 项目目录名
   - 导演风格
   - 视觉风格
   - 视频时长
5. 根据需求点击：
   - **生成运行方案**：只在前端本地预览方案
   - **调用服务预览**：请求 Python 服务返回正式方案 JSON
   - **创建项目目录**：执行 `init`，创建 outputs 项目骨架
   - **导出正式结果**：执行 `export`，把当前 `lingjing/test/` 产物导出到正式项目目录
6. 在右侧查看：
   - 当前模式
   - 剧情类型
   - 节奏建议
   - 推荐理由
   - `@lingjing` 调用文本
   - 执行状态
   - 输出目录绝对路径
   - 可直接打开的结果链接

### 页面里新增的执行反馈

页面现在会实时显示：

- **服务状态**：是否成功连上本地 Python 服务
- **最近动作**：最近执行的是 `plan / init / export` 哪一个动作
- **输出目录**：实际创建或导出的目录绝对路径
- **结果链接**：项目入口页、总查看器、Seedance / 即梦 / 叙事页面、`outputs` 根入口

### 适合场景

- 需要边看边调风格，同时一键执行
- 需要给非终端用户提供可视化入口
- 需要从网页直接打开生成结果而不是再手动去找目录

---

## 二、CLI 工作台

文件位置：`lingjing/tools/workbench_cli.py`

### 交互式启动

```bash
python3 /Users/billy/Documents/AI_pro/漫剧创作库/lingjing/tools/workbench_cli.py
```

启动后流程为：

1. 粘贴正文
2. 输入 `END` 结束正文输入
3. 依次选择：
   - 导演风格
   - 视觉风格
   - 视频时长
   - 项目目录名（可回车自动提炼）
4. 查看终端中的方案摘要
5. 再选择下一步动作：
   - `plan`：仅生成运行方案
   - `init`：创建 outputs 项目目录骨架
   - `export`：导出当前 test 产物到正式 outputs

### 非交互参数模式

如果你已经有固定输入，也可以直接用参数执行：

```bash
python3 /Users/billy/Documents/AI_pro/漫剧创作库/lingjing/tools/workbench_cli.py \
  --text-file /绝对路径/你的剧本.md \
  --director nolan \
  --visual cinematic \
  --duration 60s \
  --project-name 废物_命令行版 \
  --action plan \
  --no-interactive
```

### 常见动作示例

#### 1. 只生成命令行方案预览

```bash
python3 /Users/billy/Documents/AI_pro/漫剧创作库/lingjing/tools/workbench_cli.py --text-file /绝对路径/你的剧本.md --no-interactive
```

#### 2. 直接创建项目目录骨架

```bash
python3 /Users/billy/Documents/AI_pro/漫剧创作库/lingjing/tools/workbench_cli.py \
  --text-file /绝对路径/你的剧本.md \
  --project-name 自定义项目名 \
  --action init \
  --no-interactive
```

#### 3. 直接导出当前 test 产物到正式 outputs

```bash
python3 /Users/billy/Documents/AI_pro/漫剧创作库/lingjing/tools/workbench_cli.py \
  --text-file /绝对路径/你的剧本.md \
  --director wong \
  --visual watercolor \
  --duration 90s \
  --action export \
  --no-interactive
```

### 参数说明

- `--text`：直接传入正文
- `--text-file`：从文件读取正文
- `--project-name`：手动指定项目目录名
- `--director`：导演风格 ID
- `--visual`：视觉风格 ID
- `--duration`：视频时长，如 `30s`、`60s`
- `--action`：`plan / init / export`
- `--no-interactive`：关闭交互提问，直接按参数执行

### 当前内置风格 ID 示例

#### 导演风格 ID

- `generic`
- `nolan`
- `cameron`
- `villeneuve`
- `spielberg`
- `scorsese`
- `fincher`
- `hitchcock`
- `wong`
- `tarantino`
- `kubrick`
- `miyazaki`
- `anderson`
- `lee_ang`
- `zhang`
- `bong`
- `chan`
- `new_wave`
- `carpenter`
- `park`
- `malick`
- `inarritu`
- `cuaron`
- `del_toro`
- `ridley`
- `wachowski`
- `zemeckis`
- `burton`
- `shinkai`
- `hosoda`
- `kon`
- `takahata`
- `lynch`
- `cronenberg`
- `romero`
- `peckinpah`
- `woo`
- `tsui`
- `yuen`
- `hou`
- `yang`
- `chen`
- `jia`
- `kim`
- `kore_eda`
- `kurosawa`
- `ozu`

#### 视觉风格 ID

- `cinematic`
- `anime`
- `donghua_xianxia`
- `ink_wash`
- `watercolor`
- `oil_painting`
- `comic`
- `pixel_art`
- `noir`
- `fantasy`
- `cyberpunk`
- `3d_render`
- `concept_art`

---

## 三、相关脚本关系

### `workbench_server.py`

这是网页工作台现在真正的执行桥：

- 提供 `workbench.html` 和 `outputs/index.html` 的统一访问入口
- 提供健康检查接口
- 提供执行接口，把网页参数转给 Python 工作流
- 返回项目目录和可打开链接

### `init_outputs.py`

用于只创建标准目录骨架：

- `seedance/`
- `即梦/`
- `叙事/`
- 项目级 `index.html`
- 根入口 `outputs/index.html`

### `export_current_outputs.py`

用于把 `lingjing/test/` 中当前已有产物导出到新的正式项目目录：

- `ep001-prompts-viewer.html`
- Seedance HTML / Markdown
- 即梦 HTML / Markdown
- 叙事 HTML / Markdown
- 项目入口页

### `workbench_cli.py`

用于提供命令行交互工作台，负责：

- 输入正文
- 收集风格偏好
- 生成统一运行方案
- 继续执行 `plan / init / export`

---

## 四、推荐使用方式

- **想可视化配置并直接打开结果页面**：优先用 `HTML` 工作台 + `workbench_server.py`
- **想在终端中连续处理多个项目**：优先用 `CLI` 工作台
- **想做自动化脚本串联**：使用 `CLI` 工作台的 `--no-interactive` 参数模式

如果后续还要继续升级，下一步最值得做的是把网页风格选项从 `HTML` 内写死，进一步改成直接读取 `wordlists` 词库，这样词库更新后工作台会自动同步。
