#!/usr/bin/env python3
from __future__ import annotations

import argparse
import contextlib
import html
import json
import re
import sys
import threading
import uuid
from datetime import datetime
from functools import partial
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

SCRIPT_DIR = Path(__file__).resolve().parent
LINGJING_DIR = SCRIPT_DIR.parent
WORKSPACE_ROOT = LINGJING_DIR.parent
PROJECTS_DIR = WORKSPACE_ROOT / "projects"
TOOLS_DIR = WORKSPACE_ROOT / "tools"
WORKBENCH_OUTPUTS_DIR = LINGJING_DIR / "outputs"
WORKBENCH_RUN_PAGE = "/workbench-run.html"

if __package__:
    from .export_current_outputs import export_project
    from .init_outputs import OUTPUTS_DIR, create_structure
    from .workbench_core import build_plan
else:
    sys.path.insert(0, str(SCRIPT_DIR))
    from export_current_outputs import export_project
    from init_outputs import OUTPUTS_DIR, create_structure
    from workbench_core import build_plan

if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

TASKS: dict[str, dict[str, object]] = {}
TASKS_LOCK = threading.Lock()


def discover_projects() -> list[dict[str, str]]:
    projects: list[dict[str, str]] = []
    if not PROJECTS_DIR.exists():
        return projects
    for project_dir in sorted(PROJECTS_DIR.iterdir()):
        if not project_dir.is_dir():
            continue
        project_json = project_dir / "project.json"
        if not project_json.exists():
            continue
        try:
            payload = json.loads(project_json.read_text(encoding="utf-8"))
        except Exception:
            payload = {}
        projects.append(
            {
                "id": project_dir.name,
                "name": str(payload.get("name") or project_dir.name),
                "path": str(project_dir),
                "relativePath": project_dir.relative_to(WORKSPACE_ROOT).as_posix(),
            }
        )
    return projects


def to_workspace_url(path: Path) -> str:
    return "/" + path.relative_to(WORKSPACE_ROOT).as_posix()


def to_relative_path(path: Path) -> str:
    return path.relative_to(WORKSPACE_ROOT).as_posix()


def normalize_episode(value: str) -> str:
    raw = re.sub(r"\D", "", value or "")
    if not raw:
        raise ValueError("请填写集数，例如 2 或 002")
    return f"{int(raw):03d}"


def infer_episode_from_text(text: str) -> str | None:
    match = re.search(r"第\s*([0-9一二三四五六七八九十百千零〇两]+)\s*话", text)
    if not match:
        return None
    candidate = match.group(1)
    if candidate.isdigit():
        return f"{int(candidate):03d}"
    mapping = {"零": 0, "〇": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10}
    total = 0
    if candidate == "十":
        total = 10
    elif "十" in candidate:
        parts = candidate.split("十")
        tens = mapping.get(parts[0], 1) if parts[0] else 1
        ones = mapping.get(parts[1], 0) if len(parts) > 1 and parts[1] else 0
        total = tens * 10 + ones
    else:
        total = mapping.get(candidate, 0)
    return f"{total:03d}" if total > 0 else None


def extract_script_title(text: str, fallback: str) -> str:
    for line in text.splitlines()[:12]:
        cleaned = line.strip().strip("# ")
        match = re.search(r"第\s*[0-9一二三四五六七八九十百千零〇两]+\s*话\s*[:：\-— ]*([^\n]+)", cleaned)
        if match:
            title = re.sub(r"[<>:\"/\\|?*\u0000-\u001f]", "", match.group(1)).strip()
            if title:
                return title[:32]
    return fallback


def resolve_script_path(project_dir: Path, episode: str, text: str) -> Path:
    scripts_dir = project_dir / "01-story" / "scripts"
    scripts_dir.mkdir(parents=True, exist_ok=True)
    episode_number = int(episode)
    existing = sorted(scripts_dir.glob(f"第{episode_number}话-*-剧本正文.md"))
    if existing:
        return existing[0]
    title = extract_script_title(text, f"ep{episode}")
    safe_title = re.sub(r"\s+", "", title)
    safe_title = re.sub(r"[<>:\"/\\|?*\u0000-\u001f]", "", safe_title).strip(" .-_") or f"ep{episode}"
    return scripts_dir / f"第{episode_number}话-{safe_title}-剧本正文.md"


def write_script_to_project(project_dir: Path, episode: str, text: str) -> Path:
    script_path = resolve_script_path(project_dir, episode, text)
    script_path.write_text(text.strip() + "\n", encoding="utf-8")
    return script_path


class TaskLogStream:
    def __init__(self, task_id: str):
        self.task_id = task_id
        self._buffer = ""

    def write(self, text: str) -> int:
        if not text:
            return 0
        self._buffer += text
        while "\n" in self._buffer:
            line, self._buffer = self._buffer.split("\n", 1)
            append_task_log(self.task_id, line)
        return len(text)

    def flush(self) -> None:
        if self._buffer:
            append_task_log(self.task_id, self._buffer)
            self._buffer = ""


def create_task(meta: dict[str, object]) -> str:
    task_id = uuid.uuid4().hex[:12]
    with TASKS_LOCK:
        TASKS[task_id] = {
            "id": task_id,
            "status": "running",
            "createdAt": datetime.now().isoformat(timespec="seconds"),
            "updatedAt": datetime.now().isoformat(timespec="seconds"),
            "meta": meta,
            "logs": [],
            "result": None,
            "error": None,
        }
    return task_id


def append_task_log(task_id: str, line: str) -> None:
    with TASKS_LOCK:
        task = TASKS.get(task_id)
        if not task:
            return
        logs = task.setdefault("logs", [])
        logs.append(line.rstrip())
        task["updatedAt"] = datetime.now().isoformat(timespec="seconds")


