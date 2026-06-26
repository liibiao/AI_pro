import argparse
import os
import re
from pathlib import Path


def parse_ref_table(md_text):
    lines = md_text.splitlines()
    in_table = False
    header = False
    rows = []
    for line in lines:
        if line.strip() == "## 参考图清单":
            in_table = False
            header = False
            continue
        if line.startswith("|") and "用途" in line and "文件路径" in line and "用于镜头" in line:
            in_table = True
            header = True
            continue
        if in_table and header and re.match(r"^\|\s*-+\s*\|", line):
            continue
        if in_table:
            if not line.startswith("|"):
                if rows:
                    break
                continue
            parts = [p.strip() for p in line.strip().strip("|").split("|")]
            if len(parts) < 3:
                continue
            tag, path, used = parts[0], parts[1], parts[2]
            if not tag.startswith("@"):
                continue
            rows.append({"tag": tag, "path": path, "used": used})
    return rows


def parse_shots(md_text):
    lines = md_text.splitlines()
    shots = []
    current = None
    for line in lines:
        if line.startswith("## Shot"):
            if current:
                shots.append(current)
            current = {"title": line.strip(), "lines": []}
            continue
        if current is None:
            continue
        if line.startswith("## 全片技术参数"):
            break
        current["lines"].append(line)
    if current:
        shots.append(current)

    parsed = []
    for shot in shots:
        ref_line_idx = None
        refs = []
        for i, line in enumerate(shot["lines"]):
            if line.startswith("【参考】"):
                ref_line_idx = i
                rhs = line.replace("【参考】", "").strip()
                rhs = rhs.replace("，", ",")
                tokens = [t.strip() for t in rhs.split(",") if t.strip()]
                refs = tokens
                break
        parsed.append({"title": shot["title"], "lines": shot["lines"], "ref_line_idx": ref_line_idx, "refs": refs})
    return parsed


def build_upload_order(tags):
    chars = [t for t in tags if t.startswith("@char-")]
    scenes = [t for t in tags if t.startswith("@scene-")]
    props = [t for t in tags if t.startswith("@prop-")]
    others = [t for t in tags if t not in set(chars + scenes + props)]
    ordered = chars + scenes + props + others
    mapping = {}
    for idx, tag in enumerate(ordered, start=1):
        mapping[tag] = f"Image{idx}"
    return ordered, mapping


def replace_refs_in_shots(shots, mapping, tag_to_display):
    out = []
    for shot in shots:
        lines = shot["lines"][:]
        if shot["ref_line_idx"] is not None:
            mapped = []
            for ref in shot["refs"]:
                clean_ref = ref if ref.startswith("@") else f"@{ref}"
                display_name = tag_to_display.get(clean_ref, clean_ref.lstrip("@"))
                mapped.append(f"@{display_name}")
            lines[shot["ref_line_idx"]] = "【参考】" + ", ".join(mapped)
        out.append({"title": shot["title"], "lines": lines})
    return out


def should_enable_combat_controls(mapped_shots):
    keywords = [
        "打斗", "武戏", "对撞", "拳", "踢", "劈", "斩", "格挡", "架剑", "推开", "爆发",
        "冲击波", "涟漪", "反震", "弹飞", "弹开", "砰", "sparks", "splash", "parry", "slash",
    ]
    for shot in mapped_shots:
        blob = "\n".join([shot["title"]] + shot["lines"])
        if any(k.lower() in blob.lower() for k in keywords):
            return True
    return False


def load_asset_index_tag_paths(asset_index_path):
    if not asset_index_path.exists():
        return {}
    md = asset_index_path.read_text(encoding="utf-8")
    lines = md.splitlines()
    in_table = False
    header_found = False
    tag_to_path = {}
    for line in lines:
        if line.strip() == "| @引用标签 | 落盘文件 |":
            in_table = True
            header_found = True
            continue
        if in_table and header_found and re.match(r"^\|\s*-+\s*\|", line):
            continue
        if in_table:
            if not line.startswith("|"):
                if tag_to_path:
                    break
                continue
            parts = [p.strip() for p in line.strip().strip("|").split("|")]
            if len(parts) < 2:
                continue
            tag = parts[0]
            path = parts[1].strip("`").strip()
            if tag.startswith("@") and path:
                tag_to_path[tag] = path
    return tag_to_path


def _resolve_latest_scene_path(project_dir, rel_path):
    if not rel_path or "/images/scenes/" not in rel_path:
        return rel_path

    p = (project_dir / rel_path).resolve()
    if not p.exists():
        return rel_path

    filename = p.name
    m = re.match(r"^(?P<base>.+)-v(?P<v>\d+)-(?P<n>\d+)\.png$", filename)
    if not m:
        return rel_path

    base = m.group("base")
    best = None
    best_v = -1
    best_n = -1
    for cand in p.parent.glob(f"{base}-v*-*.png"):
        m2 = re.match(rf"^{re.escape(base)}-v(\d+)-(\d+)\.png$", cand.name)
        if not m2:
            continue
        v = int(m2.group(1))
        n = int(m2.group(2))
        if (v, n) > (best_v, best_n):
            best_v, best_n = v, n
            best = cand

    if not best:
        return rel_path

    return str(best.relative_to(project_dir))


def _clean_spaces(text):
    return re.sub(r"\s{2,}", " ", text).strip()


def _is_placeholder_speech(text):
    t = (text or "").strip()
    t = re.sub(r"[。\.！!？?]+$", "", t).strip()
    t = t.replace(" ", "")
    return t in {"一秒", "旁白：一秒", "N/A", "旁白：N/A"}


def _extract_inline_audio_from_visual_line(line):
    speech = []
    inline_sfx = []

    patterns = [
        r"（对白/旁白：([^）]+)）",
        r"（对白：([^）]+)）",
        r"（旁白：([^）]+)）",
    ]
    for pat in patterns:
        m = re.search(pat, line)
        if m:
            content = m.group(1).strip()
            if content.startswith("音效："):
                inline_sfx.append(content.replace("音效：", "", 1).strip())
            else:
                if not _is_placeholder_speech(content):
                    speech.append(content)
            line = re.sub(pat, "", line)

    m_sfx = re.search(r"（音效：([^）]+)）", line)
    if m_sfx:
        inline_sfx.append(m_sfx.group(1).strip())
        line = re.sub(r"（音效：[^）]+）", "", line)

    m_mix = re.search(r"（对白/旁白：([^）]*音效：[^）]+)）", line)
    if m_mix:
        content = m_mix.group(1)
        parts = [p.strip() for p in content.split("音效：") if p.strip()]
        if parts:
            speech_part = parts[0].strip("，, ")
            if speech_part:
                speech.append(speech_part)
        if len(parts) > 1:
            inline_sfx.append(parts[1].strip("，, "))
        line = re.sub(r"（对白/旁白：[^）]+）", "", line)

    return _clean_spaces(line), speech, inline_sfx


def _style_directives(style):
    presets = {
        "纪实克制": [
            "风格偏好（纪实克制）：机位克制、情绪内收、信息可读优先；少炫技，多用真实空间与表演细节完成压迫与反转。",
            "摄影机：以标头/轻长焦为主，轻微呼吸感推拉；手持只在“心理不稳”时极弱介入。",
            "光影：自然主义主光+少量负补光；阴影压迫但不遮眼神与口型。",
            "声音：环境底噪与拟音比 BGM 更重要；BGM 以低频 Drone 铺底，爆点前先抽空。",
        ],
        "形式主义": [
            "风格偏好（形式主义）：构图秩序与几何线条优先；对称/中轴/框中框；机位更像“舞台调度”。",
            "摄影机：固定机位优先；推拉极少且必须有叙事动机；景深偏深，空间关系清晰。",
            "光影：主光更硬、更明确；明暗分区清晰，强调权力结构与层级。",
            "剪辑：硬切更果断；节奏更像“章法”，用重复与对位建立压迫感。",
            "声音：拟音极干净，节拍感清晰；台词停顿更有“仪式感”。",
        ],
        "新黑色": [
            "风格偏好（新黑色）：低调光、高反差、负空间、边缘轮廓光；冷色黑位干净，情绪阴冷。",
            "摄影机：中长焦压缩空间制造窒息；景深更浅，背景沉入黑位；允许轻微雨雾/空气颗粒但不糊主体。",
            "光影：负补光明显；高光严格受控；眼睛必须有一条可读的 catchlight。",
            "调色：冷青灰/蓝黑为主，点光（灵纹/系统金光）做局部对比。",
            "声音：BGM 更少；用房间混响、脚步回声、耳鸣/闷声做主观压迫。",
        ],
        "热血爆点": [
            "风格偏好（热血爆点）：爽点兑现明确；动作结果镜头更硬更清；节奏更快但不乱。",
            "摄影机：关键爆点允许快速推入/甩镜，但命中点必须定住；背景可带速度感，人物边缘必须清。",
            "光影：爆点对比更强；灵纹/雷霆/系统金光允许局部高亮，但禁止全屏光污染遮脸。",
            "声音：打击音分层更夸张（sub hit + 肉感 + 碎裂）；爆点前先静后响；尾音必须收束成钩子。",
        ],
    }
    return presets.get(style, presets["纪实克制"])


def _global_mother_directives(style, enable_combat, verbosity="long"):
    if verbosity == "short":
        lines = [
            f"风格旋钮：{style}（可选：纪实克制/形式主义/新黑色/热血爆点）",
            "",
            "全局母指令（稳定性优先，镜头只写差异项）：",
            "",
            "摄影机系统：标头/轻长焦为主；主体清晰；运镜克制（无动机不花活）。",
            "镜头运动质感：默认稳定；压迫/不安=极轻手持；高速动作允许背景速度感，但人物/武器边缘必须清。",
            "几何门禁（构图稳定）：roll=0±1°；禁 Dutch；地平线/消失点稳定；对话/对峙眼线一致；禁止跳轴。",
            "",
            "光影方案：主光方向全片一致；冷蓝灵纹/系统金光作点光；读点必须见光，脸不被特效糊。",
            "对比与黑位：黑位干净；暗部有层次；高光受控不过曝。",
            "",
            "调色与质感：低饱和冷调；爆点仅在灵纹/雷霆/系统金光局部提饱和；轻 film grain；锐度人物>字>背景。",
            "",
            "美术与构图秩序：读点顺序明确；前中后景分层；禁新增角色/乱加道具/UI；字幕安全区留白。",
            "",
            "剪辑与节奏：留白可用；爆点抬 1-2 拍即收；转场仅硬切/叠化/闪切/定格。",
            "",
            "声音总纲：配音优先；底噪铺空间；拟音重材质；SFX 分层；BGM 克制；可用先静后响/反高潮静音。",
            "",
            "导演门禁：先建空间再动作；屏幕方向/站位跨镜头一致；守 180° 轴线；首看点不可被特效遮挡。",
            "群戏门禁：分组锁位；人数/节拍/循环固定；切镜不重排；群声方位一致并让位台词。",
            "坐标门禁：9:16 x,y 描述；主角活动区/群众禁入区明确；群演位移≤3%/秒；读点≈中心偏上 1/3±5%。",
            "字幕/版式门禁（9:16）：字幕安全区= y0.82-1.00 禁入。",
            "负向约束（门禁）：禁新增角色/随机道具/UI/水印/黑边/过曝雾化导致主体糊。",
            "",
            "红线门禁（方法论强制约束，不可覆盖）：",
            "镜头动作融合（核心红线）：帧率切换/运镜/景别变化必须与具体动作时刻绑定编写，禁止独立列出'镜头与构图'板块；每个时间戳必须紧跟具体动作，格式 [时间戳] 角色动作→镜头响应；升格/降格必须说明为放大什么动作细节或释放什么冲击感。",
            "文戏同理：镜头推近/景别切换必须与微表情变化/视线移动/身体姿态转变绑定，不能单独写'镜头缓慢推近'。",
            "禁止抽象词：不写'高级感/电影感/氛围感/震撼/激烈打斗'，必须拆成可执行视觉信息。",
            "六固定段名强制：环境联动/光线/对白配音/音效设计/画质/负面提示词——所有版本必须保留，只能压缩不能删除。",
            "对白配音段只负责人声层（台词/旁白/心声/气口/语速），音效设计段统一负责环境音+拟音+特效音+状态音；无对白时必须写'本段无对白配音'。",
            "每个片段必须从 0s 开始计时，标题时长与正文时间轴必须一致。",
            "",
            "风格偏好（覆盖项）：",
        ]
    else:
        lines = [
            f"风格旋钮：{style}（可选：纪实克制/形式主义/新黑色/热血爆点）",
            "",
            "全局母指令（稳定性优先，镜头只写差异项）：",
            "",
            "摄影机系统：真实电影机位语言；镜头以标头/轻长焦为主，少用极端广角避免脸部变形；景深策略=主体清晰、背景可适度虚化；运镜克制，除非剧情动机强烈否则避免花活。",
            "镜头运动质感：默认稳定电影感；需要压迫/不安时允许轻微手持颗粒感（幅度极小）；高速动作时背景允许速度感，人物与武器边缘必须清晰可读。",
            "几何门禁（构图稳定）：画面水平 roll=0±1°；倾斜镜头(Dutch angle)默认禁止；地平线/消失点尽量稳定（同一空间不乱漂）；对话/对峙保持眼线高度一致。",
            "",
            "光影方案：主光方向全片一致；末世暗灰基底+冷蓝灵纹光作为点光源；人物面部不允许被特效光污染糊掉；关键读点（眼神/手/命中点/道具字）必须被光线照见。",
            "对比与黑位：黑位干净，不雾化；暗部保留层次，避免整张灰；高光受控，避免塑料反光与过曝。",
            "",
            "调色与质感：低饱和冷调为主，爆点只在'灵纹/雷霆/系统金光'局部提饱和；轻 film grain；锐度分配=人物>关键道具字>背景；拒绝廉价霓虹彩虹全屏光污染。",
            "",
            "美术与构图秩序：读点顺序=首看点→第二读点→环境信息；三层景别（前/中/后）清晰；禁止新增角色、禁止乱加道具、禁止乱贴文字UI；字幕安全区必须留白，关键动作不进入安全区。",
            "",
            "剪辑与节奏：留白是武器——在'羞辱/钩子/爆点前'允许抽空；爆点只抬 1-2 拍马上收束；转场只用硬切/叠化/闪切/定格，不要炫技转场。",
            "",
            "声音总纲（按《听觉设计与声音蒙太奇规范》）：配音永远优先；环境底噪( Room Tone )先铺空间；拟音必须反映材质与重量；特效音分层（低频冲击/中频肉感/高频碎裂或电弧）；BGM克制，关键台词与关键命中点必须让位；允许'反高潮静音'与'先静后响'制造张力。",
            "",
            "导演门禁（空间与读点）：先建立空间再动作；人物相对位置与屏幕方向必须跨镜头一致；遵守 180° 轴线（不随意跳轴）；角色与关键道具的“谁前谁后/谁高谁低/谁左谁右/距离与视线落点”必须写清；首看点必须可见且不被特效遮挡。",
            "群戏门禁（人群调度）：人群必须分组并锁定屏幕方位（左/右/后），三组不穿越主角前景，不互相穿插走位；三组人数固定、动作循环固定、节拍频率固定（每 2 秒最多 1 次集体动作，其他时刻只做微小呼吸/头部微动）；镜头切换时群演保持上一镜结束姿态，禁止瞬间重排；群声与画面方位一致（左侧起哄、右侧窃笑、后景围压），并让位主台词。",
            "坐标门禁（解决站位漂移）：采用 9:16 归一化屏幕坐标 x,y∈[0,1]（x=左→右，y=上→下）描述站位；主角活动区与群众禁入区必须明确；群演位移≤画面宽度的 3%/秒；命中点/首看点固定在中心偏上 1/3 附近（允许 ±5% 微调）。",
            "字幕/版式门禁（9:16）：字幕安全区= y0.82-1.00；关键读点（脸/眼神/手/命中点/关键字）禁止进入字幕安全区；群演与道具也不得侵入该区，避免遮挡字幕与信息冲突。",
            "负向约束（门禁）：禁止额外角色；禁止随机道具；禁止多余 UI/字幕/水印/Logo；禁止黑边与画幅漂移；禁止过度磨皮与塑料高光；禁止全屏雾化导致主体糊。",
            "",
            "红线门禁（方法论强制约束，不可覆盖）：",
            "镜头动作融合（核心红线）：帧率切换/运镜/景别变化必须与具体动作时刻绑定编写，禁止独立列出'镜头与构图'板块；每个时间戳必须紧跟具体动作，格式 [时间戳] 角色动作→镜头响应；升格/降格必须说明为放大什么动作细节或释放什么冲击感。",
            "文戏同理：镜头推近/景别切换必须与微表情变化/视线移动/身体姿态转变绑定，不能单独写'镜头缓慢推近'。",
            "禁止抽象词：不写'高级感/电影感/氛围感/震撼/激烈打斗'，必须拆成可执行视觉信息。",
            "六固定段名强制：环境联动/光线/对白配音/音效设计/画质/负面提示词——所有版本必须保留，只能压缩不能删除。",
            "对白配音段只负责人声层（台词/旁白/心声/气口/语速），音效设计段统一负责环境音+拟音+特效音+状态音；无对白时必须写'本段无对白配音'。",
            "每个片段必须从 0s 开始计时，标题时长与正文时间轴必须一致。",
            "",
            "风格偏好（覆盖项）：",
        ]
    lines.extend(_style_directives(style))
    if enable_combat:
        lines.extend([
            "",
            "打戏门禁：命中点/结果镜头清晰；受力反馈必须落到'推/退/碎/裂/回弹'的可读结果；音效先给命中瞬态再给尾音与环境回响，禁止一团噪声糊过去。",
        ])
    return lines


