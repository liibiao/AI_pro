#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if __package__:
    from .export_current_outputs import export_project
    from .init_outputs import create_structure, read_input_text
    from .workbench_core import (
        DIRECTOR_CATEGORY_LABELS,
        DIRECTOR_OPTIONS,
        DURATION_OPTIONS,
        PACE_MAP,
        VISUAL_CATEGORY_LABELS,
        VISUAL_OPTIONS,
        build_plan,
        options_by_category,
        selected_label,
    )
else:
    sys.path.insert(0, str(SCRIPT_DIR))
    from export_current_outputs import export_project
    from init_outputs import create_structure, read_input_text
    from workbench_core import (
        DIRECTOR_CATEGORY_LABELS,
        DIRECTOR_OPTIONS,
        DURATION_OPTIONS,
        PACE_MAP,
        VISUAL_CATEGORY_LABELS,
        VISUAL_OPTIONS,
        build_plan,
        options_by_category,
        selected_label,
    )


def prompt_multiline() -> str:
    print("请粘贴小说原文或剧本正文。输入完成后，单独输入一行 END 并回车：")
    lines: list[str] = []
    while True:
        try:
            line = input()
        except EOFError:
            break
        if line.strip() == "END":
            break
        lines.append(line)
    text = "\n".join(lines).strip()
    if not text:
        raise ValueError("未获取到正文内容，请重新运行并粘贴文本")
    return text


def choose_category(title: str, category_labels: dict[str, str]) -> str:
    categories = ["all", *[key for key in category_labels if key != "all"]]
    print(f"\n{title}分类")
    print("  0. AI 智能模式")
    for idx, category in enumerate(categories, start=1):
        print(f"  {idx}. {category_labels[category]}")
    while True:
        raw = input("先选分类，直接回车使用 AI 智能模式：").strip()
        if raw in {"", "0"}:
            return ""
        if raw.isdigit() and 1 <= int(raw) <= len(categories):
            return categories[int(raw) - 1]
        print("输入无效，请重新输入编号。")


def choose_option_in_category(title: str, options: list[dict[str, str]], category: str) -> str:
    filtered = options_by_category(options, category)
    print(f"\n{title} · {category}")
    print("  0. 返回 AI 智能模式")
    for idx, option in enumerate(filtered, start=1):
        print(f"  {idx}. {option['name']}")
    while True:
        raw = input("再选具体项，直接回车使用 AI 智能模式：").strip()
        if raw in {"", "0"}:
            return ""
        if raw.isdigit() and 1 <= int(raw) <= len(filtered):
            return filtered[int(raw) - 1]["id"]
        print("输入无效，请重新输入编号。")


def choose_director() -> str:
    category = choose_category("导演风格", DIRECTOR_CATEGORY_LABELS)
    if not category:
        return ""
    return choose_option_in_category("导演风格", DIRECTOR_OPTIONS, category)


def choose_visual() -> str:
    category = choose_category("视觉风格", VISUAL_CATEGORY_LABELS)
    if not category:
        return ""
    return choose_option_in_category("视觉风格", VISUAL_OPTIONS, category)


def choose_duration() -> str:
    print("\n视频时长")
    print("  0. AI 智能模式（自动估算）")
    for idx, option in enumerate(DURATION_OPTIONS, start=1):
        print(f"  {idx}. {option}")
    while True:
        raw = input("请输入编号，直接回车使用 AI 智能模式：").strip()
        if raw in {"", "0"}:
            return ""
        if raw.isdigit() and 1 <= int(raw) <= len(DURATION_OPTIONS):
            return DURATION_OPTIONS[int(raw) - 1]
        print("输入无效，请重新输入编号。")


def choose_action(default_action: str) -> str:
    mapping = {"1": "plan", "2": "init", "3": "export"}
    print("\n请选择下一步动作")
    print("  1. 仅生成运行方案")
    print("  2. 创建 outputs 项目目录骨架")
    print("  3. 导出当前 test 产物到正式 outputs")
    while True:
        raw = input(f"请输入编号，直接回车默认 {default_action}：").strip()
        if raw == "":
            return default_action
        if raw in mapping:
            return mapping[raw]
        print("输入无效，请重新输入编号。")


def print_plan(plan: object) -> None:
    payload = plan.to_dict()
    director = payload["directorStyle"] or "AI 智能模式"
    visual = payload["visualStyle"] or "AI 智能模式"
    duration = payload["duration"] or "AI 智能模式（自动估算）"
    print("\n================ 灵境 CLI 工作台 ================")
    print(f"模式：{payload['mode']}")
    print(f"项目目录：{payload['projectName']}")
    print(f"导演风格：{director if director == 'AI 智能模式' else selected_label(DIRECTOR_OPTIONS, director)}")
    print(f"视觉风格：{visual if visual == 'AI 智能模式' else selected_label(VISUAL_OPTIONS, visual)}")
    print(f"视频时长：{duration}")
    print(f"剧情类型：{payload['detectedGenre']}")
    print(f"节奏建议：{PACE_MAP.get(payload['recommendedPace'], '均衡叙事')}")
    print(f"推荐理由：{payload['reason']}")
    print("\n@lingjing 调用文本：")
    print(payload["commandPreview"])
    print("\n运行参数 JSON：")
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def resolve_text(args: argparse.Namespace) -> str:
    if args.text or args.text_file:
        return read_input_text(args.text, args.text_file)
    return prompt_multiline()


def main() -> None:
    parser = argparse.ArgumentParser(description="灵境命令行交互工作台")
    parser.add_argument("--text", help="直接传入剧本或小说正文")
    parser.add_argument("--text-file", help="从文件读取剧本或小说正文")
    parser.add_argument("--project-name", default="", help="手动指定项目目录名")
    parser.add_argument("--director", default="", help="导演风格 ID；留空为 AI 智能模式")
    parser.add_argument("--visual", default="", help="视觉风格 ID；留空为 AI 智能模式")
    parser.add_argument("--duration", default="", help="视频时长；如 30s、60s，留空为 AI 智能模式")
    parser.add_argument("--action", choices=["plan", "init", "export"], default="plan", help="生成方案后默认执行的动作")
    parser.add_argument("--no-interactive", action="store_true", help="关闭交互提问，直接按参数执行")
    args = parser.parse_args()

    text = resolve_text(args)

    director = args.director
    visual = args.visual
    duration = args.duration
    project_name = args.project_name

    if not args.no_interactive:
        print("\n未选择的项会默认进入 AI 智能模式。")
        director = director or choose_director()
        visual = visual or choose_visual()
        duration = duration or choose_duration()
        project_name = project_name or input("\n项目目录名（直接回车使用自动提炼结果）：").strip()

    plan = build_plan(text, project_name=project_name, director=director, visual=visual, duration=duration)
    print_plan(plan)

    action = args.action
    if not args.no_interactive:
        action = choose_action(args.action)

    if action == "plan":
        return
    if action == "init":
        project_dir = create_structure(text, plan.project_name)
        print(f"\n已创建项目目录：{project_dir}")
        return

    project_dir = export_project(text, plan.project_name)
    print(f"\n已导出正式产物：{project_dir}")


if __name__ == "__main__":
    main()
