# 道具设计图任务卡 — 系统 UI 面板

> 工作流：UI 设计图 + 状态变体
> 模型：MJ-Niji7（动漫插画风格）
> 资产类型：道具设计图
> 优先级：P0

---

## 1. 设计图规格

### 整体布局
- **排版**：2 × 2 四宫格
- **背景**：纯灰色背景（#808080）
- **画面要求**：不得出现文字和边框

### 四宫格内容
| 位置 | 内容 |
|------|------|
| 左上 | 主面板全貌（力量数值 + 等级 + 灵纹信息） |
| 右上 | 提示弹窗（新手礼包激活确认） |
| 左下 | 激活瞬间（面板炸裂成金色光粒） |
| 右下 | 日常查看（半透明悬浮，安静显示） |

---

## 2. 道具特征锚点

- 风格：半透明 HUD，科技感 + 玄幻感混合
- 配色：金色边框 + 黑底半透明 + 白色/金色文字
- 出现方式：浮在画面上层，不遮挡角色主体
- 面板元素：力量数值条、等级显示、灵纹类型、激活按钮
- 粒子效果：金色粒子汇聚/消散

---

## 3. MJ-Niji7 直出提示词（英文）

```text
UI design sheet of Infinite Enhancement System HUD panel, 2x2 grid layout on solid gray background, Top-left: main panel full view semi-transparent golden sci-fi HUD with dark background gold borders showing power stats bar level info and spirit rune type, Top-right: notification popup window showing activation confirmation with golden glow, Bottom-left: activation moment panel shattering into golden light particles energy burst, Bottom-right: daily view mode semi-transparent floating quietly displaying stats peacefully, fantasy-tech hybrid style, golden particle effects, holographic feel, no text no borders, anime style, 8k quality --ar 1:1 --style raw
```

---

## 4. 执行信息

| 项目 | 值 |
|------|----|
| 模式 | `--mj-niji7` |
| 输出目录 | `06-generated/images/props/` |
| 文件命名 | `道具设计图-系统UI面板-v1-20260412.png` |
| 元数据文件 | `道具设计图-系统UI面板-v1.task.json` |
| 状态 | ⬜ 待执行 |

---

## 5. CLI 命令

```bash
python3 tools/runninghub_client.py \
  --mj-niji7 \
  --prompt "UI design sheet of Infinite Enhancement System HUD panel, 2x2 grid layout on solid gray background, Top-left: main panel full view semi-transparent golden sci-fi HUD with dark background gold borders showing power stats bar level info and spirit rune type, Top-right: notification popup window showing activation confirmation with golden glow, Bottom-left: activation moment panel shattering into golden light particles energy burst, Bottom-right: daily view mode semi-transparent floating quietly displaying stats peacefully, fantasy-tech hybrid style, golden particle effects, holographic feel, no text no borders, anime style, 8k quality" \
  --negative-prompt "text, words, letters, border, frame, watermark, signature, low quality, blurry" \
  --aspect-ratio 1:1 \
  --quality 1 \
  --output-dir "projects/无限强化_漫剧_001/06-generated/images/props/" \
  --download-prefix "道具设计图-系统UI面板-v1-" \
  --task-meta-file "projects/无限强化_漫剧_001/06-generated/images/props/道具设计图-系统UI面板-v1.task.json" \
  --print-mode-summary
```