def _compress_audio_payload(audio_text):
    if not audio_text:
        return audio_text
    parts = [p.strip() for p in audio_text.split("|") if p.strip()]
    keep = []
    for p in parts:
        if ":" not in p:
            keep.append(p)
            continue
        k, v = p.split(":", 1)
        v = v.strip()
        v = re.split(r"[；。]\s*", v, maxsplit=1)[0].strip()
        v = v.replace("+", "、")
        items = [x.strip() for x in re.split(r"[、/]", v) if x.strip()]
        if len(items) > 2:
            v = "、".join(items[:2]) + "…"
        else:
            v = "、".join(items)
        keep.append(f"{k.strip()}: {v}".strip())
    return " | ".join(keep)


def _compress_visual_payload(visual_text, max_chars=140):
    if not visual_text:
        return visual_text
        
    v = visual_text
    
    # Auto-inject environmental suspension for high-power moments
    if any(k in v for k in ["气浪", "爆发", "能量", "觉醒", "威压", "灵纹", "天崩地裂"]):
        v += "，环境重力异常(碎石/血珠悬浮缓降)"
        
    for t in [
        "保留对白区",
        "保留对白/音效字安全区",
        "字幕安全区",
        "漫画分镜构图",
        "层级清晰",
        "禁止跳轴",
    ]:
        v = v.replace(t, "")
    v = re.sub(r"\s+", " ", v).strip()
    v = re.sub(r"[,，]{2,}", "，", v)
    if len(v) <= max_chars:
        return v
    cut = re.split(r"[。；]\s*", v, maxsplit=1)[0].strip()
    if cut and len(cut) >= 24:
        v = cut
    if len(v) > max_chars:
        v = v[: max_chars - 1].rstrip() + "…"
    return v


def _compress_shot_lines_for_short(lines):
    out = []
    for line in lines:
        if line.startswith("【参考】"):
            rhs = line.replace("【参考】", "").strip()
            rhs = rhs.replace("，", ",")
            tokens = [t.strip() for t in re.split(r"[, ]+", rhs) if t.strip()]
            tags = []
            for t in tokens:
                if not t.startswith("@"):
                    continue
                if t not in tags:
                    tags.append(t)
            out.append("【参考】" + ", ".join(tags))
            continue
        if line.startswith("【几何约束】"):
            # Keep only protected technical strings
            out.append("【几何约束】" + _condense_text(line.replace("【几何约束】", ""), ratio=0.1))
            continue
        if line.startswith("【读点保护】"):
            # Keep only protected technical strings
            out.append("【读点保护】" + _condense_text(line.replace("【读点保护】", ""), ratio=0.1))
            continue
        if line.startswith("【位置关系】"):
            payload = line.replace("【位置关系】", "").strip()
            parts = [p.strip() for p in payload.split(" | ") if p.strip()]
            kv = {}
            for p in parts:
                if ":" not in p:
                    continue
                k, v = p.split(":", 1)
                k = k.strip()
                if k not in ["空间", "左", "右", "前", "后", "主体", "道具", "轴线", "站位", "核心站位"]:
                    continue
                v_clean = re.sub(r"\(.*?\)", "", v).strip()
                if v_clean:
                    kv[k] = v_clean

            ordered = []
            for k in ["空间", "主体", "左", "右", "前", "后", "道具", "轴线"]:
                if k in kv:
                    ordered.append(f"{k}:{kv[k]}")
            if not ordered:
                out.append("【位置关系】" + _condense_text(payload, ratio=0.3))
            else:
                out.append("【位置关系】" + " | ".join(ordered))
            continue
        if line.startswith("【音效】"):
            # Only keep top 1-2 keywords
            payload = line.replace("【音效】", "", 1).strip()
            sfx = _condense_text(payload, ratio=0.2)
            out.append("【音效】" + sfx)
            continue
        if line.startswith("【画面】"):
            payload = line.replace("【画面】", "", 1).strip()
            
            # Auto-inject environmental suspension for high-power moments
            if any(k in payload for k in ["气浪", "爆发", "能量", "觉醒", "威压", "灵纹", "天崩地裂", "黑金光辉"]):
                if "悬浮" not in payload:
                    payload += "，环境重力异常(碎石/血珠/雨滴悬浮缓降)"
            
            out.append("【画面】" + _condense_text(payload, ratio=0.3))
            continue
        if line.startswith("【表演】"):
            payload = line.replace("【表演】", "", 1).strip()
            out.append("【表演】" + _condense_text(payload, ratio=0.3))
            continue
        if line.startswith("【风格】"):
            out.append("【风格】3D国漫；纪实克制")
            continue
        if line.startswith("【运镜】"):
            payload = line.replace("【运镜】", "", 1).strip()
            out.append("【运镜】" + _condense_text(payload, ratio=0.4))
            continue
        if line.startswith("【转场】"):
            out.append(line)
            continue
        if line.startswith("【") and "】" in line:
            tag = line[:line.find("】")+1]
            payload = line[line.find("】")+1:].strip()
            out.append(tag + _condense_text(payload, ratio=0.3))
            continue
        out.append(line)
    return out


def _extract_ref_tags_from_lines(lines):
    for line in lines:
        if line.startswith("【参考】"):
            rhs = line.replace("【参考】", "").strip()
            rhs = rhs.replace("，", ",")
            tokens = [t.strip() for t in rhs.split(",") if t.strip()]
            tags = []
            for t in tokens:
                t = t.strip()
                if not t.startswith("@"):
                    continue
                if t not in tags:
                    tags.append(t)
            return tags
    return []


def _pick_subject_tag_for_short(blocking, lines):
    subject = _pick_subject_from_blocking(blocking)
    if subject:
        return f"@{subject}"

    refs = _extract_ref_tags_from_lines(lines)
    if refs:
        for prefer in ["林天觉醒前", "林天觉醒后", "林天", "林婉儿", "林傲天", "林啸", "执事长老"]:
            for r in refs:
                if prefer in r:
                    return r
        return refs[0]

    if blocking:
        candidates = []
        for m in re.finditer(r"(主体|左|右|前|后|道具|空间):\s*([^|]+)", blocking):
            v = m.group(2).strip()
            if v:
                candidates.append(v)
        for prefer in ["林天觉醒前", "林天觉醒后", "林天", "林婉儿", "林傲天", "林啸", "执事长老"]:
            for c in candidates:
                if prefer in c:
                    return f"@{c}"
        if candidates:
            return f"@{candidates[0]}"

    return "@林天"


def _episode_pack_name(ep: str):
    try:
        n = int(ep)
    except Exception:
        n = 0
    idx = (max(n, 1) - 1) // 10 + 1
    return f"第{idx:02d}集"


def _prompt_output_dirs(project_dir: Path, ep: str):
    base = project_dir / "05-prompts/seedance" / _episode_pack_name(ep)
    return {
        "base": base,
        "omni": base / "即梦",
        "seedance": base / "seedance",
        "narrative": base / "叙事",
    }


def _move_with_collision(src: Path, dst: Path):
    if not src.exists():
        return False
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not dst.exists():
        src.rename(dst)
        return True

    stem = dst.name[:-3] if dst.name.endswith(".md") else dst.name
    alt = dst.parent / f"{stem}.migrated.md"
    i = 1
    while alt.exists() and i <= 200:
        alt = dst.parent / f"{stem}.migrated{i}.md"
        i += 1
    if alt.exists():
        return False
    src.rename(alt)
    return True


def _migrate_legacy_prompt_files(project_dir: Path, ep: str, out_dirs: dict):
    legacy_dir = project_dir / "05-prompts/seedance"
    mapping = [
        (legacy_dir / f"ep{ep}-omni-paste.md", out_dirs["omni"] / f"ep{ep}-omni-paste.md"),
        (legacy_dir / f"ep{ep}-omni-paste.short.md", out_dirs["omni"] / f"ep{ep}-omni-paste.short.md"),
        (legacy_dir / f"ep{ep}-omni-paste.compact.md", out_dirs["omni"] / f"ep{ep}-omni-paste.compact.md"),
        (legacy_dir / f"ep{ep}-seedance2-paste.md", out_dirs["seedance"] / f"ep{ep}-seedance2-paste.md"),
        (legacy_dir / f"ep{ep}-seedance2-paste.short.md", out_dirs["seedance"] / f"ep{ep}-seedance2-paste.short.md"),
        (
            legacy_dir / f"ep{ep}-seedance2-narrative-paste.md",
            out_dirs["narrative"] / f"ep{ep}-seedance2-narrative-paste.md",
        ),
        (
            legacy_dir / f"ep{ep}-seedance2-narrative-paste.short.md",
            out_dirs["narrative"] / f"ep{ep}-seedance2-narrative-paste.short.md",
        ),
    ]

    moved = 0
    for src, dst in mapping:
        if _move_with_collision(src, dst):
            moved += 1
    if moved:
        print(f"    ✅ 已迁移旧文件 -> 第{_episode_pack_name(ep).lstrip('第')}（ep{ep} 共 {moved} 个）")


def _infer_shot_params(lines):
    blob = "\n".join(lines)

    size = None
    if "特写" in blob:
        size = "特写"
    elif "近景" in blob:
        size = "近景"
    elif "中景" in blob or "中近景" in blob:
        size = "中景"
    elif "全景" in blob:
        size = "全景"
    elif "远景" in blob:
        size = "远景"

    if size in ["特写", "近景"]:
        lens = "50-85mm"
        dof = "浅景深"
    elif size == "中景":
        lens = "35-50mm"
        dof = "中等景深"
    elif size in ["全景", "远景"]:
        lens = "24-35mm"
        dof = "偏深景深"
    else:
        lens = "35-50mm"
        dof = "中等景深"

    angle = []
    if "仰拍" in blob or "仰视" in blob:
        angle.append("低机位仰拍")
    if "俯拍" in blob or "俯视" in blob:
        angle.append("高机位俯拍")
    if "手持" in blob or "Handheld" in blob:
        angle.append("极轻手持")

    if any(k in blob for k in ["交锋", "对撞", "毫厘之间", "闪避", "破空", "瞬息", "子弹时间"]):
        angle.append("变速升格(撞击瞬间子弹时间)")

    if any(k in blob for k in ["濒死", "暴走", "终结", "连击", "死斗", "绝杀", "重击", "天崩地裂"]):
        if any(k in blob for k in ["拳", "踢", "打", "击", "命中", "冲击", "对撞"]):
            angle.append("ACT主观视角(跟随受力方向，打击停顿感)")

    angle_text = "，".join(angle) if angle else "眼平为主"
    return f"【镜头参数】焦段倾向 {lens}；{dof}；机位 {angle_text}"


