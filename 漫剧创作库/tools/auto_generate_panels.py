import os
import sys
import json
import time
import urllib.request
import mimetypes
import argparse
import re
from pathlib import Path

from normalize_episode_prompt_refs import normalize_markdown

API_KEY = os.environ.get("RUNNINGHUB_API_KEY", "")


def _load_asset_tag_display_map(project_dir):
    asset_index = project_dir / "03-assets/asset-index.md"
    mapping = {}
    if not asset_index.exists():
        return mapping

    for line in asset_index.read_text(encoding="utf-8").splitlines():
        if not line.startswith("| @"):
            continue
        parts = [p.strip() for p in line.strip().strip("|").split("|")]
        if len(parts) < 2:
            continue
        tag = parts[0]
        path = parts[1].strip().strip("`")
        if not tag.startswith("@"):
            continue
        base = os.path.basename(path)
        base = re.sub(r"\.(png|jpg|jpeg|webp)$", "", base, flags=re.I)
        display = re.sub(r"-v\d+(?:-\d+)?$", "", base)
        if not display:
            continue
        if tag.startswith("@char-"):
            display = display.replace("觉醒前", "").replace("觉醒后", "").strip() or display
        mapping[tag] = f"@{display}"
    # storyboard 里可能出现的群演/集合类引用，补中文显示名
    mapping.setdefault("@char-clanextras", "@围观群众")
    mapping.setdefault("@char-younglintian", "@林天")
    mapping.setdefault("@char-younglinwanye", "@林婉儿")
    mapping.setdefault("@scene-clan-hall", "@家主大殿")
    mapping.setdefault("@scene-clan-gate", "@家主大殿")
    mapping.setdefault("@scene-clan", "@家主大殿")
    return mapping


def _build_asset_name_map(tag_map):
    mapping = {}
    for _, display in tag_map.items():
        mapping[display.lstrip("@")] = display
    return mapping


def _separate_asset_suffixes(text):
    action_prefixes = "带|抬|挥|指|盯|胸|脚|步|中|近|全|特|如|从|向|朝|与|和|被|将|把|在|骤|狂|冷|怒|冲|扑|踏|跳|笑|缓|直|双|低|微|慢|猛|暴|开|说|看|压|退"
    return re.sub(rf"(@[^\s@]+)(?=({action_prefixes}))", r"\1 ", text)


def _normalize_asset_mentions(text, tag_map):
    if not text:
        return text
    name_map = _build_asset_name_map(tag_map)
    for tag, display in sorted(tag_map.items(), key=lambda x: len(x[0]), reverse=True):
        text = text.replace(tag, display)
    for name, display in sorted(name_map.items(), key=lambda x: len(x[0]), reverse=True):
        text = re.sub(rf"(?<!@){re.escape(name)}", display, text)
    text = _separate_asset_suffixes(text)
    return text.replace("@@", "@")

def _extract_name_from_filename(filename, prefix, suffix):
    if not filename.startswith(prefix) or not filename.endswith(suffix):
        return ""
    return filename[len(prefix):-len(suffix)]

def _find_episode_script(project_dir, ep_int):
    scripts_dir = project_dir / "01-story/scripts"
    if not scripts_dir.exists():
        return None
    patterns = [
        f"第{ep_int}话-*-剧本正文.md",
        f"第{ep_int}话-*.md",
        f"ep{ep_int:03d}.md",
    ]
    for pattern in patterns:
        matches = sorted(scripts_dir.glob(pattern))
        if matches:
            return matches[0]
    return None

def _extract_episode_title_from_script_path(script_path, ep_int):
    if not script_path:
        return f"第{ep_int}话"
    m = re.search(rf"第{ep_int}话-(.*?)-剧本正文\.md$", script_path.name)
    if m:
        return f"第{ep_int}话《{m.group(1)}》"
    return f"第{ep_int}话"

def _list_assets_by_type(project_dir, asset_type):
    if asset_type == "characters":
        dir_path = project_dir / "06-generated/images/characters"
    elif asset_type == "scenes":
        dir_path = project_dir / "06-generated/images/scenes"
    elif asset_type == "props":
        dir_path = project_dir / "06-generated/images/props"
    else:
        return []
    if not dir_path.exists():
        return []
    assets = []
    for p in sorted(dir_path.glob("*-v8-1.png")):
        if p.name.lower().endswith("readme.md"):
            continue
        base = p.stem
        name = re.sub(r"-v\d+-\d+$", "", base)
        name = re.sub(r"^(角色设计图-|场景氛围图-|道具设计图-)", "", name)
        if name:
            assets.append({"name": name, "path": p})
    return assets

def _list_comic_panels_for_ep(project_dir, ep):
    panels_dir = project_dir / "06-generated/images/comic-panels"
    if not panels_dir.exists():
        return []
    panels = []
    ep_prefix = f"ep{ep}_shot"
    for p in sorted(panels_dir.glob(f"{ep_prefix}*.png")):
        m = re.match(rf"^ep{re.escape(ep)}_shot(.+?)_\d+\.png$", p.name)
        if not m:
            continue
        shot_id = m.group(1)
        rel_path = p.as_posix().split(project_dir.as_posix() + "/")[-1]
        panels.append({"shot_id": shot_id, "path": p, "rel_path": rel_path})
    return panels

def _asset_alias(asset_type, name):
    return f"@{name}"