def finish_task(task_id: str, *, status: str, result: dict[str, object] | None = None, error: str | None = None) -> None:
    with TASKS_LOCK:
        task = TASKS.get(task_id)
        if not task:
            return
        task["status"] = status
        task["result"] = result
        task["error"] = error
        task["updatedAt"] = datetime.now().isoformat(timespec="seconds")


def get_task_snapshot(task_id: str) -> dict[str, object] | None:
    with TASKS_LOCK:
        task = TASKS.get(task_id)
        if not task:
            return None
        return {
            "id": task["id"],
            "status": task["status"],
            "createdAt": task["createdAt"],
            "updatedAt": task["updatedAt"],
            "meta": task["meta"],
            "logs": list(task.get("logs", [])),
            "result": task.get("result"),
            "error": task.get("error"),
        }


def run_project_pipeline_task(task_id: str, project_dir: Path, episode: str, style: str, variant: str, skip_assets: bool, force: bool, script_path: Path) -> None:
    import project_pipeline_run

    argv = [
        "project_pipeline_run.py",
        "--project-dir",
        str(project_dir),
        "--ep",
        episode,
        "--style",
        style,
        "--prompts-variant",
        variant,
    ]
    if skip_assets:
        argv.append("--skip-assets")
    if force:
        argv.append("--force")

    stream = TaskLogStream(task_id)
    old_argv = sys.argv
    try:
        sys.argv = argv
        with contextlib.redirect_stdout(stream), contextlib.redirect_stderr(stream):
            try:
                project_pipeline_run.main()
            except SystemExit as exc:
                code = exc.code if isinstance(exc.code, int) else 1
                stream.flush()
                if code not in (0, None):
                    raise RuntimeError(f"项目流水线执行失败，退出码 {code}")
        stream.flush()
        result = build_pipeline_result(project_dir, episode, script_path)
        running_url = str(result.get("runningUrl") or "").replace("{taskId}", task_id)
        result["runningUrl"] = running_url
        finish_task(
            task_id,
            status="completed",
            result=result,
        )
    except Exception as exc:  # noqa: BLE001
        stream.flush()
        finish_task(task_id, status="failed", error=str(exc))
    finally:
        sys.argv = old_argv


def prompt_episode_pack_dir(project_dir: Path, episode: str) -> Path:
    try:
        num = int(episode)
    except Exception:
        num = 1
    pack_index = (max(num, 1) - 1) // 10 + 1
    return project_dir / f"05-prompts/seedance/第{pack_index:02d}集"


def collect_pipeline_outputs(project_dir: Path, episode: str, script_path: Path | None = None) -> dict[str, object]:
    generated_files: list[dict[str, str]] = []
    prompt_pack_dir = prompt_episode_pack_dir(project_dir, episode)
    candidates = [
        project_dir / f"04-storyboard/ep{episode}-storyboard.md",
        project_dir / f"05-prompts/seedance/ep{episode}-shots.md",
        project_dir / f"05-prompts/seedance/ep{episode}-fullref-15s.md",
        prompt_pack_dir / f"即梦/ep{episode}-omni-paste.md",
        prompt_pack_dir / f"即梦/ep{episode}-omni-paste.short.md",
        prompt_pack_dir / f"seedance/ep{episode}-seedance2-paste.md",
        prompt_pack_dir / f"seedance/ep{episode}-seedance2-paste.short.md",
        prompt_pack_dir / f"叙事/ep{episode}-seedance2-narrative-paste.md",
        prompt_pack_dir / f"叙事/ep{episode}-seedance2-narrative-paste.short.md",
    ]
    if script_path and script_path.exists():
        candidates.insert(0, script_path)
    for path in candidates:
        if not path.exists():
            continue
        generated_files.append({
            "label": path.name,
            "path": str(path),
            "relativePath": to_relative_path(path),
            "url": to_workspace_url(path),
            "kind": infer_file_kind(path.name),
        })
    return {
        "projectDir": str(project_dir),
        "projectRelativePath": to_relative_path(project_dir),
        "projectUrl": to_workspace_url(project_dir / "README.md") if (project_dir / "README.md").exists() else None,
        "generatedFiles": generated_files,
    }


def infer_file_kind(filename: str) -> str:
    lower = filename.lower()
    if "storyboard" in lower:
        return "storyboard"
    if "shots" in lower:
        return "shots"
    if "fullref" in lower:
        return "fullref"
    if "omni-paste" in lower:
        return "jimeng"
    if "seedance2-paste" in lower and "narrative" not in lower:
        return "seedance"
    if "narrative" in lower:
        return "narrative"
    if "剧本正文" in filename:
        return "script"
    return "file"


def extract_markdown_table(markdown_text: str) -> tuple[list[str], list[list[str]]]:
    lines = markdown_text.splitlines()
    header: list[str] | None = None
    rows: list[list[str]] = []
    for line in lines:
        stripped = line.strip()
        if not stripped.startswith("|"):
            continue
        parts = [part.strip() for part in stripped.strip("|").split("|")]
        if not header:
            header = parts
            continue
        if all(re.fullmatch(r":?-{3,}:?", part.replace(" ", "")) for part in parts):
            continue
        if header and len(parts) == len(header):
            rows.append(parts)
    return header or [], rows


def render_storyboard_table(markdown_text: str) -> str:
    header, rows = extract_markdown_table(markdown_text)
    if not header or not rows:
        return f"<pre>{html.escape(markdown_text)}</pre>"
    head_html = "".join(f"<th>{html.escape(cell)}</th>" for cell in header)
    body_html = "".join(
        "<tr>" + "".join(f"<td>{html.escape(cell)}</td>" for cell in row) + "</tr>"
        for row in rows
    )
    return f"<div class=\"table-wrap\"><table><thead><tr>{head_html}</tr></thead><tbody>{body_html}</tbody></table></div>"


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def strip_code_fences(text: str) -> str:
    return re.sub(r"^```[a-zA-Z0-9_-]*\n|\n```$", "", text.strip(), flags=re.MULTILINE).strip()


