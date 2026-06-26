import argparse
import os
import sys
import re
import json
from pathlib import Path
from typing import List, Optional


def _run_module_main(module_name: str, argv: List[str]):
    module = __import__(module_name)
    old_argv = sys.argv
    try:
        sys.argv = argv
        module.main()
    finally:
        sys.argv = old_argv


def _generate_assets(project_dir: Path, asset_types: List[str], target: Optional[str]):
    if not os.environ.get("RUNNINGHUB_API_KEY"):
        raise SystemExit("未设置 RUNNINGHUB_API_KEY，无法自动生产资产（可用 --skip-assets 跳过）")

    for t in asset_types:
        argv = [
            "auto_generate_assets.py",
            "--project-dir",
            str(project_dir),
            "--type",
            t,
        ]
        if target:
            argv.extend(["--target", target])
        _run_module_main("auto_generate_assets", argv)


def _generate_prompts(project_dir: Path, ep: Optional[str], style: str, force: bool, variant: str):
    argv = [
        "seedance_pipeline_run.py",
        "--project-dir",
        str(project_dir),
        "--style",
        style,
        "--variant",
        variant,
    ]
    if ep:
        argv.extend(["--ep", ep])
    if force:
        argv.append("--force")
    _run_module_main("seedance_pipeline_run", argv)

def _ensure_storyboard_and_shots(project_dir: Path, ep: Optional[str], force: bool = False):
    if not ep:
        return
    
    # 1. Ensure storyboard.md
    storyboard_path = project_dir / f"04-storyboard/ep{ep}-storyboard.md"
    if force or not storyboard_path.exists():
        argv = [
            "auto_generate_panels.py",
            "--project-dir", str(project_dir),
            "--ep", ep,
            "--emit-storyboard"
        ]
        if force: argv.append("--force")
        _run_module_main("auto_generate_panels", argv)

    # 2. Ensure shots.md
    shots_path = project_dir / f"05-prompts/seedance/ep{ep}-shots.md"
    if force or not shots_path.exists():
        argv = [
            "auto_generate_panels.py",
            "--project-dir", str(project_dir),
            "--ep", ep,
            "--emit-shots"
        ]
        if force: argv.append("--force")
        _run_module_main("auto_generate_panels", argv)

    # 3. Ensure fullref-15s.md
    fullref_path = project_dir / f"05-prompts/seedance/ep{ep}-fullref-15s.md"
    if force or not fullref_path.exists():
        argv = [
            "auto_generate_panels.py",
            "--project-dir", str(project_dir),
            "--ep", ep,
            "--emit-fullref-15s"
        ]
        if force: argv.append("--force")
        _run_module_main("auto_generate_panels", argv)


def _extract_scene_names_from_fullref(project_dir: Path, ep: str):
    seedance_dir = project_dir / "05-prompts/seedance"
    fullref_path = seedance_dir / f"ep{ep}-fullref-15s.md"
    if not fullref_path.exists():
        return []

    text = fullref_path.read_text(encoding="utf-8")
    names = []
    for m in re.finditer(r"06-generated/images/scenes/([^/]+)-v\d+-\d+\.png", text):
        names.append(m.group(1))
    uniq = []
    for n in names:
        if n not in uniq:
            uniq.append(n)
    return uniq


def _generate_episode_scene_angles(project_dir: Path, ep: Optional[str]):
    if not ep:
        return
    if not os.environ.get("RUNNINGHUB_API_KEY"):
        print("[!] 未设置 RUNNINGHUB_API_KEY，跳过场景新角度生成")
        return

    scene_names = _extract_scene_names_from_fullref(project_dir, ep)
    if not scene_names:
        return

    for scene in scene_names:
        argv = [
            "auto_generate_assets.py",
            "--project-dir",
            str(project_dir),
            "--type",
            "scenes",
            "--target",
            scene,
        ]
        _run_module_main("auto_generate_assets", argv)


def _load_pipeline_config(project_dir: Path, config_path: Optional[str]):
    if config_path:
        p = Path(config_path).expanduser()
        if not p.is_absolute():
            p = (project_dir / p).resolve()
        if not p.exists():
            raise SystemExit(f"未找到 pipeline 配置文件: {p}")
        return json.loads(p.read_text(encoding="utf-8"))

    p = project_dir / "pipeline.config.json"
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return {}