def _select_assets_for_text(project_dir, text):
    selected = {"characters": [], "scenes": [], "props": []}
    for asset_type in ["characters", "scenes", "props"]:
        for asset in _list_assets_by_type(project_dir, asset_type):
            if asset["name"] in text:
                selected[asset_type].append(asset)
    return selected

def _parse_seedance_tag_mapping(project_dir):
    mapping_path = project_dir / "03-assets/asset-index.md"
    if not mapping_path.exists():
        return {}
    content = mapping_path.read_text(encoding="utf-8")
    m = re.search(r"##\s*Seedance\s*@引用标签映射（落盘路径）\s*\n([\s\S]*?)(?:\n##\s+|\Z)", content)
    if not m:
        return {}
    block = m.group(1)
    lines = [line.strip() for line in block.splitlines() if line.strip().startswith("|")]
    if len(lines) < 3:
        return {}
    rows = []
    for line in lines[2:]:
        parts = [p.strip() for p in line.strip().strip("|").split("|")]
        if len(parts) < 2:
            continue
        tag = parts[0]
        path_raw = parts[1]
        path_raw = path_raw.strip().strip("`")
        if tag.startswith("@") and path_raw:
            rows.append((tag, path_raw))
    tag_map = {}
    for tag, rel_path in rows:
        tag_map[tag] = rel_path
    return tag_map

def _parse_refs_field(refs):
    if not refs:
        return []
    refs = refs.replace("，", ",")
    parts = []
    for chunk in refs.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        for item in chunk.split():
            item = item.strip()
            if item.startswith("@"):
                parts.append(item)
    return parts

def _collapse_shot_ranges(indices):
    if not indices:
        return ""
    indices = sorted(set(indices))
    ranges = []
    start = prev = indices[0]
    for x in indices[1:]:
        if x == prev + 1:
            prev = x
            continue
        ranges.append((start, prev))
        start = prev = x
    ranges.append((start, prev))
    parts = []
    for a, b in ranges:
        if a == b:
            parts.append(f"Shot {a}")
        else:
            parts.append(f"Shot {a}-{b}")
    return ", ".join(parts)

def _infer_name_from_asset_path(rel_path):
    base = rel_path.split("/")[-1]
    base = re.sub(r"\.\w+$", "", base)
    base = re.sub(r"-v\d+-\d+$", "", base)
    base = re.sub(r"^(角色设计图-|场景氛围图-|道具设计图-)", "", base)
    return base.strip()

def _build_aliases_for_name(name):
    aliases = set()
    if not name:
        return aliases
    aliases.add(name)
    if name.endswith("觉醒前"):
        base = name.replace("觉醒前", "")
        if base:
            aliases.add(base)
    if name.endswith("觉醒后"):
        base = name.replace("觉醒后", "")
        if base:
            aliases.add(base)
    if "全景" in name:
        aliases.add(name.replace("全景", ""))
        aliases.add("全景")
    if "练武场" in name:
        aliases.add("练武场")
        aliases.add("演武场")
    if ("系统" in name) or ("UI" in name):
        aliases.update(["系统", "UI", "HUD", "面板", "UI面板", "HUD面板"])
    if "联邦" in name:
        aliases.update(["联邦", "联邦屏障", "屏障", "七大联邦"])
    if "碑" in name:
        aliases.update(["碑", "碑石", "碑面", "巨碑", "黑碑", "灵纹碑"])
    if "战甲" in name:
        aliases.update(["战甲", "金甲", "金纹战甲"])
    if "婚约" in name:
        aliases.update(["婚约", "红纸", "婚约红纸"])
    if "遗物" in name or "禁忌" in name:
        aliases.update(["遗物", "禁忌", "禁忌遗物"])
    return {a for a in aliases if a and len(a) >= 2}

def _parse_storyboard_table_rows(storyboard_md_path):
    if not storyboard_md_path.exists():
        return []
    with open(storyboard_md_path, "r", encoding="utf-8") as f:
        lines = f.read().splitlines()
    rows = []
    in_table = False
    header_seen = False
    for line in lines:
        if line.startswith("|") and "镜号" in line and "内容描述" in line:
            in_table = True
            header_seen = True
            continue
        if in_table and header_seen and re.match(r"^\|\s*-+\s*\|", line):
            continue
        if in_table:
            if not line.startswith("|"):
                if rows:
                    break
                continue
            parts = [p.strip() for p in line.strip().strip("|").split("|")]
            if len(parts) < 6:
                continue
            # New format: | 镜号 | 镜头任务 | 景别 | 内容描述 | 首看点 | 运镜 | 时长 | 节拍数 | 安全区 | @引用 | 光影参数 | 风险 / 回退点 | AI模型 |
            rows.append({
                "id": parts[0],
                "task": parts[1],
                "shot_size": parts[2],
                "frame": parts[3],
                "first_look": parts[4] if len(parts) > 4 else "",
                "camera_psy": parts[5] if len(parts) > 5 else "",
                "duration": parts[6] if len(parts) > 6 else "",
                "beats": parts[7] if len(parts) > 7 else "",
                "safety": parts[8] if len(parts) > 8 else "",
                "refs": parts[9] if len(parts) > 9 else "",
                "lighting": parts[10] if len(parts) > 10 else "",
                "risk": parts[11] if len(parts) > 11 else "",
                "ai_model": parts[12] if len(parts) > 12 else "",
            })
    return rows

