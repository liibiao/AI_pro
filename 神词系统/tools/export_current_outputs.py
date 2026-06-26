#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if __package__:
    from .init_outputs import create_structure, read_input_text
else:
    sys.path.insert(0, str(SCRIPT_DIR))
    from init_outputs import create_structure, read_input_text

LINGJING_DIR = SCRIPT_DIR.parent
TEST_DIR = LINGJING_DIR / "test"

EXPORT_MAP = {
    "storyboard_md": (TEST_DIR / "ep001-storyboard.md", "seedance"),
    "seedance_md": (TEST_DIR / "ep001-seedance-prompts.md", "seedance"),
    "seedance_html": (TEST_DIR / "ep001-seedance-prompts.html", "seedance"),
    "jimeng_md": (TEST_DIR / "ep001-jimeng-prompts.md", "即梦"),
    "jimeng_html": (TEST_DIR / "ep001-jimeng-prompts.html", "即梦"),
    "narrative_md": (TEST_DIR / "ep001-narrative-prompts.md", "叙事"),
    "narrative_html": (TEST_DIR / "ep001-narrative-prompts.html", "叙事"),
    "viewer_html": (TEST_DIR / "ep001-prompts-viewer.html", "."),
}

PROJECT_INDEX_TEMPLATE = """<!DOCTYPE html>
<html lang=\"zh-CN\">
<head>
  <meta charset=\"UTF-8\" />
  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
  <title>{project_name} - 三版本结果入口</title>
  <style>
    body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, \"PingFang SC\", sans-serif; background: #0b1020; color: #eef2ff; }}
    .wrap {{ max-width: 1080px; margin: 0 auto; padding: 32px 20px 48px; }}
    .hero {{ background: linear-gradient(135deg, rgba(120,166,255,.16), rgba(110,231,255,.08)); border: 1px solid rgba(255,255,255,.12); border-radius: 18px; padding: 24px; }}
    h1 {{ margin: 0 0 8px; font-size: 30px; }}
    p {{ color: #a7b0d6; line-height: 1.8; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin-top: 20px; }}
    .card {{ display: block; text-decoration: none; color: #eef2ff; background: #121935; border: 1px solid rgba(255,255,255,.1); border-radius: 16px; padding: 18px; }}
    .card strong {{ display: block; font-size: 18px; margin-bottom: 6px; }}
    .card span {{ color: #a7b0d6; }}
  </style>
</head>
<body>
  <div class=\"wrap\">
    <section class=\"hero\">
      <h1>{project_name}</h1>
      <p>这里是自动导出的三版本结果入口。所有页面都保留完整可复制提示词，不再使用“详见原文”的占位写法。</p>
    </section>
    <div class=\"grid\">
      <a class=\"card\" href=\"./ep001-prompts-viewer.html\"><strong>总查看器</strong><span>切换分镜 / Seedance / 即梦 / 叙事版</span></a>
      <a class=\"card\" href=\"./seedance/ep001-seedance-prompts.html\"><strong>Seedance</strong><span>长版母稿 HTML + Markdown</span></a>
      <a class=\"card\" href=\"./即梦/ep001-jimeng-prompts.html\"><strong>即梦</strong><span>直投短提示词 HTML + Markdown</span></a>
      <a class=\"card\" href=\"./叙事/ep001-narrative-prompts.html\"><strong>叙事</strong><span>段落式叙事提示词 HTML + Markdown</span></a>
    </div>
  </div>
</body>
</html>
"""


def export_project(text: str, project_name_override: str | None = None) -> Path:
    project_dir = create_structure(text, project_name_override)

    for _, (src, target_dirname) in EXPORT_MAP.items():
        if not src.exists():
            continue
        target_dir = project_dir if target_dirname == "." else project_dir / target_dirname
        target_dir.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, target_dir / src.name)

    (project_dir / "index.html").write_text(
        PROJECT_INDEX_TEMPLATE.format(project_name=project_dir.name), encoding="utf-8"
    )
    return project_dir


def main() -> None:
    parser = argparse.ArgumentParser(description="把当前灵境测试产物导出到 outputs 项目目录")
    parser.add_argument("--text", help="直接传入剧本或小说正文")
    parser.add_argument("--text-file", help="从文件读取剧本或小说正文")
    parser.add_argument("--project-name", help="手动指定项目目录名，默认从正文自动提炼")
    args = parser.parse_args()

    text = read_input_text(args.text, args.text_file)
    project_dir = export_project(text, args.project_name)
    print(project_dir)


if __name__ == "__main__":
    main()