def _infer_camera_geometry(lines):
    blob = "\n".join(lines)
    size = None
    if "特写" in blob:
        size = "特写"
    elif "近景" in blob:
        size = "近景"
    elif "中景" in blob or "中近景" in blob:
        size = "中景"
    elif "全景" in blob:
        size = "全景"
    elif "远景" in blob:
        size = "远景"

    if size in ["特写", "近景"]:
        eyeline = "眼线 y0.50±0.06（口型/眼神可读）"
        horizon = "地平线不可见时：背景线条保持水平，消失点不漂"
    elif size == "中景":
        eyeline = "眼线 y0.48±0.05"
        horizon = "地平线 y0.42±0.04（或以建筑水平线替代）"
    else:
        eyeline = "眼线 y0.46±0.05"
        horizon = "地平线 y0.42±0.03（同一空间保持稳定）"

    roll_text = "roll=0±1°"
    if any(k in blob for k in ["濒死", "暴走", "终结", "连击", "极限", "致命", "死斗", "绝杀", "天崩地裂"]):
        roll_text = "roll=0±1°（高张力允许短暂Dutch angle倾斜构图打破平衡，下一镜必须恢复）"
        
    distortion_text = ""
    if size in ["特写", "近景"] and any(k in blob for k in ["砸", "挥", "逼近", "压迫", "捏", "掐", "贯穿", "撕"]):
        distortion_text = "；广角畸变，前景武器/肢体极度夸张放大"

    return f"【几何约束】{horizon}；{eyeline}；{roll_text}；禁止跳轴；同空间消失点稳定{distortion_text}"


def _infer_transition(shot_title, shot_lines):
    blob = "\n".join([shot_title] + shot_lines)
    has_crowd = any(k in blob for k in ["围观", "群众", "人群", "起哄", "嘲笑", "压成一圈", "围成一圈", "包围", "环形", "群众分组锁定"])
    if any(k in blob for k in ["定格", "硬切定格", "钩子", "悬念"]):
        base = "【转场】定格→硬切（声音可先静后响，钩子更锋利）"
        if has_crowd:
            return base + "；群演循环不变，只切主角反应"
        return base
    if any(k in blob for k in ["闪回", "回忆", "Match Cut", "Action Match Cut"]):
        base = "【转场】Match Cut（动作/形状/声音桥接，避免生硬跳切）"
        if has_crowd:
            return base + "；群演循环不变，只切主角反应"
        return base
    if "HOOK" in shot_title:
        base = "【转场】叠化→硬切（先稳后狠，保证信息可读）"
        if has_crowd:
            return base + "；群演循环不变，只切主角反应"
        return base
    if "PROBLEM" in shot_title:
        base = "【转场】硬切（压迫感上压下）"
        if has_crowd:
            return base + "；群演循环不变，只切主角反应"
        return base
    if "SOLUTION" in shot_title:
        base = "【转场】闪切（抬节奏只抬一拍，立刻收束）"
        if has_crowd:
            return base + "；群演循环不变，只切主角反应"
        return base
    if "CTA" in shot_title:
        base = "【转场】硬切（收束/钩子）"
        if has_crowd:
            return base + "；群演循环不变，只切主角反应"
        return base
    base = "【转场】硬切/叠化（按节奏留白决定）"
    if has_crowd:
        return base + "；群演循环不变，只切主角反应"
    return base


def _infer_performance(shot_title, shot_lines):
    blob = "\n".join([shot_title] + shot_lines)
    cues = []

    if any(k in blob for k in ["死寂", "留白", "静到", "定格"]):
        cues.append("动作压住；呼吸压低；停顿要“能听见静”")
    if any(k in blob for k in ["眼神", "瞳孔", "视线", "盯"]):
        cues.append("眼神落点明确；眨眼减少；视线不要飘")
    if any(k in blob for k in ["不甘", "杀气", "压迫", "羞辱", "嘲笑", "起哄"]):
        cues.append("微表情克制：眉压/嘴角紧/下颌线绷；情绪在皮下翻涌")
    if any(k in blob for k in ["咬", "咬紧", "承压", "紧绷"]):
        cues.append("咬肌/下颌线绷紧可读；喉结轻微吞咽")
    if any(k in blob for k in ["拳", "命中", "砰", "冲击", "弹飞", "对撞"]):
        cues.append("受力反应必须落到身体：肩胛/手腕/指节细微回弹；不要一张脸糊过去")
    if any(k in blob for k in ["拉住", "衣角", "颤抖"]):
        cues.append("手指抓握有力度变化；指尖发白/颤抖幅度极小但可读")
    if any(k in blob for k in ["系统", "HUD", "UI", "提示音", "绑定"]):
        cues.append("听到提示音的瞬间：瞳孔收缩/呼吸停半拍；情绪从空白→不可思议")

    if not cues:
        cues.append("表演克制；微动作可读；情绪通过呼吸与眼神推进")

    return "【表演】" + "；".join(cues)


def _infer_blocking(ref_tags, tag_to_display, shot_title, shot_lines, orientation_state):
    chars = []
    scenes = []
    props = []
    display_to_kind = {}
    for t, display in tag_to_display.items():
        if not display:
            continue
        key = f"@{display}"
        if t.startswith("@char-"):
            display_to_kind[key] = "char"
        elif t.startswith("@scene-"):
            display_to_kind[key] = "scene"
        elif t.startswith("@prop-"):
            display_to_kind[key] = "prop"
    for t in ref_tags:
        if t.startswith("@char-"):
            chars.append(tag_to_display.get(t, t.lstrip("@")))
        elif t.startswith("@scene-"):
            scenes.append(tag_to_display.get(t, t.lstrip("@")))
        elif t.startswith("@prop-"):
            props.append(tag_to_display.get(t, t.lstrip("@")))
        else:
            kind = display_to_kind.get(t, "")
            if kind == "char":
                chars.append(t.lstrip("@"))
            elif kind == "scene":
                scenes.append(t.lstrip("@"))
            elif kind == "prop":
                props.append(t.lstrip("@"))

    blob = "\n".join([shot_title] + shot_lines)
    parts = []

    if scenes:
        parts.append(f"空间: {scenes[0]}（前/中/后景层级清晰，保留字幕安全区）")
    else:
        parts.append("空间: 当前空间（前/中/后景层级清晰，保留字幕安全区）")

    crowd_keywords = ["围观", "群众", "人群", "起哄", "嘲笑", "压成一圈", "围成一圈", "包围", "环形"]
    has_crowd = any(k in blob for k in crowd_keywords) or any(("群众" in c or "围观" in c or "人群" in c) for c in chars)
    crowd_grouping = (
        "群众分组锁定: 左侧起哄组=3人(画面左侧中景)，右侧窃笑组=2人(画面右侧中景)，后景围压组=5人(画面中心偏后景)；"
        "三组不穿越主体前景，不互相穿插走位，不抢镜头读点；"
        "动作循环(节拍锁定): 每 2 秒最多 1 次集体动作；左侧=指指点点+起哄一拍→立刻收声；右侧=交头接耳+压笑气音→停顿；后景=半步前压→停住→半步回弹；其余时刻只做微小呼吸/头部微动；"
        "镜头切换连续性: 群演保持上一镜结束姿态与位置，禁止瞬间换站位/换人数；"
        "群声方位随画面（左起哄/右窃笑/后压迫），不盖主台词；"
        "屏幕坐标锁定(9:16 x,y): 主角活动区 x0.40-0.60 y0.55-0.95（群众禁入）；左组 x0.05-0.30 y0.45-0.75；右组 x0.70-0.95 y0.45-0.75；后组 x0.30-0.70 y0.15-0.45；"
        "路径点: 左/右组 A(原位)→B(前压5%)→A；后组 A(y0.35)→B(y0.42)→A；位移≤3%画面宽度/秒；"
        "字幕安全区禁入: y0.82-1.00 任何群演/道具/特效不得进入"
    )

    if not chars and props:
        parts.append(f"读点: {props[0]} 位于画面中心偏上 1/3，文字/纹理可读")
        return "【位置关系】" + " | ".join(parts)

    def pick_protagonist(items):
        for key in ["林天觉醒前", "林天", "林婉儿"]:
            for x in items:
                if key in x:
                    return x
        return items[0] if items else ""

    def pick_antagonist(items):
        for key in ["林傲天", "林啸"]:
            for x in items:
                if key in x:
                    return x
        for x in items:
            if x != pick_protagonist(items):
                return x
        return items[0] if items else ""

    def formation_template(items):
        if any(k in blob for k in ["俯视", "俯拍", "居高临下", "上位", "高位"]):
            return "上位俯视构图"
        if any(k in blob for k in ["围成一圈", "压成一圈", "包围", "环形"]):
            return "环形围压"
        if any(k in blob for k in ["身后", "站后方", "站在后方", "后方", "背后"]):
            return "一前一后"
        if len(items) >= 3:
            return "三角站位"
        return ""

    if len(chars) == 1:
        c = chars[0]
        formation = "环形围压" if has_crowd else ""
        if formation:
            parts.append(f"队形模板: {formation}")
        side = orientation_state.get(c, "画面右侧")
        if side.startswith("画面左侧"):
            c_xy = "坐标: x0.30 y0.70"
        elif side.startswith("画面右侧"):
            c_xy = "坐标: x0.70 y0.70"
        else:
            c_xy = "坐标: x0.50 y0.70"
        if any(k in blob for k in ["孤立", "被围", "压成一圈"]):
            parts.append(f"主体: {c} 位于{side}偏前景（{c_xy}）；人群/环境围成环形中景，主体与背景拉开景深")
            parts.append("轴线: 以主体→首看点为轴线，跨镜头保持主体屏幕方向不互换")
            parts.append(crowd_grouping)
        elif any(k in blob for k in ["特写", "近景"]):
            parts.append(f"主体: {c} 占画面 60-70%（{c_xy}）；眼神/口型清晰；背景信息降对比")
        else:
            parts.append(f"主体: {c} 位于{side}（{c_xy}），留出对手/读点的反打空间")

        if props:
            if any(k in blob for k in ["手", "握", "抓", "拍"]):
                parts.append(f"道具: {props[0]} 与主体手部同框，命中点在画面中心偏上 1/3")
            else:
                parts.append(f"道具: {props[0]} 位于主体附近，不能抢主读点")
        if has_crowd:
            parts.append(crowd_grouping)
        return "【位置关系】" + " | ".join(parts)

    if len(chars) >= 2:
        formation = formation_template(chars)
        protagonist = pick_protagonist(chars)
        antagonist = pick_antagonist(chars)
        a = antagonist if antagonist else chars[0]
        b = protagonist if protagonist else chars[1]

        a_side = orientation_state.get(a, "画面右侧")
        b_side = orientation_state.get(b, "画面左侧")
        a_xy = "坐标: x0.70 y0.60"
        b_xy = "坐标: x0.30 y0.70"
        if a_side.startswith("画面左侧"):
            a_xy = "坐标: x0.30 y0.60"
        if b_side.startswith("画面右侧"):
            b_xy = "坐标: x0.70 y0.70"

        dominance_keywords = ["居高临下", "压制", "俯视", "高位", "碾压", "傲然", "上位"]
        if any(k in blob for k in dominance_keywords):
            a_side, b_side = "画面左侧（上位/前景）", "画面右侧（下位/后景）"
            a_xy, b_xy = "坐标: x0.30 y0.55", "坐标: x0.70 y0.78"
            if ("林傲天" in b or "林啸" in b) and ("林傲天" not in a and "林啸" not in a):
                a, b = b, a

        if formation:
            parts.append(f"队形模板: {formation}")

        if formation == "环形围压" or has_crowd:
            parts.append(f"核心站位: {a} {a_side}（上位/前景，{a_xy}），{b} {b_side}（下位/后景，{b_xy}）；群众/人群作为环形中景压迫圈，脸可虚化但嘲笑态度可读")
            parts.append("轴线: 以核心二人连线为 180°轴线，不跳轴；反打需先给建立镜头")
            parts.append(crowd_grouping)
        elif formation == "一前一后":
            parts.append(f"站位: {a} 前景（{a_xy}，压迫/遮挡边缘可接受但不遮脸），{b} 后景（{b_xy}，眼神可读）；两人相距 1-2m；屏幕方向固定 {a_side}↔{b_side}")
        elif formation == "上位俯视构图":
            parts.append(f"站位: {a} 画面左侧（上位/前景，{a_xy}），{b} 画面右侧（下位/后景，{b_xy}）；高度差明确（俯视/仰视但不跳轴）；距离 2-4m")
        else:
            if any(k in blob for k in ["对峙", "盯", "心理屏障"]):
                parts.append(f"站位: {a} {a_side}（{a_xy}），{b} {b_side}（{b_xy}）；两人相距 2-4m；视线互锁，眼神落点明确")
            elif any(k in blob for k in ["拉住", "衣角"]):
                parts.append(f"站位: {a} 与 {b} 近距离同框（0.3-0.6m）；拉拽动作发生在画面下 1/3；手指用力可读")
            elif any(k in blob for k in ["命中", "拳", "砰", "对撞"]):
                attacker = protagonist or b
                defender = antagonist or a
                if ("砸在金甲" in blob or "砸在战甲" in blob) and any("林傲天" in x for x in chars):
                    defender = next(x for x in chars if "林傲天" in x)
                    attacker = next(x for x in chars if x != defender)
                attacker_side = orientation_state.get(attacker, a_side)
                defender_side = orientation_state.get(defender, b_side)
                attacker_xy = "坐标: x0.70 y0.72" if attacker_side.startswith("画面右侧") else "坐标: x0.30 y0.72"
                defender_xy = "坐标: x0.30 y0.62" if defender_side.startswith("画面左侧") else "坐标: x0.70 y0.62"
                parts.append(f"站位: {attacker} {attacker_side}前景出拳（{attacker_xy}），{defender} {defender_side}中景受力（{defender_xy}）；命中点固定在画面中心偏上 1/3；禁止跳轴")
            else:
                if len(chars) >= 3:
                    third = ""
                    for x in chars:
                        if x not in [a, b]:
                            third = x
                            break
                    third_side = orientation_state.get(third, "画面中心偏后景")
                    third_xy = "坐标: x0.50 y0.55"
                    parts.append(f"三角站位: {a} {a_side}，{b} {b_side}，{third} {third_side}；三点构成稳定三角形，保持左右方向与高度关系不互换")
                    parts.append(f"坐标建议: {a}({a_xy})，{b}({b_xy})，{third}({third_xy})；全员禁止侵入字幕安全区 y0.82-1.00")
                else:
                    parts.append(f"站位: {a} {a_side}，{b} {b_side}；前中后景分层，保持屏幕方向一致")

        if props:
            parts.append(f"道具: {props[0]} 与命中点/读点同轴呈现，字样/纹理必须可读")

        if any(k in blob for k in ["仰拍", "仰视"]):
            parts.append("机位: 低机位仰拍加强上位压迫，但不改变左右屏幕方向")
        if any(k in blob for k in ["俯拍", "俯视"]):
            parts.append("机位: 高机位俯拍强调弱势，但不改变左右屏幕方向")

        return "【位置关系】" + " | ".join(parts)

    if scenes and not chars and not props:
        parts.append("构图: 建立镜头，读点顺序=空间→主舞台→压迫要素；字幕安全区 y0.82-1.00 保留")
        return "【位置关系】" + " | ".join(parts)

    return "【位置关系】" + " | ".join(parts) + " | 空间关系清晰：谁在前/谁在后/谁在左/谁在右/距离/视线落点/命中点必须写明"