def _extract_beats_from_script(script_text):
    if not script_text:
        return []
    lines = script_text.splitlines()
    beats = []
    current = None
    for line in lines:
        if line.startswith("## "):
            if current and current.get("content_lines"):
                beats.append(current)
            current = {"title": line.strip("# ").strip(), "content_lines": []}
            continue
        if current is None:
            continue
        stripped = line.strip()
        if not stripped:
            continue
        current["content_lines"].append(stripped)
    if current and current.get("content_lines"):
        beats.append(current)

    rows = []
    for i, beat in enumerate(beats, start=1):
        title = beat["title"]
        if not title.startswith("场景"):
            continue
        cam = ""
        frame_lines = []
        for s in beat["content_lines"]:
            if s.startswith("|"):
                continue
            if s.startswith("【运镜：") and not cam:
                cam = s.replace("【运镜：", "").rstrip("】").strip()
            if s.startswith("△") or s.startswith("△△"):
                frame_lines.append(s.lstrip("△").strip())
            if s.startswith("**") and s.endswith("**："):
                frame_lines.append(s.strip("*："))
            if len(frame_lines) >= 2:
                break
        frame = " / ".join(frame_lines) if frame_lines else (beat["content_lines"][0] if beat["content_lines"] else "")
        rows.append({
            "id": f"S{i}",
            "task": title,
            "frame": frame,
            "shot_size": "",
            "camera_psy": cam,
            "duration": "4s", # Default
            "beats": "1",
            "safety": "前0.5s / 后0.5s",
            "roles": "",
            "first_look": "",
            "arc": "",
            "dialogue": "",
            "refs": "",
            "lighting": "",
            "risk": "",
            "ai_prompt": "",
            "ai_model": "Seedance"
        })
    return rows

def _pick_row(rows, keywords, fallback_index):
    for row in rows:
        hay = " ".join([row.get("task",""), row.get("frame",""), row.get("first_look",""), row.get("dialogue","")])
        if any(k in hay for k in keywords):
            return row
    if rows and 0 <= fallback_index < len(rows):
        return rows[fallback_index]
    return rows[-1] if rows else None

def _pick_row_excluding(rows, keywords, fallback_index, used_ids):
    for row in rows:
        row_id = row.get("id")
        if row_id and row_id in used_ids:
            continue
        hay = " ".join([row.get("task",""), row.get("frame",""), row.get("first_look",""), row.get("dialogue","")])
        if any(k in hay for k in keywords):
            if row_id:
                used_ids.add(row_id)
            return row
    if rows and 0 <= fallback_index < len(rows):
        row = rows[fallback_index]
        row_id = row.get("id")
        if row_id and row_id not in used_ids:
            used_ids.add(row_id)
            return row
    for row in reversed(rows):
        row_id = row.get("id")
        if row_id and row_id in used_ids:
            continue
        if row_id:
            used_ids.add(row_id)
        return row
    return None

def _pick_row_excluding_from_end(rows, keywords, fallback_index, used_ids):
    for row in reversed(rows):
        row_id = row.get("id")
        if row_id and row_id in used_ids:
            continue
        hay = " ".join([row.get("task",""), row.get("frame",""), row.get("first_look",""), row.get("dialogue","")])
        if any(k in hay for k in keywords):
            if row_id:
                used_ids.add(row_id)
            return row
    return _pick_row_excluding(rows, keywords, fallback_index, used_ids)

def _format_seconds(sec):
    if abs(sec - round(sec)) < 1e-9:
        return str(int(round(sec)))
    s = f"{sec:.1f}".rstrip("0").rstrip(".")
    return s

def _time_ranges_15s(shot_count):
    if shot_count <= 0:
        return []
    presets = {
        1: [(0, 15)],
        2: [(0, 7), (7, 15)],
        3: [(0, 5), (5, 10), (10, 15)],
        4: [(0, 3), (3, 7), (7, 11), (11, 15)],
        5: [(0, 3), (3, 6), (6, 9), (9, 12), (12, 15)],
        6: [(0, 2.5), (2.5, 5), (5, 7.5), (7.5, 10), (10, 12.5), (12.5, 15)],
    }
    if shot_count in presets:
        return [f"{_format_seconds(a)}-{_format_seconds(b)}s" for a, b in presets[shot_count]]
    step = 15.0 / shot_count
    ranges = []
    t = 0.0
    for i in range(shot_count):
        a = t
        b = 15.0 if i == shot_count - 1 else (t + step)
        ranges.append(f"{_format_seconds(a)}-{_format_seconds(b)}s")
        t = b
    return ranges

