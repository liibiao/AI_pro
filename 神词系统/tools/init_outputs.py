#!/usr/bin/env python3
from __future__ import annotations

import argparse
import html
import re
from datetime import datetime
from pathlib import Path
from typing import Iterable

SCRIPT_DIR = Path(__file__).resolve().parent
LINGJING_DIR = SCRIPT_DIR.parent
OUTPUTS_DIR = LINGJING_DIR / "outputs"
INVALID_CHARS = r'[<>:"/\\|?*\u0000-\u001f]'


def read_input_text(text: str | None, text_file: str | None) -> str:
    if text:
        return text.strip()
    if text_file:
        return Path(text_file).read_text(encoding="utf-8").strip()
    raise ValueError("必须提供 --text 或 --text-file")


def extract_name_candidates(text: str) -> list[str]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    candidates: list[str] = []

    for line in lines[:12]:
        if line.startswith("#"):
            cleaned = re.sub(r"^#+\s*", "", line).strip()
            if cleaned:
                candidates.append(cleaned)

    bracket_titles = re.findall(r"《([^》]{1,40})》", text)
    candidates.extend(bracket_titles)

    episode_match = re.search(r"(第\s*[0-9一二三四五六七八九十百千零〇两]+\s*[话章节卷集篇]\s*[:：\-— ]*[^\n]{0,30})", text)
    if episode_match:
        candidates.append(episode_match.group(1).strip())

    for line in lines[:8]:
        if any(key in line for key in ["剧本", "小说", "故事", "正文", "梗概", "大纲"]):
            candidates.append(line)

    for line in lines[:8]:
        if 2 <= len(line) <= 40:
            candidates.append(line)

    if lines:
        first_sentence = re.split(r"[。！？!?.\n]", lines[0])[0].strip()
        if first_sentence:
            candidates.append(first_sentence)

    return candidates


def normalize_name(raw: str) -> str:
    name = raw.strip()
    name = re.sub(r"^#+\s*", "", name)
    name = re.sub(r"^(标题|书名|剧名|小说名|第[0-9一二三四五六七八九十百千零〇两]+[话章节卷集篇])\s*[:：\-— ]*", "", name)
    name = re.sub(r"\s+", " ", name)
    name = re.sub(INVALID_CHARS, "", name)
    name = name.strip(" .-_，。、《》【】[]()（）:：;；\t")
    name = name.replace("/", "-")
    name = name.replace(" ", "_")
    return name[:48].strip("._-")


def extract_project_name(text: str) -> str:
    for candidate in extract_name_candidates(text):
        name = normalize_name(candidate)
        if len(name) >= 2:
            return name
    return datetime.now().strftime("untitled_%Y%m%d_%H%M%S")


def ensure_unique_dir(base_name: str, parent: Path) -> Path:
    candidate = parent / base_name
    if not candidate.exists():
        return candidate
    idx = 2
    while True:
        next_candidate = parent / f"{base_name}_{idx}"
        if not next_candidate.exists():
            return next_candidate
        idx += 1