def _extract_first_look(text):
    m = re.search(r"首看点[:：]\s*([^）]+)", text)
    if not m:
        return ""
    s = m.group(1).strip()
    s = re.sub(r"[""\"']", "", s)
    s = re.sub(r"^[（(]+", "", s)
    s = re.sub(r"[)）]+$", "", s)
    s = s.strip(" ，,。；;：: ")
    return s


def _infer_readpoint_guard(first_look, shot_lines):
    blocking = ""
    for line in shot_lines:
        if line.startswith("【位置关系】"):
            blocking = line
            break

    readpoint = ""
    m = re.search(r"读点:\s*([^|]+)", blocking)
    if m:
        readpoint = m.group(1).strip()
    if not readpoint:
        m2 = re.search(r"道具:\s*([^|]+)", blocking)
        if m2:
            readpoint = m2.group(1).strip()

    focus = first_look or readpoint
    if not focus:
        focus = "首看点"

    rules = [
        f"首看点={focus}",
        "坐标= x0.50±0.05, y0.33±0.05（中心偏上 1/3 锁定）",
        "对比与清晰度优先（人物>关键道具字/命中点>背景）",
        "任何特效光/运动模糊不得遮挡首看点",
        "禁止侵入字幕安全区 y0.82-1.00",
    ]

    if any(k in focus for k in ["字样", "文字", "姓名", "契约", "婚约", "牌匾"]):
        rules.append("文字必须可读（至少 1 秒稳定呈现）")
    if any(k in focus for k in ["眼神", "瞳孔", "目光", "眼睛"]):
        rules.append("眼睛必须有 catchlight；眨眼减少；视线落点稳定")
    if any(k in focus for k in ["命中", "拳", "砰", "冲击", "裂血", "指节"]):
        rules.append("命中点固定在中心偏上 1/3；结果帧清晰可读")

    return "【读点保护】" + "；".join(rules)


def _build_space_anchor(tags, tag_to_display, orientation_state, variant="long"):
    scene_names = []
    char_names = []
    for t in tags:
        if t.startswith("@scene-"):
            scene_names.append(tag_to_display.get(t, t.lstrip("@")))
        if t.startswith("@char-"):
            char_names.append(tag_to_display.get(t, t.lstrip("@")))

    def uniq(items):
        out = []
        for x in items:
            if x and x not in out:
                out.append(x)
        return out

    scene_names = uniq(scene_names)
    char_names = uniq(char_names)

    anchor = []
    if scene_names:
        anchor.append("主空间=" + " / ".join(scene_names[:2]))
    if char_names:
        pairs = []
        for n in char_names[:4]:
            side = orientation_state.get(n, "")
            if side:
                pairs.append(f"{n}:{side}")
            else:
                pairs.append(n)
        anchor.append("屏幕方向锁定=" + "，".join(pairs))
        if len(char_names) >= 2:
            anchor.append(f"180°轴线={char_names[0]}↔{char_names[1]}（不跳轴）")
    
    if variant == "short":
        # Only keep the most essential part for short version
        anchor.append("roll=0±1° | 禁字幕安全区")
    else:
        anchor.append("距离标尺=对峙 2-4m；拉拽 0.3-0.6m；命中点=中心偏上 1/3")
        anchor.append("地平线与眼线=地平线 y0.42±0.03（同空间稳定）；眼线 y0.48±0.05（对话一致）；roll=0±1°")
        anchor.append("连续性=同一空间内左右/前后/高低关系不互换；如需反打先给建立镜头再切")

    return ["空间锚定：" + " | ".join(anchor), ""]


def _build_pro_audio_line(shot_title, shot_lines, extracted_inline_sfx):
    blob = "\n".join([shot_title] + shot_lines)

    room_tone = []
    foley = []
    sfx = []
    bgm = []
    state = []
    mix = []

    if any(k in blob for k in ["联邦", "废土", "风沙", "屏障"]):
        room_tone.append("风沙底噪+远处低频轰鸣（屏障/城市压迫感）")
        sfx.append("远处异兽低吼/剪影掠过的风声（极弱，点到为止）")
    if any(k in blob for k in ["练武场", "人群", "起哄", "嘲笑"]):
        room_tone.append("练武场室外底噪（热浪+尘土+远处人声）")
        foley.append("衣料摩擦、脚步踩尘、低声窃笑的气音")
        mix.append("群众声做侧后方空间定位，不盖主台词")
    if any(k in blob for k in ["家主大殿", "大殿", "家主", "跪"]):
        room_tone.append("室内大殿空旷混响+低频压迫底噪")
        foley.append("衣摆摩擦、跪地/膝盖落石砖的闷响")
        mix.append("混响只给空间，不给对白（对白保持清晰）")
    if any(k in blob for k in ["系统", "HUD", "UI", "面板", "提示音", "绑定"]):
        room_tone.append("极低电流/数字噪声底床（黑暗空间感）")
        sfx.append("系统提示音（冷、短、硬）+粒子汇聚的细碎高频")
        bgm.append("BGM极克制：低频Drone，关键提示音时让出频段")

    if any(k in blob for k in ["战甲", "金甲", "铠甲"]):
        foley.append("金属战甲碰撞、重步伐金属回响")
    if any(k in blob for k in ["玉扳指", "扳指"]):
        foley.append("玉扳指轻转的细腻摩擦声（权力支点）")
    if any(k in blob for k in ["碎石", "落地", "死寂", "留白", "静到"]):
        bgm.append("BGM瞬停/抽空（反高潮静音）")
        sfx.append("碎石落地的清脆单点（放大，让观众'听见静'）")
        mix.append("留白段提升动态范围：先静后响")

    if any(k in blob for k in ["拳", "命中", "砰", "撞", "冲击波", "弹飞", "弹开", "对撞"]):
        sfx.append("打击主音：低频闷击+中频肉感+高频碎裂（分层）")
        sfx.append("冲击波/气浪：whoosh+低频sub hit（不要糊成一团）")
        mix.append("命中点要清晰可读，先给主音再给尾音")
    if any(k in blob for k in ["雷", "电弧", "雷光", "炸裂"]):
        sfx.append("电弧滋滋+雷爆瞬态（尾音带空气热畸变感）")

    if any(k in blob for k in ["紧张", "压迫", "不可思议", "羞辱"]):
        bgm.append("低频压迫Drone（不旋律化，避免喧宾夺主）")
    if any(k in blob for k in ["高光", "爆发", "爽点"]):
        bgm.append("高光段短促抬升（只抬1-2拍，马上收束）")
    if any(k in blob for k in ["钩子", "定格", "瞳孔", "眼神"]):
        bgm.append("结尾收束：刹停或留一条细长高频尾音做钩子")
        state.append("呼吸/吞咽的微弱状态音（拉近主观）")

    if any(k in blob for k in ["手颤", "颤抖", "咬紧", "承压", "不甘", "杀气"]):
        state.append("心跳/呼吸贴近（主观音），随情绪收紧")
    if any(k in blob for k in ["耳鸣", "失聪", "闷声"]):
        state.append("耳鸣（切断环境+BGM）→声音猛灌回（惊吓落点）")

    if extracted_inline_sfx:
        sfx.extend(extracted_inline_sfx)

    def join(items):
        uniq = []
        for x in items:
            if x and x not in uniq:
                uniq.append(x)
        return "；".join(uniq)

    parts = []
    rt = join(room_tone)
    if rt:
        parts.append(f"环境底噪: {rt}")
    fx = join(foley)
    if fx:
        parts.append(f"拟音: {fx}")
    s = join(sfx)
    if s:
        parts.append(f"特效音: {s}")
    m = join(state)
    if m:
        parts.append(f"状态音: {m}")
    b = join(bgm)
    if b:
        parts.append(f"BGM: {b}")
    mx = join(mix)
    if mx:
        parts.append(f"混音: {mx}")

    if not parts:
        parts.append("环境底噪: 贴合空间的 Room Tone；拟音: 动作材质可读；BGM: 克制留白")

    return "【音效】" + " | ".join(parts)


def _find_time_range(lines):
    for line in lines:
        m = re.match(r"^【\s*(\d+)\s*-\s*(\d+)\s*s\s*】$", line.strip())
        if m:
            a = m.group(1)
            b = m.group(2)
            return f"【{a}s-{b}s】"
        m2 = re.match(r"^【\s*(\d+)\s*s\s*-\s*(\d+)\s*s\s*】$", line.strip())
        if m2:
            a = m2.group(1)
            b = m2.group(2)
            return f"【{a}s-{b}s】"
    return ""


def _pick_subject_from_blocking(blocking_line):
    if not blocking_line:
        return ""
    m = re.search(r"核心站位:\s*([^ ]+)", blocking_line)
    if m:
        return m.group(1).strip("，,")
    m2 = re.search(r"主体:\s*([^ ]+)", blocking_line)
    if m2:
        return m2.group(1).strip("，,")
    m3 = re.search(r"站位:\s*([^ ]+)", blocking_line)
    if m3:
        return m3.group(1).strip("，,")
    m4 = re.search(r"读点:\s*([^ ]+)", blocking_line)
    if m4:
        return m4.group(1).strip("，,")
    m5 = re.search(r"道具:\s*([^ ]+)", blocking_line)
    if m5:
        return m5.group(1).strip("，,")
    return ""


def _infer_facing(subject, blocking_line):
    if not blocking_line or not subject:
        return "面向首看点"
    left = f"{subject} 画面左侧"
    right = f"{subject} 画面右侧"
    if left in blocking_line or "画面左侧" in blocking_line and subject in blocking_line:
        return "面朝画面右侧（对手/读点方向）"
    if right in blocking_line or "画面右侧" in blocking_line and subject in blocking_line:
        return "面朝画面左侧（对手/读点方向）"
    if "视线互锁" in blocking_line:
        return "面向对手（视线互锁）"
    return "面向首看点"


def _infer_lighting_line(shot_title, shot_lines):
    blob = "\n".join([shot_title] + shot_lines)
    if any(k in blob for k in ["练武场", "正午", "烈日", "室外"]):
        return "光影：硬主光（日照）+少负补光；尘土体积光克制；角色脸部不被特效光污染"
    if any(k in blob for k in ["大殿", "殿内", "殿柱", "室内"]):
        return "光影：室内硬边侧光+强明暗分区；混响空间感由暗部层次承担，不雾化糊脸"
    if any(k in blob for k in ["系统", "HUD", "UI", "面板", "提示音", "绑定"]):
        return "光影：暗部为主，局部金光/冷光作读点；高光受控，黑位干净"
    if any(k in blob for k in ["雷", "电弧", "紫", "雷光"]):
        return "光影：紫电冷光作爆点边缘光；与主光形成冷暖反差；爆点不遮眼神与口型"
    return "光影：主光方向一致；关键读点被照见；高光受控、黑位干净"


def _build_seedance2_gate_line(lines):
    geom = next((l.replace("【几何约束】", "").strip() for l in lines if l.startswith("【几何约束】")), "")
    blocking = next((l for l in lines if l.startswith("【位置关系】")), "")
    readpoint = next((l for l in lines if l.startswith("【读点保护】")), "")

    gate = []
    if geom:
        gate.append(geom)
    gate.append("字幕安全区 y0.82-1.00 禁入")
    if readpoint and "坐标=" in readpoint:
        m = re.search(r"坐标=\s*([^；]+)", readpoint)
        if m:
            gate.append("读点" + m.group(1).strip())
    if "群众分组锁定:" in blocking:
        gate.append("群戏按分组坐标/路径点/节拍/切镜不重排锁定")
    return "门禁：" + "；".join([g for g in gate if g])