def emit_storyboard_md(project_dir, ep, force=False):
    ep_int = int(ep)
    output_path = project_dir / f"04-storyboard/ep{ep}-storyboard.md"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists() and not force:
        return

    script_path = _find_episode_script(project_dir, ep_int)
    if not script_path or not script_path.exists():
        print(f"[-] 找不到剧本文件，无法生成分镜表: ep{ep}")
        return

    script_text = script_path.read_text(encoding="utf-8")
    rows = _extract_beats_from_script(script_text)
    if not rows:
        print(f"[-] 剧本中未提取到有效节拍: ep{ep}")
        return

    title = _extract_episode_title_from_script_path(script_path, ep_int)
    lines = [
        f"# {title} 分镜剧本",
        "",
        f"> **项目：** 无限强化·灵纹觉醒",
        f"> **集数：** 第 {ep_int} 话",
        f"> **总镜头数：** {len(rows)}个",
        "",
        "---",
        "",
        "## 分镜表",
        "",
        "| 镜号 | 镜头任务 | 景别 | 内容描述 | 首看点 | 运镜 | 时长 | 节拍数 | 安全区 | @引用 | 光影参数 | 风险 / 回退点 | AI模型 |",
        "|------|----------|------|---------|--------|------|------|-------|--------|-------|---------|---------------|--------|",
    ]
    for r in rows:
        lines.append(f"| {r['id']} | {r['task']} | {r['shot_size']} | {r['frame']} | {r['first_look']} | {r['camera_psy']} | {r['duration']} | {r['beats']} | {r['safety']} | {r['refs']} | {r['lighting']} | {r['risk']} | Seedance |")

    lines.extend([
        "",
        "---",
        "",
        "## Seedance 提示词",
        "",
    ])
    for r in rows:
        lines.append(f"### 镜头 {r['id']}")
        lines.append("```")
        lines.append(r['frame'])
        lines.append("```")
        lines.append("")

    output_path.write_text("\n".join(lines), encoding="utf-8")
    print(f"    ✅ 已输出 -> {output_path}")


def emit_shots_md(project_dir, ep, force=False):
    ep_int = int(ep)
    storyboard_md = project_dir / f"04-storyboard/ep{ep}-storyboard.md"
    output_path = project_dir / f"05-prompts/seedance/ep{ep}-shots.md"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists() and not force:
        print(f"[*] 已存在: {output_path}（使用 --force 可覆盖）")
        return

    rows = _parse_storyboard_table_rows(storyboard_md)
    if not rows:
        script_path = _find_episode_script(project_dir, ep_int)
        if script_path:
            rows = _extract_beats_from_script(script_path.read_text(encoding="utf-8"))

    if not rows:
        print(f"[-] 找不到分镜数据，无法生成 shots.md: ep{ep}")
        return

    script_path = _find_episode_script(project_dir, ep_int)
    title = _extract_episode_title_from_script_path(script_path, ep_int)
    tag_display_map = _load_asset_tag_display_map(project_dir)

    content = [
        f"# ep{ep}-shots.md — {title} Seedance 镜头提示词",
        "",
        f"> **项目：** 无限强化·灵纹觉醒",
        f"> **章节：** {title}",
        f"> **用途：** 将 `04-storyboard/ep{ep}-storyboard.md` 中的 {len(rows)} 镜拆为可执行的 Seedance 正式镜头稿。",
        f"> **执行原则：** 先保住人物关系、身体受力、镜头结果，再决定是否加速度强化。",
        "",
        "---",
        "",
        "## 一、参考资产建议 (自动生成版)",
        "",
        "### 全局风格参考 (SREF)",
        "- `06-generated/images/characters/林天觉醒后-v3-3.png`",
        "",
        "## 二、镜头执行稿",
        "",
    ]

    for r in rows:
        content.append(f"## SHOT {r['id']} — {r['task']}")
        content.append("### 目标")
        content.append(_normalize_asset_mentions(r['first_look'] or "保住画面基本逻辑。", tag_display_map))
        content.append("")
        content.append("### 推荐引用")
        if r['refs']:
            for ref in r['refs'].split(","):
                clean_ref = ref.strip()
                content.append(f"- {tag_display_map.get(clean_ref, clean_ref)}")
        else:
            content.append("- (无)")
        content.append("")
        content.append("### baseline")
        baseline = r['frame']
        if r['camera_psy']:
            baseline += f"，{r['camera_psy']}"
        if r['lighting']:
            baseline += f"，{r['lighting']}"
        baseline = _normalize_asset_mentions(baseline, tag_display_map)
        content.append(baseline + "。漫画分镜构图，层级清晰，保留对白区。")
        content.append("")
        content.append("---")
        content.append("")

    final_content = "\n".join(content)
    output_path.write_text(final_content, encoding="utf-8")
    print(f"    ✅ 已输出 -> {output_path}")