def extract_code_fence_content(text: str) -> str:
    matches = re.findall(r"```(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)\n```", text)
    if not matches:
        return ""
    matches.sort(key=len, reverse=True)
    return matches[0].strip()


def extract_field(block: str, labels: list[str]) -> str:
    stop_pattern = r"(?=\n(?:[【#]|主体：|空间：|光影：|镜头：|运镜：|画面：|台词：|台词/配音：|音效：|表演：|门禁：|读点保护：|位置关系：|参考：|风格：|转场：|镜头参数：|几何约束：|### |## |---|\()|\Z)"
    for label in labels:
        patterns = [
            rf"(?:^|\n){re.escape(label)}\s*[:：]\s*(.+?){stop_pattern}",
            rf"(?:^|\n){re.escape(label)}\s*(.+?){stop_pattern}",
        ]
        for pattern in patterns:
            match = re.search(pattern, block, flags=re.S)
            if match:
                return match.group(1).strip()
    return ""


def split_prompt_blocks(markdown_text: str, kind: str) -> list[dict[str, str]]:
    blocks: list[dict[str, str]] = []

    if kind == "shots":
        pattern = re.compile(r"(?m)^##\s*(?:SHOT|Shot)\s+(.+?)\n")
        matches = list(pattern.finditer(markdown_text))
        for index, match in enumerate(matches):
            start = match.end()
            end = matches[index + 1].start() if index + 1 < len(matches) else len(markdown_text)
            blocks.append({"title": match.group(1).strip(), "body": markdown_text[start:end].strip()})
        return blocks

    if kind == "fullref":
        pattern = re.compile(r"(?m)^##\s*Shot\s+(\d+.*?)\n")
        matches = list(pattern.finditer(markdown_text))
        for index, match in enumerate(matches):
            start = match.end()
            next_start = matches[index + 1].start() if index + 1 < len(matches) else len(markdown_text)
            tail_match = re.search(r"(?m)^##\s*全片技术参数", markdown_text[start:next_start])
            end = start + tail_match.start() if tail_match else next_start
            blocks.append({"title": match.group(1).strip(), "body": markdown_text[start:end].strip()})
        return blocks

    if kind in {"jimeng", "seedance", "narrative"}:
        source = extract_code_fence_content(markdown_text) or markdown_text
        if kind == "jimeng":
            shot_pattern = re.compile(r"(?m)^##\s*Shot\s+(.+?)\n")
            shot_matches = list(shot_pattern.finditer(source))
            if shot_matches:
                for index, match in enumerate(shot_matches):
                    start = match.end()
                    end = shot_matches[index + 1].start() if index + 1 < len(shot_matches) else len(source)
                    blocks.append({"title": match.group(1).strip(), "body": source[start:end].strip()})
                return blocks
        pattern = re.compile(r"(?m)^【\s*([0-9]{1,3}\s*[sS][^\n】]*)】")
        matches = list(pattern.finditer(source))
        for index, match in enumerate(matches):
            start = match.start()
            end = matches[index + 1].start() if index + 1 < len(matches) else len(source)
            blocks.append({"title": match.group(1).strip(), "body": source[start:end].strip()})
        return blocks

    return [{"title": "1", "body": markdown_text.strip()}]


def extract_seedance_time_blocks(markdown_text: str) -> list[tuple[str, str]]:
    source = extract_code_fence_content(markdown_text) or markdown_text
    pattern = re.compile(r"(?m)^【\s*([^\n】]+)】")
    matches = list(pattern.finditer(source))
    blocks: list[tuple[str, str]] = []
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(source)
        time_text = re.sub(r"\s+", "", match.group(1)).replace("–", "-")
        body = source[start:end].strip()
        if body:
            blocks.append((time_text, body))
    return blocks


def infer_shot_from_camera_text(camera_text: str, fallback_text: str = "") -> str:
    match = re.search(r"(大特写|特写|近景|中近景|中景|全景|远景)", f"{camera_text or ''} {fallback_text or ''}")
    return match.group(1) if match else ""


def build_seedance_desc(subject_text: str, space_text: str) -> str:
    subject_clean = normalize_whitespace(subject_text)
    if subject_clean:
        subject_clean = re.sub(r"\s*\[朝向：.*?]\s*", " ", subject_clean)
        subject_clean = re.sub(r"（.*?）", "", subject_clean)
        subject_clean = re.sub(r"\s*正在\s*", "", subject_clean)
        return normalize_whitespace(subject_clean)
    return normalize_whitespace(space_text)


