import argparse
import re
from pathlib import Path


def parse_seedance_tag_mapping(project_dir: Path):
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
    tag_map = {}
    for line in lines[2:]:
        parts = [p.strip() for p in line.strip().strip("|").split("|")]
        if len(parts) < 2:
            continue
        tag = parts[0]
        path_raw = parts[1].strip().strip("`")
        if tag.startswith("@") and path_raw:
            tag_map[tag] = path_raw
    return tag_map


def parse_ref_table(md_text: str):
    lines = md_text.splitlines()
    in_table = False
    header_seen = False
    rows = []
    for line in lines:
        if line.strip() == "## 参考图清单":
            in_table = False
            header_seen = False
            continue
        if line.startswith("|") and "用途" in line and "文件路径" in line and "用于镜头" in line:
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
            if len(parts) < 3:
                continue
            tag, path, used = parts[0], parts[1], parts[2]
            if not tag.startswith("@"):
                continue
            rows.append({"tag": tag, "path": path, "used": used})
    return rows


def parse_shot_refs(md_text: str):
    refs = []
    for line in md_text.splitlines():
        if line.startswith("【参考】"):
            rhs = line.replace("【参考】", "").strip()
            rhs = rhs.replace("，", ",")
            for token in [t.strip() for t in rhs.split(",") if t.strip()]:
                if token.startswith("@"):
                    refs.append(token)
    return refs


def validate_fullref(project_dir: Path, ep: str):
    fullref = project_dir / f"05-prompts/seedance/ep{ep}-fullref-15s.md"
    if not fullref.exists():
        raise SystemExit(f"未找到: {fullref}")
    md = fullref.read_text(encoding="utf-8")
    tag_map = parse_seedance_tag_mapping(project_dir)

    ref_rows = parse_ref_table(md)
    table_tags = {r["tag"] for r in ref_rows}
    table_paths = {r["tag"]: r["path"] for r in ref_rows}
    shot_refs = parse_shot_refs(md)
    shot_tags = {t for t in shot_refs if t.startswith("@")}

    errors = []
    warnings = []

    if not tag_map:
        warnings.append("asset-index.md 未发现“Seedance @引用标签映射（落盘路径）”，无法做强校验")

    for tag in sorted(table_tags):
        if tag.startswith("@Image") or tag.startswith("@Video") or tag.startswith("@Audio"):
            continue
        if tag_map and tag not in tag_map:
            warnings.append(f"参考图清单包含未映射标签：{tag}")
        rel_path = table_paths.get(tag, "")
        if rel_path:
            p = project_dir / rel_path
            if not p.exists():
                errors.append(f"参考图清单路径不存在：{tag} -> {rel_path}")

    for tag in sorted(shot_tags):
        if tag.startswith("@Image") or tag.startswith("@Video") or tag.startswith("@Audio"):
            continue
        if table_tags and tag not in table_tags and tag not in {"@风格锚点"}:
            warnings.append(f"Shot 引用未出现在参考图清单：{tag}")
        if tag_map and tag not in tag_map and tag not in {"@风格锚点"}:
            warnings.append(f"Shot 引用未在资产映射表注册：{tag}")

    return errors, warnings


def main():
    parser = argparse.ArgumentParser(description="校验 fullref-15s 的 @引用与资产路径")
    parser.add_argument("--project-dir", required=True)
    parser.add_argument("--ep", required=True)
    args = parser.parse_args()

    project_dir = Path(args.project_dir).resolve()
    errors, warnings = validate_fullref(project_dir, args.ep)

    if warnings:
        print("[!] 警告")
        for w in warnings:
            print(f"- {w}")
        print()

    if errors:
        print("[x] 错误")
        for e in errors:
            print(f"- {e}")
        raise SystemExit(2)

    print("✅ 校验通过：@引用与路径一致")


if __name__ == "__main__":
    main()