def emit_fullref_15s(project_dir, ep, shot_count=4, force=False, use_comic_panels=False):
    ep_int = int(ep)
    storyboard_md = project_dir / f"04-storyboard/ep{ep}-storyboard.md"
    output_path = project_dir / f"05-prompts/seedance/ep{ep}-fullref-15s.md"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists() and not force:
        print(f"[*] 已存在: {output_path}（使用 --force 可覆盖）")
        return
    if shot_count < 1:
        print("错误: --shots 必须 >= 1")
        return
    if shot_count > 10:
        print("错误: --shots 建议 <= 10（15秒内镜头过多会降低可读性与稳定性）")
        return
    script_path = _find_episode_script(project_dir, ep_int)
    title = _extract_episode_title_from_script_path(script_path, ep_int)
    storyboard_text = ""
    if storyboard_md.exists():
        storyboard_text = storyboard_md.read_text(encoding="utf-8")
    script_text = ""
    if script_path and script_path.exists():
        script_text = script_path.read_text(encoding="utf-8")
    combined_text = storyboard_text + "\n" + script_text
    tag_map = _parse_seedance_tag_mapping(project_dir)
    alias_to_tag = {}
    scene_tag_to_name = {}
    for tag, rel_path in tag_map.items():
        name = _infer_name_from_asset_path(rel_path)
        if name:
            for alias in _build_aliases_for_name(name):
                alias_to_tag.setdefault(alias, tag)
        if tag.startswith("@scene-"):
            scene_name = _infer_name_from_asset_path(rel_path)
            if scene_name:
                scene_tag_to_name[tag] = scene_name
    selected = _select_assets_for_text(project_dir, combined_text)
    fallback_ref_rows = []
    for asset_type in ["characters", "scenes", "props"]:
        for asset in selected[asset_type]:
            alias = _asset_alias(asset_type, asset["name"])
            rel_path = asset["path"].as_posix().split(project_dir.as_posix() + "/")[-1]
            fallback_ref_rows.append((alias, rel_path))
    if not fallback_ref_rows:
        for asset_type in ["characters", "scenes", "props"]:
            for asset in _list_assets_by_type(project_dir, asset_type)[:2]:
                alias = _asset_alias(asset_type, asset["name"])
                rel_path = asset["path"].as_posix().split(project_dir.as_posix() + "/")[-1]
                fallback_ref_rows.append((alias, rel_path))
    comic_panels = _list_comic_panels_for_ep(project_dir, ep) if use_comic_panels else []
    panel_by_shot_id = {}
    for panel in comic_panels:
        alias = f"@分镜-ep{ep}-shot{panel['shot_id']}"
        panel_by_shot_id[panel["shot_id"]] = {"alias": alias, "rel_path": panel["rel_path"]}
    rows = _parse_storyboard_table_rows(storyboard_md) if storyboard_md.exists() else []
    if not rows:
        rows = _extract_beats_from_script(script_text)
    selected_rows = []
    if shot_count == 4:
        used_ids = set()
        has_system = any("系统" in (r.get("task","") + r.get("frame","") + r.get("dialogue","")) for r in rows)
        hook_keywords = ["系统", "提示音", "绑定", "黑暗", "虚空", "入场"] if has_system else ["触碑", "临界", "建立", "开场", "静", "入场"]
        if has_system:
            problem_keywords_primary = ["HUD", "UI", "面板", "礼包", "+300", "激活", "数值", "力量", "绑定"]
            problem_keywords_secondary = ["踩脸", "屈辱", "脚踩", "压制", "回到踩脸"]
            solution_keywords = ["冲击波", "爆发", "涟漪", "弹开", "起身", "重塑", "金瞳", "宣言", "跪下"]
            cta_keywords = ["宣言", "跪下", "死寂", "余韵", "定格", "系统音"]
        else:
            problem_keywords_primary = ["伪灵纹", "盖章", "亮起", "审判"]
            problem_keywords_secondary = ["哄笑", "羞辱", "窃笑", "嘲笑"]
            solution_keywords = ["拳", "命中", "冲击波", "弹开", "起身", "对撞", "反震", "踩", "压回", "弹飞"]
            cta_keywords = ["钩子", "眼神", "闪回", "裂入", "宣言", "死寂", "系统音", "定格"]
        if rows:
            denom = 3
            fallback_indices = [0, int(round((len(rows) - 1) * 1 / denom)), int(round((len(rows) - 1) * 2 / denom)), len(rows) - 1]
        else:
            fallback_indices = [0, 0, 0, 0]
        hook_row = _pick_row_excluding(rows, hook_keywords, fallback_indices[0], used_ids)
        problem_row = _pick_row_excluding(rows, problem_keywords_primary, fallback_indices[1], used_ids)
        if problem_row:
            problem_hay = " ".join([problem_row.get("task",""), problem_row.get("frame",""), problem_row.get("first_look",""), problem_row.get("dialogue","")])
            if not any(k in problem_hay for k in problem_keywords_primary):
                problem_row = _pick_row_excluding(rows, problem_keywords_secondary, fallback_indices[1], used_ids)
        else:
            problem_row = _pick_row_excluding(rows, problem_keywords_secondary, fallback_indices[1], used_ids)
        solution_row = _pick_row_excluding(rows, solution_keywords, fallback_indices[2], used_ids)
        cta_row = _pick_row_excluding_from_end(rows, cta_keywords, fallback_indices[3], used_ids)
        selected_rows = [
            hook_row,
            problem_row,
            solution_row,
            cta_row,
        ]
    else:
        if rows:
            denom = max(shot_count - 1, 1)
            for i in range(shot_count):
                idx = int(round(i * (len(rows) - 1) / denom))
                selected_rows.append(rows[idx])
        else:
            selected_rows = [None] * shot_count
    default_scene = ""
    for tag, scene_name in scene_tag_to_name.items():
        if scene_name and scene_name in combined_text:
            default_scene = tag
            break

    def resolve_refs(row, shot_index):
        refs = []
        missing = []
        if row:
            for tag in _parse_refs_field(row.get("refs", "")):
                if tag in tag_map:
                    refs.append(tag)
                else:
                    missing.append(tag)
        if use_comic_panels and row:
            panel = panel_by_shot_id.get(row.get("id"))
            if panel:
                refs.insert(0, panel["alias"])
        if not refs and row:
            hay = " ".join([row.get("roles",""), row.get("frame",""), row.get("first_look","")])
            for alias in sorted(alias_to_tag.keys(), key=len, reverse=True):
                if alias in hay:
                    refs.append(alias_to_tag[alias])
        if not refs and not tag_map and row:
            for alias, _ in fallback_ref_rows:
                name = alias.split("-", 1)[-1]
                if name and (name in row.get("roles","") or name in row.get("frame","") or name in row.get("first_look","")):
                    refs.append(alias)
        if row:
            scene_refs = [r for r in refs if r.startswith("@scene-")]
            if not scene_refs:
                hay = " ".join([row.get("task",""), row.get("frame",""), row.get("first_look","")])
                matched_scene = ""
                for tag, scene_name in scene_tag_to_name.items():
                    if scene_name and scene_name in hay:
                        matched_scene = tag
                        break
                if matched_scene:
                    refs.insert(0, matched_scene)
                elif default_scene and default_scene in scene_tag_to_name and scene_tag_to_name[default_scene] in hay:
                    refs.insert(0, default_scene)
        deduped = []
        seen = set()
        for r in refs:
            if r in seen:
                continue
            seen.add(r)
            deduped.append(r)
        return deduped, missing

    def shot_block(shot_title, time_range, row, shot_index):
        if not row:
            cam = ""
            frame = ""
            first_look = ""
            arc = ""
            dialogue = ""
        else:
            cam = row.get("camera_psy", "")
            frame = row.get("frame", "")
            first_look = row.get("first_look", "")
            arc = row.get("arc", "")
            dialogue = row.get("dialogue", "")
        refs, _ = resolve_refs(row, shot_index)
        refs_str = ", ".join([r for r in refs if r])
        cam_str = cam if cam else "固定/轻推/轻摇（绑定心理动机）"
        frame_line = frame
        if first_look:
            frame_line = f"{frame_line}（首看点：{first_look}）" if frame_line else f"首看点：{first_look}"
        if arc:
            frame_line = f"{frame_line}（视觉弧光：{arc}）" if frame_line else f"视觉弧光：{arc}"
        if dialogue and dialogue != "无":
            frame_line = f"{frame_line}（对白/旁白：{dialogue}）" if frame_line else f"对白/旁白：{dialogue}"
        return (
            f"## {shot_title}\n\n"
            f"【{time_range}】\n"
            f"【运镜】{cam_str}\n"
            f"【画面】{frame_line}\n"
            f"【参考】{refs_str}\n"
            f"【音效】环境底噪/留白/入点/收束（按情绪曲线设计）\n"
            f"【风格】统一画风、主光方向与字幕安全区；提示词只写动态变化，不重复静态事实\n\n"
            "---\n\n"
        )
    tag_usage = {}
    missing_tags = []
    for i in range(shot_count):
        row = selected_rows[i] if i < len(selected_rows) else None
        refs, missing = resolve_refs(row, i)
        for tag in refs:
            tag_usage.setdefault(tag, []).append(i + 1)
        missing_tags.extend(missing)
    if not tag_usage:
        for alias in sorted(alias_to_tag.keys(), key=len, reverse=True):
            if alias in combined_text:
                tag_usage.setdefault(alias_to_tag[alias], []).extend(list(range(1, shot_count + 1)))
    ref_table_lines = ["| 用途 | 文件路径 | 用于镜头 |", "|------|---------|---------|"]
    for tag, shots_used in sorted(tag_usage.items(), key=lambda x: x[0]):
        if tag.startswith("@分镜-"):
            shot_id = tag.split("shot", 1)[-1]
            panel = panel_by_shot_id.get(shot_id)
            if panel:
                ref_table_lines.append(f"| {tag} | {panel['rel_path']} | {_collapse_shot_ranges(shots_used)} |")
            else:
                missing_tags.append(tag)
            continue
        if tag in tag_map:
            rel_path = tag_map[tag]
            ref_table_lines.append(f"| {tag} | {rel_path} | {_collapse_shot_ranges(shots_used)} |")
        else:
            missing_tags.append(tag)
    if not tag_map:
        ref_table_existing_tags = set(tag_usage.keys())
        for alias, rel_path in fallback_ref_rows:
            if alias in ref_table_existing_tags:
                continue
            ref_table_lines.append(f"| {alias} | {rel_path} | Shot 1-{shot_count} |")
    structure_line = "结构：HOOK→PROBLEM→SOLUTION→CTA/钩子收束（适合宣发/预告）"
    if shot_count != 4:
        structure_line = "结构：按剧本节奏设计（慢镜 1-2 镜头 / 常规 3-5 镜头 / 武戏快切 6-10 镜头）"
    content_parts = [
        f"# {title} — Seedance 2.0 全能参考 15 秒分镜提示词\n",
        f"> 项目：无限强化·灵纹觉醒\n",
        f"> 镜头数：{shot_count}\n",
        f"> {structure_line}\n",
        "\n---\n\n",
        "## 参考图清单\n\n",
        "\n".join(ref_table_lines) + "\n",
        "\n---\n\n",
    ]
    if missing_tags:
        content_parts.extend([
            "## 缺失引用（需要先补齐资产或修正 @引用）\n\n",
            "\n".join([f"- {t}" for t in missing_tags]) + "\n",
            "\n---\n\n",
        ])
    content_parts.extend([
        "## 素材职责矩阵（避免抢权漂移）\n\n",
        "| 控制维度 | 主控制源 | 约束 |\n",
        "|---------|----------|------|\n",
        "| 角色形象/阶段/战损一致性 | @角色-… | 禁止跨阶段换装与战损消失 |\n",
        "| 场景空间/光影基准 | @场景-… | 主光方向一致，保留字幕安全区 |\n",
        "| 剧情支点道具可读性 | @道具-… | 关键道具必须可读，不抢主读点 |\n",
        "| 动作/受力/结果可读性 | 由文字指令定义 | 命中点与结果镜头必须清晰，过程可适度 motion blur |\n",
        "| 节奏与声画空间 | 由文字指令定义 | 写清骤静/入点/收束与 Room Tone/Foley |\n",
        "\n## 片段节拍纪律\n\n",
        "- 节拍密度：每 2.5 秒 ≤ 1 个关键动作节拍；每个 Shot 只承担 1 个核心视觉任务。\n",
        "- 清晰帧保护：爆点 Shot 必须写明“命中点/结果镜头必须清晰可读”。\n",
        "\n---\n\n",
    ])
    content = "".join(content_parts)
    time_ranges = _time_ranges_15s(shot_count)
    if shot_count == 4:
        content += shot_block("Shot 1 — HOOK", time_ranges[0], selected_rows[0], 0)
        content += shot_block("Shot 2 — PROBLEM→SOLUTION", time_ranges[1], selected_rows[1], 1)
        content += shot_block("Shot 3 — SOLUTION（高光）", time_ranges[2], selected_rows[2], 2)
        content += shot_block("Shot 4 — CTA / 钩子收束", time_ranges[3], selected_rows[3], 3)
    else:
        for i in range(shot_count):
            content += shot_block(f"Shot {i+1}", time_ranges[i], selected_rows[i] if i < len(selected_rows) else None, i)
    content += (
        "## 全片技术参数\n\n"
        "| 参数 | 值 |\n"
        "|------|-----|\n"
        "| 画面比例 | 9:16 |\n"
        f"| 总时长 | 15秒（{shot_count}镜头） |\n"
        "| 模式 | 全部 I2V（全能参考入口） |\n"
        "| 转场 | 叠化 / 闪切 / 硬切 / 首尾帧桥接 |\n"
        "| 配乐走向 | Shot1铺底 → Shot2骤静/压迫 → Shot3高潮 → Shot4收束/钩子 |\n\n"
        "## 情绪曲线\n\n"
        "```\n"
        "情绪强度\n"
        "  ↑\n"
        "  │      ★S3(高光)\n"
        "  │     /\n"
        "  │ ★S1/ ★S4(收束/钩子)\n"
        "  │   ★S2\n"
        "  └────────→ 时间 0 3 7 11 15s\n"
        "```\n\n"
        "## 使用说明\n\n"
        "- 修改时只改【画面】中的动态描述与【运镜】，静态内容由参考图决定无需重复。\n"
        "- `comic-panels` 首帧为可选增强：有则可按 Shot 替换 @场景/@角色参考以锁定构图与一致性；无则不影响执行。\n"
    )
    output_path.write_text(content, encoding="utf-8")
    print(f"    ✅ 已输出 -> {output_path}")

