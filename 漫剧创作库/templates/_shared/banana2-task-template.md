# Banana2 任务模板

> 用途：作为 RunningHub Banana2 的标准任务卡，统一记录输入参考图、提示词目标、执行参数、责任 Agent、结果去向与审核状态。适用于角色展示图、封面图、视觉探索图。

---

## 1. 基本信息
- **任务名称：**
- **项目：**
- **集数 / 阶段：**
- **任务类型：** 角色展示图 / 封面图 / 视觉探索图 / 其他
- **目标用途：** 资产沉淀 / 发布包装 / 风格探索 / 角色统一 / 其他
- **负责人：** prompt-lab / generation-executor / art-director / publisher
- **日期：**

---

## 2. RunningHub 工作流信息
- **workflow 名称：** Banana2
- **workflowId：** `2043087373063430146`
- **调用方式：** `tools/runninghub_client.py --banana2`
- **执行平台：** RunningHub

---

## 3. 输入参考图
### 人物参考图
- **路径：**
- **资产标签：** @人物 / @主角 / @服装变体
- **说明：**

### 服装参考图
- **路径：**
- **资产标签：** @服装 / @造型 / @风格变体
- **说明：**

### 场景参考图
- **路径：**
- **资产标签：** @场景 / @光影 / @氛围
- **说明：**

---

## 4. 提示词目标
- **主体目标：**
- **姿态 / 动作目标：**
- **气质 / 情绪目标：**
- **画面质感目标：**
- **禁止项：** 不要变脸 / 不要服装跑偏 / 不要场景过满 / 不要低级滤镜感

### 正式提示词
```text

```

---

## 5. 执行参数
- **ratio：** 9:16 / 3:4 / 1:1 / 其他
- **resolution：** 2k / 默认 / 其他
- **seed：**
- **filename_prefix：**
- **输出目录：** `06-generated/runninghub/banana2/`

---

## 6. 建议命令
```bash
python3 tools/runninghub_client.py \
  --banana2 \
  --char-file "<人物参考图路径>" \
  --cloth-file "<服装参考图路径>" \
  --scene-file "<场景参考图路径>" \
  --prompt "<正式提示词>" \
  --ratio 9:16 \
  --resolution 2k \
  --filename-prefix "banana2_task" \
  --output-dir "projects/<项目名>/06-generated/runninghub/banana2/<类型目录>"
```

---

## 7. 结果记录
- **执行结果：** 待执行 / 成功 / 失败 / 暂缓
- **输出文件：**
- **版本判断：** 主版本 / 备选版 / 失败版 / 观察版
- **主要问题：**
- **回退建议：**

---

## 8. 审核与归档
- **是否进入正式资产：** 是 / 否
- **是否进入发布物料：** 是 / 否
- **是否回填 `asset-index.md`：** 是 / 否
- **是否回填 `08-qa/`：** 是 / 否
- **是否抽回全局案例库：** 是 / 否

---

## 9. Agent 协作记录
- **art-director：** 判断人物 / 服装 / 场景匹配度
- **prompt-lab：** 整理提示词与变量控制
- **generation-executor：** 发起任务并归档原始结果
- **quality-control：** 判断一致性、用途适配性与合规
- **asset-librarian：** 回填资产索引与复用标签
- **publisher：** 若作为封面 / 宣发图使用，则接入发布包装链