def parse_seedance_structured_rows(markdown_text: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for index, (time_text, body) in enumerate(extract_seedance_time_blocks(markdown_text), start=1):
        subject_text = extract_field(body, ["主体"])
        space_text = extract_field(body, ["空间"])
        light_text = extract_field(body, ["光影"])
        camera_text = extract_field(body, ["镜头"])
        prompt_text = body.strip()
        rows.append(
            {
                "id": str(index),
                "time": time_text,
                "shot": infer_shot_from_camera_text(camera_text, subject_text),
                "move": normalize_whitespace(camera_text),
                "desc": build_seedance_desc(subject_text, space_text),
                "light": normalize_whitespace(light_text),
                "prompt": prompt_text,
            }
        )
    return rows






def parse_storyboard_rows(markdown_text: str) -> list[dict[str, str]]:
    header, rows = extract_markdown_table(markdown_text)
    if not header or not rows:
        return []
    index_map = {name: idx for idx, name in enumerate(header)}

    def cell(row: list[str], names: list[str]) -> str:
        for name in names:
            idx = index_map.get(name)
            if idx is not None and idx < len(row):
                return row[idx].strip()
        return ""

    parsed_rows: list[dict[str, str]] = []
    for row in rows:
        parsed_rows.append(
            {
                "id": cell(row, ["镜号", "镜头", "#"]),
                "time": cell(row, ["时长", "时间段", "时间"]),
                "shot": cell(row, ["景别"]),
                "move": cell(row, ["运镜"]),
                "desc": cell(row, ["内容描述", "画面描述", "镜头任务"]),
                "light": cell(row, ["光影参数", "光影氛围"]),
                "prompt": cell(row, ["SEEDANCE提示词", "提示词", "内容描述"]),
            }
        )
    return parsed_rows
def parse_prompt_markdown_rows(markdown_text: str, kind: str) -> list[dict[str, str]]:
    if kind == "seedance":
        return parse_seedance_structured_rows(markdown_text)

    blocks = split_prompt_blocks(markdown_text, kind)
    rows: list[dict[str, str]] = []
    for idx, block in enumerate(blocks, start=1):
        title = block["title"]
        body = block["body"]
        if not title and not body:
            continue
        shot_id_match = re.search(r"([A-Za-z]?\d+)", title)
        shot_id = shot_id_match.group(1) if shot_id_match else str(idx)
        time_match = re.search(r"【\s*([0-9]{1,3}\s*(?:[-–]\s*[0-9]{1,3}\s*)?[sS][^\n】]*)】", body)
        time_text = re.sub(r"\s+", "", time_match.group(1)) if time_match else normalize_whitespace(title if kind == "narrative" else "")
        shot_text = ""

        if kind == "shots":
            baseline_match = re.search(r"### baseline\n([\s\S]*?)(?=\n---|\Z)", body)
            prompt = (baseline_match.group(1).strip() if baseline_match else strip_code_fences(body)).strip()
            desc_text = normalize_whitespace(title)
            move = ""
            light = ""
        elif kind == "fullref":
            prompt = body.strip()
            desc_text = normalize_whitespace(title)
            move = extract_field(body, ["【运镜】"])
            light = ""
        elif kind == "jimeng":
            prompt = body.strip()
            desc_text = extract_field(body, ["【画面】", "主体", "画面"])
            move = extract_field(body, ["【运镜】", "镜头", "运镜"])
            light = extract_field(body, ["【光影】", "光影", "【风格】", "风格"])
            shot_text = infer_shot_from_camera_text(move, desc_text)
        elif kind == "narrative":
            prompt = body.strip()
            desc_text = normalize_whitespace(title)
            move = ""
            light = ""
        else:
            prompt = strip_code_fences(body)
            desc_text = normalize_whitespace(title)
            move = ""
            light = ""

        rows.append(
            {
                "id": shot_id,
                "time": time_text,
                "shot": normalize_whitespace(shot_text if kind == "jimeng" else ""),
                "move": normalize_whitespace(move),
                "desc": normalize_whitespace(desc_text),
                "light": normalize_whitespace(light),
                "prompt": prompt.strip(),
            }
        )
    return [row for row in rows if any(row.values())]


def build_prompt_label(kind: str) -> str:
    return {
        "storyboard": "SEEDANCE提示词",
        "shots": "镜头执行稿",
        "fullref": "FullRef",
        "jimeng": "即梦提示词",
        "seedance": "SEEDANCE提示词",
        "narrative": "叙事提示词",
    }.get(kind, "内容")


def build_viewer_dataset(file: dict[str, str]) -> dict[str, object]:
    relative_path = str(file.get("relativePath") or "")
    path = WORKSPACE_ROOT / relative_path
    content = path.read_text(encoding="utf-8") if path.exists() else ""
    kind = str(file.get("kind") or "file")
    label = str(file.get("label") or path.name or "结果文件")
    title_map = {
        "storyboard": "灵境分镜表",
        "shots": "镜头执行稿",
        "fullref": "FullRef",
        "jimeng": "即梦提示词",
        "seedance": "Seedance 提示词",
        "narrative": "叙事提示词",
        "script": "本次剧本正文",
        "file": "结果文件",
    }
    rows = parse_storyboard_rows(content) if kind == "storyboard" else parse_prompt_markdown_rows(content, kind)
    return {
        "kind": kind,
        "title": title_map.get(kind, label),
        "label": label,
        "relativePath": relative_path,
        "url": str(file.get("url") or ""),
        "content": content,
        "promptLabel": build_prompt_label(kind),
        "rows": rows,
    }


def dedupe_generated_files(generated_files: list[dict[str, str]]) -> list[dict[str, str]]:
    preferred_order = ["storyboard", "shots", "fullref", "jimeng", "seedance", "narrative"]
    chosen: dict[str, dict[str, str]] = {}
    for kind in preferred_order:
        same_kind = [file for file in generated_files if file.get("kind") == kind]
        if not same_kind:
            continue
        same_kind.sort(key=lambda file: (".short." in str(file.get("label") or ""), len(str(file.get("label") or ""))))
        chosen[kind] = same_kind[0]
    return [chosen[kind] for kind in preferred_order if kind in chosen]


def viewer_output_dir(project_dir: Path, episode: str) -> Path:
    safe_name = re.sub(r"[^0-9A-Za-z一-龥_-]+", "_", project_dir.name).strip("_") or "project"
    target_dir = WORKBENCH_OUTPUTS_DIR / f"{safe_name}_ep{episode}"
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir


def write_pipeline_viewer(project_dir: Path, episode: str, generated_files: list[dict[str, str]]) -> Path | None:
    viewer_files = dedupe_generated_files(generated_files)
    datasets = [build_viewer_dataset(file) for file in viewer_files if file.get("kind") in {"storyboard", "shots", "fullref", "jimeng", "seedance", "narrative"}]
    if not datasets:
        return None
    output_dir = viewer_output_dir(project_dir, episode)
    viewer_path = output_dir / f"ep{episode}-prompts-viewer.html"
    payload_json = json.dumps(datasets, ensure_ascii=False)
    title = f"第{int(episode)}话《{project_dir.name}》- 灵境提示词 HTML 查看器"
    html_content = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>__VIEWER_TITLE__</title>
  <style>
    :root {
      --bg: #0b1020;
      --panel: #121935;
      --panel-2: #182147;
      --line: rgba(255,255,255,.12);
      --text: #eef2ff;
      --muted: #a7b0d6;
      --accent: #78a6ff;
      --accent-2: #6ee7ff;
      --success: #54d2a5;
      --shadow: 0 18px 45px rgba(0,0,0,.28);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "PingFang SC", "Helvetica Neue", sans-serif;
      background: linear-gradient(180deg, #09101d 0%, #0d1530 100%);
      color: var(--text);
    }
    .wrap {
      max-width: 1680px;
      margin: 0 auto;
      padding: 28px 20px 40px;
    }
    .hero {
      background: linear-gradient(135deg, rgba(120,166,255,.16), rgba(110,231,255,.08));
      border: 1px solid var(--line);
      border-radius: 20px;
      padding: 24px;
      box-shadow: var(--shadow);
      margin-bottom: 18px;
    }
    .hero h1 {
      margin: 0 0 8px;
      font-size: 30px;
      line-height: 1.2;
    }
    .hero p {
      margin: 0;
      color: var(--muted);
      line-height: 1.7;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 18px;
    }
    button {
      appearance: none;
      border: 1px solid rgba(255,255,255,.14);
      background: linear-gradient(180deg, #1f2b5a, #182147);
      color: var(--text);
      padding: 10px 14px;
      border-radius: 12px;
      cursor: pointer;
      font-size: 14px;
      transition: .2s ease;
    }
    button:hover { transform: translateY(-1px); border-color: rgba(120,166,255,.5); }
    .tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin: 18px 0 14px;
    }
    .tab-btn.active {
      background: linear-gradient(180deg, #3a63d8, #2748a8);
      border-color: rgba(255,255,255,.26);
    }
    .panel {
      display: none;
      background: rgba(13, 21, 48, .82);
      border: 1px solid var(--line);
      border-radius: 18px;
      overflow: hidden;
      box-shadow: var(--shadow);
    }
    .panel.active { display: block; }
    .panel-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 16px 18px;
      border-bottom: 1px solid var(--line);
      background: rgba(255,255,255,.03);
    }
    .panel-head h2 {
      margin: 0;
      font-size: 18px;
    }
    .panel-head span {
      color: var(--muted);
      font-size: 13px;
    }
    .table-wrap { overflow: auto; }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 1380px;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      border-right: 1px solid rgba(255,255,255,.06);
      padding: 12px 12px;
      text-align: left;
      vertical-align: top;
      font-size: 13px;
      line-height: 1.75;
    }
    th {
      position: sticky;
      top: 0;
      z-index: 2;
      background: #121935;
      color: #dbe6ff;
      font-size: 12px;
      letter-spacing: .02em;
      white-space: nowrap;
    }
    td.small { white-space: nowrap; color: #d9e2ff; }
    td.desc { min-width: 280px; }
    td.prompt { min-width: 620px; }
    .prompt-box {
      display: grid;
      gap: 10px;
      white-space: normal;
      word-break: break-word;
      color: #edf2ff;
    }
    .prompt-segments {
      display: grid;
      gap: 8px;
    }
    .prompt-segment {
      padding: 10px 12px;
      border-radius: 14px;
      border: 1px solid rgba(255,255,255,.08);
      background: rgba(255,255,255,.03);
    }
    .prompt-segment-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .prompt-tag {
      display: inline-flex;
      align-items: center;
      padding: 3px 9px;
      border-radius: 999px;
      background: rgba(120,166,255,.16);
      border: 1px solid rgba(120,166,255,.3);
      color: #dbe6ff;
      font-size: 12px;
      line-height: 1.2;
      font-weight: 600;
    }
    .prompt-tag.role-subject { background: rgba(84,210,165,.14); border-color: rgba(84,210,165,.3); color: #dcfff3; }
    .prompt-tag.role-space { background: rgba(110,231,255,.12); border-color: rgba(110,231,255,.28); color: #ddfbff; }
    .prompt-tag.role-light { background: rgba(255,207,112,.12); border-color: rgba(255,207,112,.26); color: #fff1cd; }
    .prompt-tag.role-camera { background: rgba(195,140,255,.14); border-color: rgba(195,140,255,.28); color: #f0ddff; }
    .prompt-tag.role-character { background: rgba(255,143,149,.14); border-color: rgba(255,143,149,.28); color: #ffdfe1; }
    .prompt-segment-body {
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.72;
    }
    .prompt-plain {
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.72;
    }
    .row-actions {
      margin-top: 10px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .copy-btn {
      padding: 7px 10px;
      border-radius: 10px;
      font-size: 12px;
      background: linear-gradient(180deg, #1e8b68, #17664e);
    }
    .copy-btn.secondary {
      background: linear-gradient(180deg, #31406f, #243056);
    }
    .footer-note {
      margin-top: 14px;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.7;
    }
    .pill {
      display: inline-block;
      margin-right: 8px;
      margin-bottom: 8px;
      padding: 5px 10px;
      border-radius: 999px;
      background: rgba(120,166,255,.12);
      border: 1px solid rgba(120,166,255,.22);
      color: #dbe6ff;
      font-size: 12px;
    }
    .ok {
      position: fixed;
      right: 18px;
      bottom: 18px;
      background: rgba(84,210,165,.95);
      color: #06261d;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 13px;
      box-shadow: var(--shadow);
      opacity: 0;
      transform: translateY(10px);
      transition: .25s ease;
      pointer-events: none;
      font-weight: 600;
    }
    .ok.show { opacity: 1; transform: translateY(0); }
    @media (max-width: 900px) {
      .hero h1 { font-size: 24px; }
      .wrap { padding: 16px 12px 28px; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <h1>__VIEWER_TITLE__</h1>
      <p>这份页面用于直接查看和复制本次生成的分镜表与多版本提示词。你可以切换版本、复制单镜提示词，或一键复制整页当前版本的全部提示词内容。</p>
      <div style="margin-top:14px;">
        <span class="pill">表格直观查看</span>
        <span class="pill">每镜复制</span>
        <span class="pill">一键复制全版本</span>
        <span class="pill">本地静态 HTML</span>
      </div>
      <div class="toolbar">
        <button onclick="copyCurrentAll()">复制当前版本全部提示词</button>
        <button onclick="copyCurrentTable()">复制当前表格全文</button>
        <button onclick="openCurrentSource()">打开当前源文件</button>
      </div>
    </section>

    <div class="tabs" id="tabs"></div>
    <div id="panels"></div>

    <div class="footer-note">
      当前页面为纯本地静态文件，可直接在浏览器打开。后续继续生成新话数时，将沿用这一套查看器结构稳定输出。
    </div>
  </div>

  <div class="ok" id="toast">已复制</div>

  <script>
    const datasets = __DATASETS_JSON__;
    let currentKey = datasets[0]?.kind || '';

    const tabs = document.getElementById('tabs');
    const panels = document.getElementById('panels');
    const toast = document.getElementById('toast');

    function showToast(text) {
      toast.textContent = text;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 1400);
    }

    async function copyText(text, successText='已复制') {
      try {
        await navigator.clipboard.writeText(text);
        showToast(successText);
      } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        showToast(successText);
      }
    }

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function segmentPrompt(text) {
      const source = String(text || '').replace(/\\r/g, '').trim();
      if (!source) return [];
      const lines = source.split('\\n');
      const segments = [];
      let current = null;
      const pushCurrent = () => {
        if (!current) return;
        current.value = (current.value || '').trim();
        if (current.value) segments.push(current);
        current = null;
      };

      lines.forEach(line => {
        const trimmed = line.trim();
        const fieldMatch = trimmed.match(/^([@A-Za-z0-9_\\-\\u4e00-\\u9fa5\\/]+)\\s*[:：]\\s*(.*)$/);
        if (fieldMatch) {
          pushCurrent();
          current = { label: fieldMatch[1], value: fieldMatch[2] || '' };
          return;
        }
        if (!current) {
          current = { label: '', value: trimmed };
          return;
        }
        current.value += `${current.value ? '\\n' : ''}${line}`;
      });
      pushCurrent();
      return segments;
    }

    function classifyPromptLabel(label) {
      const text = String(label || '').trim();
      if (!text) return 'role-plain';
      if (text.startsWith('@')) return 'role-character';
      if (/主体|角色|人物/.test(text)) return 'role-subject';
      if (/空间|场景|环境/.test(text)) return 'role-space';
      if (/光影|氛围|色彩/.test(text)) return 'role-light';
      if (/镜头|运镜|景别|机位/.test(text)) return 'role-camera';
      return 'role-plain';
    }

    function renderPromptContent(text) {
      const segments = segmentPrompt(text);
      if (!segments.length) {
        return `<div class="prompt-plain">${escapeHtml(text || '')}</div>`;
      }
      return `<div class="prompt-segments">${segments.map(segment => {
        const roleClass = classifyPromptLabel(segment.label);
        const head = segment.label ? `<div class="prompt-segment-head"><span class="prompt-tag ${roleClass}">${escapeHtml(segment.label)}</span></div>` : '';
        return `<div class="prompt-segment">${head}<div class="prompt-segment-body">${escapeHtml(segment.value)}</div></div>`;
      }).join('')}</div>`;
    }

    function render() {
      tabs.innerHTML = datasets.map(ds => `<button class="tab-btn ${ds.kind===currentKey?'active':''}" onclick="switchTab('${ds.kind}')">${ds.title}</button>`).join('');
      panels.innerHTML = datasets.map(ds => `
        <section class="panel ${ds.kind===currentKey?'active':''}" id="panel-${ds.kind}">
          <div class="panel-head">
            <div>
              <h2>${ds.title}</h2>
              <span>列结构：# / 时间段 / 景别 / 运镜 / 画面描述 / 光影氛围 / ${ds.promptLabel}</span>
            </div>
            <div>
              <button class="copy-btn secondary" onclick="copyAllPrompts('${ds.kind}')">复制全部提示词</button>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>时间段</th>
                  <th>景别</th>
                  <th>运镜</th>
                  <th>画面描述</th>
                  <th>光影氛围</th>
                  <th>${ds.promptLabel}</th>
                </tr>
              </thead>
              <tbody>
                ${ds.rows.map(row => `
                  <tr>
                    <td class="small">${escapeHtml(row.id)}</td>
                    <td class="small">${escapeHtml(row.time)}</td>
                    <td class="small">${escapeHtml(row.shot)}</td>
                    <td class="small">${escapeHtml(row.move)}</td>
                    <td class="desc">${escapeHtml(row.desc)}</td>
                    <td class="desc">${escapeHtml(row.light)}</td>
                    <td class="prompt">
                      <div class="prompt-box">${renderPromptContent(row.prompt)}</div>
                      <div class="row-actions">
                        <button class="copy-btn" data-copy-action="prompt" data-dataset-kind="${ds.kind}" data-row-id="${escapeHtml(row.id)}">复制本镜提示词</button>
                        <button class="copy-btn secondary" data-copy-action="row" data-dataset-kind="${ds.kind}" data-row-id="${escapeHtml(row.id)}">复制本镜整行</button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </section>
      `).join('');
    }

    function switchTab(key) {
      currentKey = key;
      if (location.hash !== `#${key}`) {
        history.replaceState(null, '', `#${key}`);
      }
      render();
    }

    window.addEventListener('hashchange', () => {
      const next = (location.hash || '').replace('#', '');
      if (datasets.some(ds => ds.kind === next) && next !== currentKey) {
        currentKey = next;
        render();
      }
    });

    function getCurrentDataset() {
      return datasets.find(ds => ds.kind === currentKey) || datasets[0];
    }

    function copyAllPrompts(kind) {
      const ds = datasets.find(item => item.kind === kind);
      if (!ds) return;
      const text = ds.rows.map(row => `【${row.id || '-'}｜${row.time || '-'}】\\n${row.prompt || ''}`).join('\\n\\n');
      copyText(text, `已复制${ds.title}全部提示词`);
    }

    function copyCurrentAll() {
      copyAllPrompts(currentKey);
    }

    function copyCurrentTable() {
      const ds = getCurrentDataset();
      const header = `#\\t时间段\\t景别\\t运镜\\t画面描述\\t光影氛围\\t${ds.promptLabel}`;
      const lines = ds.rows.map(r => [r.id, r.time, r.shot, r.move, r.desc, r.light, r.prompt].join('\\t'));
      copyText([header, ...lines].join('\\n'), '已复制当前表格全文');
    }

    function openCurrentSource() {
      const ds = getCurrentDataset();
      if (ds?.url) window.open(ds.url, '_blank');
    }

    function goWorkbench() {
      window.location.href = '/workbench.html';
    }

    function handleRowCopy(event) {
      const button = event.target.closest('[data-copy-action]');
      if (!button) return;

      const datasetKind = button.getAttribute('data-dataset-kind');
      const rowId = button.getAttribute('data-row-id');
      const action = button.getAttribute('data-copy-action');
      const ds = datasets.find(item => item.kind === datasetKind);
      if (!ds) return;
      const row = ds.rows.find(item => String(item.id) === String(rowId));
      if (!row) return;

      if (action === 'prompt') {
        copyText(row.prompt || '', `已复制第${row.id}镜提示词`);
        return;
      }

      if (action === 'row') {
        const fullRowText = `#${row.id} | ${row.time || ''} | ${row.shot || ''} | ${row.move || ''}\\n画面描述：${row.desc || ''}\\n光影氛围：${row.light || ''}\\n${ds.promptLabel}：\\n${row.prompt || ''}`;
        copyText(fullRowText, `已复制第${row.id}镜整行`);
      }
    }

    panels.addEventListener('click', handleRowCopy);

    if (location.hash) {
      const next = location.hash.replace('#', '');
      if (datasets.some(ds => ds.kind === next)) {
        currentKey = next;
      }
    }

    render();
  </script>
</body>
</html>'''
    html_content = html_content.replace("__VIEWER_TITLE__", html.escape(title)).replace("__DATASETS_JSON__", payload_json)
    viewer_path.write_text(html_content, encoding="utf-8")
    return viewer_path


def filter_primary_generated_files(generated_files: list[dict[str, str]], viewer_path: Path | None = None) -> list[dict[str, str]]:
    if viewer_path and viewer_path.exists():
        return [{
            "label": viewer_path.name,
            "path": str(viewer_path),
            "relativePath": to_relative_path(viewer_path),
            "url": to_workspace_url(viewer_path),
            "kind": "htmlviewer",
        }]
    return []


def build_pipeline_result(project_dir: Path, episode: str, script_path: Path) -> dict[str, object]:
    outputs = collect_pipeline_outputs(project_dir, episode, script_path)
    source_files = list(outputs.get("generatedFiles") or [])
    viewer_path = write_pipeline_viewer(project_dir, episode, source_files)
    primary_files = filter_primary_generated_files(source_files, viewer_path)
    result: dict[str, object] = {
        "episode": episode,
        "scriptPath": str(script_path),
        "scriptUrl": to_workspace_url(script_path),
        "runningUrl": f"{WORKBENCH_RUN_PAGE}?taskId={{taskId}}",
        **outputs,
        "generatedFiles": primary_files,
        "sourceFiles": source_files,
    }
    if viewer_path and viewer_path.exists():
        result["resultViewerPath"] = str(viewer_path)
        result["resultViewerRelativePath"] = to_relative_path(viewer_path)
        result["resultViewerUrl"] = to_workspace_url(viewer_path)
    return result


def read_workspace_text(relative_path: str) -> str:
    if not relative_path:
        raise ValueError("缺少文件路径")
    path = (WORKSPACE_ROOT / relative_path).resolve()
    if not path.exists() or not path.is_file():
        raise ValueError(f"文件不存在：{relative_path}")
    if WORKSPACE_ROOT not in path.parents and path != WORKSPACE_ROOT:
        raise ValueError("禁止读取工作区外文件")
    return path.read_text(encoding="utf-8")


class WorkbenchRequestHandler(SimpleHTTPRequestHandler):
    server_version = "LingjingWorkbench/3.0"

    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        if parsed.path == "/api/workbench/health":
            self.respond_json(
                {
                    "ok": True,
                    "service": "lingjing-workbench-server",
                    "workspaceRoot": str(WORKSPACE_ROOT),
                    "outputsRoot": str(OUTPUTS_DIR),
                    "projectsRoot": str(PROJECTS_DIR),
                    "workbenchUrl": "/workbench.html",
                    "runPageUrl": WORKBENCH_RUN_PAGE,
                    "rootIndexUrl": "/index.html",
                    "availableProjects": discover_projects(),
                }
            )
            return
        if parsed.path == "/api/workbench/projects":
            self.respond_json({"ok": True, "projects": discover_projects()})
            return
        if parsed.path == "/api/workbench/task":
            task_id = (query.get("taskId") or [""])[0]
            task = get_task_snapshot(task_id)
            if not task:
                self.respond_json({"ok": False, "error": "任务不存在"}, status=HTTPStatus.NOT_FOUND)
                return
            self.respond_json({"ok": True, "task": task})
            return
        if parsed.path == "/api/workbench/file":
            try:
                relative_path = (query.get("path") or [""])[0]
                content = read_workspace_text(relative_path)
                self.respond_json({"ok": True, "path": relative_path, "content": content})
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return
        if parsed.path == "/":
            self.path = "/index.html"
        elif parsed.path == "/workbench.html":
            self.path = "/lingjing/outputs/workbench.html"
        elif parsed.path == "/workbench-run.html":
            self.path = "/lingjing/outputs/workbench-run.html"
        elif parsed.path == "/index.html":
            self.path = "/lingjing/outputs/index.html"
        else:
            self.path = parsed.path
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/api/workbench/execute":
            self.respond_json({"ok": False, "error": "接口不存在"}, status=HTTPStatus.NOT_FOUND)
            return
        try:
            payload = self.read_json_body()
            action = str(payload.get("action") or "plan").strip() or "plan"
            if action not in {"plan", "init", "export", "pipeline"}:
                raise ValueError("action 仅支持 plan、init、export、pipeline")
            text = str(payload.get("text") or "").strip()
            if action != "pipeline" and not text:
                raise ValueError("请先输入小说原文或剧本正文")

            plan = build_plan(
                text,
                project_name=str(payload.get("projectName") or ""),
                director=str(payload.get("directorStyle") or ""),
                visual=str(payload.get("visualStyle") or ""),
                duration=str(payload.get("duration") or ""),
            )

            project_dir: Path | None = None
            pipeline_payload: dict[str, object] | None = None
            if action == "init":
                project_dir = create_structure(text, plan.project_name)
            elif action == "export":
                project_dir = export_project(text, plan.project_name)
            elif action == "pipeline":
                project_id = str(payload.get("pipelineProjectId") or "").strip()
                if not project_id:
                    raise ValueError("请先选择项目")
                project_dir = (PROJECTS_DIR / project_id).resolve()
                if not project_dir.exists():
                    raise ValueError(f"项目不存在：{project_id}")
                episode = str(payload.get("pipelineEpisode") or "").strip() or infer_episode_from_text(text or "") or ""
                episode = normalize_episode(episode)
                if not text:
                    raise ValueError("项目级生成需要正文内容，当前输入区不能为空")
                script_path = write_script_to_project(project_dir, episode, text)
                task_meta = {
                    "action": "pipeline",
                    "projectId": project_id,
                    "episode": episode,
                    "style": str(payload.get("pipelineStyle") or "纪实克制"),
                    "variant": str(payload.get("pipelineVariant") or "short"),
                    "skipAssets": bool(payload.get("pipelineSkipAssets", False)),
                    "force": bool(payload.get("pipelineForce", False)),
                    "scriptPath": str(script_path),
                }
                task_id = create_task(task_meta)
                worker = threading.Thread(
                    target=run_project_pipeline_task,
                    args=(
                        task_id,
                        project_dir,
                        episode,
                        task_meta["style"],
                        task_meta["variant"],
                        task_meta["skipAssets"],
                        task_meta["force"],
                        script_path,
                    ),
                    daemon=True,
                )
                worker.start()
                pipeline_payload = {
                    "taskId": task_id,
                    "episode": episode,
                    "scriptPath": str(script_path),
                    "scriptUrl": to_workspace_url(script_path),
                    "status": "running",
                    "runningUrl": f"{WORKBENCH_RUN_PAGE}?taskId={task_id}",
                    "resultViewerUrl": None,
                }

            response = {
                "ok": True,
                "action": action,
                "plan": plan.to_dict(),
                "project": self.build_project_payload(project_dir),
                "pipeline": pipeline_payload,
            }
            self.respond_json(response)
        except Exception as exc:  # noqa: BLE001
            self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def read_json_body(self) -> dict[str, object]:
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length > 0 else b"{}"
        if not raw:
            return {}
        return json.loads(raw.decode("utf-8"))

    def build_project_payload(self, project_dir: Path | None) -> dict[str, object] | None:
        if not project_dir:
            return None
        payload: dict[str, object] = {
            "name": project_dir.name,
            "absolutePath": str(project_dir),
            "relativePath": project_dir.relative_to(WORKSPACE_ROOT).as_posix(),
            "projectIndexUrl": to_workspace_url(project_dir / "index.html") if (project_dir / "index.html").exists() else None,
            "rootIndexUrl": "/index.html",
        }
        return payload

    def respond_json(self, payload: dict[str, object], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:  # noqa: A003
        super().log_message(format, *args)


def main() -> None:
    parser = argparse.ArgumentParser(description="灵境网页工作台本地执行服务")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址，默认 127.0.0.1")
    parser.add_argument("--port", type=int, default=8766, help="监听端口，默认 8766")
    args = parser.parse_args()
    OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
    handler = partial(WorkbenchRequestHandler, directory=str(WORKSPACE_ROOT))
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"Lingjing workbench server running at http://{args.host}:{args.port}/workbench.html")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