def upload_image(file_path):
    url = "https://www.runninghub.cn/openapi/v2/media/upload/binary"
    boundary = f"----WebKitFormBoundary{int(time.time()*1000)}"
    with open(file_path, "rb") as f:
        file_bytes = f.read()
    mime_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
    filename = os.path.basename(file_path)
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: {mime_type}\r\n\r\n".encode("utf-8") +
        file_bytes +
        f"\r\n--{boundary}--\r\n".encode("utf-8")
    )
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Authorization", f"Bearer {API_KEY}")
    req.add_header("Content-Type", f"multipart/form-data; boundary={boundary}")
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode())
        return res["data"]["fileName"] if "data" in res else res["fileName"]

def create_task(node_info_list):
    url = "https://www.runninghub.cn/task/openapi/create"
    payload = {
        "apiKey": API_KEY,
        "addMetadata": True,
        "workflowId": "2043087373063430146", # Banana2 
        "nodeInfoList": node_info_list
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST")
    req.add_header("Authorization", f"Bearer {API_KEY}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode())
        return res["data"]["taskId"]

def check_status(task_id):
    url = "https://www.runninghub.cn/task/openapi/status"
    payload = {"apiKey": API_KEY, "taskId": task_id}
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST")
    req.add_header("Authorization", f"Bearer {API_KEY}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode())
        return res["data"]

def get_outputs(task_id):
    url = "https://www.runninghub.cn/task/openapi/outputs"
    payload = {"apiKey": API_KEY, "taskId": task_id}
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), method="POST")
    req.add_header("Authorization", f"Bearer {API_KEY}")
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req) as response:
        res = json.loads(response.read().decode())
        return res["data"]

