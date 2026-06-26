# RunningHub 人物高清增强任务模板

> 用途：统一记录 `portrait-upscale` 任务。它只用于后处理高清增强，不承担内容编辑职责。适用于封面图、角色卡、海报图、宣发图定稿前增强。

---

## 1. 基本信息
- **任务名称：**
- **项目：**
- **集数 / 镜头 / 页码：**
- **任务类型：** 高清增强 / 宣发定稿 / 角色卡精修 / 海报精修 / 其他
- **目标用途：** 正式资产 / 宣发物料 / 发布包装 / 其他
- **负责人：** generation-executor / quality-control / publisher
- **日期：**

---

## 2. 工作流信息
- **workflow：** RunningHub 图像编辑与高清增强复合工作流
- **workflowId：** `2043088500844662785`
- **模式：** `portrait-upscale`
- **调用脚本：** `tools/runninghub_client.py`
- **执行平台：** RunningHub

---

## 3. 输入图信息
- **输入图路径：**
- **输入图来源：** 已通过 QA 的角色图 / 封面图 / 海报图 / 宣发图
- **资产标签：** @正式资产 / @封面 / @海报 / @角色卡 / @待增强
- **增强原因：**
  - 例如：分辨率不够 / 发布前细节不足 / 需要平台裁切前高清化

---

## 4. 执行目标
- **本轮目标：**
- **必须保留：**
- **重点关注：** 五官、头发边缘、服装纹理、皮肤质感、背景层次
- **禁止项：** 不要蜡像感 / 不要边缘毛刺 / 不要假细节过载 / 不要背景异常锐化

---

## 5. 执行参数
- **mode：** `portrait-upscale`
- **upscale-model：**
- **filename_prefix：**
- **输出目录：** `06-generated/runninghub/image-edit/portrait-upscale/`
- **前置版本：** baseline-v1 / final-v1 / 其他

---

## 6. 建议命令
```bash
python3 tools/runninghub_client.py \
  --portrait-upscale \
  --input-file "<输入图路径>" \
  --upscale-model "4x-UltraSharp.pth" \
  --filename-prefix "portrait_upscale_task" \
  --output-dir "projects/<项目名>/06-generated/runninghub/image-edit/portrait-upscale/"
```

---

## 7. 结果记录
- **执行结果：** 待执行 / 成功 / 失败 / 暂缓
- **输出文件：**
- **版本判断：** final-upscale-v1 / failure-v1 / alt-upscale-v1
- **主要问题：**
- **是否可进入发布包装：** 是 / 否
- **回退建议：**

---

## 8. QA 审核
- **清晰度提升是否成立：** 通过 / 不通过
- **脸部是否自然：** 通过 / 不通过
- **头发边缘是否干净：** 通过 / 不通过
- **衣物纹理是否自然：** 通过 / 不通过
- **背景是否稳定：** 通过 / 不通过
- **是否可升级正式发布版：** 是 / 否
- **审核结论：**

---

## 9. 归档要求
- **是否回填 `06-generated/asset-index.md`：** 是 / 否
- **是否回填 `08-qa/`：** 是 / 否
- **是否进入发布目录：** 是 / 否
- **是否保留失败记录：** 是 / 否

---

## 10. Agent 协作记录
- **generation-executor：**
- **quality-control：**
- **asset-librarian：**
- **publisher：**
