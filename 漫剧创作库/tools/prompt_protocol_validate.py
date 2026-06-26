import argparse
import json
import re
from pathlib import Path


def load_schema(schema_path: Path):
    if not schema_path.exists():
        raise SystemExit(f"未找到协议文件: {schema_path}")
    return json.loads(schema_path.read_text(encoding="utf-8"))


def _extract_text_block(md: str):
    blocks = re.findall(r"```text\n([\s\S]*?)\n```", md)
    return "\n\n".join(blocks).strip()


def _split_omni_shots(md: str):
    lines = md.splitlines()
    shots = []
    current = None
    for line in lines:
        if re.match(r"^##\s+Shot\s+\d+\s+—\s+", line.strip()):
            if current:
                shots.append(current)
            current = {"title": line.strip(), "lines": []}
            continue
        if current is None:
            continue
        current["lines"].append(line.rstrip())
    if current:
        shots.append(current)
    return shots


def _split_seedance2_segments(text_block: str):
    lines = [l.rstrip() for l in text_block.splitlines()]
    segments = []
    current = None
    for line in lines:
        if re.match(r"^【\d+s-\d+s】$", line.strip()):
            if current:
                segments.append(current)
            current = {"title": line.strip(), "lines": []}
            continue
        if current is None:
            continue
        if line.strip().startswith("空间锚定："):
            continue
        current["lines"].append(line)
    if current:
        segments.append(current)
    return segments


def _line_with_prefix(lines, prefix):
    for l in lines:
        if l.startswith(prefix):
            return l
    return ""


def _contains_any(s, keywords):
    return any(k in s for k in keywords)


def validate_omni(md: str, schema: dict):
    shots = _split_omni_shots(md)
    errors = []
    if not shots:
        errors.append("未解析到 Shot（omni 版应包含 '## Shot N — ...' 标题）")
        return errors

    geom = schema["lines"]["geometry"]
    blk = schema["lines"]["blocking"]
    focus = schema["lines"]["focus"]

    for shot in shots:
        lines = shot["lines"]

        geom_line = _line_with_prefix(lines, geom["prefix"])
        blk_line = _line_with_prefix(lines, blk["prefix"])
        focus_line = _line_with_prefix(lines, focus["prefix"])

        if not geom_line:
            errors.append(f"{shot['title']}: 缺少 {geom['prefix']}")
        else:
            for req in geom.get("required_substrings", []):
                if req not in geom_line:
                    errors.append(f"{shot['title']}: {geom['prefix']} 缺少关键约束: {req}")
            for _, rx in geom.get("regexes", {}).items():
                if not re.search(rx, geom_line):
                    errors.append(f"{shot['title']}: {geom['prefix']} 不匹配: {rx}")

        if not blk_line:
            errors.append(f"{shot['title']}: 缺少 {blk['prefix']}")
        else:
            for req in blk.get("required_substrings", []):
                if req not in blk_line:
                    errors.append(f"{shot['title']}: {blk['prefix']} 缺少关键字段: {req}")
            if _contains_any(blk_line, blk.get("crowd_trigger_keywords", [])):
                for req in blk.get("crowd_required_substrings", []):
                    if req not in blk_line:
                        errors.append(f"{shot['title']}: 群戏触发但 {blk['prefix']} 缺少: {req}")

        if not focus_line:
            errors.append(f"{shot['title']}: 缺少 {focus['prefix']}")
        else:
            for req in focus.get("required_substrings", []):
                if req not in focus_line:
                    errors.append(f"{shot['title']}: {focus['prefix']} 缺少关键约束: {req}")
            for _, rx in focus.get("regexes", {}).items():
                if not re.search(rx, focus_line):
                    errors.append(f"{shot['title']}: {focus['prefix']} 不匹配: {rx}")

    return errors