def download_image(url, save_path):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response, open(save_path, 'wb') as out_file:
        out_file.write(response.read())

def extract_shots_from_md(md_path, target_shot=None):
    with open(md_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    shots = []
    # 按照 ## SHOT 分块
    blocks = re.split(r'\n## SHOT ', content)
    for block in blocks[1:]: # 跳过开头
        shot_id_match = re.match(r'([A-Za-z0-9-]+)', block)
        if not shot_id_match:
            continue
        shot_id = shot_id_match.group(1)
        
        if target_shot and shot_id != target_shot:
            continue
            
        # 提取 baseline
        baseline_match = re.search(r'### baseline\n(.*?)(?=\n###|\n---|\Z)', block, re.DOTALL)
        if baseline_match:
            prompt = baseline_match.group(1).strip()
            # 附加风格锚点，确保画风统一
            style_anchor = "dark post-apocalyptic manhua aesthetic, high contrast dramatic lighting, cold blue rim light, charcoal gray base tones, fine black ink outlines, cinematic comic composition, cel-shaded with subtle gradients, metallic gold highlights, professional comic panel."
            full_prompt = f"{prompt}, {style_anchor}"
            shots.append({"shot_id": shot_id, "prompt": full_prompt})
            
    return shots

def update_execution_queue(project_dir, ep, shot_id):
    queue_path = project_dir / f"06-generated/第{int(ep)}话总执行队列.md"
    if not queue_path.exists():
        return
    with open(queue_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    pattern = rf'(\|\s*{shot_id}.*?\|\s*执行中\s*\|)'
    def repl(match):
        return match.group(1).replace("执行中", "✅ 已生成")
        
    new_content = re.sub(pattern, repl, content)
    if new_content != content:
        with open(queue_path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"    📝 Librarian: 已自动更新执行队列中 SHOT {shot_id} 的状态。")

def main():
    parser = argparse.ArgumentParser(description="自动化分镜生成脚本")
    parser.add_argument("--project-dir", required=True, help="项目根目录")
    parser.add_argument("--ep", required=True, help="集数编号 (如 001)")
    parser.add_argument("--shot", help="指定目标镜头(如 1-4)，不指定则跑全集")
    parser.add_argument("--emit-fullref-15s", action="store_true", help="输出全能参考 15 秒提示词文件（不发起生图）")
    parser.add_argument("--emit-storyboard", action="store_true", help="根据剧本输出分镜表 (storyboard.md)")
    parser.add_argument("--emit-shots", action="store_true", help="根据分镜表输出镜头执行稿 (shots.md)")
    parser.add_argument("--force", action="store_true", help="覆盖已存在输出文件")
    parser.add_argument("--shots", type=int, default=4, help="全能参考 15 秒镜头数（建议 1-10，默认 4）")
    parser.add_argument("--use-comic-panels", action="store_true", help="在输出全能参考 15 秒提示词时，优先按 Shot 绑定本集 comic-panels 首帧（可选增强）")
    args = parser.parse_args()
    
    project_dir = Path(args.project_dir).resolve()
    
    if args.emit_storyboard:
        emit_storyboard_md(project_dir, args.ep, force=args.force)
        
    if args.emit_shots:
        emit_shots_md(project_dir, args.ep, force=args.force)

    if args.emit_fullref_15s:
        emit_fullref_15s(project_dir, args.ep, shot_count=args.shots, force=args.force, use_comic_panels=args.use_comic_panels)
        
    if args.emit_storyboard or args.emit_shots or args.emit_fullref_15s:
        return

    if not API_KEY:
        print("错误: 未设置 RUNNINGHUB_API_KEY 环境变量")
        sys.exit(1)
        
    shots_md = project_dir / f"05-prompts/seedance/ep{args.ep}-shots.md"
    output_dir = project_dir / "06-generated/images/comic-panels"
    output_dir.mkdir(parents=True, exist_ok=True)
    
    if not shots_md.exists():
        print(f"[-] 找不到分镜脚本文件: {shots_md}")
        return
        
    shots = extract_shots_from_md(shots_md, args.shot)
    if not shots:
        print(f"[-] 未在脚本中找到匹配的镜头: {args.shot if args.shot else '全部'}")
        return

    print(f"[*] 发现 {len(shots)} 个镜头生成任务，开始自动化生产链...")
    
    # 全局上传一次 SREF 垫图以节省时间
    ref_img = project_dir / "06-generated/images/characters/林天觉醒后-v3-3.png"
    print(f"[*] 上传全局风格参考图...")
    char_filename = upload_image(ref_img)

    for shot in shots:
        shot_id = shot['shot_id']
        prompt = shot['prompt']
        print(f"\n=========================================")
        print(f"[+] 开始生产镜头: SHOT {shot_id}")
        print(f"[*] 提示词: {prompt[:50]}...")
        
        nodes = [
            {"nodeId": "2", "fieldName": "image", "fieldValue": char_filename},
            {"nodeId": "9", "fieldName": "text", "fieldValue": prompt},
            {"nodeId": "1", "fieldName": "prompt", "fieldValue": prompt}
        ]
        
        task_id = create_task(nodes)
        print(f"[*] 任务 {task_id} 已启动，等待出图...")
        
        while True:
            status = check_status(task_id)
            if status == "SUCCESS":
                outputs = get_outputs(task_id)
                for i, out in enumerate(outputs):
                    url = out.get("fileUrl") or out.get("url")
                    if url:
                        save_path = output_dir / f"ep{args.ep}_shot{shot_id}_{i+1}.png"
                        download_image(url, save_path)
                        print(f"    ✅ 已落盘 -> {save_path.name}")
                
                # 自动更新队列
                update_execution_queue(project_dir, args.ep, shot_id)
                break
            elif status == "FAILED":
                print(f"[-] 任务失败！请检查 prompt 是否含有违禁词或接口状态。")
                break
            time.sleep(5)
            
if __name__ == "__main__":
    main()
