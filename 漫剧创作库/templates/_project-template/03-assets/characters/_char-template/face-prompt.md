# 角色模板 — Character Template

> 复制此模板为每个角色创建独立文件夹
> 文件夹命名格式：`char-001-姓名`（三位数字序号）

---

## 角色文件夹结构

```
char-001-name/
├── face-prompt.md          ← 【必填】面部特写参考图提示词
├── three-view-prompt.md    ← 【必填】三视图参考图提示词
├── costume-variants/       ← 【换装时新建】
│   ├── variant-01-xxx.md
│   └── variant-02-xxx.md
└── status-log.md           ← 【自动更新】角色状态变化记录
```

---

## face-prompt.md — 面部特写提示词

> AI 图像生成用。Seedance 2.0 生成角色一致性参考图。

```markdown
# [角色名] — 面部特写参考图

## 基本信息
- 角色 ID：char-001
- 状态：日常装
- 生成日期：YYYY-MM-DD

## 参考图提示词（中文 + 英文）

[中文描述]
[角色名]的特写面部照。年轻[年龄]岁[性别]，五官清晰立体。
眉形[眉形描述]，眼神[眼神描述]，有[面部特征]。
面部无过度美化，保留真实皮肤质感。
面部表情：[当前表情]。
光线：自然侧光，冷色调，在[场景]中。

[English Prompt]
Close-up portrait of [Name], [age] years old [gender],
sharp facial features, [eye description],
[introducing detail], natural skin texture,
neutral expression, soft side lighting,
cinematic, realistic, Seedance 2.0 style.

## 禁忌描述（不要写入提示词）
- 避免：过度磨皮、卡通化、美颜滤镜感
- 避免：特定明星脸描述（如"像某明星"）
- 避免：模糊或不完整的描述

## 复用记录
- ep001 ✅ 日常装（首次生成）
```