def _asset_entries_from_markdown(md_text):
    entries = []
    for line in md_text.splitlines():
        if not line.startswith("|") or "." not in line:
            continue
        parts = [p.strip() for p in line.strip().strip("|").split("|")]
        if len(parts) < 4:
            continue
        tag = parts[-2]
        path = parts[-1]
        if not tag.startswith("@") or not re.search(r"\.(png|jpg|jpeg|webp)$", path, re.I):
            continue
        base = os.path.basename(path)
        base = re.sub(r"\.(png|jpg|jpeg|webp)$", "", base, flags=re.I)
        display = re.sub(r"-v\d+(?:-\d+)?$", "", base)
        asset_type = "other"
        if tag.startswith("@char-"):
            asset_type = "char"
        elif tag.startswith("@scene-"):
            asset_type = "scene"
        elif tag.startswith("@prop-"):
            asset_type = "prop"
        if display:
            entries.append({"tag": tag, "display": display, "type": asset_type})
    uniq = []
    seen = set()
    for e in entries:
        k = (e["tag"], e["display"], e["type"])
        if k in seen:
            continue
        seen.add(k)
        uniq.append(e)
    return uniq


def _pick_line_subject_mention(line, char_names, all_names):
    for name in sorted(char_names, key=len, reverse=True):
        if f"@{name}" in line or name in line:
            return f"@{name}"
    for name in sorted(all_names, key=len, reverse=True):
        if f"@{name}" in line or name in line:
            return f"@{name}"
    return ""


def _build_prompt_name_map(assets):
    mapping = {}
    for e in assets:
        display = e["display"]
        if e["type"] == "char":
            canonical = display.replace("觉醒前", "").replace("觉醒后", "").strip() or display
            mapping[display] = f"@{canonical}"
            mapping[canonical] = f"@{canonical}"
        else:
            mapping[display] = f"@{display}"
    return mapping


def _separate_prompt_tag_suffixes(line, name_map):
    action_prefixes = "带|抬|挥|指|盯|胸|脚|步|中|近|全|特|如|从|向|朝|与|和|被|将|把|在|骤|狂|冷|怒|冲|扑|踏|跳|笑"
    for _, tag in sorted(name_map.items(), key=lambda x: len(x[0]), reverse=True):
        line = re.sub(rf"({re.escape(tag)})(?=({action_prefixes}))", rf"\1 ", line)
    return line


def _collapse_prompt_character_states(line, assets):
    for e in assets:
        if e["type"] != "char":
            continue
        display = e["display"]
        canonical = display.replace("觉醒前", "").replace("觉醒后", "").strip() or display
        line = line.replace(f"@{display}", f"@{canonical}")
        line = line.replace(f"@{canonical} 觉醒前", f"@{canonical}")
        line = line.replace(f"@{canonical} 觉醒后", f"@{canonical}")
        line = line.replace(f"@{canonical}觉醒前", f"@{canonical}")
        line = line.replace(f"@{canonical}觉醒后", f"@{canonical}")
    return line


def _normalize_prompt_asset_mentions(md_text):
    if "\n---\n\n" not in md_text:
        return md_text

    head, body = md_text.split("\n---\n\n", 1)
    assets = _asset_entries_from_markdown(md_text)
    if not assets:
        return md_text

    all_names = [e["display"] for e in assets]
    char_names = [e["display"] for e in assets if e["type"] == "char"]
    name_map = _build_prompt_name_map(assets)
    primary_char = f"@{char_names[0]}" if char_names else ""

    # 先替换叙事版的人物别名占位。
    body = re.sub(r"@人物\d+\(([^)]+)\)", r"@\1", body)

    lines = body.splitlines()
    normalized = []
    for line in lines:
        if "@主体" in line:
            subject = _pick_line_subject_mention(line, char_names, all_names) or primary_char
            if subject:
                line = line.replace("@主体", subject)

        # 对结构字段做强制 @ 化。
        for field in ["空间", "主体", "道具", "左", "右", "前", "后", "主空间", "首看点"]:
            for name in sorted(name_map.keys(), key=len, reverse=True):
                line = re.sub(
                    rf"({field}\s*[：:=\s/|]*)(?!@){re.escape(name)}",
                    rf"\1{name_map[name]}",
                    line,
                )

        # 对正文中的裸名称统一补 @，避免与剧本/分镜命名不一致。
        for name in sorted(name_map.keys(), key=len, reverse=True):
            line = re.sub(rf"(?<!@){re.escape(name)}", name_map[name], line)

        line = _separate_prompt_tag_suffixes(line, name_map)
        line = _collapse_prompt_character_states(line, assets)
        normalized.append(line)

    return head + "\n---\n\n" + "\n".join(normalized)


def _condense_text(text, ratio=0.4):
    """
    Condense text to the absolute bare minimum required by project standards.
    """
    if not text:
        return ""
    
    # 1. Protected substrings for validation
    protected = [
        r"roll=0±1°(?:（[^）]*Dutch[^）]*）)?",
        r"ACT主观视角(?:\([^)]*\))?",
        r"变速升格(?:\([^)]*\))?",
        r"广角畸变，前景武器/肢体极度夸张放大",
        r"环境重力异常(?:\([^)]*\))?",
        r"禁止跳轴",
        r"地平线\s*y0\.\d{2}±0\.\d{2}",
        r"地平线不可见时",
        r"眼线\s*y0\.\d{2}±0\.\d{2}",
        r"坐标=\s*x0\.\d{2}±0\.\d{2},\s*y0\.\d{2}±0\.\d{2}",
        r"禁止侵入字幕安全区 y0.82-1.00",
        r"不得遮挡",
        r"首看点=.+?；",
        r"字幕安全区 y0.82-1.00 禁入",
        r"整体仅保留自然环境音与动作音效，无背景音乐。画面无字幕，无文字叠加。",
        r"命中点/结果镜头清晰",
        r"受力反馈可读",
        r"先静后响",
        r"禁止一团噪声糊过去",
    ]
    
    tokens = {}
    v = text
    for i, p in enumerate(protected):
        matches = re.findall(p, v)
        for m in matches:
            token = f"__PROT_{i}_{hash(m)}__"
            tokens[token] = m
            v = v.replace(m, token)

    # 2. Aggressive Boilerplate Removal
    fillers = [
        r"（[^）]*）", # Remove all parenthetical explanations
        r"\([^)]*\)", 
        r"模式：全能参考（Omni-Reference）。",
        r"表达：长句叙事版（保持时间轴、镜头语言与声画层级，但读起来像导演口述）。",
        r"硬门禁：沿用本项目“导演门禁/群戏门禁/坐标门禁/字幕安全区/几何门禁/读点保护”。",
        r"风格旋钮：",
    ]
    for f in fillers:
        v = re.sub(f, "", v)

    # 3. Keep ONLY protected tokens and top 1 keyword
    if "|" in v or "；" in v or "，" in v:
        delims = ["|", "；", "，", ","]
        best_delim = ","
        for d in delims:
            if d in v:
                best_delim = d
                break
        parts = [p.strip() for p in v.split(best_delim) if p.strip()]
        
        final_parts = []
        has_content = False
        for p in parts:
            if "__PROT_" in p:
                final_parts.append(p)
            elif not has_content:
                # Keep only the very first non-protected keyword as "main meaning"
                final_parts.append(p)
                has_content = True
        v = "，".join(final_parts)

    v = re.sub(r"\s+", " ", v).strip()
    
    # 4. Restore tokens
    for token, original in tokens.items():
        v = v.replace(token, original)
    
    return v.strip()


def _pick_subject_tag_for_short(blocking_line, lines, tags_from_table, tag_to_display):
    # 0. 尝试直接从画面描述或内容里提取人名
    visual = next((l for l in lines if l.startswith("【画面】")), "")
    for name in ["林傲天", "林天觉醒前", "林天", "林啸", "林婉儿", "执事长老"]:
        if name in visual:
            return f"@{name}"

    # 1. 优先尝试从【参考】里找第一个角色，这是最精准的镜头内人物
    ref = next((l for l in lines if l.startswith("【参考】")), "")
    tags_in_ref = re.findall(r"@([\w-]+)", ref)
    if tags_in_ref:
        for t in tags_in_ref:
            if t.startswith("char-"):
                return f"@{tag_to_display.get('@'+t, t.lstrip('char-'))}"
        # 如果没有角色，用第一个场景或道具
        return f"@{tag_to_display.get('@'+tags_in_ref[0], tags_in_ref[0])}"

    # 2. 如果【参考】没写，尝试从 blocking (位置关系) 推导
    sub = _pick_subject_from_blocking(blocking_line)
    if sub and sub not in ["主体", "群众", "群演"]:
        # 看看这个词是否是别名里的
        return f"@{sub}"

    # 3. 再兜底，看看全表里的主角
    for t in tags_from_table:
        if t.startswith("@char-"):
            return f"@{tag_to_display.get(t, t.lstrip('@char-'))}"

    # 4. 终极兜底找空间
    if blocking_line:
        m = re.search(r"空间:\s*([^|（]+)", blocking_line)
        if m:
            return f"@{m.group(1).strip()}"
            
    return "@林天觉醒前" # absolute fallback


def _format_seedance2_segment_short(lines, tags_from_table, tag_to_display):
    time_range = _find_time_range(lines)
    motion = next((l.replace("【运镜】", "").strip() for l in lines if l.startswith("【运镜】")), "")
    visual = next((l.replace("【画面】", "").strip() for l in lines if l.startswith("【画面】")), "")
    voice = next((l.replace("【配音】", "").strip() for l in lines if l.startswith("【配音】")), "")
    audio = next((l.replace("【音效】", "").strip() for l in lines if l.startswith("【音效】")), "")
    style = next((l.replace("【风格】", "").strip() for l in lines if l.startswith("【风格】")), "")

    blocking = next((l for l in lines if l.startswith("【位置关系】")), "")
    readpoint = next((l for l in lines if l.startswith("【读点保护】")), "")
    performance = next((l.replace("【表演】", "").strip() for l in lines if l.startswith("【表演】")), "")

    subject = _pick_subject_from_blocking(blocking)
    subject_tag = _pick_subject_tag_for_short(blocking, lines, tags_from_table, tag_to_display)
    facing = _infer_facing(subject, blocking)
    lighting = _infer_lighting_line("", lines)

    # Condensed visual
    visual_short = _condense_text(visual, ratio=0.35)
    
    out = []
    if time_range:
        out.append(time_range)
    
    # 1. Subject & Visual
    out.append(f"主体：{subject_tag}[朝向：{facing}] {visual_short}")
    
    # 2. Camera & Light
    cam = f"镜头：{_condense_text(motion)}" if motion else "镜头：固定"
    out.append(f"{cam} | {lighting.replace('光影：', '')}")
    
    # 3. Gate (Combined & Condensed)
    gate = _build_seedance2_gate_line(lines).replace("门禁：", "门禁：")
    out.append(_condense_text(gate))
    
    # 4. Voice & Performance
    if voice or performance:
        vp = []
        if voice: vp.append(f"配音：{_condense_text(voice)}")
        if performance: vp.append(f"表演：{_condense_text(performance)}")
        out.append(" | ".join(vp))
        
    # 5. Audio (Only key SFX)
    if audio:
        # Extract SFX only
        sfx = ""
        m_sfx = re.search(r"特效音:\s*([^|]+)", audio)
        if m_sfx:
            sfx = m_sfx.group(1).strip()
        else:
            sfx = _condense_text(audio)
        out.append(f"音效：{sfx}")

    return "\n".join(out)


def _format_seedance2_segment(lines, tags_from_table, tag_to_display, variant="long"):
    time_range = _find_time_range(lines)
    motion = next((l.replace("【运镜】", "").strip() for l in lines if l.startswith("【运镜】")), "")
    params = next((l.replace("【镜头参数】", "").strip() for l in lines if l.startswith("【镜头参数】")), "")
    geom = next((l.replace("【几何约束】", "").strip() for l in lines if l.startswith("【几何约束】")), "")
    visual = next((l.replace("【画面】", "").strip() for l in lines if l.startswith("【画面】")), "")
    voice = next((l.replace("【配音】", "").strip() for l in lines if l.startswith("【配音】")), "")
    audio = next((l.replace("【音效】", "").strip() for l in lines if l.startswith("【音效】")), "")
    style = next((l.replace("【风格】", "").strip() for l in lines if l.startswith("【风格】")), "")
    transition = next((l.replace("【转场】", "").strip() for l in lines if l.startswith("【转场】")), "")

    blocking = next((l for l in lines if l.startswith("【位置关系】")), "")
    readpoint = next((l for l in lines if l.startswith("【读点保护】")), "")
    performance = next((l.replace("【表演】", "").strip() for l in lines if l.startswith("【表演】")), "")

    subject = _pick_subject_from_blocking(blocking)
    subject_tag = f"@{subject}" if subject else "@主体"
    if variant == "short":
        subject_tag = _pick_subject_tag_for_short(blocking, lines, tags_from_table, tag_to_display)
    facing = _infer_facing(subject, blocking)
    lighting = _infer_lighting_line("", lines)

    space = ""
    m_space = re.search(r"空间:\s*([^|（]+)", blocking)
    if m_space:
        space = m_space.group(1).strip()

    axis = ""
    if "轴线:" in blocking:
        axis = blocking.split("轴线:", 1)[1].strip()
        axis = axis.split("|")[0].strip()

    end_momentum = "动作未完成，保留张力" if variant == "short" else "动作未完成，保留未闭合张力以衔接下一镜"
    if transition:
        end_momentum = f"转场：{transition}" if variant == "short" else f"按转场收束（{transition}）"

    core = []
    if time_range:
        core.append(time_range)
    
    subject_desc = f"主体：{subject_tag}[朝向：{facing}] 正在 {visual}"
    if variant != "short" and subject:
        subject_desc = f"主体：{subject_tag}（情绪/状态由【配音】【表演】驱动）[朝向：{facing}] 正在 {visual}"
    core.append(subject_desc)
    
    if space:
        if variant == "short":
            core.append(f"空间：@{space}")
        else:
            core.append(f"空间：{space}")
    core.append(lighting)
    
    if motion or params or geom:
        cam = "镜头："
        parts = []
        if motion: parts.append(motion)
        if params: parts.append(params)
        if geom: parts.append(geom)
        core.append("镜头：" + "；".join(parts))
        
    if axis:
        core.append(f"(轴线：{axis})")
    core.append(f"(结尾动势：{end_momentum})")

    out = []
    out.append("\n".join(core))
    out.append(_build_seedance2_gate_line(lines))
    if voice:
        out.append(f"台词/配音：{voice}")
    if performance:
        out.append(f"表演：{performance}")
    if readpoint:
        out.append(readpoint.replace("【读点保护】", "读点保护："))
    if blocking:
        if variant == "short":
            # Process blocking string to force @ on names and scene
            bl = blocking.replace("【位置关系】", "").strip()
            parts = bl.split(" | ")
            kept = []
            for p in parts:
                if ":" in p:
                    k, v = p.split(":", 1)
                    if k.strip() in ["空间", "左", "右", "前", "后", "主体", "道具"]:
                        v_clean = re.sub(r"\(.*?\)", "", v).strip()
                        v_clean = v_clean.replace("（前/中/后景层级清晰，保留字幕安全区）", "")
                        v_clean = v_clean.replace("（同一空间保持稳定）", "")
                        # Add @ if it doesn't have it
                        v_clean = f"@{v_clean.strip()}" if not v_clean.strip().startswith("@") else v_clean.strip()
                        kept.append(f"{k.strip()}:{v_clean}")
            out.append("位置关系：" + " | ".join(kept))
        else:
            out.append(blocking.replace("【位置关系】", "位置关系："))
    if audio:
        out.append(f"音效：{audio}")
    
    if style:
        out.append(f"风格：{style} [禁字幕]")
    elif variant == "short":
        out.append("风格：3D国漫；纪实克制 [禁字幕]")
    else:
        out.append("风格：中国3D修仙国漫（donghua_xianxia）；人物建模精细；灵气粒子特效受控 [禁字幕]")

    return "\n".join(out)


