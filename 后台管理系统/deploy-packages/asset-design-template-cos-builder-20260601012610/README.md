# 资产设计模板 COS 构建包

这个包用于把用户提供的 14 张参考图按固定顺序上传到 COS，并写入新画布资产设计节点的模板缩略图与提示词。

当前包不会强行部署占位缩略图。必须先补齐真实参考图：

1. 在本机仓库放入 14 张参考图：
   `/Users/billy/Documents/AI_pro/漫剧创作库/template-reference-input/`
2. 按图 2 从左到右、从上到下命名：
   `01.png` ... `14.png`，也支持 `.jpg`、`.jpeg`、`.webp`。
3. 在本机仓库运行：
   `cd /Users/billy/Documents/AI_pro/漫剧创作库 && python3 tools/build_asset_design_templates_from_refs.py`
4. 脚本会上传 COS，并重写：
   `tools/workbench-web/image-studio-canvas-next.html`
5. 重新打包部署包后，部署脚本会校验 14 条 COS 映射、模板标记和缩略图弹窗标记。

模板顺序固定为：
粉系九宫格设定板、粉系长页全案板、工业蓝图角色档案、角色比例档案板、肖像细节蓝图板、雾蓝针织设定板、粉色针织设定板、雾蓝半身细节板、五官妆容材质板、雾蓝肖像设计板、粉色肖像设计板、混合五官蓝图板、中文多角度档案板、柔光海报档案板。
