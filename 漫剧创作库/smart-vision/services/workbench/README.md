# services/workbench

这里保存无限画布相关后台服务副本，来源于原 `tools/` 中的工作台服务链路。

## 当前迁移范围

- `workbench_server.py`：本地工作台与无限画布 API 服务。
- `workbench_core.py`：工作台核心逻辑。
- `image_studio_backend.py`：图像生成与文件处理后端能力。
- `init_outputs.py`：输出目录初始化能力。
- `object_storage_uploader.py`：对象存储可选能力，保留为可切换链路。
- `workbench_cli.py`：CLI/启动入口副本，存在缺失依赖风险时仅作为保留参考。

不迁移与无限画布无直接关系的项目批处理脚本，除非后续确认平台需要项目流水线能力。