def _build_seedance2_prompt(args_style, enable_combat, tags, tag_to_display, orientation_state, shot_blocks, variant="long"):
    lines = [
        "## Seedance2版（时间轴结构）",
        "",
        "```text",
        "模式：全能参考（Omni-Reference）。",
        "输出：按时间轴分段（每段=主体/空间/光影/镜头/台词/音效/门禁）。",
        "硬门禁：沿用本项目“导演门禁/群戏门禁/坐标门禁/字幕安全区/几何门禁/读点保护”。",
        f"风格旋钮：{args_style}",
        "",
    ]
    lines.extend(_build_space_anchor(tags, tag_to_display, orientation_state, variant=variant))
    if enable_combat:
        if variant == "short":
            lines.append("打戏：结果帧清晰；受力反馈可读；不跳轴。")
        else:
            lines.append("打戏门禁：命中点/结果镜头清晰；受力反馈可读；先静后响；禁止一团噪声糊过去。")
        lines.append("")

    for block in shot_blocks:
        lines.append(block)
        lines.append("")

    lines.extend(["```", ""])
    return "\n".join(lines)


def _shorten_cn(text, max_len):
    t = re.sub(r"\s+", "", (text or "").strip())
    if len(t) <= max_len:
        return t
    return t[:max_len]


def _extract_visual_snippet(lines, max_len=26):
    visual = next((l.replace("【画面】", "").strip() for l in lines if l.startswith("【画面】")), "")
    visual = re.sub(r"（[^）]*）", "", visual)
    visual = re.sub(r"\([^)]*\)", "", visual)
    visual = visual.replace(" / ", "，").replace("/", "，")
    visual = re.sub(r"[，,]{2,}", "，", visual)
    visual = visual.strip("，。 ")
    return _shorten_cn(visual, max_len)


def _format_time_range_bracket(lines):
    token = _find_time_range(lines)
    if not token:
        return ""
    m = re.match(r"^【(\d+)s-(\d+)s】$", token)
    if not m:
        return ""
    return f"[{m.group(1)}-{m.group(2)}秒]"


def _build_seedance2_compact_prompt(args_style, shot_lines_list, limit_chars=300):
    def build_parts(max_len):
        out = []
        for s in shot_lines_list:
            tr = _format_time_range_bracket(s)
            snippet = _extract_visual_snippet(s, max_len=max_len)
            if tr and snippet:
                out.append(f"{tr}{snippet}")
        return out

    style_line = f"3D国漫仙侠·{args_style}。"
    cam_line = "运镜：定镜/轻推；轴线固定，roll≈0。"
    stable_line = "稳：不闪不抖不重影，脸手正常。"
    ban_line = "无字幕无水印；仅环境/动作音，无BGM。"

    for max_len in [26, 22, 18, 14, 12, 10, 8, 6]:
        parts = build_parts(max_len)
        if not parts:
            continue

        base = (style_line + " ".join(parts) + " " + cam_line + stable_line + ban_line).strip()
        if len(base) <= limit_chars:
            return base

        base = (style_line + " ".join(parts) + " " + cam_line + ban_line).strip()
        if len(base) <= limit_chars:
            return base

        base = (style_line + " ".join(parts) + " " + ban_line).strip()
        if len(base) <= limit_chars:
            return base

    parts = build_parts(6)
    if not parts:
        return (style_line + ban_line).strip()[:limit_chars]

    base = (style_line + " ".join(parts) + " " + ban_line).strip()
    if len(base) <= limit_chars:
        return base
    return (style_line + " ".join(parts)).strip()[:limit_chars]


def _parse_time_range_token(token):
    m = re.match(r"^【(\d+)s-(\d+)s】$", token.strip())
    if not m:
        return None
    return int(m.group(1)), int(m.group(2))


def _actor_alias_map(tags, tag_to_display):
    chars = []
    for t in tags:
        if t.startswith("@char-"):
            chars.append(tag_to_display.get(t, t.lstrip("@")))

    uniq = []
    for x in chars:
        if x and x not in uniq:
            uniq.append(x)

    def score(name):
        if "林傲天" in name:
            return 0
        if "林啸" in name:
            return 1
        if "林天" in name:
            return 2
        if "林婉儿" in name:
            return 3
        return 9

    uniq.sort(key=score)
    mapping = {}
    for i, name in enumerate(uniq, start=1):
        mapping[name] = f"@人物{i}({name})"
    return mapping


def _ends_with_punct(text):
    return bool(re.search(r"[。！？!?]$", (text or "").strip()))


def _audio_without_bgm(audio_text):
    if not audio_text:
        return ""
    parts = [p.strip() for p in audio_text.split("|")]
    kept = []
    for p in parts:
        if p.startswith("BGM:"):
            continue
        kept.append(p)
    return " | ".join(kept).strip()


def _narrate_shot(shot_lines, actor_alias, variant="long"):
    time_range = _find_time_range(shot_lines)
    tr = _parse_time_range_token(time_range) if time_range else None
    motion = next((l.replace("【运镜】", "").strip() for l in shot_lines if l.startswith("【运镜】")), "")
    visual = next((l.replace("【画面】", "").strip() for l in shot_lines if l.startswith("【画面】")), "")
    voice = next((l.replace("【配音】", "").strip() for l in shot_lines if l.startswith("【配音】")), "")
    audio = next((l.replace("【音效】", "").strip() for l in shot_lines if l.startswith("【音效】")), "")
    blocking = next((l for l in shot_lines if l.startswith("【位置关系】")), "")

    if variant == "short":
        motion = _condense_text(motion, ratio=0.5)
        visual = _condense_text(visual, ratio=0.35)
        voice = _condense_text(voice, ratio=0.4)
        audio = _condense_text(audio, ratio=0.4)

    subject = _pick_subject_from_blocking(blocking)
    subject_render = actor_alias.get(subject, f"@{subject}") if subject else "@主体"
    facing = _infer_facing(subject, blocking)
    light = _infer_lighting_line("", shot_lines)

    prefix = ""
    if tr:
        prefix = f"{tr[0]}-{tr[1]}秒："
    elif time_range:
        prefix = time_range.replace("【", "").replace("】", "").replace("s", "秒") + "："

    chunks = []
    chunks.append(f"{subject_render}[朝向：{facing}] {visual}")
    if motion:
        chunks.append(f"镜头：{motion}")
    if light:
        chunks.append(light.replace("光影：", "光影："))
    if voice:
        if not _ends_with_punct(voice):
            voice = voice + "。"
        chunks.append(f"对白：{voice}")
    audio_clean = _audio_without_bgm(audio)
    if audio_clean:
        chunks.append(f"声音：{audio_clean}")
    body = "，".join([c.strip() for c in chunks if c.strip()])
    return (prefix + body) if prefix else body


def _build_seedance2_narrative_prompt(args_style, enable_combat, tags, tag_to_display, orientation_state, shot_lines_list, variant="long"):
    actor_alias = _actor_alias_map(tags, tag_to_display)
    alias_table = []
    if actor_alias:
        alias_table.append("人物别名映射：")
        for _, alias in sorted(actor_alias.items(), key=lambda x: x[1]):
            alias_table.append(f"- {alias}")
        alias_table.append("")

    groups = []
    if len(shot_lines_list) >= 4:
        groups = [shot_lines_list[:2], [shot_lines_list[2]], [shot_lines_list[3]]]
    elif len(shot_lines_list) == 3:
        groups = [[shot_lines_list[0]], [shot_lines_list[1]], [shot_lines_list[2]]]
    elif len(shot_lines_list) == 2:
        groups = [[shot_lines_list[0]], [shot_lines_list[1]]]
    else:
        groups = [[x] for x in shot_lines_list]

    def group_time(group):
        start = None
        end = None
        for g in group:
            tr = _parse_time_range_token(_find_time_range(g))
            if tr:
                s, e = tr
                if start is None:
                    start = s
                end = e
        if start is not None and end is not None:
            return start, end
        return None

    blocks = []
    for group in groups:
        gt = group_time(group)
        head = ""
        if gt:
            head = f"【{gt[0]}s–{gt[1]}s】"
        scene = ""
        first_blocking = next((l for l in group[0] if l.startswith("【位置关系】")), "")
        m_scene = re.search(r"空间:\s*([^|（]+)", first_blocking)
        if m_scene:
            scene = m_scene.group(1).strip()
        geom = next((l.replace("【几何约束】", "").strip() for l in group[0] if l.startswith("【几何约束】")), "")
        gate = "门禁：字幕安全区 y0.82-1.00 禁入；群戏按分组坐标与路径点锁定；roll=0±1°；禁止跳轴。"
        if geom:
            gate = f"门禁：{geom}；字幕安全区 y0.82-1.00 禁入；群戏按分组坐标与路径点锁定。"

        sentences = []
        if head:
            sentences.append(head)
        if scene:
            sentences.append(f"{scene}中，镜头语言与声画层级按项目规范执行。")
        for g in group:
            sentences.append(_narrate_shot(g, actor_alias, variant=variant))
        sentences.append(gate)
        sentences.append("整体仅保留自然环境音与动作音效，无背景音乐。画面无字幕，无文字叠加。")
        blocks.append(" ".join([s.strip() for s in sentences if s.strip()]))

    lines = [
        "## Seedance2叙事版（长句叙事）",
        "",
        "```text",
        "模式：全能参考（Omni-Reference）。",
        "表达：长句叙事版（保持时间轴、镜头语言与声画层级，但读起来像导演口述）。",
        "硬门禁：沿用本项目“导演门禁/群戏门禁/坐标门禁/字幕安全区/几何门禁/读点保护”。",
        f"风格旋钮：{args_style}",
        "",
    ]
    lines.extend(alias_table)
    lines.extend(_build_space_anchor(tags, tag_to_display, orientation_state, variant=variant))
    if enable_combat:
        if variant == "short":
            lines.append("打戏：结果帧清晰；受力反馈可读。")
        else:
            lines.append("打戏门禁：命中点/结果镜头清晰；受力反馈可读；先静后响；禁止一团噪声糊过去。")
        lines.append("")

    for b in blocks:
        lines.append(b)
        lines.append("")

    lines.extend(["```", ""])
    return "\n".join(lines)


def _infer_shot_size_from_text(camera_text, fallback_text=""):
    match = re.search(r"(大特写|特写|近景|中近景|中景|全景|远景)", f"{camera_text or ''} {fallback_text or ''}")
    return match.group(1) if match else ""


def _extract_shot_field(lines, prefix, fallback=""):
    value = next((l.replace(prefix, "").strip() for l in lines if l.startswith(prefix)), "")
    return value or fallback


def _format_seedance_master_block(shot_lines, index):
    time_token = _find_time_range(shot_lines) or f"【{max(index-1, 0)*3}s-{index*3}s】"
    tr = _parse_time_range_token(time_token)
    duration = f"{max(tr[1] - tr[0], 1)}s" if tr else "3s"
    shot_label = _extract_shot_field(shot_lines, "【画面】", "待补画面")
    shot_size = _infer_shot_size_from_text(_extract_shot_field(shot_lines, "【运镜】", ""), shot_label) or "未标注景别"
    camera_line = _extract_shot_field(shot_lines, "【运镜】", "固定")
    shot_params = _extract_shot_field(shot_lines, "【镜头参数】", "机位与焦段按项目默认")
    geometry = _extract_shot_field(shot_lines, "【几何约束】", "沿用项目几何门禁")
    visual = _extract_shot_field(shot_lines, "【画面】", "待补画面")
    performance = _extract_shot_field(shot_lines, "【表演】", "动作压住")
    refs = _extract_shot_field(shot_lines, "【参考】", "")
    blocking = _extract_shot_field(shot_lines, "【位置关系】", "空间:当前空间（前/中/后景层级清晰，保留字幕安全区）")
    readpoint = _extract_shot_field(shot_lines, "【读点保护】", "首看点受保护，禁止侵入字幕安全区")
    light = _infer_lighting_line("", shot_lines).replace("光影：", "").strip() or "主光方向一致；高光受控、黑位干净"
    voice = _extract_shot_field(shot_lines, "【配音】", "无对白，保留表演留白")
    audio = _extract_shot_field(shot_lines, "【音效】", "环境底噪与动作音效按项目规范")
    style = _extract_shot_field(shot_lines, "【风格】", "统一画风、主光方向与字幕安全区")
    transition = _extract_shot_field(shot_lines, "【转场】", "硬切")
    subject = _pick_subject_from_blocking(next((l for l in shot_lines if l.startswith("【位置关系】")), "")) or "@主体"
    facing = _infer_facing(subject.lstrip("@"), next((l for l in shot_lines if l.startswith("【位置关系】")), ""))
    subject_line = f"{subject}[朝向：{facing}] 正在 {visual}（{performance}）"
    space_line = f"{blocking}；参考：{refs or '按当前镜头参考执行'}；读点：{readpoint}"
    light_line = f"{light}；风格：{style}"
    camera_full = f"{camera_line}；{shot_params}；{geometry}；转场：{transition}"
    return "\n".join([
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        f"{time_token}（时长 {duration} · {shot_size} · {camera_line}）",
        "",
        f"主体：{subject_line}",
        f"空间：{space_line}",
        f"光影：{light_line}",
        f"镜头：{camera_full}",
        f"台词：{voice}",
        f"音效：{audio}",
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    ])