def render_project_index(project_name: str, rel_dirs: Iterable[str]) -> str:
    links = "\n".join(
        f'        <a class="card" href="./{html.escape(rel_name)}/"><span>{html.escape(rel_name)}</span><strong>{html.escape(rel_name)}</strong><em>打开目录</em></a>'
        for rel_name in rel_dirs
    )
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M")
    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{html.escape(project_name)} - 灵境输出目录</title>
  <style>
    body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; background: #0b1020; color: #eef2ff; }}
    .wrap {{ max-width: 1080px; margin: 0 auto; padding: 32px 20px 48px; }}
    .hero {{ background: linear-gradient(135deg, rgba(120,166,255,.16), rgba(110,231,255,.08)); border: 1px solid rgba(255,255,255,.12); border-radius: 18px; padding: 24px; }}
    h1 {{ margin: 0 0 8px; font-size: 30px; }}
    p {{ color: #a7b0d6; line-height: 1.8; margin: 8px 0; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-top: 20px; }}
    .card {{ display: block; text-decoration: none; color: #eef2ff; background: #121935; border: 1px solid rgba(255,255,255,.1); border-radius: 16px; padding: 18px; }}
    .card span {{ display: inline-block; font-size: 12px; color: #8fb2ff; background: rgba(120,166,255,.12); padding: 4px 8px; border-radius: 999px; margin-bottom: 10px; }}
    .card strong {{ display: block; font-size: 20px; margin-bottom: 6px; }}
    .card em {{ font-style: normal; color: #a7b0d6; }}
    .tip {{ margin-top: 18px; font-size: 13px; color: #a7b0d6; }}
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <h1>{html.escape(project_name)}</h1>
      <p>这是灵境工作流为当前输入内容建立的标准输出目录。你可以把不同版本的产物分别落到三个子目录里，保持结构稳定、检索清晰。</p>
      <p>创建时间：{created_at}</p>
    </section>
    <div class="grid">
{links}
    </div>
    <div class="tip">建议约定：`seedance/` 放长版母稿与表格版提示词，`即梦/` 放平台直投短提示词，`叙事/` 放段落式叙事提示词与中间稿。</div>
  </div>
</body>
</html>
'''


def render_root_index(project_dirs: list[Path]) -> str:
    items = []
    for path in sorted(project_dirs, key=lambda p: p.stat().st_mtime, reverse=True):
        items.append(
            f'        <a class="item" href="./{html.escape(path.name)}/index.html"><strong>{html.escape(path.name)}</strong><span>打开项目输出目录</span></a>'
        )
    links = "\n".join(items) if items else '        <div class="empty">当前还没有项目输出目录，先运行初始化脚本创建一个。</div>'
    return f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>灵境 outputs</title>
  <style>
    body {{ margin: 0; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; background: #09101d; color: #eef2ff; }}
    .wrap {{ max-width: 1080px; margin: 0 auto; padding: 32px 20px 48px; }}
    h1 {{ margin: 0 0 8px; font-size: 32px; }}
    p {{ color: #a7b0d6; line-height: 1.8; }}
    .list {{ margin-top: 24px; display: grid; gap: 12px; }}
    .item, .empty, .hero-link {{ display: block; background: #121935; border: 1px solid rgba(255,255,255,.1); border-radius: 16px; padding: 18px; text-decoration: none; color: #eef2ff; }}
    .hero-link {{ margin-top: 18px; background: linear-gradient(135deg, rgba(120,166,255,.18), rgba(110,231,255,.08)); }}
    .item strong, .hero-link strong {{ display: block; font-size: 18px; margin-bottom: 6px; }}
    .item span, .hero-link span {{ color: #a7b0d6; }}
    code {{ background: rgba(255,255,255,.08); padding: 2px 6px; border-radius: 6px; }}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>灵境输出目录</h1>
    <p>这里统一收纳由灵境工作流生成的项目结果。标准结构为 <code>项目目录 / seedance / 即梦 / 叙事 / index.html</code>。</p>
    <a class="hero-link" href="./workbench.html"><strong>打开灵境运行工作台</strong><span>粘贴小说 / 剧本，选择导演风格、视觉风格、视频时长；不选则默认 AI 智能模式</span></a>
    <div class="list">
{links}
    </div>
  </div>
</body>
</html>
'''


def create_structure(text: str, project_name_override: str | None = None) -> Path:
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    project_name = normalize_name(project_name_override or "") or extract_project_name(text)
    project_dir = ensure_unique_dir(project_name, OUTPUTS_DIR)
    project_dir.mkdir(parents=True, exist_ok=False)

    subdirs = ["seedance", "即梦", "叙事"]
    for dirname in subdirs:
        subdir = project_dir / dirname
        subdir.mkdir(parents=True, exist_ok=True)
        keep = subdir / ".gitkeep"
        keep.write_text("", encoding="utf-8")

    (project_dir / "index.html").write_text(
        render_project_index(project_dir.name, subdirs), encoding="utf-8"
    )

    project_dirs = [p for p in OUTPUTS_DIR.iterdir() if p.is_dir()]
    (OUTPUTS_DIR / "index.html").write_text(render_root_index(project_dirs), encoding="utf-8")
    return project_dir


def main() -> None:
    parser = argparse.ArgumentParser(description="初始化灵境 outputs 项目目录")
    parser.add_argument("--text", help="直接传入剧本或小说正文")
    parser.add_argument("--text-file", help="从文件读取剧本或小说正文")
    parser.add_argument("--project-name", help="手动指定项目目录名，默认从正文自动提炼")
    args = parser.parse_args()

    text = read_input_text(args.text, args.text_file)
    project_dir = create_structure(text, args.project_name)
    print(project_dir)


if __name__ == "__main__":
    main()
