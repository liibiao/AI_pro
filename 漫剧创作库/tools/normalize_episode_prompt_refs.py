import os
import re
from pathlib import Path


def _clean_display_name(name):
    name = name.strip()
    name = name.replace("（觉醒前）", "")
    name = name.replace("（觉醒后）", "")
    name = name.replace("(觉醒前)", "")
    name = name.replace("(觉醒后)", "")
    return name.strip()


def parse_assets(md_text):
    entries = []
    current_section = ""
    for line in md_text.splitlines():
        if line.startswith("### "):
            current_section = line.strip()
        if not line.startswith("|"):
            if line.startswith("- ") and "`" in line and any(ext in line for ext in [".png", ".jpg", ".jpeg", ".webp"]):
                m = re.search(r"-\s*(.*?)\s*:\s*`([^`]+)`", line)
                if not m:
                    continue
                label = _clean_display_name(m.group(1))
                path = m.group(2)
                base = os.path.basename(path)
                base = re.sub(r"\.(png|jpg|jpeg|webp)$", "", base, flags=re.I)
                display = re.sub(r"-v\d+(?:-\d+)?$", "", base)
                asset_type = "other"
                if "/characters/" in path or "角色参考" in current_section:
                    asset_type = "char"
                elif "/scenes/" in path or "场景" in current_section:
                    asset_type = "scene"
                elif "/props/" in path or "道具" in current_section:
                    asset_type = "prop"
                aliases = [a for a in [label, display, _clean_display_name(display)] if a]
                entries.append({"display": display, "type": asset_type, "aliases": aliases})
            continue
        if any(ext in line for ext in [".png", ".jpg", ".jpeg", ".webp"]):
            parts = [p.strip() for p in line.strip().strip("|").split("|")]
            if len(parts) < 3:
                continue
            tag = parts[-2]
            path = parts[-1]
            if not tag.startswith("@"):
                continue
            base = os.path.basename(path)
            base = re.sub(r"\.(png|jpg|jpeg|webp)$", "", base, flags=re.I)
            display = re.sub(r"-v\d+(?:-\d+)?$", "", base)
            if not display:
                continue
            asset_type = "other"
            if tag.startswith("@char-"):
                asset_type = "char"
            elif tag.startswith("@scene-"):
                asset_type = "scene"
            elif tag.startswith("@prop-"):
                asset_type = "prop"
            aliases = [display, _clean_display_name(display)]
            entries.append({"display": display, "type": asset_type, "aliases": aliases})

    uniq = []
    for item in entries:
        if item not in uniq:
            uniq.append(item)
    return uniq


def build_name_map(assets):
    mapping = {}
    for asset in assets:
        display = asset["display"]
        asset_type = asset["type"]
        aliases = asset["aliases"]
        if asset_type == "char":
            canonical = display
            canonical = canonical.replace("觉醒前", "")
            canonical = canonical.replace("觉醒后", "")
            canonical = canonical.strip()
            if not canonical:
                canonical = display
            for alias in aliases + [canonical]:
                if alias:
                    mapping[alias] = f"@{canonical}"
        else:
            for alias in aliases:
                if alias:
                    mapping[alias] = f"@{display}"
    return mapping


def separate_tag_suffixes(line, name_map):
    action_prefixes = "带|抬|挥|指|盯|胸|脚|步|中|近|全|特|如|从|向|朝|与|和|被|将|把|在|骤|狂|冷|怒|冲|扑|踏|跳|笑"
    for _, tag in sorted(name_map.items(), key=lambda x: len(x[0]), reverse=True):
        line = re.sub(rf"({re.escape(tag)})(?=({action_prefixes}))", rf"\1 ", line)
    return line


def collapse_character_state_suffixes(line, assets):
    for asset in assets:
        display = asset["display"]
        asset_type = asset["type"]
        if asset_type != "char":
            continue
        canonical = display.replace("觉醒前", "").replace("觉醒后", "").strip() or display
        line = line.replace(f"@{display}", f"@{canonical}")
        line = line.replace(f"@{canonical} 觉醒前", f"@{canonical}")
        line = line.replace(f"@{canonical} 觉醒后", f"@{canonical}")
        line = line.replace(f"@{canonical}觉醒前", f"@{canonical}")
        line = line.replace(f"@{canonical}觉醒后", f"@{canonical}")
    return line


def pick_subject(line, char_names, all_names, primary_char, primary_scene):
    for name in sorted(char_names, key=len, reverse=True):
        if f"@{name}" in line or name in line:
            return f"@{name}"
    for name in sorted(all_names, key=len, reverse=True):
        if f"@{name}" in line or name in line:
            return f"@{name}"
    return primary_char or primary_scene or "@主体"


def normalize_markdown(md_text):
    if "\n---\n\n" not in md_text:
        return md_text

    assets = parse_assets(md_text)
    if not assets:
        return md_text

    head, body = md_text.split("\n---\n\n", 1)
    all_names = [asset["display"] for asset in assets]
    char_names = [asset["display"] for asset in assets if asset["type"] == "char"]
    scene_names = [asset["display"] for asset in assets if asset["type"] == "scene"]
    name_map = build_name_map(assets)
    primary_char = f"@{char_names[0]}" if char_names else ""
    primary_scene = f"@{scene_names[0]}" if scene_names else ""

    lines = []
    for line in body.splitlines():
        line = re.sub(r"@人物\d+\(([^)]+)\)", r"@\1", line)

        if "当前空间" in line and primary_scene:
            line = line.replace("当前空间", primary_scene)

        if "@主体" in line:
            line = line.replace("@主体", pick_subject(line, char_names, all_names, primary_char, primary_scene))

        for name in sorted(name_map.keys(), key=len, reverse=True):
            for field in ["空间", "主体", "道具", "左", "右", "前", "后", "主空间", "首看点", "读点"]:
                line = re.sub(
                    rf"({field}\s*[：:=]\s*)(?!@){re.escape(name)}",
                    rf"\1{name_map[name]}",
                    line,
                )
            line = re.sub(rf"(?<!@){re.escape(name)}", name_map[name], line)

        line = separate_tag_suffixes(line, name_map)
        line = collapse_character_state_suffixes(line, assets)
        line = line.replace("@@", "@")
        lines.append(line)

    return head + "\n---\n\n" + "\n".join(lines)


def main():
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="/Users/billy/Documents/AI_pro/漫剧创作库/projects/无限强化_漫剧_001/05-prompts/seedance/第01集")
    parser.add_argument("--glob", default="*.md")
    args = parser.parse_args()

    root = Path(args.root)
    changed = 0
    for path in sorted(root.rglob(args.glob)):
        src = path.read_text(encoding="utf-8")
        dst = normalize_markdown(src)
        if dst != src:
            path.write_text(dst, encoding="utf-8")
            changed += 1
    print(f"changed_files={changed}")


if __name__ == "__main__":
    main()
