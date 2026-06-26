# 灵境 outputs 目录

这里是灵境工作流的正式输出区。

## 工作台入口

- **HTML 工作台**：`lingjing/outputs/workbench.html`
- **CLI 工作台**：`python3 lingjing/tools/workbench_cli.py`
- **使用文档**：`lingjing/docs/workbench-usage.md`

HTML 工作台适合可视化操作；CLI 工作台适合终端交互和批量流程。

## 标准结构

```text
lingjing/outputs/
└── [自动提炼的目录名]/
    ├── seedance/
    ├── 即梦/
    ├── 叙事/
    ├── ep001-prompts-viewer.html
    └── index.html
```

## 目录名提炼规则

优先级从高到低：

1. Markdown 一级标题
2. `《书名》` / `《剧名》`
3. `第X话/章/卷/集/篇 + 标题`
4. 前几行中的短标题文本
5. 首行首句截取

若目录已存在，会自动追加 `_2`、`_3` 以避免覆盖。

## 使用方式

### 1. 只初始化目录骨架

```bash
python3 lingjing/tools/init_outputs.py --text-file /绝对路径/你的剧本.md
```

或：

```bash
python3 lingjing/tools/init_outputs.py --text "# 第1话 废物\n林天在练武场被众人嘲笑……"
```

### 2. 把当前三版本结果直接导出到正式 outputs 目录

```bash
python3 lingjing/tools/export_current_outputs.py --text-file /绝对路径/你的剧本.md
```

或：

```bash
python3 lingjing/tools/export_current_outputs.py --text "# 第1话：废物\n林天在练武场被众人嘲笑，等待灵纹测试。"
```
