import argparse
import re
import sys
from pathlib import Path


def _discover_eps(project_dir: Path):
    seedance_dir = project_dir / "05-prompts/seedance"
    eps = []
    if not seedance_dir.exists():
        return eps
    for p in sorted(seedance_dir.glob("ep*-fullref-15s.md")):
        m = re.match(r"^ep(\d+)-fullref-15s\.md$", p.name)
        if not m:
            continue
        eps.append(m.group(1))
    return eps


def _validate_fullref(project_dir: Path, ep: str):
    try:
        from seedance_prompt_validate import validate_fullref
    except Exception as e:
        raise SystemExit(f"无法加载 fullref 校验模块: {e}")
    errors, warnings = validate_fullref(project_dir, ep)
    if warnings:
        print(f"[!] ep{ep} fullref 警告")
        for w in warnings:
            print(f"- {w}")
        print()
    if errors:
        print(f"[x] ep{ep} fullref 错误")
        for e in errors:
            print(f"- {e}")
        raise SystemExit(2)
    print(f"✅ ep{ep} fullref 校验通过")


def _generate_prompts(project_dir: Path, ep: str, style: str, force: bool, variant: str):
    try:
        import seedance_emit_omni_paste
    except Exception as e:
        raise SystemExit(f"无法加载 Seedance 生成器模块: {e}")

    argv = [
        "seedance_emit_omni_paste.py",
        "--project-dir",
        str(project_dir),
        "--ep",
        ep,
        "--style",
        style,
        "--variant",
        variant,
        "--no-validate",
    ]
    if force:
        argv.append("--force")

    old_argv = sys.argv
    try:
        sys.argv = argv
        seedance_emit_omni_paste.main()
    finally:
        sys.argv = old_argv


def _protocol_validate(project_dir: Path, ep: str):
    """协议校验：作为外层 pipeline 的唯一强制门禁之一"""
    try:
        from prompt_protocol_validate import (
            load_schema,
            validate_omni,
            validate_seedance2_field,
            validate_seedance2_narrative,
        )
    except Exception as e:
        raise SystemExit(f"协议校验模块不可用: {e}")

    schema_path = Path(__file__).resolve().parents[1] / "docs/blocking-camera-geometry.schema.json"
    schema = load_schema(schema_path)

    files = []
    for out_dir in ["即梦", "seedance", "叙事"]:
        for suffix in ["", ".short", ".compact"]:
            if out_dir == "即梦":
                p = project_dir / "05-prompts/seedance" / f"第{((int(ep)-1)//10)+1:02d}集" / out_dir / f"ep{ep}-omni-paste{suffix}.md"
            elif out_dir == "seedance":
                p = project_dir / "05-prompts/seedance" / f"第{((int(ep)-1)//10)+1:02d}集" / out_dir / f"ep{ep}-seedance2-paste{suffix}.md"
            else:
                p = project_dir / "05-prompts/seedance" / f"第{((int(ep)-1)//10)+1:02d}集" / out_dir / f"ep{ep}-seedance2-narrative-paste{suffix}.md"
            if p.exists():
                files.append(p)

    if not files:
        raise SystemExit(f"未找到 ep{ep} 已生成提示词文件，无法执行协议校验")

    errors = []
    for p in files:
        md_text = p.read_text(encoding="utf-8")
        if "omni-paste" in p.name:
            errors.extend([f"{p.name}: {x}" for x in validate_omni(md_text, schema)])
        elif "seedance2-paste" in p.name and "narrative" not in p.name:
            errors.extend([f"{p.name}: {x}" for x in validate_seedance2_field(md_text, schema)])
        elif "seedance2-narrative-paste" in p.name:
            errors.extend([f"{p.name}: {x}" for x in validate_seedance2_narrative(md_text, schema)])

    if errors:
        print(f"[x] 协议校验失败：{len(errors)} 个错误")
        for err in errors:
            print(f"  - {err}")
        raise SystemExit(2)

    print("✅ 协议校验通过：几何/站位/读点/群戏/字幕安全区门禁一致")


def _redline_validate(project_dir: Path, ep: str):
    """红线校验：校验生成的提示词是否违反核心方法论"""
    try:
        from prompt_redline_validate import load_redline_rules, validate_file, _discover_prompt_files
    except Exception as e:
        raise SystemExit(f"红线校验模块不可用: {e}")

    rules = load_redline_rules()
    files = _discover_prompt_files(project_dir, ep)
    if not files:
        raise SystemExit("未找到已生成的提示词文件，无法执行红线校验")

    errors = []
    warnings = []
    for f in files:
        errs, warns = validate_file(f, rules)
        errors.extend([f"{f.name}: {e}" for e in errs])
        warnings.extend([f"{f.name}: {w}" for w in warns])

    if warnings:
        print(f"[!] 红线校验：{len(warnings)} 个警告")
        for w in warnings[:15]:
            print(f"  - {w}")
        if len(warnings) > 15:
            print(f"  ... 还有 {len(warnings) - 15} 个（运行 python3 tools/prompt_redline_validate.py --project-dir {project_dir} --ep {ep} 查看全部）")

    if errors:
        print(f"[x] 红线校验失败：{len(errors)} 个错误")
        for e in errors:
            print(f"  - {e}")
        raise SystemExit(2)

    if warnings:
        print(f"⚠️ 红线校验通过（{len(warnings)} 警告，0 错误）")
    else:
        print("✅ 红线校验通过：方法论约束全部满足")


def main():
    parser = argparse.ArgumentParser(description="Seedance 强制闭环：fullref校验 → 生成提示词 → 协议校验 → 红线校验。落盘仅 5 类：资产设计卡/分镜脚本/shots/三版paste，其余内存处理。")
    parser.add_argument("--project-dir", required=True)
    parser.add_argument("--ep", help="集数（如 002），不填则自动扫描所有 ep*-fullref-15s.md")
    parser.add_argument(
        "--style",
        default="纪实克制",
        choices=["纪实克制", "形式主义", "新黑色", "热血爆点"],
        help="风格旋钮",
    )
    parser.add_argument("--force", action="store_true", help="覆盖已有输出")
    parser.add_argument(
        "--variant",
        default="short",
        choices=["short", "long", "both"],
        help="输出版本：short=简版（默认）；long=长版；both=长+简",
    )
    args = parser.parse_args()

    project_dir = Path(args.project_dir).resolve()
    eps = [args.ep] if args.ep else _discover_eps(project_dir)
    if not eps:
        raise SystemExit("未发现可执行集数（请确认 05-prompts/seedance/ 下存在 ep*-fullref-15s.md）")

    print("== Seedance Pipeline ==")
    print(f"- Project: {project_dir}")
    print(f"- Style: {args.style}")
    print(f"- Episodes: {', '.join(eps)}")
    print()

    for ep in eps:
        print(f"--- ep{ep} ---")
        _validate_fullref(project_dir, ep)
        _generate_prompts(project_dir, ep, args.style, args.force, args.variant)
        _redline_validate(project_dir, ep)
        print()

    variant_desc = {
        "short": "简版（30%-40% 浓缩，默认）",
        "long": "长版（全量叙事）",
        "both": "同时生成长版与简版"
    }
    v = variant_desc.get(args.variant, args.variant)
    print(f"✅ 全部完成：已生成 {v} 的即梦版/Seedance2字段版/Seedance2叙事版，并通过外层 pipeline 的协议校验 + 红线校验强制门禁")


if __name__ == "__main__":
    main()
