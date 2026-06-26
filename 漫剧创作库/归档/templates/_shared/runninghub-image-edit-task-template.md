# RunningHub 图像编辑任务模板

> 用途：统一记录 `banana2-edit` / `banana-pro-edit` 两类单图编辑任务，避免直接手写命令导致无法回溯。适用于角色图微调、封面图改造、气质修正、AB 比稿。

---

## 1. 基本信息
- **任务名称：**
- **项目：**
- **集数 / 镜头 / 页码：**
- **任务类型：** 角色微调 / 封面改造 / 海报试稿 / AB 比稿 / 其他
- **目标用途：** 正式资产 / 宣发物料 / 风格探索 / 其他
- **负责人：** prompt-lab / generation-executor / art-director / quality-control
- **日期：**

---

## 2. 工作流信息
- **workflow：** RunningHub 图像编辑复合工作流
- **workflowId：** `2043088500844662785`
- **模式：** `banana2-edit` / `banana-pro-edit`
- **调用脚本：** `tools/runninghub_client.py`
- **执行平台：** RunningHub

---

## 3. 输入图信息
- **输入图路径：**
- **输入图来源：** 角色图 / 封面草稿 / 海报草图 / 历史资产 / 其他
- **资产标签：** @角色 / @封面 / @海报 / @探索图 / @候选资产
- **当前问题：**
  - 例如：服装质感不够 / 气质不稳 / 构图不够像封面 / 面部不够统一

---

## 4. 任务目标
- **本轮目标：**
- **必须保留：**
- **重点强化：**
- **禁止项：** 不要变脸 / 不要换人 / 不要服装跑偏 / 不要低级滤镜感 / 不要背景喧宾夺主

### 正式提示词
```text

```

---

## 5. 执行参数
- **mode：** `banana2-edit` / `banana-pro-edit`
- **ratio：** 9:16 / 3:4 / 1:1 / 其他
- **resolution：** 2k / 默认 / 其他
- **seed：**
- **filename_prefix：**
- **输出目录：** `06-generated/runninghub/image-edit/`
- **是否 AB 对照：** 是 / 否
- **对照任务：**

---

## 6. 建议命令

### banana2-edit
```bash
python3 tools/runninghub_client.py \
  --banana2-edit \
  --input-file "<输入图路径>" \
  --prompt "<正式提示词>" \
  --ratio 9:16 \
  --resolution 2k \
  --seed 829788543 \
  --filename-prefix "edit_task" \
  --output-dir "projects/<项目名>/06-generated/runninghub/image-edit/banana2-edit/"
```

### banana-pro-edit
```bash
python3 tools/runninghub_client.py \
  --banana-pro-edit \
  --input-file "<输入图路径>" \
  --prompt "<正式提示词>" \
  --ratio 9:16 \
  --resolution 2k \
  --seed 829788543 \
  --filename-prefix "edit_task" \
  --output-dir "projects/<项目名>/06-generated/runninghub/image-edit/banana-pro-edit/"
```

---

## 7. 结果记录
- **执行结果：** 待执行 / 成功 / 失败 / 暂缓
- **输出文件：**
- **版本判断：** baseline-v1 / alt-v1 / final-v1 / failure-v1
- **主要问题：**
- **是否进入后续 upscale：** 是 / 否
- **回退建议：**

---

## 8. QA 审核
- **人物一致性：** 通过 / 不通过
- **五官稳定性：** 通过 / 不通过
- **服装与肢体逻辑：** 通过 / 不通过
- **构图适用性：** 通过 / 不通过
- **是否升级正式资产：** 是 / 否
- **审核结论：**

---

## 9. 归档要求
- **是否回填 `06-generated/asset-index.md`：** 是 / 否
- **是否回填 `08-qa/`：** 是 / 否
- **是否保留失败记录：** 是 / 否
- **是否进入全局案例库：** 是 / 否

---

## 10. Agent 协作记录
- **prompt-lab：**
- **generation-executor：**
- **art-director：**
- **quality-control：**
- **asset-librarian：**
- **publisher：**
