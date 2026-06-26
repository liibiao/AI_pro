# 资产设计模板 COS 构建包

这版脚本按 17 张参考图处理模板缩略图和提示词。

当前本机已经把现有 13 张参考图补成 `05.jpg` 到 `17.jpg`。还缺：

- `01` 粉系九宫格设定板
- `02` 粉系长页全案板
- `03` 工业蓝图角色档案
- `04` 角色比例档案板

把缺失的 4 张放入：

`/Users/billy/Documents/AI_pro/漫剧创作库/template-reference-input/`

命名为 `01.jpg`、`02.jpg`、`03.jpg`、`04.jpg` 后运行：

```bash
cd "/Users/billy/Documents/AI_pro/漫剧创作库"
./tools/package_asset_design_templates_after_refs.sh
```

脚本会上传 17 张图到 COS，重写新画布资产设计节点模板，并输出真正可部署的 `/tmp/asset-design-template-cos-final-*.tar.gz`。
