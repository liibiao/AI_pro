# 舞蹈律动与唯美动作规范 (Dance & Rhythm Aesthetics Standard)

> 适用范围：高光慢镜头、剑舞、双人舞、凄美转场、Seedance 视频生成
> 核心目标：解决 AI 生成唯美动作时的“机械感”和“僵硬感”，赋予动作极具延展性的曲线美和呼吸感。

---

## 1. 核心问题与指导思想
**痛点**：AI 处理舞蹈或柔美动作时，经常把关节折断，或者动作像机器人数节拍。
**原则**：舞蹈美学不追求“快准狠”，而是追求**“极致的延展（Extension）”**、**“身体的曲线（Curves）”**和**“动量的滞后（Follow-through）”**。

---

## 2. 唯美动作的三大视觉法则

### 2.1 身体曲线的极值 (C-Curve & S-Curve)
唯美的动作定格，必须形成优美的几何曲线。
- **C 形曲线**：主角仰天长啸、或极度悲伤时的后仰，脊柱形成拉满的弓形。
- **S 形曲线**：经典的回眸、持剑侧立，通过肩膀、腰部和臀部的扭转，形成 S 形张力（Contrapposto 对应法则）。
- **提示词映射**：`elegant S-curve posture, hyper-extended limbs, graceful arching of the back, Contrapposto stance`

### 2.2 动量滞后与余韵 (Follow-through & Overlapping Action)
这是动画十二法则中最重要的一条。
- **现象**：当舞者（或剑客）突然停下脚步时，他们的裙摆、长发、丝带绝不会立刻停下，而是会因为惯性继续向前飘动，然后再缓缓落下。
- **视觉效果**：这是制造“仙气”和“呼吸感”的灵魂。
- **提示词映射**：`character suddenly halts, but the long silk sleeves and hair continue to float forward in the air due to momentum, lingering motion`

### 2.3 慢动作的呼吸感 (Breathing Slow-Mo)
唯美高光时刻，时间必须被拉长。
- **镜头运动**：禁止使用快切或剧烈晃动。镜头必须像舞伴一样，围绕主体进行极其平滑的**轨道环绕（Orbit）**或**缓慢推近（Slow Push-in）**。
- **微尘与光斑**：在慢动作中，空气中漂浮的灰尘或细小的雪花也必须处于极慢的漂浮状态，烘托神圣感。
- **提示词映射**：`extreme slow motion, ultra-smooth slow orbit camera around the character, floating embers drifting lazily in the air`

---

## 3. 工作流执行门禁
- **Director (导演)**：在设计高光唯美镜头时，必须明确标出**“定格瞬间的身体曲线形状”**（C或S）。
- **Studio (执行)**：在 Seedance 提示词中，强制加入 `flowing hair, billowing fabrics` 等词汇，并使用视频首尾帧入口来锁定极致的曲线姿态。
- **Reviewer (审片)**：检查动作停止后，是否有衣服/头发的“滞后飘动”。如果没有，打回重做（因为那看起来像假人）。