def validate_seedance2_field(md: str, schema: dict):
    text_block = _extract_text_block(md)
    errors = []
    if not text_block:
        errors.append("未找到 ```text 区块（seedance2 字段版应包含 text block）")
        return errors

    fmt = schema["formats"]["seedance2_field"]
    segments = _split_seedance2_segments(text_block)
    if not segments:
        errors.append("未解析到时间段段落（seedance2 字段版应包含 '【0s-3s】' 形式段落）")
        return errors

    for seg in segments:
        segment_text = "\n".join([seg["title"]] + seg["lines"])
        for req in fmt.get("required_substrings_in_segment", []):
            if req not in segment_text:
                errors.append(f"{seg['title']}: 缺少: {req}")
        for forbid in fmt.get("forbid_substrings", []):
            if forbid in segment_text:
                errors.append(f"{seg['title']}: 禁止出现: {forbid}")

    return errors


def validate_seedance2_narrative(md: str, schema: dict):
    text_block = _extract_text_block(md)
    errors = []
    if not text_block:
        errors.append("未找到 ```text 区块（seedance2 叙事版应包含 text block）")
        return errors

    fmt = schema["formats"]["seedance2_narrative"]
    for req in fmt.get("required_substrings", []):
        if req not in text_block:
            errors.append(f"叙事版缺少: {req}")
    for forbid in fmt.get("forbid_substrings", []):
        if forbid in text_block:
            errors.append(f"叙事版禁止出现: {forbid}")

    return errors


def main():
    parser = argparse.ArgumentParser(description="按协议校验 Seedance 提示词输出（几何/站位/读点等导演门禁）")
    parser.add_argument("--project-dir", required=True)
    parser.add_argument("--ep", help="集数（如 002），不填则校验所有 ep*- 文件")
    parser.add_argument(
        "--format",
        default="all",
        choices=["omni", "seedance2", "seedance2-narrative", "all"],
        help="校验目标输出格式",
    )
    parser.add_argument(
        "--schema",
        default=str(Path(__file__).resolve().parents[1] / "docs/blocking-camera-geometry.schema.json"),
        help="协议文件路径",
    )
    args = parser.parse_args()

    project_dir = Path(args.project_dir).resolve()
    schema = load_schema(Path(args.schema).resolve())

    seedance_root = project_dir / "05-prompts/seedance"
    if not seedance_root.exists():
        raise SystemExit(f"未找到目录: {seedance_root}")

    patterns = []
    if args.ep:
        ep = args.ep
        ep_str = str(ep).zfill(3)
        candidates = sorted(seedance_root.rglob(f"ep{ep_str}-omni-paste*.md"))
        candidates += sorted(seedance_root.rglob(f"ep{ep_str}-seedance2-paste*.md"))
        candidates += sorted(seedance_root.rglob(f"ep{ep_str}-seedance2-narrative-paste*.md"))
        patterns = candidates
    else:
        patterns = sorted(seedance_root.rglob("ep*-omni-paste*.md"))
        patterns = patterns + sorted(seedance_root.rglob("ep*-seedance2-paste*.md")) + sorted(
            seedance_root.rglob("ep*-seedance2-narrative-paste*.md")
        )

    errors = []
    checked = 0
    for p in patterns:
        if not p.exists():
            continue
        checked += 1
        md = p.read_text(encoding="utf-8")
        if "omni-paste" in p.name and args.format in {"omni", "all"}:
            errs = validate_omni(md, schema)
        elif "seedance2-paste" in p.name and "narrative" not in p.name and args.format in {"seedance2", "all"}:
            errs = validate_seedance2_field(md, schema)
        elif "seedance2-narrative-paste" in p.name and args.format in {"seedance2-narrative", "all"}:
            errs = validate_seedance2_narrative(md, schema)
        else:
            continue
        for e in errs:
            errors.append(f"{p.name}: {e}")

    if checked == 0:
        raise SystemExit("未找到可校验的输出文件（请先生成 ep*-omni/seedance2 输出）")

    if errors:
        print("[x] 协议校验失败")
        for e in errors:
            print(f"- {e}")
        raise SystemExit(2)

    print(f"✅ 协议校验通过（已校验 {checked} 个文件）")


if __name__ == "__main__":
    main()