def _precheck_phase_1_3(project_dir: Path, ep: Optional[str], cfg: dict):
    missing = []

    required_items = (
        cfg.get("precheck", {}).get("required_items")
        or [
            {"path": "project.json", "type": "file"},
            {"path": "01-story/scripts", "type": "dir", "glob": "*.md", "min_files": 1},
            {"path": "02-director/README.md", "type": "file"},
            {"path": "03-assets/asset-index.md", "type": "file"},
        ]
    )

    for item in required_items:
        rel = str(item.get("path") or "")
        t = str(item.get("type") or "file")
        if not rel:
            continue
        p = (project_dir / rel).resolve()
        if t == "dir":
            if not p.exists() or not p.is_dir():
                missing.append(rel + "/")
                continue
            glob_pat = item.get("glob")
            min_files = int(item.get("min_files") or 0)
            if glob_pat and min_files > 0:
                files = list(p.glob(glob_pat))
                if len(files) < min_files:
                    missing.append(f"{rel}/{glob_pat} (min {min_files})")
        else:
            if not p.exists() or not p.is_file():
                missing.append(rel)

    scripts_dir = (project_dir / "01-story/scripts").resolve()
    if ep and scripts_dir.exists():
        templ = cfg.get("precheck", {}).get("ep_script_name_contains") or "第{ep}话"
        key = templ.format(ep=str(int(ep))) if str(ep).isdigit() else templ.format(ep=ep)
        md_files = sorted(scripts_dir.glob("*.md"))
        if md_files and not any(key in p.name for p in md_files):
            print(f"[!] Phase1 提示：01-story/scripts/ 下未发现包含“{key}”的文件名（不阻塞流水线）")

    if missing:
        lines = ["[x] Phase 1-3 前置产物不完整（故事/导演/资产）:"]
        for m in missing:
            lines.append(f"- 缺少 {m}")
        raise SystemExit("\n".join(lines))

    print("✅ Phase 1-3 前置检查通过（故事/导演/资产）")


def main():
    parser = argparse.ArgumentParser(
        description="项目自动流水线（当前阶段）：Phase1-3前置检查 → 生产资产 → 生成提示词→自动校验（不包含视频生成/剪辑/审片，后续可恢复）"
    )
    parser.add_argument("--project-dir", required=True)
    parser.add_argument("--ep", help="集数（如 002），不填则扫描所有 ep*-fullref-15s.md")
    parser.add_argument(
        "--style",
        default="纪实克制",
        choices=["纪实克制", "形式主义", "新黑色", "热血爆点"],
        help="风格旋钮（用于提示词输出）",
    )
    parser.add_argument("--force", action="store_true", help="覆盖已有输出")
    parser.add_argument(
        "--prompts-variant",
        default="short",
        choices=["short", "long", "both"],
        help="提示词输出版本：short=简版（默认）；long=长版；both=长+简",
    )
    parser.add_argument(
        "--config",
        help="pipeline 配置文件路径（默认读取 <project-dir>/pipeline.config.json）",
    )
    parser.add_argument(
        "--skip-precheck",
        action="store_true",
        help="跳过 Phase 1-3 前置产物检查（不推荐）",
    )
    parser.add_argument(
        "--skip-assets",
        action="store_true",
        help="跳过资产生产（仅生成提示词）。默认会尝试生产角色/场景/道具资产",
    )
    parser.add_argument(
        "--ensure-fullref",
        action="store_true",
        default=True,
        help="当 ep*-fullref-15s.md 缺失时自动补齐（默认开启）",
    )
    parser.add_argument(
        "--no-scene-angle",
        action="store_true",
        help="不为本集自动补一张场景新角度（默认：会为 fullref 引用到的场景各补一张新角度）",
    )
    parser.add_argument(
        "--asset-types",
        default="characters,scenes,props",
        help="要生产的资产类型，逗号分隔（characters,scenes,props）",
    )
    parser.add_argument("--asset-target", help="只生产指定资产名称（例如 林婉儿）")
    args = parser.parse_args()

    project_dir = Path(args.project_dir).resolve()
    cfg = _load_pipeline_config(project_dir, args.config)
    asset_types = [x.strip() for x in args.asset_types.split(",") if x.strip()]
    if cfg.get("assets", {}).get("enabled") is False:
        args.skip_assets = True
    if cfg.get("assets", {}).get("types"):
        asset_types = [str(x) for x in cfg["assets"]["types"]]
    if cfg.get("prompts", {}).get("style_default") and not args.style:
        args.style = cfg["prompts"]["style_default"]
    if cfg.get("prompts", {}).get("variant_default"):
        args.prompts_variant = str(cfg["prompts"]["variant_default"])

    print("== Project Pipeline ==")
    print(f"- Project: {project_dir}")
    print(f"- Target ep: {args.ep or 'AUTO'}")
    print(f"- Style: {args.style}")
    print(f"- Prompts: {args.prompts_variant}")
    print(f"- Assets: {'SKIP' if args.skip_assets else ', '.join(asset_types)}")
    print()

    if not args.skip_precheck:
        _precheck_phase_1_3(project_dir, args.ep, cfg)
        print()

    if not args.skip_assets:
        _generate_assets(project_dir, asset_types, args.asset_target)

    if args.ensure_fullref:
        _ensure_storyboard_and_shots(project_dir, args.ep, force=args.force)
    if args.ep and not args.no_scene_angle:
        _generate_episode_scene_angles(project_dir, args.ep)

    _generate_prompts(project_dir, args.ep, args.style, args.force, args.prompts_variant)

    print("✅ 已完成：Phase1-3门禁检查 + 资产生产 + 提示词生成 + 自动校验（视频生成/剪辑/审片已暂时屏蔽）")


if __name__ == "__main__":
    main()