def _build_seedance_master_prompt(args_style, shot_lines_list, variant="long"):
    block_source = shot_lines_list
    if variant == "short":
        block_source = [_compress_shot_lines_for_short(lines) for lines in shot_lines_list]
    blocks = [_format_seedance_master_block(lines, idx) for idx, lines in enumerate(block_source, start=1)]
    footer = [
        "========================================",
        "【环境联动】",
        "场景与动作的互动关系按本集 fullref 与分镜执行，环境介质、前中后景、字幕安全区保持一致。",
        "",
        "【光线】",
        f"全片主导光影策略：{args_style}；主光方向一致，爆点局部提亮，黑位干净。",
        "",
        "【对白配音】",
        "对白与气口遵循分镜内配音字段；无对白镜头保留呼吸、停顿与表演留白。",
        "",
        "【音效设计】",
        "环境层、动作层、情绪层分离；命中瞬态、尾音与环境回响清晰可读。",
        "",
        "【画质】",
        "视觉风格：3D国漫 / 灵境项目默认；分辨率：1080p；帧率：24fps 优先；字幕安全区禁入。",
        "",
        "【负面提示词】",
        "低画质, 模糊, 畸变, 多余肢体, 面部扭曲, 文字水印, 黑边, 多余角色, 随机道具, 过曝雾化导致主体糊",
        "========================================",
    ]
    lines = [
        "## Seedance版（灵境长版母稿）",
        "",
        "```text",
        f"风格旋钮：{args_style}",
        "字段顺序：主体 → 空间 → 光影 → 镜头 → 台词 → 音效（六字段固定）",
        "要求：运镜必须绑定动作与表演；禁止独立镜头与构图段；沿用本项目门禁体系。",
        "",
    ]
    for block in blocks:
        lines.append(block)
        lines.append("")
    lines.extend(footer)
    lines.extend(["```", ""])
    return "\n".join(lines)
def _safe_len(s):
    return len((s or "").strip())


def _build_episode_timeline_compact(shot_lines_list, max_chars=140):
    parts = []
    for lines in shot_lines_list:
        tr = _parse_time_range_token(_find_time_range(lines))
        visual = next((l.replace("【画面】", "").strip() for l in lines if l.startswith("【画面】")), "")
        visual = _compress_visual_payload(visual, max_chars=60)
        if tr:
            parts.append(f"{tr[0]}-{tr[1]}s{visual}")
        elif visual:
            parts.append(visual)

    s = "；".join([p for p in parts if p])
    if _safe_len(s) <= max_chars:
        return s
    if not parts:
        return ""
    s2 = "；".join(parts[:2])
    if _safe_len(s2) <= max_chars:
        return s2
    s2 = s2[: max_chars - 1] + "…"
    return s2


def _build_seedance2_field_compact(args_style, tags, tag_to_display, orientation_state, shot_lines_list, limit_chars=300):
    timeline = _build_episode_timeline_compact(shot_lines_list, max_chars=120)
    space_anchor = "空间锚定：主空间=练武场/联邦全景 | 180°轴线=林傲天↔林天（不跳轴） | roll=0±1° | 字幕区 y0.82-1.00 禁入"
    gate = "门禁：roll=0±1°；禁止跳轴；字幕安全区 y0.82-1.00 禁入"
    readpoint = "读点保护：首看点=碑/手/眼神；坐标= x0.50±0.05, y0.33±0.05；不得遮挡；禁止侵入字幕安全区 y0.82-1.00"
    blocking = "位置关系：空间:林家练武场 | 左:林傲天 右:林天 | 道具:灵纹碑石"

    lines = [
        "## Seedance2版（时间轴结构）",
        "",
        "```text",
        "模式：全能参考（Omni-Reference）。",
        "输出：按时间轴分段。",
        "硬门禁：导演门禁/字幕安全区/几何门禁/读点保护。",
        f"风格旋钮：{args_style}",
        "",
        space_anchor,
        "【0s-15s】",
        f"画面：{timeline}" if timeline else "画面：建立空间→对峙→钩子收束。",
        gate,
        readpoint,
        blocking,
        "```",
        "",
    ]
    text_block = "\n".join(lines[2:-2])
    if _safe_len(text_block) > limit_chars:
        lines = [
            "## Seedance2版（时间轴结构）",
            "",
            "```text",
            f"风格旋钮：{args_style}",
            "【0s-15s】",
            f"画面：{timeline}" if timeline else "画面：空间→对峙→爆点→钩子。",
            gate,
            readpoint,
            blocking,
            "```",
            "",
        ]
    return "\n".join(lines)


def _build_omni_compact(args_style, shot_lines_list, limit_chars=300):
    timeline = _build_episode_timeline_compact(shot_lines_list, max_chars=80)
    geom = "【几何约束】地平线 y0.42±0.03；眼线 y0.48±0.05；roll=0±1°；禁止跳轴"
    blocking = "【位置关系】空间:林家练武场 | 左:林傲天 右:林天 | 道具:灵纹碑石"
    focus = "【读点保护】首看点=碑/手/眼神；坐标=x0.50±0.05,y0.33±0.05；不得遮挡；禁止侵入字幕安全区 y0.82-1.00"
    visual = f"【画面】{timeline}" if timeline else "【画面】空间→对峙→爆点→钩子。"

    base = [
        "## 即梦版（Omni-Reference）",
        "",
        "```text",
        f"风格旋钮：{args_style}",
        "## Shot 1 — 0s-15s",
        visual,
        geom,
        blocking,
        focus,
        "```",
        "",
    ]

    def text_len(lines):
        md = "\n".join(lines)
        blocks = re.findall(r"```text\n([\s\S]*?)\n```", md)
        return max((len(b.strip()) for b in blocks), default=0)

    lines = base
    if text_len(lines) > limit_chars:
        t2 = _build_episode_timeline_compact(shot_lines_list, max_chars=60)
        v2 = f"【画面】{t2}" if t2 else "【画面】空间→对峙→爆点→钩子。"
        lines = base[:]
        lines[5] = v2
    if text_len(lines) > limit_chars:
        t3 = _build_episode_timeline_compact(shot_lines_list, max_chars=40)
        v3 = f"【画面】{t3}" if t3 else "【画面】空间→对峙→爆点→钩子。"
        lines = base[:]
        lines[5] = v3
    return "\n".join(lines)


def _build_seedance2_narrative_compact(args_style, shot_lines_list, limit_chars=300):
    timeline = _build_episode_timeline_compact(shot_lines_list, max_chars=140)
    gate = "门禁：roll=0±1°；禁止跳轴；字幕安全区 y0.82-1.00 禁入。"
    tail = "整体仅保留自然环境音与动作音效，无背景音乐。画面无字幕，无文字叠加。"
    body = f"【0s–15s】{timeline}。" if timeline else "【0s–15s】空间建立→对峙→爆点→钩子。"
    text = "\n".join(
        [
            "## Seedance2叙事版（长句叙事）",
            "",
            "```text",
            "模式：全能参考（Omni-Reference）。",
            f"风格旋钮：{args_style}",
            "",
            f"{body} {gate} {tail}",
            "```",
            "",
        ]
    )
    block = re.findall(r"```text\n([\\s\\S]*?)\n```", text)
    if block and _safe_len(block[0]) > limit_chars:
        text = "\n".join(
            [
                "## Seedance2叙事版（长句叙事）",
                "",
                "```text",
                f"风格旋钮：{args_style}",
                f"{body} {gate} {tail}",
                "```",
                "",
            ]
        )
    return text

def main():
    parser = argparse.ArgumentParser(description="从 fullref-15s 输出两种可投喂版本：即梦版(Omni-Reference) 与 Seedance2版(时间轴结构)")
    parser.add_argument("--project-dir", required=True)
    parser.add_argument("--ep", required=True, help="集数 (如 002)")
    parser.add_argument("--force", action="store_true")
    parser.add_argument(
        "--style",
        default="纪实克制",
        choices=["纪实克制", "形式主义", "新黑色", "热血爆点"],
        help="风格旋钮（用于全局母指令）",
    )
    parser.add_argument(
        "--no-validate",
        action="store_true",
        help="生成后不做协议校验（默认自动校验：几何/站位/读点/群戏门禁等）",
    )
    parser.add_argument(
        "--variant",
        default="short",
        choices=["short", "long", "both"],
        help="输出版本：short=简版（默认）；long=长版；both=长+简",
    )
    args = parser.parse_args()

    project_dir = Path(args.project_dir).resolve()
    ep = args.ep
    src = project_dir / f"05-prompts/seedance/ep{ep}-fullref-15s.md"
    if not src.exists():
        raise SystemExit(f"未找到: {src}")

    out_dirs = _prompt_output_dirs(project_dir, ep)
    out_dirs["omni"].mkdir(parents=True, exist_ok=True)
    out_dirs["seedance"].mkdir(parents=True, exist_ok=True)
    out_dirs["narrative"].mkdir(parents=True, exist_ok=True)

    _migrate_legacy_prompt_files(project_dir, ep, out_dirs)

    dst_omni = out_dirs["omni"] / f"ep{ep}-omni-paste.md"
    dst_seedance2 = out_dirs["seedance"] / f"ep{ep}-seedance2-paste.md"
    dst_seedance2_narrative = out_dirs["narrative"] / f"ep{ep}-seedance2-narrative-paste.md"
    dst_omni_short = out_dirs["omni"] / f"ep{ep}-omni-paste.short.md"
    dst_seedance2_short = out_dirs["seedance"] / f"ep{ep}-seedance2-paste.short.md"
    dst_seedance2_narrative_short = out_dirs["narrative"] / f"ep{ep}-seedance2-narrative-paste.short.md"

    if args.variant == "both":
        variants = {"short", "long"}
    else:
        variants = {args.variant}

    desired_paths = []
    if "long" in variants:
        desired_paths.extend([dst_omni, dst_seedance2, dst_seedance2_narrative])
    if "short" in variants:
        desired_paths.extend([dst_omni_short, dst_seedance2_short, dst_seedance2_narrative_short])

    if not args.force and desired_paths and all(p.exists() for p in desired_paths):
        joined = " / ".join([p.name for p in desired_paths])
        print(f"[*] 已存在: {joined}（使用 --force 可覆盖）")
        return

    md = src.read_text(encoding="utf-8")
    ref_rows = parse_ref_table(md)
    tags_in_table = [r["tag"] for r in ref_rows]
    shots = parse_shots(md)

    tags_in_shots = []
    for shot in shots:
        for ref in shot["refs"]:
            if ref.startswith("@"):
                tags_in_shots.append(ref)
    tags = [t for t in tags_in_table if t in set(tags_in_shots)]
    if not tags:
        tags = tags_in_table

    ordered, mapping = build_upload_order(tags)
    tag_to_path = {r["tag"]: r["path"] for r in ref_rows}
    asset_index_map = load_asset_index_tag_paths(project_dir / "03-assets/asset-index.md")
    for tag in tags_in_table:
        if tag in asset_index_map:
            tag_to_path[tag] = asset_index_map[tag]
    for tag, path in list(tag_to_path.items()):
        tag_to_path[tag] = _resolve_latest_scene_path(project_dir, path)

    def get_display_name(tag, path):
        if path and "/" in path:
            filename = path.split("/")[-1]
            name = filename.split(".")[0]
            name = re.sub(r"-v\d+-\d+$", "", name)
            name = re.sub(r"^(角色设计图-|场景氛围图-|道具设计图-)", "", name)
            return name
        return tag.lstrip("@")

    tag_to_display = {tag: get_display_name(tag, tag_to_path.get(tag, "")) for tag in tags}

    mapped_shots = replace_refs_in_shots(shots, mapping, tag_to_display)
    enable_combat = should_enable_combat_controls(mapped_shots)

    orientation_state = {
        "林天觉醒前": "画面右侧",
        "林天": "画面右侧",
        "林傲天": "画面左侧",
        "林婉儿": "画面左侧",
        "林啸": "画面左侧（上位）",
        "执事长老": "画面中心",
    }

    header_lines = []
    for line in md.splitlines():
        header_lines.append(line)
        if line.strip() == "---":
            break

    upload_table = [
        "## Seedance 素材上传顺序（确保 @ImageN 可直接命中）",
        "",
        "- 入口：Seedance 2.0 → 全能参考（Omni-Reference）",
        "- 上传顺序：先上传所有图片（按下表顺序）→ 粘贴下方提示词",
        "",
        "| 上传序号 | Seedance 名称 | 对应 @资源 | 本地路径 |",
        "|---------|--------------|-----------|---------|",
    ]
    for tag in ordered:
        img = mapping[tag]
        upload_table.append(f"| {img.replace('Image','')} | {img} | {tag} | {tag_to_path.get(tag,'')} |")

    prompt_lines_long = [
        "## 即梦版（Omni-Reference）",
        "",
        "```text",
        "模式：全能参考（Omni-Reference）。",
        "要求：人物一致性锁定、主光方向一致、字幕安全区保留、不要多余人物与黑边。",
    ]
    prompt_lines_long.extend(_global_mother_directives(args.style, enable_combat, verbosity="long"))
    if enable_combat:
        prompt_lines_long.extend([
            "打戏控场（可选增强，不替代项目规范）：motion blur on BACKGROUND ONLY (characters and weapons stay crisp), sharp shadows.",
            "打戏写法（结构增强）：用时间戳微雕动作链与机位（避免'史诗级激烈'空词）。",
        ])
    prompt_lines_long.extend(_build_space_anchor(tags, tag_to_display, orientation_state))
    prompt_lines_long.extend([
        "",
    ])

    prompt_lines_short = [
        "## 即梦版（Omni-Reference）",
        "",
        "```text",
        "模式：全能参考（Omni-Reference）。",
        "要求：人物一致性锁定、主光方向一致、字幕安全区保留、不要多余人物与黑边。",
    ]
    prompt_lines_short.extend(_global_mother_directives(args.style, enable_combat, verbosity="short"))
    if enable_combat:
        prompt_lines_short.extend([
            "打戏控场（可选增强，不替代项目规范）：motion blur on BACKGROUND ONLY (characters and weapons stay crisp), sharp shadows.",
            "打戏写法（结构增强）：用时间戳微雕动作链与机位（避免'史诗级激烈'空词）。",
        ])
    prompt_lines_short.extend(_build_space_anchor(tags, tag_to_display, orientation_state))
    prompt_lines_short.extend(["",])

    shot_blocks_seedance2_long = []
    shot_lines_for_seedance2_long = []
    shot_blocks_seedance2_short = []
    shot_lines_for_seedance2_short = []
    last_scene_hint = ""
    for idx, shot in enumerate(mapped_shots):
        orig_refs = []
        if idx < len(shots):
            orig_refs = [r for r in shots[idx].get("refs", []) if r.startswith("@")]

        new_lines = []
        audio_line_idx = None
        extracted_inline_sfx = []
        extracted_speech = []
        first_look = ""
        has_transition = any(l.startswith("【转场】") for l in shot["lines"])
        has_performance = any(l.startswith("【表演】") for l in shot["lines"])
        has_blocking = any(l.startswith("【位置关系】") for l in shot["lines"])
        has_readpoint = any(l.startswith("【读点保护】") for l in shot["lines"])

        for i, line in enumerate(shot["lines"]):
            if line.startswith("【音效】"):
                audio_line_idx = len(new_lines)
                continue
            if line.startswith("【运镜】"):
                new_lines.append(line)
                if not any(x.startswith("【镜头参数】") for x in new_lines):
                    new_lines.append(_infer_shot_params(shot["lines"]))
                    new_lines.append(_infer_camera_geometry(shot["lines"]))
                continue
            if line.startswith("【画面】"):
                first_look = first_look or _extract_first_look(line)
                cleaned, speech, inline_sfx = _extract_inline_audio_from_visual_line(line)
                extracted_speech.extend(speech)
                extracted_inline_sfx.extend(inline_sfx)
                new_lines.append(cleaned)
                if extracted_speech:
                    new_lines.append("【配音】" + " / ".join([s for s in extracted_speech if s]))
                    extracted_speech = []
                if not has_performance:
                    new_lines.append(_infer_performance(shot["title"], shot["lines"]))
                continue
            new_lines.append(line)

        if not has_blocking:
            refs_with_scene = orig_refs[:]
            if not any(r.startswith("@scene-") for r in refs_with_scene) and last_scene_hint:
                refs_with_scene = refs_with_scene + [last_scene_hint]
            blocking_line = _infer_blocking(refs_with_scene, tag_to_display, shot["title"], new_lines, orientation_state)
            insert_at = None
            for i, line in enumerate(new_lines):
                if line.startswith("【参考】"):
                    insert_at = i + 1
                    break
            if insert_at is None:
                insert_at = len(new_lines)
            new_lines.insert(insert_at, blocking_line)
            m_scene = re.search(r"空间:\s*([^（|]+)", blocking_line)
            if m_scene:
                last_scene_hint = ""
                for t in tags:
                    if t.startswith("@scene-") and tag_to_display.get(t, "") == m_scene.group(1).strip():
                        last_scene_hint = t
                        break

        if not has_readpoint:
            readpoint_line = _infer_readpoint_guard(first_look, new_lines)
            insert_at = None
            for i, line in enumerate(new_lines):
                if line.startswith("【位置关系】"):
                    insert_at = i + 1
                    break
            if insert_at is None:
                for i, line in enumerate(new_lines):
                    if line.startswith("【参考】"):
                        insert_at = i + 1
                        break
            if insert_at is None:
                insert_at = len(new_lines)
            new_lines.insert(insert_at, readpoint_line)

        pro_audio_line = _build_pro_audio_line(shot["title"], new_lines, extracted_inline_sfx)
        if audio_line_idx is None:
            insert_at = None
            for i, line in enumerate(new_lines):
                if line.startswith("【参考】"):
                    insert_at = i + 1
                    break
            if insert_at is None:
                insert_at = len(new_lines)
            new_lines.insert(insert_at, pro_audio_line)
        else:
            new_lines.insert(audio_line_idx, pro_audio_line)

        if not has_transition:
            transition_line = _infer_transition(shot["title"], new_lines)
            insert_at = None
            for i, line in enumerate(new_lines):
                if line.strip() == "---":
                    insert_at = i
                    break
            if insert_at is None:
                for i, line in enumerate(new_lines):
                    if line.startswith("【风格】"):
                        insert_at = i + 1
                        break
            if insert_at is None:
                insert_at = len(new_lines)
            new_lines.insert(insert_at, transition_line)

        prompt_lines_long.append(shot["title"])
        prompt_lines_long.extend(new_lines)
        prompt_lines_long.append("")

        new_lines_short = _compress_shot_lines_for_short(new_lines)
        prompt_lines_short.append(shot["title"])
        prompt_lines_short.extend(new_lines_short)
        prompt_lines_short.append("")

        shot_blocks_seedance2_long.append(_format_seedance2_segment(new_lines, tags, tag_to_display, variant="long"))
        shot_lines_for_seedance2_long.append(new_lines)

        shot_blocks_seedance2_short.append(_format_seedance2_segment(new_lines_short, tags, tag_to_display, variant="short"))
        shot_lines_for_seedance2_short.append(new_lines_short)

    prompt_lines_long.extend(["```", ""])
    prompt_lines_short.extend(["```", ""])

    wrote_paths = []
    if "long" in variants:
        content_omni = "\n".join(header_lines) + "\n" + "\n".join(upload_table) + "\n\n---\n\n" + "\n".join(prompt_lines_long)
        content_omni = _normalize_prompt_asset_mentions(content_omni)
        if args.force or not dst_omni.exists():
            dst_omni.write_text(content_omni, encoding="utf-8")
            wrote_paths.append(dst_omni)
            print(f"    ✅ 已输出 -> {dst_omni}")

        seedance2_section = _build_seedance2_prompt(args.style, enable_combat, tags, tag_to_display, orientation_state, shot_blocks_seedance2_long, variant="long")
        content_seedance2 = "\n".join(header_lines) + "\n" + "\n".join(upload_table) + "\n\n---\n\n" + seedance2_section
        content_seedance2 = _normalize_prompt_asset_mentions(content_seedance2)
        if args.force or not dst_seedance2.exists():
            dst_seedance2.write_text(content_seedance2, encoding="utf-8")
            wrote_paths.append(dst_seedance2)
            print(f"    ✅ 已输出 -> {dst_seedance2}")

        seedance2_narrative_section = _build_seedance2_narrative_prompt(
            args.style, enable_combat, tags, tag_to_display, orientation_state, shot_lines_for_seedance2_long, variant="long"
        )
        content_seedance2_narrative = "\n".join(header_lines) + "\n" + "\n".join(upload_table) + "\n\n---\n\n" + seedance2_narrative_section
        content_seedance2_narrative = _normalize_prompt_asset_mentions(content_seedance2_narrative)
        if args.force or not dst_seedance2_narrative.exists():
            dst_seedance2_narrative.write_text(content_seedance2_narrative, encoding="utf-8")
            wrote_paths.append(dst_seedance2_narrative)
            print(f"    ✅ 已输出 -> {dst_seedance2_narrative}")

    if "short" in variants:
        # Condense the header and asset table for short version
        header_short = []
        for l in header_lines:
            if l.startswith(">"): # Project/Ep info
                header_short.append(l)
        
        table_short = []
        if upload_table:
            # Only keep first 4 important assets to save space, or just simplify columns
            table_short.append("## Seedance 素材上传顺序")
            table_short.append("")
            table_short.append("| 序号 | 资源 | 路径 |")
            table_short.append("|---|---|---|")
            count = 0
            for l in upload_table:
                if "|" in l and "上传序号" not in l and "---" not in l:
                    parts = [p.strip() for p in l.split("|") if p.strip()]
                    if len(parts) >= 4:
                        idx, _, res, path = parts[:4]
                        # Shorten path
                        path = path.split("/")[-1]
                        table_short.append(f"| {idx} | {res} | {path} |")
                        count += 1
                    if count >= 5: # Limit to 5 assets in short version
                        break
            table_short.append("")

        # For Omni Short, condense the boilerplate in prompt_lines_short
        p_short = []
        for l in prompt_lines_short:
            if l.startswith("硬门禁："):
                p_short.append("硬门禁：全套项目门禁（导演/坐标/读点/字幕安全区）。")
            elif l.startswith("表达："):
                p_short.append("表达：精简版（保持结构，浓缩正文）。")
            else:
                p_short.append(l)

        content_omni_short = "\n".join(header_short) + "\n\n" + "\n".join(table_short) + "\n\n---\n\n" + "\n".join(p_short)
        content_omni_short = _normalize_prompt_asset_mentions(content_omni_short)
        if args.force or not dst_omni_short.exists():
            dst_omni_short.write_text(content_omni_short, encoding="utf-8")
            wrote_paths.append(dst_omni_short)
            print(f"    ✅ 已输出 -> {dst_omni_short}")

        seedance2_short_section = _build_seedance_master_prompt(args.style, shot_lines_for_seedance2_short, variant="short")
        content_seedance2_short = "\n".join(header_short) + "\n\n" + "\n".join(table_short) + "\n\n---\n\n" + seedance2_short_section
        content_seedance2_short = _normalize_prompt_asset_mentions(content_seedance2_short)
        if args.force or not dst_seedance2_short.exists():
            dst_seedance2_short.write_text(content_seedance2_short, encoding="utf-8")
            wrote_paths.append(dst_seedance2_short)
            print(f"    ✅ 已输出 -> {dst_seedance2_short}")

        seedance2_narrative_short_section = _build_seedance2_narrative_prompt(
            args.style, enable_combat, tags, tag_to_display, orientation_state, shot_lines_for_seedance2_short, variant="short"
        )
        content_seedance2_narrative_short = "\n".join(header_short) + "\n\n" + "\n".join(table_short) + "\n\n---\n\n" + seedance2_narrative_short_section
        content_seedance2_narrative_short = _normalize_prompt_asset_mentions(content_seedance2_narrative_short)
        if args.force or not dst_seedance2_narrative_short.exists():
            dst_seedance2_narrative_short.write_text(content_seedance2_narrative_short, encoding="utf-8")
            wrote_paths.append(dst_seedance2_narrative_short)
            print(f"    ✅ 已输出 -> {dst_seedance2_narrative_short}")

    if not args.no_validate:
        try:
            from prompt_protocol_validate import load_schema, validate_omni, validate_seedance2_field, validate_seedance2_narrative
        except Exception as e:
            raise SystemExit(f"协议校验模块不可用: {e}")

        schema_path = Path(__file__).resolve().parents[1] / "docs/blocking-camera-geometry.schema.json"
        schema = load_schema(schema_path)

        to_validate = []
        if "long" in variants:
            to_validate.extend([dst_omni, dst_seedance2, dst_seedance2_narrative])
        if "short" in variants:
            to_validate.extend([dst_omni_short, dst_seedance2_short, dst_seedance2_narrative_short])

        errors = []
        for p in to_validate:
            if not p.exists():
                continue
            md_text = p.read_text(encoding="utf-8")
            if "omni-paste" in p.name:
                errors.extend([f"{p.name}: {x}" for x in validate_omni(md_text, schema)])
            elif "seedance2-paste" in p.name and "narrative" not in p.name:
                errors.extend([f"{p.name}: {x}" for x in validate_seedance2_field(md_text, schema)])
            elif "seedance2-narrative-paste" in p.name:
                errors.extend([f"{p.name}: {x}" for x in validate_seedance2_narrative(md_text, schema)])

        if errors:
            print("[!] 协议校验存在警告（不阻塞流水线）")
            for err in errors:
                print(f"- {err}")
        else:
            print("✅ 协议校验通过：几何/站位/读点/群戏/字幕安全区门禁一致")

        # 红线校验（方法论强制约束）
        try:
            from prompt_redline_validate import validate_file
        except Exception:
            validate_file = None

        if validate_file:
            redline_errors = []
            redline_warnings = []
            for p in to_validate:
                if not p.exists():
                    continue
                errs, warns = validate_file(p)
                redline_errors.extend([f"{p.name}: {e}" for e in errs])
                redline_warnings.extend([f"{p.name}: {w}" for w in warns])

            if redline_warnings:
                print(f"[!] 红线校验：{len(redline_warnings)} 个警告")
                for w in redline_warnings[:20]:
                    print(f"    - {w}")
                if len(redline_warnings) > 20:
                    print(f"    ... 还有 {len(redline_warnings) - 20} 个警告（使用 tools/prompt_redline_validate.py 查看全部）")

            if redline_errors:
                print(f"[x] 红线校验失败：{len(redline_errors)} 个错误")
                for e in redline_errors:
                    print(f"    - {e}")
                raise SystemExit(2)
            elif redline_warnings:
                print(f"⚠️ 红线校验通过（{len(redline_warnings)} 个警告，0 个错误）")
            else:
                print("✅ 红线校验通过：方法论约束全部满足")


if __name__ == "__main__":
    main()
