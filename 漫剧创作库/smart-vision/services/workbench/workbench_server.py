#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import cgi
import contextlib
import html
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import uuid
from datetime import datetime
from functools import partial
from html.parser import HTMLParser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

SCRIPT_DIR = Path(__file__).resolve().parent
STUDIO_DIR = SCRIPT_DIR.parent          # 漫剧创作库/
WORKSPACE_ROOT = STUDIO_DIR.parent      # AI_pro/
PROJECTS_DIR = STUDIO_DIR / "projects"
TOOLS_DIR = STUDIO_DIR / "tools"
WORKBENCH_OUTPUTS_DIR = STUDIO_DIR / "tools" / "workbench-web"
IMAGE_STUDIO_OUTPUTS_DIR = STUDIO_DIR / "runninghub_outputs" / "image-studio"
IMAGE_STUDIO_MODELS_DIR = WORKBENCH_OUTPUTS_DIR / "models"
IMAGE_STUDIO_MODEL_REGISTRY_PATH = WORKBENCH_OUTPUTS_DIR / "model-registry.json"
IMAGE_STUDIO_FILES_DIR = STUDIO_DIR / "data" / "files"
IMAGE_FILE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
VIDEO_FILE_SUFFIXES = {".mp4", ".webm", ".mov", ".avi"}
WORDLISTS_DIR = STUDIO_DIR / "wordlists" / "mj-image"
MIDJOURNEY_PROMPT_SKILL_PATH = STUDIO_DIR / "skills" / "midjourney-prompt-skill.md"
WORKBENCH_RUN_PAGE = "/workbench-run.html"


def load_local_env_files() -> None:
    """Load local .env files for the standalone workbench server.

    The server is often started directly with python, so shell environment
    variables from the canvas project .env are not available unless we load
    them here. Existing process env values always win.
    """
    env_paths = [
        STUDIO_DIR / ".env",
        STUDIO_DIR / ".env.local",
        STUDIO_DIR / ".env.object-storage",
        TOOLS_DIR / ".env",
        WORKBENCH_OUTPUTS_DIR / ".env",
    ]
    for path in env_paths:
        if not path.exists():
            continue
        try:
            for raw_line in path.read_text(encoding="utf-8").splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                if not key or key in os.environ:
                    continue
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
                    value = value[1:-1]
                os.environ[key] = value
        except Exception as exc:  # noqa: BLE001
            print(f"[workbench] warning: failed to load env file {path}: {exc}", file=sys.stderr)


load_local_env_files()

if __package__:
    # export_current_outputs not migrated (test-only module)
    from init_outputs import OUTPUTS_DIR, create_structure
    from .image_studio_backend import (
        DEFAULT_API_KEY,
        DEFAULT_BASE_URL,
        DEFAULT_MODEL,
        DEFAULT_SIZE,
        ImageStudioError,
        _debug_request_summary,
        _is_seedance_full_adapter,
        _json_headers,
        _request_image_generation_with_size_fallback,
        _save_response_image,
        _seedance_full_submit_url,
        build_config,
        build_endpoint_url,
        build_gpt_image2_edits_payload,
        build_image_payload,
        build_notevideo_request_body,
        build_video_config,
        build_video_provider_request_body,
        edit_image,
        generate_from_text,
        generate_panorama,
        generate_video,
        get_video_generation_task_status,
        get_notevideo_seedance_video_status,
        repair_image,
        start_video_generation_task,
        start_notevideo_seedance_video,
    )
    from .workbench_core import build_plan
else:
    sys.path.insert(0, str(SCRIPT_DIR))
    # export_current_outputs not migrated
    from image_studio_backend import (
        DEFAULT_API_KEY,
        DEFAULT_BASE_URL,
        DEFAULT_MODEL,
        DEFAULT_SIZE,
        ImageStudioError,
        _debug_request_summary,
        _is_seedance_full_adapter,
        _json_headers,
        _request_image_generation_with_size_fallback,
        _save_response_image,
        _seedance_full_submit_url,
        build_config,
        build_endpoint_url,
        build_gpt_image2_edits_payload,
        build_image_payload,
        build_notevideo_request_body,
        build_video_config,
        build_video_provider_request_body,
        edit_image,
        generate_from_text,
        generate_panorama,
        generate_video,
        get_video_generation_task_status,
        get_notevideo_seedance_video_status,
        repair_image,
        start_video_generation_task,
        start_notevideo_seedance_video,
    )
    from init_outputs import OUTPUTS_DIR, create_structure
    from workbench_core import build_plan

if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

TASKS: dict[str, dict[str, object]] = {}
TASKS_LOCK = threading.Lock()
VIDEO_TASKS: dict[str, dict[str, object]] = {}
VIDEO_TASKS_LOCK = threading.Lock()
IMAGE_TASKS: dict[str, dict[str, object]] = {}
IMAGE_TASKS_LOCK = threading.Lock()


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


PREVIEW_PLACEHOLDER_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNk+M9QzwAEYBxVSFIAAKtqBAOy5vL9AAAAAElFTkSuQmCC"
)


def preview_size_params(query: dict[str, list[str]]) -> tuple[int, int]:
    def read(*names: str) -> int:
        for name in names:
            value = (query.get(name) or [""])[0]
            if value not in ("", None):
                try:
                    return max(0, int(float(str(value))))
                except (TypeError, ValueError):
                    return 0
        return 0

    return read("maxW", "w"), read("maxH", "h")


def resize_image_for_preview(binary: bytes, content_type: str, max_w: int, max_h: int) -> tuple[bytes, str]:
    if max_w <= 0 and max_h <= 0:
        return binary, content_type
    max_w = max(1, min(max_w or max_h, 1600))
    max_h = max(1, min(max_h or max_w, 1600))
    try:
        import io
        from PIL import Image, ImageOps

        with Image.open(io.BytesIO(binary)) as img:
            img = ImageOps.exif_transpose(img)
            resample = getattr(getattr(Image, "Resampling", Image), "LANCZOS", 1)
            img.thumbnail((max_w, max_h), resample)
            out = io.BytesIO()
            has_alpha = img.mode in {"RGBA", "LA"} or (img.mode == "P" and "transparency" in img.info)
            if has_alpha:
                if img.mode not in {"RGBA", "LA"}:
                    img = img.convert("RGBA")
                img.save(out, format="PNG", optimize=True)
                return out.getvalue(), "image/png"
            if img.mode != "RGB":
                img = img.convert("RGB")
            img.save(out, format="WEBP", quality=82, method=4)
            return out.getvalue(), "image/webp"
    except Exception:
        return PREVIEW_PLACEHOLDER_PNG, "image/png"


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


def save_to_user_dir(source_path: str | None, remote_url: str | None, output_dir_str: str) -> dict[str, str]:
    """将图片保存到用户指定的目录。优先使用本地文件，否则从远端下载。"""
    import shutil
    target = Path(output_dir_str).expanduser()
    if not target.is_absolute():
        target = (STUDIO_DIR / output_dir_str).resolve()
    else:
        target = target.resolve()
    target.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    # 优先用本地文件
    local_file = Path(source_path).expanduser() if source_path else None
    if local_file and local_file.is_absolute() and local_file.exists():
        dest = target / f"img-{timestamp}{local_file.suffix}"
        shutil.copy2(local_file, dest)
    elif remote_url:
        from image_studio_backend import _download_binary, _guess_extension_from_content_type
        try:
            binary, content_type = _download_binary(remote_url, timeout=12, retries=2)
            ext = _guess_extension_from_content_type(content_type, ".png")
            dest = target / f"img-{timestamp}{ext}"
            dest.write_bytes(binary)
        except ImageStudioError as exc:
            dest = target / f"img-{timestamp}.url.txt"
            dest.write_text(remote_url, encoding="utf-8")
            saved = {
                "filename": dest.name,
                "path": str(dest.resolve()),
                "remoteUrl": remote_url,
                "url": remote_url,
                "sourceType": "url_pending_download",
                "downloadError": str(exc),
            }
            if WORKSPACE_ROOT in dest.resolve().parents or dest.resolve() == WORKSPACE_ROOT:
                saved["linkFileUrl"] = to_workspace_url(dest.resolve())
            return saved
    else:
        raise ImageStudioError("无可用图片源（本地文件和远端 URL 均为空）")

    saved = {
        "filename": dest.name,
        "path": str(dest.resolve()),
    }
    if WORKSPACE_ROOT in dest.resolve().parents or dest.resolve() == WORKSPACE_ROOT:
        saved["url"] = to_workspace_url(dest.resolve())
    return saved


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
    import project_pipeline_run as _ppr

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
                _ppr.main()
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
        "storyboard": "漫剧分镜表",
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
    title = f"第{int(episode)}话《{project_dir.name}》- 漫剧创作库提示词查看器"
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




def list_image_studio_outputs(output_dir: str | None = None, exclude_source: bool = False) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    target_dir = Path(output_dir).expanduser() if output_dir else IMAGE_STUDIO_OUTPUTS_DIR
    if not target_dir.is_absolute():
        target_dir = (STUDIO_DIR / target_dir).resolve()
    else:
        target_dir = target_dir.resolve()
    if not target_dir.exists():
        return items
    for path in sorted(target_dir.glob("*"), key=lambda item: item.stat().st_mtime, reverse=True):
        if not path.is_file():
            continue
        if exclude_source and path.name.startswith("input-"):
            continue
        record = {
            "name": path.name,
            "path": str(path.resolve()),
            "updatedAt": datetime.fromtimestamp(path.stat().st_mtime).isoformat(timespec="seconds"),
            "relativePath": "",
            "url": "",
        }
        if path.suffix.lower() == ".txt" and path.name.endswith(".url.txt"):
            try:
                remote_url = path.read_text(encoding="utf-8").strip().splitlines()[0]
            except Exception:
                remote_url = ""
            if remote_url.startswith(("http://", "https://")):
                record["remoteUrl"] = remote_url
                record["url"] = remote_url
                record["sourceType"] = "url_link_file"
                items.append(record)
                continue
        resolved = path.resolve()
        if resolved == WORKSPACE_ROOT or WORKSPACE_ROOT in resolved.parents:
            record["relativePath"] = to_relative_path(resolved)
            record["url"] = to_workspace_url(resolved)
        else:
            # 不在 WORKSPACE_ROOT 下的文件，通过专用 file 接口提供访问
            from urllib.parse import quote as _url_quote
            record["url"] = f"/api/workbench/image-studio/file?path={_url_quote(str(resolved))}"
        items.append(record)
    return items


def decode_data_url_to_bytes(data_url: str) -> tuple[bytes, str]:
    if not data_url.startswith("data:") or ";base64," not in data_url:
        raise ValueError("上传图片数据格式不正确")
    header, encoded = data_url.split(",", 1)
    mime_part = header.split(";", 1)[0]
    mime_type = mime_part.replace("data:", "").strip().lower()
    suffix_map = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/webp": ".webp",
        "image/svg+xml": ".svg",
    }
    suffix = suffix_map.get(mime_type, ".png")
    return base64.b64decode(encoded), suffix


def get_image_studio_defaults() -> dict[str, object]:
    return {
        "baseUrl": DEFAULT_BASE_URL,
        "model": DEFAULT_MODEL,
        "size": DEFAULT_SIZE,
        "hasApiKey": bool(DEFAULT_API_KEY),
        "apiKey": DEFAULT_API_KEY,
    }


def resolve_image_studio_output_dir(output_dir: str | None) -> Path:
    output_dir_str = str(output_dir or "").strip()
    if output_dir_str:
        target = Path(output_dir_str).expanduser()
        if not target.is_absolute():
            target = (STUDIO_DIR / output_dir_str).resolve()
        else:
            target = target.resolve()
    else:
        target = IMAGE_STUDIO_OUTPUTS_DIR
    target.mkdir(parents=True, exist_ok=True)
    return target


def image_studio_file_url(path: Path) -> str:
    resolved = path.resolve()
    if resolved == WORKSPACE_ROOT or WORKSPACE_ROOT in resolved.parents:
        return to_workspace_url(resolved)
    from urllib.parse import quote as _url_quote
    return f"/api/workbench/image-studio/file?path={_url_quote(str(resolved))}"


def enrich_video_task_saved(task_id: str, saved: dict[str, object]) -> None:
    with VIDEO_TASKS_LOCK:
        task = VIDEO_TASKS.get(task_id)
        if not task:
            return
        task["localPath"] = saved.get("path") or ""
        task["localUrl"] = saved.get("url") or ""
        task["saved"] = saved
        task["downloadStatus"] = "completed"
        task["downloadProgress"] = 100
        task["downloadError"] = ""


def mark_video_task_download_failed(task_id: str, error: str) -> None:
    with VIDEO_TASKS_LOCK:
        task = VIDEO_TASKS.get(task_id)
        if not task:
            return
        task["downloadStatus"] = "failed"
        task["downloadError"] = error


def start_video_background_download(task_id: str, output_dir: str | None = None) -> None:
    def worker() -> None:
        try:
            with VIDEO_TASKS_LOCK:
                task = VIDEO_TASKS.get(task_id)
                if not task:
                    return
                if task.get("localPath") or task.get("downloadStatus") == "downloading":
                    return
                content_endpoint = str(task.get("contentEndpoint") or "").strip()
                api_key = str(task.get("apiKey") or "").strip()
                content_auth_required = task.get("contentAuthRequired", True) is not False
                task["downloadStatus"] = "downloading"
                task["downloadProgress"] = 0
                task["downloadError"] = ""
            if not content_endpoint or (content_auth_required and not api_key):
                raise ImageStudioError("视频任务缺少 contentEndpoint 或 API Key")
            target_dir = resolve_image_studio_output_dir(output_dir or str(task.get("outputDir") or ""))
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            safe_task_id = re.sub(r"[^A-Za-z0-9_.-]+", "-", task_id).strip(".-") or "video"
            target_path = target_dir / f"video-{timestamp}-{safe_task_id}.mp4"
            tmp_path = target_path.with_suffix(target_path.suffix + ".part")
            headers = {
                "Accept": "video/mp4,video/*;q=0.9,*/*;q=0.8",
                "User-Agent": "image-studio/1.0",
            }
            if content_auth_required:
                headers["Authorization"] = f"Bearer {api_key}"
            request = Request(content_endpoint, headers=headers, method="GET")
            with urlopen(request, timeout=900) as response, tmp_path.open("wb") as fp:
                shutil.copyfileobj(response, fp, length=1024 * 256)
            tmp_path.replace(target_path)
            saved: dict[str, object] = {
                "filename": target_path.name,
                "path": str(target_path.resolve()),
                "url": image_studio_file_url(target_path),
                "remoteUrl": content_endpoint,
                "fileSize": target_path.stat().st_size,
                "sourceType": "downloaded_video",
            }
            enrich_video_task_saved(task_id, saved)
        except Exception as exc:  # noqa: BLE001
            try:
                tmp = locals().get("tmp_path")
                if isinstance(tmp, Path) and tmp.exists():
                    tmp.unlink()
            except Exception:
                pass
            mark_video_task_download_failed(task_id, str(exc))

    threading.Thread(target=worker, name=f"video-download-{task_id[:12]}", daemon=True).start()


def get_image_task(task_id: str) -> dict[str, object] | None:
    with IMAGE_TASKS_LOCK:
        task = IMAGE_TASKS.get(task_id)
        return dict(task) if task else None


def register_image_download_task(saved: dict[str, object], output_dir: str | None = None) -> str:
    task_id = uuid.uuid4().hex[:12]
    remote_url = str(saved.get("remoteUrl") or saved.get("url") or "").strip()
    with IMAGE_TASKS_LOCK:
        IMAGE_TASKS[task_id] = {
            "taskId": task_id,
            "remoteUrl": remote_url,
            "localUrl": saved.get("localUrl") or "",
            "localPath": saved.get("path") or "",
            "outputDir": output_dir or "",
            "downloadStatus": "completed" if saved.get("path") else "waiting",
            "downloadProgress": 100 if saved.get("path") else 1,
            "downloadError": "",
            "saved": dict(saved),
        }
    return task_id


def update_image_task_saved(task_id: str, saved: dict[str, object]) -> None:
    with IMAGE_TASKS_LOCK:
        task = IMAGE_TASKS.get(task_id)
        if not task:
            return
        task["localPath"] = saved.get("path") or ""
        task["localUrl"] = saved.get("url") or ""
        task["saved"] = saved
        task["downloadStatus"] = "completed"
        task["downloadProgress"] = 100
        task["downloadError"] = ""


def mark_image_task_download_failed(task_id: str, error: str) -> None:
    with IMAGE_TASKS_LOCK:
        task = IMAGE_TASKS.get(task_id)
        if not task:
            return
        task["downloadStatus"] = "failed"
        task["downloadError"] = error


def start_image_background_download(task_id: str) -> None:
    def worker() -> None:
        try:
            with IMAGE_TASKS_LOCK:
                task = IMAGE_TASKS.get(task_id)
                if not task:
                    return
                if task.get("localPath") or task.get("downloadStatus") == "downloading":
                    return
                remote_url = str(task.get("remoteUrl") or "").strip()
                output_dir = str(task.get("outputDir") or "").strip()
                task["downloadStatus"] = "downloading"
                task["downloadProgress"] = 5
                task["downloadError"] = ""
            if not remote_url:
                raise ImageStudioError("图片任务缺少 remoteUrl")
            from image_studio_backend import _download_binary, _detect_image_dimensions, _guess_extension_from_content_type
            target_dir = resolve_image_studio_output_dir(output_dir)
            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            safe_task_id = re.sub(r"[^A-Za-z0-9_.-]+", "-", task_id).strip(".-") or "image"
            binary, content_type = _download_binary(remote_url, timeout=300, retries=3)
            ext = _guess_extension_from_content_type(content_type, ".png")
            target_path = target_dir / f"image-{timestamp}-{safe_task_id}{ext}"
            tmp_path = target_path.with_suffix(target_path.suffix + ".part")
            tmp_path.write_bytes(binary)
            tmp_path.replace(target_path)
            width, height = _detect_image_dimensions(binary)
            saved: dict[str, object] = {
                "filename": target_path.name,
                "path": str(target_path.resolve()),
                "url": image_studio_file_url(target_path),
                "localUrl": image_studio_file_url(target_path),
                "localPath": str(target_path.resolve()),
                "remoteUrl": remote_url,
                "fileSize": target_path.stat().st_size,
                "sourceType": "downloaded_image",
                "downloadStatus": "completed",
                "downloadProgress": 100,
                "imageTaskId": task_id,
            }
            if width and height:
                saved["width"] = width
                saved["height"] = height
                saved["actualSize"] = f"{width}x{height}"
            update_image_task_saved(task_id, saved)
        except Exception as exc:  # noqa: BLE001
            try:
                tmp = locals().get("tmp_path")
                if isinstance(tmp, Path) and tmp.exists():
                    tmp.unlink()
            except Exception:
                pass
            mark_image_task_download_failed(task_id, str(exc))

    threading.Thread(target=worker, name=f"image-download-{task_id[:12]}", daemon=True).start()


def load_image_studio_model_registry() -> dict[str, dict]:
    """读取独立模型身份注册表；注册表只决定身份/别名/adapter，不保存 Key。"""
    if not IMAGE_STUDIO_MODEL_REGISTRY_PATH.exists():
        return {}
    try:
        data = json.loads(IMAGE_STUDIO_MODEL_REGISTRY_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}
    items = data.get("models") if isinstance(data, dict) else []
    registry: dict[str, dict] = {}
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        config_id = str(item.get("configId") or "").strip()
        if config_id:
            registry[config_id] = item
    return registry


def is_gpt_image_2_pro_model_config(data: dict, config_id: str = "") -> bool:
    protocol = data.get("protocol") if isinstance(data.get("protocol"), dict) else {}
    provider = data.get("provider") if isinstance(data.get("provider"), dict) else {}
    values = [
        config_id,
        data.get("id"),
        data.get("configId"),
        data.get("modelKey"),
        data.get("identityKey"),
        data.get("name"),
        data.get("model"),
        data.get("nick"),
        data.get("nickname"),
        data.get("displayName"),
        data.get("label"),
        (data.get("ui") or {}).get("label") if isinstance(data.get("ui"), dict) else "",
        data.get("adapter"),
        protocol.get("adapter"),
        data.get("channelKey"),
        data.get("providerKey"),
        provider.get("providerKey"),
        provider.get("name"),
        provider.get("adapter"),
    ]
    text = " ".join(str(value or "").strip().lower() for value in values if str(value or "").strip())
    dashed = re.sub(r"[\s_]+", "-", text)
    compact = re.sub(r"[\s_-]+", "", text)
    return (
        "canvas-gpt-image-2-pro" in dashed
        or "gpt-image-2-pro" in dashed
        or "gpt-image-2(pro)" in text
        or "canvasgptimage2pro" in compact
        or "gptimage2pro" in compact
        or "gptimage2(pro)" in compact
    )


def is_gpt_image_2_generations_model_config(data: dict, config_id: str = "") -> bool:
    if not is_gpt_image_2_pro_model_config(data, config_id):
        return False
    try:
        text = json.dumps({"configId": config_id, **data}, ensure_ascii=False).lower()
    except TypeError:
        text = " ".join(str(value or "").lower() for value in [config_id, *data.values()])
    return (
        "hongniaoai.com" in text
        or "hongniao" in text
        or "openai-generations" in text
        or "/images/generations" in text
        or "gpt-image-2(pro)" in text
    )


def coerce_gpt_image_2_pro_model_config(data: dict, config_id: str = "") -> dict:
    if not is_gpt_image_2_pro_model_config(data, config_id):
        return data
    protocol = data.get("protocol") if isinstance(data.get("protocol"), dict) else {}
    provider = data.get("provider") if isinstance(data.get("provider"), dict) else {}
    defaults = data.get("defaults") if isinstance(data.get("defaults"), dict) else {}
    upload_mode = (
        data.get("uploadMode")
        or data.get("upload_mode")
        or provider.get("uploadMode")
        or provider.get("upload_mode")
        or protocol.get("uploadMode")
        or protocol.get("upload_mode")
        or defaults.get("uploadMode")
        or defaults.get("upload_mode")
    )
    upload_mode = str(upload_mode or "").strip()
    if is_gpt_image_2_generations_model_config(data, config_id):
        data_model = str(data.get("model") or "").strip()
        provider_model = str(provider.get("defaultModel") or provider.get("default_model") or provider.get("model") or "").strip()
        model_name = provider_model if provider_model and data_model.lower() == "gpt-image-2" else (data_model or provider_model or "gpt-image-2")
        provider_next = {**provider, "adapter": "openai-generations", "endpointPath": "/v1/images/generations"}
        protocol_next = {**protocol, "adapter": "openai-generations", "endpointPath": "/v1/images/generations", "method": protocol.get("method") or "sync"}
        if upload_mode:
            provider_next["uploadMode"] = upload_mode
            protocol_next["uploadMode"] = upload_mode
            protocol_next["upload_mode"] = upload_mode
        result = {
            **data,
            "model": model_name,
            "adapter": "openai-generations",
            "endpointPath": "/v1/images/generations",
            "provider": provider_next,
            "protocol": protocol_next,
        }
        if upload_mode:
            result["uploadMode"] = upload_mode
            result["uploadStrategy"] = str(data.get("uploadStrategy") or data.get("upload_strategy") or upload_mode)
        return result
    provider_next = {**provider, "adapter": "openai-edits", "endpointPath": "/images/edits"}
    protocol_next = {**protocol, "adapter": "openai-edits", "endpointPath": "/images/edits", "method": protocol.get("method") or "sync"}
    if upload_mode:
        provider_next["uploadMode"] = upload_mode
        protocol_next["uploadMode"] = upload_mode
        protocol_next["upload_mode"] = upload_mode
    result = {
        **data,
        "model": "gpt-image-2",
        "adapter": "openai-edits",
        "endpointPath": "/images/edits",
        "provider": provider_next,
        "protocol": protocol_next,
    }
    if upload_mode:
        result["uploadMode"] = upload_mode
        result["uploadStrategy"] = str(data.get("uploadStrategy") or data.get("upload_strategy") or upload_mode)
    return result


def _model_url_origin(value: str) -> str:
    parsed = urlparse(str(value or "").strip())
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"


def _collect_model_keys_by_origin(paths: list[Path]) -> dict[str, str]:
    keys: dict[str, str] = {}
    for path in paths:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                continue
            url = str(data.get("url") or data.get("baseUrl") or data.get("base_url") or data.get("apiBase") or data.get("api_base") or data.get("endpoint") or "").strip()
            key = str(data.get("key") or data.get("apiKey") or data.get("api_key") or data.get("token") or "").strip()
            origin = _model_url_origin(url)
            if origin and key and origin not in keys:
                keys[origin] = key
        except Exception:
            continue
    return keys


def _inherit_model_key_for_origin(url: str, key: str, keys_by_origin: dict[str, str]) -> str:
    clean_key = str(key or "").strip()
    if clean_key:
        return clean_key
    origin = _model_url_origin(url)
    if origin == "https://aiyunzhi.top":
        return keys_by_origin.get(origin, "")
    return ""


def list_image_studio_models() -> list[dict[str, str]]:
    """扫描 models/ 目录下的 .json 文件，返回可用模型列表。"""
    models: list[dict[str, str]] = []
    registry = load_image_studio_model_registry()
    if not IMAGE_STUDIO_MODELS_DIR.exists():
        return models
    model_paths = sorted(IMAGE_STUDIO_MODELS_DIR.glob("*.json"))
    keys_by_origin = _collect_model_keys_by_origin(model_paths)
    for path in model_paths:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                continue
            data = coerce_gpt_image_2_pro_model_config(data, path.stem)
            reg = registry.get(path.stem, {})
            alias = str(data.get("name") or data.get("alias") or path.stem).strip()
            real_model = str(data.get("model") or alias).strip()
            url = str(data.get("url") or data.get("baseUrl") or data.get("base_url") or data.get("apiBase") or data.get("api_base") or data.get("endpoint") or "").strip()
            key = str(data.get("key") or data.get("apiKey") or data.get("api_key") or data.get("token") or "").strip()
            key = _inherit_model_key_for_origin(url, key, keys_by_origin)
            note = str(data.get("note") or "").strip()
            ui = data.get("ui") if isinstance(data.get("ui"), dict) else {}
            protocol = data.get("protocol") if isinstance(data.get("protocol"), dict) else {}
            if reg.get("adapter"):
                protocol = {**protocol, "adapter": str(reg.get("adapter") or "").strip()}
            if real_model or alias:
                model_id = str(data.get("id") or path.stem).strip() or path.stem
                label = str(data.get("label") or ui.get("label") or data.get("displayName") or data.get("nick") or data.get("nickname") or alias or real_model).strip()
                adapter = str(data.get("adapter") or protocol.get("adapter") or "").strip()
                endpoint_path = str(data.get("endpointPath") or data.get("endpoint_path") or protocol.get("endpointPath") or protocol.get("endpoint_path") or "").strip()
                status_endpoint_path = str(data.get("statusEndpointPath") or data.get("status_endpoint_path") or protocol.get("statusEndpointPath") or protocol.get("status_endpoint_path") or "").strip()
                upload_mode = str(data.get("uploadMode") or data.get("upload_mode") or protocol.get("uploadMode") or protocol.get("upload_mode") or "").strip()
                upload_strategy = str(data.get("uploadStrategy") or data.get("upload_strategy") or upload_mode).strip()
                supports = data.get("supports") if isinstance(data.get("supports"), dict) else {}
                protocol = {**protocol}
                if adapter:
                    protocol["adapter"] = adapter
                if endpoint_path:
                    protocol["endpointPath"] = endpoint_path
                if status_endpoint_path:
                    protocol["statusEndpointPath"] = status_endpoint_path
                if upload_mode:
                    protocol["uploadMode"] = upload_mode
                models.append({
                    "id": model_id,
                    "configId": path.stem,
                    "modelKey": model_id,
                    "identityKey": str(reg.get("identityKey") or model_id or "").strip(),
                    "name": alias or model_id or real_model,
                    "label": label,
                    "displayName": label,
                    "model": real_model or alias,
                    "nick": str(data.get("nick") or data.get("nickname") or data.get("displayName") or label or "").strip(),
                    "url": url,
                    "baseUrl": url,
                    "key": key,
                    "type": str(data.get("type") or "").strip(),
                    "adapter": adapter,
                    "endpointPath": endpoint_path,
                    "statusEndpointPath": status_endpoint_path,
                    "uploadMode": upload_mode,
                    "uploadStrategy": upload_strategy,
                    "supports": supports,
                    "imageApiMode": str(data.get("imageApiMode") or data.get("apiStyle") or "").strip(),
                    "capabilities": data.get("capabilities") if isinstance(data.get("capabilities"), dict) else {},
                    "modelAssembly": data.get("modelAssembly") if isinstance(data.get("modelAssembly"), dict) else {},
                    "protocol": protocol,
                    "ui": ui,
                    "note": note,
                    "source": "server",
                })
        except Exception:
            continue
    return models


def _read_midjourney_prompt_skill() -> str:
    try:
        return MIDJOURNEY_PROMPT_SKILL_PATH.read_text(encoding="utf-8")
    except Exception:
        return ""


def _tokenize_prompt_for_wordlists(text: str) -> list[str]:
    raw = str(text or "").lower()
    tokens = set(re.findall(r"[a-z0-9][a-z0-9_-]{2,}", raw))
    for chunk in re.findall(r"[\u4e00-\u9fff]{2,}", raw):
        if len(chunk) <= 8:
            tokens.add(chunk)
        else:
            for size in (2, 3, 4):
                for i in range(0, max(0, len(chunk) - size + 1)):
                    tokens.add(chunk[i : i + size])
    return sorted(tokens, key=len, reverse=True)[:80]


def _flatten_mj_wordlist_items(path: Path) -> list[dict[str, str]]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []
    out: list[dict[str, str]] = []

    def push(keyword: object, usage: object = "", category: str = "") -> None:
        key = str(keyword or "").strip()
        if not key:
            return
        out.append({"keyword": key, "usage": str(usage or "").strip(), "category": category})

    def visit(value: object, category: str = "") -> None:
        if isinstance(value, dict):
            next_category = str(value.get("name") or value.get("id") or category or "").strip()
            if "keyword" in value:
                push(value.get("keyword"), value.get("usage"), category)
            for key, item in value.items():
                if key in {"keyword", "usage", "_meta"}:
                    continue
                visit(item, next_category)
        elif isinstance(value, list):
            for item in value:
                visit(item, category)
        elif isinstance(value, str):
            push(value, "", category)

    visit(data)
    return out


def _collect_midjourney_wordlist_hints(prompt: str, style_text: str = "") -> list[dict[str, str]]:
    tokens = _tokenize_prompt_for_wordlists(f"{prompt}\n{style_text}")
    wanted_files = [
        "subject-action.json",
        "art-style.json",
        "camera-composition.json",
        "lighting-atmosphere.json",
        "color-palette.json",
        "material-texture.json",
        "quality-render.json",
        "negative-prompts.json",
        "mj-params.json",
        "preset-recipes.json",
    ]
    fallback_categories = re.compile(r"preset|quality|画质|品质|aspect|param|negative|负面|构图|景别|镜头|光影|动漫|国漫|写实|电影", re.I)
    scored: list[tuple[int, dict[str, str]]] = []
    seen: set[str] = set()
    for name in wanted_files:
        path = WORDLISTS_DIR / name
        for item in _flatten_mj_wordlist_items(path):
            keyword = item["keyword"]
            if keyword in seen:
                continue
            hay = f"{keyword} {item.get('usage', '')} {item.get('category', '')}".lower()
            score = sum(1 for token in tokens if token and token in hay)
            if score <= 0 and fallback_categories.search(hay):
                score = 1
            if score <= 0:
                continue
            seen.add(keyword)
            scored.append((score, {"source": name, **item}))
    scored.sort(key=lambda pair: (pair[0], len(pair[1]["keyword"])), reverse=True)
    return [item for _score, item in scored[:70]]


def _midjourney_smart_llm_config(payload: dict[str, object]) -> dict[str, str]:
    raw = payload.get("llmModel") if isinstance(payload.get("llmModel"), dict) else {}
    env_base = os.environ.get("MIDJOURNEY_SMART_LLM_BASE_URL") or os.environ.get("GPT55_BASE_URL") or os.environ.get("OPENAI_BASE_URL") or ""
    env_key = os.environ.get("MIDJOURNEY_SMART_LLM_API_KEY") or os.environ.get("GPT55_API_KEY") or os.environ.get("OPENAI_API_KEY") or ""
    env_model = os.environ.get("MIDJOURNEY_SMART_LLM_MODEL") or os.environ.get("GPT55_MODEL") or "gpt-5.5"
    if env_key and not env_base:
        env_base = "https://api.openai.com/v1"
    if env_base or env_key:
        return {
            "baseUrl": str(env_base).strip(),
            "apiKey": str(env_key).strip(),
            "model": str(env_model).strip() or "gpt-5.5",
            "endpointPath": "/chat/completions",
        }
    if raw:
        protocol = raw.get("protocol") if isinstance(raw.get("protocol"), dict) else {}
        return {
            "baseUrl": str(raw.get("baseUrl") or raw.get("url") or "").strip(),
            "apiKey": str(raw.get("apiKey") or raw.get("key") or raw.get("token") or "").strip(),
            "model": str(raw.get("model") or raw.get("name") or "gpt-5.5").strip(),
            "endpointPath": str(raw.get("endpointPath") or protocol.get("endpointPath") or "/chat/completions").strip(),
        }
    llm_models = [m for m in list_image_studio_models() if str(m.get("type") or "").strip().lower() in {"llm", "chat", "language", "text"}]
    if not llm_models:
        llm_models = [m for m in list_image_studio_models() if re.search(r"gpt|gemini|grok|claude|qwen|llm|chat|语言", " ".join(str(m.get(k) or "") for k in ("id", "name", "model", "label", "adapter")), re.I)]
    def rank(model: dict[str, str]) -> int:
        text = " ".join(str(model.get(k) or "") for k in ("id", "name", "model", "label", "adapter")).lower()
        if "gpt-5.5" in text or "gpt5.5" in text:
            return 50
        if "gpt-5" in text or "gpt5" in text:
            return 40
        if "gpt" in text:
            return 30
        if "gemini" in text:
            return 20
        return 10
    picked = sorted(llm_models, key=rank, reverse=True)[0] if llm_models else {}
    protocol = picked.get("protocol") if isinstance(picked.get("protocol"), dict) else {}
    return {
        "baseUrl": str(picked.get("baseUrl") or picked.get("url") or "").strip(),
        "apiKey": str(picked.get("key") or "").strip(),
        "model": str(picked.get("model") or env_model or "gpt-5.5").strip(),
        "endpointPath": str(picked.get("endpointPath") or protocol.get("endpointPath") or "/chat/completions").strip(),
    }


def _join_endpoint(base_url: str, endpoint_path: str) -> str:
    base = str(base_url or "").strip()
    path = str(endpoint_path or "/chat/completions").strip() or "/chat/completions"
    if path.startswith("http://") or path.startswith("https://"):
        return path
    if not base:
        return ""
    return f"{base.rstrip('/')}/{path.lstrip('/')}"


def _extract_chat_content(response: dict[str, object]) -> str:
    choices = response.get("choices")
    if isinstance(choices, list) and choices:
        first = choices[0] if isinstance(choices[0], dict) else {}
        message = first.get("message") if isinstance(first.get("message"), dict) else {}
        content = message.get("content") or first.get("text")
        if isinstance(content, list):
            return "".join(str(part.get("text") if isinstance(part, dict) else part) for part in content)
        return str(content or "").strip()
    output = response.get("output")
    if isinstance(output, list):
        parts: list[str] = []
        for item in output:
            if not isinstance(item, dict):
                continue
            for content in item.get("content") or []:
                if isinstance(content, dict) and content.get("text"):
                    parts.append(str(content.get("text")))
        if parts:
            return "\n".join(parts).strip()
    return str(response.get("text") or response.get("content") or "").strip()


def _parse_jsonish(text: str) -> dict[str, object]:
    raw = str(text or "").strip()
    raw = re.sub(r"^```(?:json)?\s*", "", raw, flags=re.I)
    raw = re.sub(r"\s*```$", "", raw)
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:
        match = re.search(r"\{.*\}", raw, re.S)
        if not match:
            return {}
        try:
            data = json.loads(match.group(0))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}


def _infer_midjourney_aspect_ratio(prompt: str) -> str:
    text = str(prompt or "").lower()
    if re.search(r"竖屏|手机|短视频|封面|全身|海报|portrait|vertical|full body|poster|cover", text):
        return "9:16"
    if re.search(r"头像|图标|logo|徽章|方形|headshot|icon|avatar|square", text):
        return "1:1"
    if re.search(r"超宽|全景|史诗|横版|电影|场景|环境|panorama|ultrawide|wide|landscape|cinematic|environment", text):
        return "16:9"
    return "16:9"


def _normalize_midjourney_aspect_ratio(value: object) -> str:
    match = re.match(r"^\s*(\d+(?:\.\d+)?)\s*[:/x×]\s*(\d+(?:\.\d+)?)\s*$", str(value or ""), re.I)
    if not match:
        return ""
    width = float(match.group(1))
    height = float(match.group(2))
    if width <= 0 or height <= 0:
        return ""
    return f"{match.group(1)}:{match.group(2)}"


def _is_niji_midjourney_model(image_model: object, label: str = "") -> bool:
    text = f"{json.dumps(image_model, ensure_ascii=False) if isinstance(image_model, dict) else image_model} {label}".lower()
    return "niji" in text or "二次元" in text or "动漫" in text


def _midjourney_version_key_from_params(params: str, image_model: object = None, label: str = "") -> str:
    raw = str(params or "").lower()
    niji_match = re.search(r"--niji\s+(\d+(?:\.\d+)?)", raw, re.I)
    if niji_match:
        return f"niji{niji_match.group(1)}"
    version_match = re.search(r"--(?:v|version)\s+(\d+(?:\.\d+)?)", raw, re.I)
    if version_match:
        return f"v{version_match.group(1)}"
    model_text = f"{json.dumps(image_model, ensure_ascii=False) if isinstance(image_model, dict) else image_model} {label}".lower()
    if re.search(r"v\s*8\.1|v8\.1|8\.1", model_text):
        return "v8.1"
    return "niji7" if _is_niji_midjourney_model(image_model or {}, label) else "v7"


def _midjourney_major_version_from_params(params: str, image_model: object = None, label: str = "") -> float:
    raw = _midjourney_version_key_from_params(params, image_model, label)
    match = re.search(r"(?:v|niji)(\d+(?:\.\d+)?)", raw, re.I)
    if match:
        try:
            return float(match.group(1))
        except ValueError:
            return 7.0
    return 7.0 if _is_niji_midjourney_model(image_model or {}, label) else 7.0


def _midjourney_smart_quality_for_params(params: str, image_model: object = None, label: str = "") -> str:
    version_key = _midjourney_version_key_from_params(params, image_model, label)
    if version_key.startswith("niji"):
        return "1"
    if version_key == "v8.1":
        return ""
    return "4" if _midjourney_major_version_from_params(params, image_model, label) >= 7 else "2"


def _default_midjourney_params_for_model(image_model: object, label: str = "") -> str:
    version_key = _midjourney_version_key_from_params("", image_model, label)
    if version_key.startswith("niji"):
        return "--niji 7 --s 100 --q 1"
    if version_key == "v8.1":
        return "--v 8.1 --raw --s 100 --c 6"
    return "--v 7 --raw --s 100 --c 6 --q 4"


def _strip_managed_midjourney_params(params: str) -> str:
    raw = f" {str(params or '').strip()} "
    raw = re.sub(r"\s+--(?:v|version|niji)\s+\S+", " ", raw, flags=re.I)
    raw = re.sub(r"\s+--style\s+raw\b", " ", raw, flags=re.I)
    raw = re.sub(r"\s+--(?:s|stylize)\s+-?\d+(?:\.\d+)?", " ", raw, flags=re.I)
    raw = re.sub(r"\s+--(?:c|chaos)\s+-?\d+(?:\.\d+)?", " ", raw, flags=re.I)
    raw = re.sub(r"\s+--(?:q|quality)\s+-?\d+(?:\.\d+)?", " ", raw, flags=re.I)
    raw = re.sub(r"\s+--iw\s+-?\d+(?:\.\d+)?", " ", raw, flags=re.I)
    raw = re.sub(r"\s+--hd\b", " ", raw, flags=re.I)
    raw = re.sub(r"\s+--(?:ar|aspect)\s+\d+(?:\.\d+)?\s*[:/x×]\s*\d+(?:\.\d+)?", " ", raw, flags=re.I)
    return re.sub(r"\s+", " ", raw).strip()


def _strip_midjourney_url_param_text(params: str, name: str) -> str:
    return re.sub(rf"\s+--{re.escape(name)}\s+.*?(?=\s+--[a-z][a-z0-9-]*\b|$)", " ", params, flags=re.I)


def _sanitize_midjourney_params_for_version(params: str, image_model: object, image_model_label: str) -> str:
    text = re.sub(r"\s+", " ", str(params or "").replace("--style raw", "--raw").strip())
    version_key = _midjourney_version_key_from_params(text, image_model, image_model_label)
    is_niji = version_key.startswith("niji")
    major = _midjourney_major_version_from_params(text, image_model, image_model_label)
    if version_key == "v8.1":
        for name in ("q", "quality", "cw", "ow"):
            text = re.sub(rf"\s+--{name}\s+\S+", " ", text, flags=re.I)
        for name in ("cref", "oref"):
            text = _strip_midjourney_url_param_text(text, name)
        text = re.sub(r"\s+--hd\b", " ", text, flags=re.I)
    elif is_niji and major >= 7:
        for name in ("raw", "hd"):
            text = re.sub(rf"\s+--{name}\b", " ", text, flags=re.I)
        for name in ("c", "chaos", "cw", "ow"):
            text = re.sub(rf"\s+--{name}\s+\S+", " ", text, flags=re.I)
        for name in ("cref", "oref"):
            text = _strip_midjourney_url_param_text(text, name)
        text = re.sub(r"\s+--(?:q|quality)\s+(?!0?\.25\b|0?\.5\b|1(?:\.0+)?\b)\S+", " --q 1", text, flags=re.I)
    return re.sub(r"\s+", " ", text).strip()


def _normalize_midjourney_params(params: str, aspect_ratio: str, image_model: object, image_model_label: str, runtime: object = None) -> str:
    raw = re.sub(r"\s+", " ", str(params or "").strip())
    aspect = _normalize_midjourney_aspect_ratio(aspect_ratio) or "16:9"
    runtime_command = ""
    if isinstance(runtime, dict):
        runtime_command = re.sub(r"\s+", " ", str(runtime.get("command") or "").strip())
    if runtime_command:
        extras = _strip_managed_midjourney_params(raw)
        return _sanitize_midjourney_params_for_version(f"{extras} --ar {aspect} {runtime_command}", image_model, image_model_label)
    if not re.search(r"--(?:ar|aspect)\s+\S+", raw, re.I):
        raw = f"{raw} --ar {aspect}".strip()
    if not re.search(r"--(?:v|version|niji)\s+\S+", raw, re.I):
        raw = f"{raw} {'--niji 7' if _is_niji_midjourney_model(image_model, image_model_label) else '--v 8.1' if _midjourney_version_key_from_params('', image_model, image_model_label) == 'v8.1' else '--v 7'}".strip()
    if not _is_niji_midjourney_model(image_model, image_model_label) and not re.search(r"--style\s+\S+", raw, re.I):
        raw = f"{raw} --raw".strip()
    if not re.search(r"--q(?:uality)?\s+\S+", raw, re.I):
        quality = _midjourney_smart_quality_for_params(raw, image_model, image_model_label)
        if quality:
            raw = f"{raw} --q {quality}".strip()
    return _sanitize_midjourney_params_for_version(raw, image_model, image_model_label)


_MIDJOURNEY_POLICY_RISK_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    (r"\bage\s*(?:18|19|20)\s*(?:to|-|–|—)\s*(?:20|21)\b", "young adult"),
    (r"\b(?:teenage|teenager|minor|underage)\b", "young adult"),
    (r"\b(?:child|children|kid|kids)\s+(soldier|warrior|fighter|infantryman|combatant)\b", r"young adult \1"),
    (r"\bsmall amount of blood on (?:his|her|their) face\b", "dust and battle marks on the face"),
    (r"\bblood[-\s]*moon\s+red\s+light\b", "crimson moonlight"),
    (r"\bblood[-\s]*moon\b", "crimson moon"),
    (r"\bcrimson\s+moon\s+red\s+light\b", "crimson moonlight"),
    (r"\bblood[-\s]*red\b", "deep crimson"),
    (r"\bbloodstained\b", "battle-worn"),
    (r"\bbloody\b", "battle-worn"),
    (r"\bblood\s+(?:splatter|splatters|spray|stains?)\b", "impact debris and battle marks"),
    (r"\bblood\b", "battle grime"),
    (r"\b(?:gore|gory|viscera|dismemberment|dismembered|severed)\b", "non-graphic battle damage"),
    (r"\b(?:corpse|dead body|dead bodies)\b", "fallen silhouettes"),
    (r"\bopen wounds?\b", "visible scratches"),
    (r"\bwounds?\b", "scratches"),
    (r"\binjur(?:ed|y|ies)\b", "battle-worn"),
    (r"\bmature old man\b", "unrelated older character"),
    (r"\bold man\b", "unrelated older character"),
    (r"\bfeminine appearance\b", "different character identity"),
)


def _sanitize_midjourney_policy_risk_prompt(prompt: str) -> str:
    text = str(prompt or "")
    if not text.strip():
        return ""
    parts = re.split(r"(https?://\S+)", text)
    sanitized: list[str] = []
    for part in parts:
        if re.match(r"^https?://", part or "", re.I):
            sanitized.append(part)
            continue
        segment = part
        for pattern, replacement in _MIDJOURNEY_POLICY_RISK_REPLACEMENTS:
            segment = re.sub(pattern, replacement, segment, flags=re.I)
        sanitized.append(segment)
    return re.sub(r"\s+", " ", "".join(sanitized)).strip()


def _fallback_midjourney_prompt(payload: dict[str, object], reason: str = "") -> dict[str, object]:
    prompt = str(payload.get("prompt") or "").strip()
    style_text = str(payload.get("styleText") or "").strip()
    runtime = payload.get("midjourneyRuntime") if isinstance(payload.get("midjourneyRuntime"), dict) else {}
    aspect_ratio = _normalize_midjourney_aspect_ratio(payload.get("aspectRatio") or payload.get("size")) or _infer_midjourney_aspect_ratio(f"{prompt}\n{style_text}")
    base = "Create a high-quality image that faithfully follows the user's original description"
    if style_text:
        base += f", with this user-provided style note preserved: {style_text}"
    english_prompt = _sanitize_midjourney_policy_risk_prompt(f"{base}: {prompt}. Clean composition, clear subject, cinematic lighting, high detail, sharp focus, professional color grading")
    params = _normalize_midjourney_params("", aspect_ratio, payload.get("imageModel"), str(payload.get("imageModelLabel") or ""), runtime)
    version_key = _midjourney_version_key_from_params(params, payload.get("imageModel"), str(payload.get("imageModelLabel") or ""))
    version_label = f"Niji {version_key.replace('niji', '')}" if version_key.startswith("niji") else f"V{version_key.replace('v', '')}"
    warnings = [f"GPT-5.5 smart prompt service unavailable; used conservative Midjourney {version_label} fallback."]
    if reason:
        if re.search(r"HTTP\s*(?:Error\s*)?400|Bad Request|上游请求失败", reason, re.I):
            warnings.append("智能提示词上游拒绝了本次请求，已使用本地兼容提示词。")
        else:
            warnings.append(reason[:180])
    return {
        "prompt": english_prompt,
        "params": params,
        "aspectRatio": aspect_ratio,
        "qualityProfile": "high",
        "fidelityCheck": "保守保留原始描述，只补充通用画质、光影和构图要求。",
        "warnings": warnings,
    }


def run_smart_midjourney_prompt(payload: dict[str, object]) -> dict[str, object]:
    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("请先输入自然语言画面描述")
    style_text = str(payload.get("styleText") or "").strip()
    image_model = payload.get("imageModel") if isinstance(payload.get("imageModel"), dict) else {}
    image_model_label = str(payload.get("imageModelLabel") or "").strip()
    runtime = payload.get("midjourneyRuntime") if isinstance(payload.get("midjourneyRuntime"), dict) else {}
    selected_aspect = _normalize_midjourney_aspect_ratio(payload.get("aspectRatio") or payload.get("size")) or _infer_midjourney_aspect_ratio(f"{prompt}\n{style_text}")
    runtime_command = re.sub(r"\s+", " ", str(runtime.get("command") or "").strip()) if isinstance(runtime, dict) else ""
    default_params = _default_midjourney_params_for_model(image_model, image_model_label)
    expected_params = re.sub(r"\s+", " ", f"--ar {selected_aspect} {runtime_command or default_params}").strip()
    expected_params = _sanitize_midjourney_params_for_version(expected_params, image_model, image_model_label)
    hints = _collect_midjourney_wordlist_hints(prompt, style_text)
    hint_text = "\n".join(
        f"- [{item.get('source')} / {item.get('category')}] {item.get('keyword')} — {item.get('usage')}"
        for item in hints
    )
    skill_text = _read_midjourney_prompt_skill()
    llm_config = _midjourney_smart_llm_config(payload)
    endpoint = _join_endpoint(llm_config.get("baseUrl", ""), llm_config.get("endpointPath", ""))
    if not endpoint:
        return {"ok": True, "result": _fallback_midjourney_prompt(payload, "未配置 GPT-5.5 / LLM API 地址"), "usedFallback": True, "wordlistHints": hints[:24]}
    headers = {"Content-Type": "application/json", "User-Agent": "studio-workbench/1.0"}
    if llm_config.get("apiKey"):
        headers["Authorization"] = f"Bearer {llm_config['apiKey']}"
    messages = [
        {
            "role": "system",
            "content": (
                "You are a Midjourney prompt optimizer for a manga/comic production canvas. "
                "The user's natural-language prompt is the highest-priority source of intent. "
                "Preserve the user's explicit subject, identity, action, setting, era, relationship, emotion, style, and composition before doing any Midjourney optimization. "
                "Use the supplied skill, reference resources, and wordlist candidates only when they match the user's intent. "
                "Never let reference images, @resources, wordlists, or style terms override the user's text. "
                "Never change the user's subject, action, setting, identity, style, emotion, era, composition, or story meaning. "
                "Avoid Midjourney policy-risk wording: rewrite blood/bloody/bloodstained/gore/wound/corpse as non-graphic battle-worn, dust, scratches, scuffed armor, crimson light; rewrite teenage/minor combat roles as young adult. "
                "Return JSON only."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Skill:\n{skill_text[:9000]}\n\n"
                f"User natural-language prompt:\n{prompt}\n\n"
                f"Optional user style text:\n{style_text or '(none)'}\n\n"
                f"Selected image model:\n{json.dumps(image_model, ensure_ascii=False)[:2200]}\n{image_model_label}\n\n"
                f"Selected MJ runtime parameters (hard constraint, do not change version or aspect ratio):\n{expected_params}\n\n"
                f"Candidate wordlist terms from this workspace. Select only fitting terms; ignore the rest:\n{hint_text[:9000]}\n\n"
                "Before returning, perform a fidelity check: the English prompt must still visibly describe the user's original subject, action, setting, and style. "
                "Before returning, sanitize unsafe Midjourney wording without changing intent: do not output blood/bloody/bloodstained/wound/gore/corpse, and do not combine teenage/minor/child with combat, weapons, injury, or blood. "
                "If any reference/resource/wordlist term conflicts with the user's text, remove or down-weight that term and mention it in warnings. "
                "The fidelityCheck field must explain in Chinese which original user elements were preserved.\n\n"
                "Return exactly this JSON shape: "
                f'{{"prompt":"English MJ prompt without URLs","params":"{expected_params}","aspectRatio":"{selected_aspect}","qualityProfile":"high","fidelityCheck":"中文一句话说明如何保持原意","warnings":[]}}'
            ),
        },
    ]
    request_payload = {
        "model": llm_config.get("model") or "gpt-5.5",
        "messages": messages,
        "temperature": 0.2,
    }
    try:
        body = json.dumps(request_payload, ensure_ascii=False).encode("utf-8")
        req = Request(endpoint, data=body, headers=headers, method="POST")
        with urlopen(req, timeout=180) as response:
            raw_response = response.read().decode("utf-8")
        response_payload = json.loads(raw_response) if raw_response else {}
        data = _parse_jsonish(_extract_chat_content(response_payload))
        if not data:
            raise ValueError("LLM 未返回 JSON")
    except Exception as exc:  # noqa: BLE001
        return {"ok": True, "result": _fallback_midjourney_prompt(payload, str(exc)), "usedFallback": True, "wordlistHints": hints[:24]}
    aspect_ratio = selected_aspect
    data["aspectRatio"] = aspect_ratio
    raw_prompt = str(data.get("prompt") or data.get("englishPrompt") or data.get("midjourneyPrompt") or "")
    safe_prompt = _sanitize_midjourney_policy_risk_prompt(raw_prompt)
    if safe_prompt:
        data["prompt"] = safe_prompt
    data["params"] = _normalize_midjourney_params(str(data.get("params") or data.get("midjourneyParams") or ""), aspect_ratio, image_model, image_model_label, runtime)
    data["qualityProfile"] = str(data.get("qualityProfile") or "high")
    if not isinstance(data.get("warnings"), list):
        data["warnings"] = []
    if raw_prompt and safe_prompt and raw_prompt.strip() != safe_prompt.strip():
        data["warnings"].insert(0, "已将可能触发 Midjourney 社区策略的血腥/未成年战斗表述改写为非血腥战损表达。")
    return {
        "ok": True,
        "result": data,
        "usedFallback": False,
        "llmModel": llm_config.get("model") or "gpt-5.5",
        "wordlistHints": hints[:24],
    }


def pick_directory() -> str:
    scripts = [
        'try\nPOSIX path of (choose folder with prompt "请选择生图结果保存目录")\non error errMsg number errNum\nreturn "__ERROR__" & errNum & ":" & errMsg\nend try',
        'try\nset chosenFolder to choose folder with prompt "请选择生图结果保存目录"\nreturn POSIX path of chosenFolder\non error errMsg number errNum\nreturn "__ERROR__" & errNum & ":" & errMsg\nend try',
    ]
    last_error = "选择目录失败"
    for script in scripts:
        result = subprocess.run(
            ["osascript", "-e", script],
            check=False,
            capture_output=True,
            text=True,
        )
        output = (result.stdout or result.stderr or "").strip()
        if result.returncode == 0 and output and not output.startswith("__ERROR__"):
            return output
        if output.startswith("__ERROR__"):
            if output.startswith("__ERROR__-128:"):
                raise ValueError("已取消选择目录")
            last_error = output.replace("__ERROR__", "", 1)
        elif output:
            last_error = output
    raise ValueError(last_error or "选择目录失败")



def load_wordlist(wordlist_id: str) -> dict[str, object]:
    if not WORDLISTS_DIR.exists():
        raise ValueError("词库目录不存在")
    filename = wordlist_id.strip().removesuffix(".json") + ".json"
    safe = Path(filename).name
    path = WORDLISTS_DIR / safe
    if not path.exists():
        raise ValueError(f"词库不存在：{wordlist_id}")
    return json.loads(path.read_text(encoding="utf-8"))


def load_wordlist_index() -> dict[str, object]:
    index_path = WORDLISTS_DIR / "index.json"
    if not index_path.exists():
        return {"dimensions": []}
    return json.loads(index_path.read_text(encoding="utf-8"))


def enrich_image_studio_saved(saved: dict[str, object] | None) -> dict[str, object]:
    if not saved:
        return {}
    path_str = str(saved.get("path") or "")
    if not path_str:
        if saved.get("remoteUrl") and not saved.get("url"):
            saved["url"] = saved.get("remoteUrl")
        return saved
    p = Path(path_str).expanduser()
    if not p.is_absolute():
        p = (STUDIO_DIR / p).resolve()
    else:
        p = p.resolve()
    saved["path"] = str(p)
    if p.exists() and (p == WORKSPACE_ROOT or WORKSPACE_ROOT in p.parents):
        saved["url"] = to_workspace_url(p)
        saved["localUrl"] = saved["url"]
        saved["localPath"] = str(p)
    elif saved.get("remoteUrl"):
        saved["url"] = saved.get("remoteUrl")
    return saved


def prepare_image_saved_for_async_download(saved: dict[str, object], output_dir: str) -> dict[str, object]:
    if not saved:
        return {}
    remote_url = str(saved.get("remoteUrl") or saved.get("url") or "").strip()
    if remote_url and not saved.get("path"):
        task_id = register_image_download_task(saved, output_dir)
        saved["imageTaskId"] = task_id
        saved["downloadStatus"] = "downloading"
        saved["downloadProgress"] = 1
        saved["localUrl"] = ""
        saved["localPath"] = ""
        saved["url"] = remote_url
        start_image_background_download(task_id)
    elif saved.get("path"):
        saved["downloadStatus"] = "completed"
        saved["downloadProgress"] = 100
        saved["localUrl"] = saved.get("url") or ""
        saved["localPath"] = saved.get("path") or ""
    return saved


def _path_from_local_file_url(url: str) -> str:
    try:
        parsed = urlparse(str(url or ""))
        if parsed.path == "/api/workbench/image-studio/file":
            return (parse_qs(parsed.query).get("path") or [""])[0]
    except Exception:
        return ""
    return ""


def ensure_local_image_file(payload: dict[str, object], request_origin: str = "") -> dict[str, object]:
    local_path_raw = str(payload.get("localPath") or payload.get("path") or "").strip()
    remote_url = str(payload.get("remoteUrl") or payload.get("url") or "").strip()
    data_url = str(payload.get("dataUrl") or payload.get("data_url") or "").strip()
    output_dir = str(payload.get("outputDir") or "").strip()
    if not local_path_raw:
        local_path_raw = _path_from_local_file_url(remote_url)
    if local_path_raw:
        local_path = Path(local_path_raw).expanduser()
        if not local_path.is_absolute():
            local_path = (STUDIO_DIR / local_path_raw).resolve()
        else:
            local_path = local_path.resolve()
        if local_path.exists() and local_path.is_file():
            saved = enrich_image_studio_saved({
                "filename": local_path.name,
                "path": str(local_path),
                "url": image_studio_file_url(local_path),
                "localUrl": image_studio_file_url(local_path),
                "localPath": str(local_path),
                "remoteUrl": remote_url,
                "fileSize": local_path.stat().st_size,
                "sourceType": "existing_local_image",
            })
            return {"ok": True, "exists": True, "downloaded": False, "localPath": str(local_path), "localUrl": saved.get("localUrl") or saved.get("url"), "remoteUrl": remote_url, "saved": saved}
    if not remote_url and data_url:
        if not data_url.startswith("data:image/"):
            raise ValueError("图片数据格式不正确，无法落盘")
        from image_studio_backend import _detect_image_dimensions
        binary, ext = decode_data_url_to_bytes(data_url)
        target_dir = resolve_image_studio_output_dir(output_dir)
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        target_path = target_dir / f"image-ref-{timestamp}-{uuid.uuid4().hex[:8]}{ext}"
        tmp_path = target_path.with_suffix(target_path.suffix + ".part")
        tmp_path.write_bytes(binary)
        tmp_path.replace(target_path)
        try:
            width, height = _detect_image_dimensions(binary)
        except Exception:
            width, height = 0, 0
        saved: dict[str, object] = {
            "filename": target_path.name,
            "path": str(target_path.resolve()),
            "url": image_studio_file_url(target_path),
            "localUrl": image_studio_file_url(target_path),
            "localPath": str(target_path.resolve()),
            "remoteUrl": "",
            "fileSize": target_path.stat().st_size,
            "sourceType": "data_url_reference_image",
            "downloadStatus": "completed",
            "downloadProgress": 100,
        }
        if width and height:
            saved["width"] = width
            saved["height"] = height
            saved["actualSize"] = f"{width}x{height}"
        return {"ok": True, "exists": True, "downloaded": False, "localPath": saved["localPath"], "localUrl": saved["localUrl"], "remoteUrl": "", "saved": saved}
    if not remote_url:
        raise ValueError("缺少可用图片来源：本地路径不存在，且没有可下载的在线地址")
    download_url = remote_url
    if download_url.startswith("/"):
        if not request_origin:
            raise ValueError("在线地址是相对路径，缺少本地服务 Origin，无法补下载")
        download_url = request_origin.rstrip("/") + download_url
    from image_studio_backend import _detect_image_dimensions, _download_binary, _guess_extension_from_content_type
    binary, content_type = _download_binary(download_url, timeout=18, retries=1)
    target_dir = resolve_image_studio_output_dir(output_dir)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    ext = _guess_extension_from_content_type(content_type, ".png")
    target_path = target_dir / f"image-ref-{timestamp}-{uuid.uuid4().hex[:8]}{ext}"
    tmp_path = target_path.with_suffix(target_path.suffix + ".part")
    tmp_path.write_bytes(binary)
    tmp_path.replace(target_path)
    width, height = _detect_image_dimensions(binary)
    saved: dict[str, object] = {
        "filename": target_path.name,
        "path": str(target_path.resolve()),
        "url": image_studio_file_url(target_path),
        "localUrl": image_studio_file_url(target_path),
        "localPath": str(target_path.resolve()),
        "remoteUrl": remote_url,
        "fileSize": target_path.stat().st_size,
        "sourceType": "downloaded_reference_image",
        "downloadStatus": "completed",
        "downloadProgress": 100,
    }
    if width and height:
        saved["width"] = width
        saved["height"] = height
        saved["actualSize"] = f"{width}x{height}"
    return {"ok": True, "exists": True, "downloaded": True, "localPath": saved["localPath"], "localUrl": saved["localUrl"], "remoteUrl": remote_url, "saved": saved}


def _resolve_existing_local_file(local_path_raw: str) -> Path:
    local_path = Path(local_path_raw).expanduser()
    if not local_path.is_absolute():
        local_path = (STUDIO_DIR / local_path_raw).resolve()
    else:
        local_path = local_path.resolve()
    if not local_path.exists() or not local_path.is_file():
        raise ValueError(f"本地图片不存在：{local_path}")
    return local_path


def upload_local_file_to_provider(payload: dict[str, object]) -> dict[str, object]:
    local_path_raw = str(payload.get("localPath") or payload.get("path") or "").strip()
    if not local_path_raw:
        raise ValueError("缺少 localPath")
    local_path = _resolve_existing_local_file(local_path_raw)
    data = local_path.read_bytes()
    base_url = str(payload.get("baseUrl") or payload.get("base_url") or DEFAULT_BASE_URL).strip()
    api_key = str(payload.get("apiKey") or payload.get("api_key") or DEFAULT_API_KEY).strip()
    purpose = str(payload.get("purpose") or "vision").strip() or "vision"
    return upload_file_to_provider(data, local_path.name, "", purpose, base_url, api_key)


def upload_local_file_to_object_storage(payload: dict[str, object]) -> dict[str, object]:
    local_path_raw = str(payload.get("localPath") or payload.get("path") or "").strip()
    if not local_path_raw:
        raise ValueError("缺少 localPath")
    local_path = _resolve_existing_local_file(local_path_raw)
    data = local_path.read_bytes()
    try:
        if __package__:
            from .object_storage_uploader import upload_reference_image
        else:
            from object_storage_uploader import upload_reference_image
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"对象存储上传模块不可用：{exc}") from exc
    uploaded = upload_reference_image(data, local_path.name, "")
    remote_url = str(uploaded.get("remoteUrl") or uploaded.get("url") or uploaded.get("fileId") or uploaded.get("id") or "").strip()
    if not remote_url.startswith(("http://", "https://")):
        raise ValueError("对象存储未返回公网 URL")
    return {
        "ok": True,
        **uploaded,
        "remoteUrl": remote_url,
        "url": remote_url,
        "fileId": remote_url,
        "providerRef": remote_url,
        "uploadRef": remote_url,
    }


def create_object_storage_upload_target(payload: dict[str, object]) -> dict[str, object]:
    filename = Path(str(payload.get("filename") or payload.get("name") or "reference.png")).name
    content_type = str(payload.get("contentType") or payload.get("mimeType") or payload.get("type") or "").strip()
    try:
        size = int(float(str(payload.get("size") or payload.get("bytes") or 0).strip() or 0))
    except (TypeError, ValueError):
        size = 0
    try:
        if __package__:
            from .object_storage_uploader import create_upload_target
        else:
            from object_storage_uploader import create_upload_target
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"对象存储上传模块不可用：{exc}") from exc
    target = create_upload_target(filename, content_type, size)
    remote_url = str(target.get("remoteUrl") or target.get("url") or target.get("publicUrl") or "").strip()
    if not remote_url.startswith(("http://", "https://")):
        raise ValueError("对象存储未返回公网 URL")
    return {
        "ok": True,
        **target,
        "remoteUrl": remote_url,
        "url": remote_url,
        "fileId": remote_url,
        "providerRef": remote_url,
        "uploadRef": remote_url,
    }


def _video_frame_suffix(filename: str, content_type: str = "") -> str:
    suffix = Path(filename or "").suffix.lower()
    if suffix in {".mp4", ".mov", ".webm", ".m4v", ".avi", ".mkv"}:
        return suffix
    if "quicktime" in content_type:
        return ".mov"
    if "webm" in content_type:
        return ".webm"
    return ".mp4"


def _capture_local_video_frame_file(video_path: Path, at: float = 0, max_width: int = 0) -> dict[str, object]:
    ffmpeg_bin = os.environ.get("FFMPEG_BIN", "ffmpeg")
    temp_dir = Path(os.environ.get("TMPDIR") or "/tmp") / f"canvas-video-frame-{uuid.uuid4().hex[:8]}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    frame_path = temp_dir / "frame.jpg"
    at_value = max(0.0, float(at or 0))
    seek_candidates: list[float] = []
    for value in (at_value, at_value - 0.05, at_value - 0.2):
        clamped = max(0.0, value)
        if all(abs(clamped - existing) > 0.001 for existing in seek_candidates):
            seek_candidates.append(clamped)
    try:
        last_error = ""
        for seek_at in seek_candidates:
            if frame_path.exists():
                frame_path.unlink()
            cmd = [
                ffmpeg_bin,
                "-hide_banner",
                "-loglevel",
                "error",
                "-ss",
                f"{seek_at:.3f}",
                "-i",
                str(video_path),
                "-frames:v",
                "1",
                "-q:v",
                "2",
            ]
            if max_width > 0:
                cmd.extend(["-vf", f"scale='min({max_width},iw)':-2"])
            cmd.append(str(frame_path))
            result = subprocess.run(cmd, check=False, capture_output=True, text=True, timeout=45)
            last_error = (result.stderr or result.stdout or "").strip()
            if result.returncode == 0 and frame_path.exists() and frame_path.stat().st_size > 0:
                data = frame_path.read_bytes()
                data_url = "data:image/jpeg;base64," + base64.b64encode(data).decode("ascii")
                return {"ok": True, "dataUrl": data_url, "width": 0, "height": 0, "contentType": "image/jpeg"}
        detail = f"：{last_error}" if last_error else ""
        raise ValueError(f"本地 ffmpeg 未截到视频画面{detail}")
    except FileNotFoundError as exc:
        raise ValueError("本机未找到 ffmpeg，请先安装 ffmpeg 或配置 FFMPEG_BIN") from exc
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def capture_uploaded_video_frame(handler: "WorkbenchRequestHandler") -> dict[str, object]:
    data, filename, field_content_type, _purpose = read_multipart_upload_file(handler)
    if not data:
        raise ValueError("上传视频为空")
    suffix = _video_frame_suffix(filename, field_content_type)
    temp_dir = Path(os.environ.get("TMPDIR") or "/tmp") / f"canvas-video-frame-src-{uuid.uuid4().hex[:8]}"
    temp_dir.mkdir(parents=True, exist_ok=True)
    video_path = temp_dir / f"source{suffix}"
    try:
        video_path.write_bytes(data)
        query = parse_qs(urlparse(handler.path).query)
        try:
            at = float((query.get("at") or [handler.headers.get("X-Video-Frame-Time", "0")])[0] or 0)
        except (TypeError, ValueError):
            at = 0.0
        try:
            max_width = int((query.get("maxWidth") or query.get("max_width") or [handler.headers.get("X-Video-Frame-Max-Width", "0")])[0] or 0)
        except (TypeError, ValueError):
            max_width = 0
        return _capture_local_video_frame_file(video_path, at, max_width)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def run_video_generation(payload: dict[str, object]) -> dict[str, object]:
    """Seedance 2.0 视频生成入口（兼容旧同步接口）。"""
    output_dir_param = str(payload.get("outputDir") or "").strip()
    if output_dir_param:
        output_dir_path = Path(output_dir_param).expanduser()
        if not output_dir_path.is_absolute():
            output_dir_path = (STUDIO_DIR / output_dir_param).resolve()
        else:
            output_dir_path = output_dir_path.resolve()
        output_dir_path.mkdir(parents=True, exist_ok=True)
    else:
        output_dir_path = IMAGE_STUDIO_OUTPUTS_DIR / ".tmp"
    output_dir_path.mkdir(parents=True, exist_ok=True)

    result = generate_video(payload, output_dir_path)
    result["saved"] = enrich_image_studio_saved(result.get("saved"))
    return {
        "ok": True,
        "action": "text2video",
        "result": result,
    }


def run_video_generation_start(payload: dict[str, object]) -> dict[str, object]:
    """提交视频异步任务：只返回任务信息，不下载视频。"""
    config = build_video_config(payload)
    result = start_video_generation_task({**payload, "baseUrl": config.endpoint_url, "apiKey": config.api_key, "model": config.model, "adapter": config.adapter, "requestMethod": config.request_method})
    task_id = str(result.get("taskId") or result.get("providerTaskId") or "")
    if not task_id:
        task_id = f"video-{uuid.uuid4().hex[:16]}"
        result["taskId"] = task_id
        result["providerTaskId"] = task_id
    output_dir = str(payload.get("outputDir") or "").strip()
    meta = dict(result.get("meta") or {})
    content_endpoint = str(result.get("contentEndpoint") or result.get("contentUrl") or result.get("downloadUrl") or "").strip()
    with VIDEO_TASKS_LOCK:
        VIDEO_TASKS[task_id] = {
            "taskId": task_id,
            "providerTaskId": result.get("providerTaskId") or task_id,
            "statusEndpoint": result.get("statusEndpoint") or "",
            "contentEndpoint": content_endpoint,
            "outputDir": output_dir,
            "downloadStatus": "waiting",
            "downloadProgress": 0,
            "downloadError": "",
            "adapter": config.adapter,
            "coverUrl": result.get("coverUrl") or "",
            "contentAuthRequired": meta.get("contentAuthRequired", True),
            **meta,
        }
    return result


def get_video_task(task_id: str) -> dict[str, object] | None:
    with VIDEO_TASKS_LOCK:
        task = VIDEO_TASKS.get(task_id)
        return dict(task) if task else None


def run_video_provider_payload_preview(payload: dict[str, object]) -> dict[str, object]:
    """返回最终真实提交给视频服务商的 JSON body，和 generate_video 共用后端转换规则。"""
    config = build_video_config(payload)
    provider_payload = build_video_provider_request_body({**payload, "baseUrl": config.endpoint_url, "apiKey": config.api_key, "model": config.model, "adapter": config.adapter, "requestMethod": config.request_method}, config)
    endpoint_url = _seedance_full_submit_url(config.endpoint_url) if _is_seedance_full_adapter(config.adapter) else config.endpoint_url
    return {
        "ok": True,
        "provider": config.adapter,
        "endpointUrl": endpoint_url,
        "method": "POST",
        "headersPreview": {
            "Authorization": "Bearer ***" if config.api_key else "",
            "Content-Type": "application/json",
        },
        "json": provider_payload,
    }


def _is_local_workbench_image_ref(value: object) -> bool:
    ref = str(value or "").strip()
    lowered = ref.lower()
    if not lowered:
        return False
    if lowered.startswith("data:") or lowered.startswith("blob:"):
        return True
    if lowered.startswith("/"):
        return lowered.startswith("/api/workbench/") or lowered.startswith("/v1/images/results/")
    try:
        parsed = urlparse(ref)
        return parsed.hostname in {"localhost", "127.0.0.1", "0.0.0.0"} or parsed.path.startswith("/api/workbench/") or parsed.path.startswith("/v1/images/results/")
    except Exception:
        return False


def _is_provider_image_ref(value: object) -> bool:
    ref = str(value or "").strip()
    if not ref:
        return False
    lowered = ref.lower()
    if _is_local_workbench_image_ref(ref):
        return False
    return ref.startswith("file-") or lowered.startswith("http://") or lowered.startswith("https://")


def _assert_no_local_image_refs(payload: dict[str, object], action: str) -> None:
    if action not in {"img2img", "panorama", "repair"}:
        return
    protocol = payload.get("protocol") if isinstance(payload.get("protocol"), dict) else {}
    adapter = str(protocol.get("adapter") or "").strip()
    upload_mode = str(protocol.get("uploadMode") or protocol.get("upload_mode") or payload.get("uploadMode") or payload.get("upload_mode") or "").strip()
    if not upload_mode:
        upload_mode = "object_storage" if adapter in {"gpt-image-v2", "gemini-image", "midjourney-imagine"} else "files"
    expected_ref = "对象存储公网 URL" if upload_mode == "object_storage" else "/v1/files 上传后的 file-xxx"
    raw_images = payload.get("image") or payload.get("images") or []
    if isinstance(raw_images, str):
        raw_images = [raw_images]
    candidates: list[object] = []
    if isinstance(raw_images, list):
        for item in raw_images:
            if isinstance(item, dict):
                candidates.extend([item.get("uploadRef"), item.get("providerRef"), item.get("fileId"), item.get("id"), item.get("file_id"), item.get("remoteUrl"), item.get("url"), item.get("image")])
            else:
                candidates.append(item)
    mask = payload.get("mask")
    if mask:
        candidates.append(mask)
    bad_refs = [str(item).strip() for item in candidates if _is_local_workbench_image_ref(item)]
    if bad_refs:
        raise ValueError("参考图必须先转换为" + expected_ref + "，不能把本地预览 URL、data/blob 或 localhost 地址直接提交给模型：" + bad_refs[0])


def _collect_image_file_refs(payload: dict[str, object]) -> list[str]:
    raw_images = payload.get("reference_images") or payload.get("image") or payload.get("images") or []
    refs: list[str] = []
    if isinstance(raw_images, str):
        raw_images = [raw_images]
    if isinstance(raw_images, list):
        for item in raw_images:
            if isinstance(item, str):
                candidates = [item]
            elif isinstance(item, dict):
                candidates = [
                    item.get("uploadRef"),
                    item.get("providerRef"),
                    item.get("fileId"),
                    item.get("id"),
                    item.get("file_id"),
                    item.get("remoteUrl"),
                    item.get("url"),
                    item.get("image"),
                ]
            else:
                candidates = []
            for candidate in candidates:
                value = str(candidate or "").strip()
                if _is_provider_image_ref(value) and value not in refs:
                    refs.append(value)
                    break
    return refs


def run_image_provider_payload_preview(payload: dict[str, object]) -> dict[str, object]:
    """返回最终真实提交给图像服务商的 OpenAI 兼容 JSON body。"""
    action = str(payload.get("action") or payload.get("mode") or "txt2img").strip() or "txt2img"
    if action == "imageToPanorama":
        action = "panorama"
    if action in {"repair", "refine", "inpaint", "edit", "edits", "imgedit"}:
        action = "repair"
    image_refs = [] if action == "txt2img" else _collect_image_file_refs(payload)
    mask = str(payload.get("mask") or "").strip() or None
    config, provider_payload = build_image_payload(payload, images=image_refs, mask=mask)
    # 按 adapter 决定实际 endpoint，并与真实请求共用 endpoint_path 拼接规则。
    headers = _json_headers(config.api_key)
    if config.adapter == "gemini-image":
        endpoint_url = build_endpoint_url(config, f"/v1beta/models/{config.model}:generateContent")
    elif config.adapter == "aiyunzhi-gemini-image":
        endpoint_url = build_endpoint_url(config, f"/v1beta/models/{config.model}:generateContent", force_default=True)
    elif config.adapter == "aiyunzhi-firefly-gpt-image":
        endpoint_url = build_endpoint_url(config, "/v1/chat/completions", force_default=True)
    elif config.adapter == "aiyunzhi-gpt-image-2":
        has_refs = bool(provider_payload.get("image")) if isinstance(provider_payload, dict) else False
        endpoint_url = build_endpoint_url(config, "/v1/images/edits" if has_refs else "/v1/images/generations", force_default=True)
        if has_refs:
            headers = {**headers, "Content-Type": "multipart/form-data; boundary=..."}
    elif config.adapter == "gpt-image-v2":
        endpoint_url = build_endpoint_url(config, "/images/generations")
    elif config.adapter == "midjourney-imagine":
        endpoint_url = build_endpoint_url(config, "/mj/submit/imagine")
    else:
        endpoint_suffix = "/images/generations" if config.adapter == "openai-generations" else "/images/edits"
        endpoint_url = build_endpoint_url(config, endpoint_suffix)
    summary = _debug_request_summary(endpoint_url, "POST", headers, provider_payload)
    return {
        "ok": True,
        "provider": "image-studio",
        "endpointUrl": endpoint_url,
        "method": "POST",
        "headersPreview": summary.get("headers", {}),
        "json": summary.get("payload", provider_payload),
        "uploadedCount": len(image_refs),
    }


def _guess_upload_mime_type(filename: str, content_type: str) -> str:
    cleaned = str(content_type or "").split(";", 1)[0].strip().lower()
    if cleaned.startswith("image/"):
        return cleaned
    suffix = Path(filename or "").suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".webp":
        return "image/webp"
    return "image/png"


def store_uploaded_file(data: bytes, filename: str, content_type: str, purpose: str = "vision") -> dict[str, object]:
    if not data:
        raise ValueError("上传文件为空")
    safe_filename = Path(str(filename or "reference.png")).name or "reference.png"
    mime_type = _guess_upload_mime_type(safe_filename, content_type)
    if not mime_type.startswith("image/"):
        raise ValueError("/v1/files 当前仅支持图片文件")
    file_id = f"file-{uuid.uuid4().hex[:24]}"
    IMAGE_STUDIO_FILES_DIR.mkdir(parents=True, exist_ok=True)
    bin_path = IMAGE_STUDIO_FILES_DIR / f"{file_id}.bin"
    meta_path = IMAGE_STUDIO_FILES_DIR / f"{file_id}.json"
    bin_path.write_bytes(data)
    meta = {
        "id": file_id,
        "object": "file",
        "bytes": len(data),
        "created_at": int(datetime.now().timestamp()),
        "filename": safe_filename,
        "purpose": str(purpose or "vision").strip() or "vision",
        "mime_type": mime_type,
        "path": str(bin_path.resolve()),
    }
    meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        **meta,
        "fileId": file_id,
        "url": file_id,
        "remoteUrl": file_id,
        "contentType": mime_type,
        "size": len(data),
    }


def read_multipart_upload_form(handler: "WorkbenchRequestHandler") -> tuple[bytes, str, str, str, str, str]:
    content_type = handler.headers.get("Content-Type", "")
    if "multipart/form-data" not in content_type:
        raise ValueError("上传参考图必须使用 multipart/form-data")
    form = cgi.FieldStorage(
        fp=handler.rfile,
        headers=handler.headers,
        environ={
            "REQUEST_METHOD": "POST",
            "CONTENT_TYPE": content_type,
            "CONTENT_LENGTH": handler.headers.get("Content-Length", "0"),
        },
    )
    item = form["file"] if "file" in form else None
    if item is None or not getattr(item, "file", None):
        raise ValueError("缺少上传字段 file")
    filename = Path(str(item.filename or "reference.png")).name
    data = item.file.read()
    field_content_type = str(getattr(item, "type", "") or "")
    purpose = str(form.getvalue("purpose") or "vision").strip() or "vision"
    base_url = str(form.getvalue("baseUrl") or form.getvalue("base_url") or DEFAULT_BASE_URL).strip()
    api_key = str(form.getvalue("apiKey") or form.getvalue("api_key") or DEFAULT_API_KEY).strip()
    return data, filename, field_content_type, purpose, base_url, api_key


def read_multipart_upload_file(handler: "WorkbenchRequestHandler") -> tuple[bytes, str, str, str]:
    data, filename, field_content_type, purpose, _base_url, _api_key = read_multipart_upload_form(handler)
    return data, filename, field_content_type, purpose


def upload_file_to_provider(data: bytes, filename: str, content_type: str, purpose: str, base_url: str, api_key: str) -> dict[str, object]:
    if not data:
        raise ValueError("上传文件为空")
    safe_filename = Path(str(filename or "reference.png")).name or "reference.png"
    mime_type = _guess_upload_mime_type(safe_filename, content_type)
    if not mime_type.startswith("image/"):
        raise ValueError("/v1/files 当前仅支持图片文件")
    config = build_config({"baseUrl": base_url, "apiKey": api_key, "model": DEFAULT_MODEL}, require_api_key=True)
    
    # 修复：对于视频模型的 base_url（包含 /videos），不使用 /files 端点
    # 视频模型的参考图应该通过腾讯云 COS 上传，获取公网 URL
    if "/videos" in config.base_url:
        raise ValueError(
            "视频模型的参考图不支持通过 /v1/files 上传到外部 API。\n"
            "请切换到 COS（对象存储）模式：在工作台右上角点击 'FILES' 按钮切换到 'COS' 模式，\n"
            "这样参考图会先上传到腾讯云 COS 获取公网 URL，然后直接传递给视频生成 API。"
        )
    
    endpoint = f"{config.base_url}/files"
    boundary = f"----mjbFilesBoundary{uuid.uuid4().hex}"
    body = b"".join([
        f"--{boundary}\r\n".encode("utf-8"),
        b'Content-Disposition: form-data; name="purpose"\r\n\r\n',
        str(purpose or "vision").encode("utf-8"),
        b"\r\n",
        f"--{boundary}\r\n".encode("utf-8"),
        f'Content-Disposition: form-data; name="file"; filename="{safe_filename}"\r\n'.encode("utf-8"),
        f"Content-Type: {mime_type}\r\n\r\n".encode("utf-8"),
        data,
        b"\r\n",
        f"--{boundary}--\r\n".encode("utf-8"),
    ])
    headers = {
        "Authorization": f"Bearer {config.api_key}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "User-Agent": "image-studio/1.0",
    }
    request = Request(endpoint, data=body, headers=headers, method="POST")
    try:
        with urlopen(request, timeout=300) as response:
            raw = response.read().decode("utf-8")
            payload = json.loads(raw) if raw else {}
    except HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="ignore")
        raise ValueError(f"Files API 上传失败 HTTP {exc.code}: {error_body}") from exc
    file_id = str(payload.get("id") or payload.get("fileId") or payload.get("file_id") or "").strip()
    if not file_id.startswith("file-"):
        raise ValueError(f"Files API 未返回有效 file-xxx：{json.dumps(payload, ensure_ascii=False)[:500]}")
    return {
        **payload,
        "ok": True,
        "id": file_id,
        "fileId": file_id,
        "providerRef": file_id,
        "uploadRef": file_id,
        "remoteUrl": file_id,
        "url": file_id,
        "contentType": payload.get("mime_type") or payload.get("contentType") or mime_type,
        "mime_type": payload.get("mime_type") or payload.get("contentType") or mime_type,
        "size": payload.get("bytes") or payload.get("size") or len(data),
        "bytes": payload.get("bytes") or payload.get("size") or len(data),
        "filename": payload.get("filename") or safe_filename,
        "purpose": payload.get("purpose") or purpose or "vision",
    }


def read_multipart_reference_upload(handler: "WorkbenchRequestHandler") -> dict[str, object]:
    data, filename, field_content_type, purpose, base_url, api_key = read_multipart_upload_form(handler)
    return upload_file_to_provider(data, filename, field_content_type, purpose, base_url, api_key)


def get_object_storage_status() -> dict[str, object]:
    provider = os.environ.get("OBJECT_STORAGE_PROVIDER", "s3").strip() or "s3"
    required = {
        "endpointUrl": bool(os.environ.get("OBJECT_STORAGE_ENDPOINT_URL", "").strip()),
        "accessKeyId": bool(os.environ.get("OBJECT_STORAGE_ACCESS_KEY_ID", "").strip()),
        "secretAccessKey": bool(os.environ.get("OBJECT_STORAGE_SECRET_ACCESS_KEY", "").strip()),
        "bucket": bool(os.environ.get("OBJECT_STORAGE_BUCKET", "").strip()),
        "publicBaseUrl": bool(os.environ.get("OBJECT_STORAGE_PUBLIC_BASE_URL", "").strip()),
    }
    configured = all(required.values())
    return {
        "ok": True,
        "enabled": configured,
        "configured": configured,
        "provider": provider,
        "bucket": os.environ.get("OBJECT_STORAGE_BUCKET", "").strip(),
        "region": os.environ.get("OBJECT_STORAGE_REGION", "").strip(),
        "publicBaseUrl": os.environ.get("OBJECT_STORAGE_PUBLIC_BASE_URL", "").strip(),
        "prefix": os.environ.get("OBJECT_STORAGE_PREFIX", "mjb-reference").strip(),
        "maxBytes": 0,
        "maxBytesUnlimited": True,
        "missing": [name for name, present in required.items() if not present],
        "mode": "object_storage",
    }


def run_image_generation(payload: dict[str, object]) -> dict[str, object]:
    action = str(payload.get("action") or payload.get("mode") or "txt2img").strip() or "txt2img"
    if action == "imageToPanorama":
        action = "panorama"
    if action in {"repair", "refine", "inpaint", "edit", "edits", "imgedit"}:
        action = "repair"
    if action not in {"txt2img", "img2img", "panorama", "repair"}:
        raise ValueError("生图 action 仅支持 txt2img、img2img、panorama 或 repair")

    # 优先存到用户指定的图库目录；未指定时降级到临时目录
    output_dir_param = str(payload.get("outputDir") or "").strip()
    temp_output_dir = resolve_image_studio_output_dir(output_dir_param) if output_dir_param else IMAGE_STUDIO_OUTPUTS_DIR / ".tmp"
    temp_output_dir.mkdir(parents=True, exist_ok=True)

    if action == "txt2img":
        clean_payload = dict(payload)
        clean_payload.pop("image", None)
        clean_payload.pop("images", None)
        clean_payload.pop("reference_images", None)
        clean_payload.pop("mask", None)
        result = generate_from_text(clean_payload, temp_output_dir)
        result["saved"] = prepare_image_saved_for_async_download(enrich_image_studio_saved(result.get("saved")), output_dir_param)
        return {
            "ok": True,
            "action": action,
            "result": result,
        }

    _assert_no_local_image_refs(payload, action)
    reference_images = _collect_image_file_refs(payload)
    if not reference_images:
        protocol = payload.get("protocol") if isinstance(payload.get("protocol"), dict) else {}
        adapter = str(protocol.get("adapter") or "").strip()
        upload_mode = str(protocol.get("uploadMode") or protocol.get("upload_mode") or payload.get("uploadMode") or payload.get("upload_mode") or "").strip()
        if not upload_mode:
            upload_mode = "object_storage" if adapter in {"gpt-image-v2", "gemini-image", "midjourney-imagine"} else "files"
        expected_ref = "公网 URL" if upload_mode == "object_storage" else "file-xxx"
        raise ValueError(f"该模式需要先上传参考图并获得 {expected_ref}，不能直接使用本地预览 URL")

    if action == "panorama":
        result = generate_panorama(payload, reference_images, temp_output_dir)
        result["saved"] = prepare_image_saved_for_async_download(enrich_image_studio_saved(result.get("saved")), output_dir_param)
        result["uploadedCount"] = len(reference_images)
        return {
            "ok": True,
            "action": action,
            "result": result,
        }

    if action == "repair":
        result = repair_image(payload, reference_images, temp_output_dir, str(payload.get("mask") or "").strip() or None)
        result["saved"] = prepare_image_saved_for_async_download(enrich_image_studio_saved(result.get("saved")), output_dir_param)
        result["uploadedCount"] = len(reference_images)
        return {
            "ok": True,
            "action": action,
            "result": result,
        }

    result = edit_image(payload, reference_images, temp_output_dir)
    result["saved"] = prepare_image_saved_for_async_download(enrich_image_studio_saved(result.get("saved")), output_dir_param)
    result["uploadedCount"] = len(reference_images)
    return {
        "ok": True,
        "action": action,
        "result": result,
    }


def _openai_image_error(message: str, status: HTTPStatus = HTTPStatus.BAD_REQUEST) -> tuple[dict[str, object], HTTPStatus]:
    return {"error": {"message": f"Invalid request: {message}", "type": "invalid_request_error"}}, status


def _validate_openai_image_request(payload: dict[str, object]) -> dict[str, object]:
    allowed = {
        "model",
        "prompt",
        "image",
        "reference_images",
        "mask",
        "size",
        "n",
        "background",
        "response_format",
        "baseUrl",
        "apiKey",
        "outputDir",
        "protocol",
        "quality",
        "style",
        "outputFormat",
        "output_format",
        "aspect_ratio",
        "aspectRatio",
        "resolution",
        "imageSize",
        "reasoning_effort",
        "reasoningEffort",
        "requestedRatio",
        "requested_ratio",
        "requestedResolution",
        "requested_resolution",
        "requestedPixelSize",
        "requested_pixel_size",
        "mjPromptImageUrls",
        "midjourneyPromptImageUrls",
        "mj_prompt_image_urls",
        "midjourney_prompt_image_urls",
        "mjReferencePlan",
        "mj_reference_plan",
    }
    clean_payload = {key: value for key, value in payload.items() if key in allowed}
    prompt = str(clean_payload.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("prompt is required")
    image_value = clean_payload.get("reference_images") or clean_payload.get("image")
    if image_value is not None:
        if isinstance(image_value, str):
            image_value = [image_value]
        if not isinstance(image_value, list) or any(not isinstance(item, str) for item in image_value):
            raise ValueError("image/reference_images must be an array of strings")
        normalized_images = [str(item or "").strip() for item in image_value if str(item or "").strip()]
        for ref in normalized_images:
            if ref.startswith("/") or ref.startswith("file:/"):
                raise ValueError("image/reference_images cannot be a local file path")
        if normalized_images:
            clean_payload["image"] = normalized_images
            clean_payload["reference_images"] = normalized_images
        else:
            clean_payload.pop("image", None)
            clean_payload.pop("reference_images", None)
    mask_value = str(clean_payload.get("mask") or "").strip()
    if mask_value:
        if not clean_payload.get("image"):
            raise ValueError("mask requires image")
        if mask_value.startswith("/") or mask_value.startswith("file:/"):
            raise ValueError("image cannot be a local file path")
        clean_payload["mask"] = mask_value
    else:
        clean_payload.pop("mask", None)
    size = str(clean_payload.get("size") or DEFAULT_SIZE).strip().replace("×", "x") or DEFAULT_SIZE
    clean_payload["size"] = size
    if clean_payload.get("n") is not None:
        try:
            n_value = int(clean_payload.get("n") or 1)
        except (TypeError, ValueError) as exc:
            raise ValueError("n must be an integer between 1 and 4") from exc
        if n_value < 1 or n_value > 4:
            raise ValueError("n must be an integer between 1 and 4")
        clean_payload["n"] = n_value
    response_format = str(clean_payload.get("response_format") or "url").strip() or "url"
    if response_format not in {"url", "b64_json"}:
        raise ValueError("response_format must be url or b64_json")
    clean_payload["response_format"] = response_format
    background = str(clean_payload.get("background") or "auto").strip() or "auto"
    if background not in {"auto", "transparent"}:
        raise ValueError("background must be auto or transparent")
    clean_payload["background"] = background
    return clean_payload


def run_openai_images_edits(payload: dict[str, object]) -> dict[str, object]:
    clean_payload = _validate_openai_image_request(payload)
    images = clean_payload.get("reference_images") or clean_payload.get("image")
    config, request_payload = build_image_payload(clean_payload, images=images, mask=str(clean_payload.get("mask") or "") or None)
    if config.adapter != "gpt-image-v2" and clean_payload.get("response_format"):
        request_payload["response_format"] = clean_payload.get("response_format")
    response_payload = _request_image_generation_with_size_fallback(config, request_payload)
    output_dir_param = str(payload.get("outputDir") or "").strip()
    output_dir = resolve_image_studio_output_dir(output_dir_param) if output_dir_param else IMAGE_STUDIO_OUTPUTS_DIR / ".tmp"
    image_prefix = "img2img" if request_payload.get("image") else "txt2img"
    saved = enrich_image_studio_saved(_save_openai_image_response(response_payload, output_dir, image_prefix, config.base_url))
    saved = prepare_image_saved_for_async_download(saved, output_dir_param)
    return {"ok": True, "created": response_payload.get("created") or int(datetime.now().timestamp()), "data": response_payload.get("data") or [], "result": {"mode": image_prefix, "prompt": request_payload.get("prompt") or "", "size": request_payload.get("size") or "", "model": request_payload.get("model") or "", "saved": saved, "rawResponse": response_payload}}


def _save_openai_image_response(response_payload: dict[str, object], output_dir: Path, prefix: str, base_url: str = "") -> dict[str, object]:
    output_dir.mkdir(parents=True, exist_ok=True)
    return _save_response_image(response_payload, output_dir, prefix, base_url)


def read_workspace_text(relative_path: str) -> str:
    if not relative_path:
        raise ValueError("缺少文件路径")
    path = (WORKSPACE_ROOT / relative_path).resolve()
    if not path.exists() or not path.is_file():
        raise ValueError(f"文件不存在：{relative_path}")
    if WORKSPACE_ROOT not in path.parents and path != WORKSPACE_ROOT:
        raise ValueError("禁止读取工作区外文件")
    return path.read_text(encoding="utf-8")


class ReadableHtmlParser(HTMLParser):
    SKIP_TAGS = {"script", "style", "noscript", "svg", "canvas", "template"}
    BLOCK_TAGS = {"article", "aside", "blockquote", "br", "dd", "div", "dl", "dt", "figcaption", "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section", "table", "td", "th", "tr", "ul"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.skip_depth = 0
        self.title_parts: list[str] = []
        self.meta_description = ""
        self.headings: list[str] = []
        self.parts: list[str] = []
        self._in_title = False
        self._heading_tag = ""
        self._heading_parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        attrs_dict = {str(k or "").lower(): str(v or "") for k, v in attrs}
        if tag in self.SKIP_TAGS:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return
        if tag == "title":
            self._in_title = True
        elif tag in {"h1", "h2", "h3"}:
            self._heading_tag = tag
            self._heading_parts = []
        elif tag == "meta":
            key = (attrs_dict.get("name") or attrs_dict.get("property") or "").lower()
            if key in {"description", "og:description", "twitter:description"} and not self.meta_description:
                self.meta_description = normalize_extracted_url_text(attrs_dict.get("content") or "")
        if tag in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in self.SKIP_TAGS and self.skip_depth:
            self.skip_depth -= 1
            return
        if self.skip_depth:
            return
        if tag == "title":
            self._in_title = False
        elif tag == self._heading_tag:
            heading = normalize_extracted_url_text("".join(self._heading_parts))
            if heading and heading not in self.headings:
                self.headings.append(heading)
            self._heading_tag = ""
            self._heading_parts = []
        if tag in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self.skip_depth:
            return
        text = normalize_extracted_url_text(data)
        if not text:
            return
        if self._in_title:
            self.title_parts.append(text)
        if self._heading_tag:
            self._heading_parts.append(text)
        self.parts.append(text)


def normalize_extracted_url_text(text: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(str(text or ""))).strip()


def _looks_like_supported_url_content_type(content_type: str) -> bool:
    cleaned = str(content_type or "").split(";", 1)[0].strip().lower()
    if not cleaned:
        return True
    return cleaned.startswith("text/") or cleaned in {
        "application/json",
        "application/ld+json",
        "application/xhtml+xml",
        "application/xml",
        "application/rss+xml",
        "application/atom+xml",
    }


def _validate_extractable_url(raw_url: str) -> str:
    value = str(raw_url or "").strip()
    if not value:
        raise ValueError("缺少 URL")
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("只支持 http(s) 网页 URL")
    host = (parsed.hostname or "").lower()
    if not host or host in {"localhost", "127.0.0.1", "0.0.0.0", "::1"}:
        raise ValueError("URL 不能指向本机地址")
    return value


def summarize_extracted_url_text(text: str, description: str = "") -> str:
    cleaned = normalize_extracted_url_text(text)
    if description:
        return normalize_extracted_url_text(description)[:700]
    sentences = re.split(r"(?<=[。！？.!?])\s+", cleaned)
    picked: list[str] = []
    for sentence in sentences:
        sentence = sentence.strip()
        if len(sentence) < 18:
            continue
        if re.search(r"cookie|隐私政策|订阅|登录|注册|copyright|all rights reserved", sentence, re.I):
            continue
        picked.append(sentence)
        if len(" ".join(picked)) >= 700 or len(picked) >= 5:
            break
    return normalize_extracted_url_text(" ".join(picked) or cleaned[:700])


def extract_url_content(raw_url: str) -> dict[str, object]:
    url = _validate_extractable_url(raw_url)
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) StudioWorkbench/1.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.2",
        },
        method="GET",
    )
    with urlopen(request, timeout=15) as response:
        content_type = response.headers.get("Content-Type") or ""
        if not _looks_like_supported_url_content_type(content_type):
            raise ValueError(f"URL 内容不是可解析网页文本：{content_type or 'unknown'}")
        charset = response.headers.get_content_charset() or "utf-8"
        raw = response.read(1024 * 1024 * 2 + 1)
        truncated = len(raw) > 1024 * 1024 * 2
        if truncated:
            raw = raw[:1024 * 1024 * 2]
        body = raw.decode(charset, errors="replace")
        final_url = response.geturl() or url
    parser = ReadableHtmlParser()
    try:
        parser.feed(body)
        parser.close()
    except Exception:
        pass
    text = normalize_extracted_url_text("\n".join(parser.parts))
    if not text:
        text = normalize_extracted_url_text(re.sub(r"<[^>]+>", " ", body))
    title = normalize_extracted_url_text(" ".join(parser.title_parts))
    headings = [h for h in parser.headings if h][:18]
    description = parser.meta_description
    summary = summarize_extracted_url_text(text, description)
    return {
        "ok": True,
        "url": url,
        "finalUrl": final_url,
        "title": title,
        "description": description,
        "summary": summary,
        "headings": headings,
        "text": text[:30000],
        "excerpt": text[:5000],
        "contentType": content_type,
        "contentLength": len(text),
        "truncated": truncated or len(text) > 30000,
        "extractedAt": datetime.now().isoformat(timespec="seconds"),
    }


class WorkbenchRequestHandler(SimpleHTTPRequestHandler):
    server_version = "StudioWorkbench/1.0"

    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def translate_path(self, path: str) -> str:
        parsed_path = urlparse(path).path
        rel_path = parsed_path.lstrip("/")
        prefix = "tools/workbench-web/"
        if rel_path.startswith(prefix):
            prefixed_candidate = (WORKBENCH_OUTPUTS_DIR / rel_path[len(prefix):]).resolve()
            try:
                prefixed_candidate.relative_to(WORKBENCH_OUTPUTS_DIR.resolve())
            except ValueError:
                prefixed_candidate = None
            if prefixed_candidate and prefixed_candidate.exists():
                return str(prefixed_candidate)
        if rel_path:
            workbench_candidate = (WORKBENCH_OUTPUTS_DIR / rel_path).resolve()
            try:
                workbench_candidate.relative_to(WORKBENCH_OUTPUTS_DIR.resolve())
            except ValueError:
                workbench_candidate = None
            if workbench_candidate and workbench_candidate.exists():
                return str(workbench_candidate)
        return super().translate_path(path)

    def do_OPTIONS(self) -> None:
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        query = parse_qs(parsed.query)
        if parsed.path == "/api/workbench/health":
            self.respond_json(
                {
                    "ok": True,
                    "service": "studio-workbench-server",
                    "workspaceRoot": str(WORKSPACE_ROOT),
                    "outputsRoot": str(OUTPUTS_DIR),
                    "projectsRoot": str(PROJECTS_DIR),
                    "workbenchUrl": "/workbench.html",
                    "runPageUrl": WORKBENCH_RUN_PAGE,
                    "imageStudioUrl": "/image-studio.html",
                    "imageStudioCanvasUrl": "/image-studio-canvas.html",
                    "imageStudioCanvasNextUrl": "/image-studio-canvas-next.html",
                    "rootIndexUrl": "/index.html",
                    "availableProjects": discover_projects(),
                }
            )
            return
        if parsed.path == "/api/workbench/projects":
            self.respond_json({"ok": True, "projects": discover_projects()})
            return
        if parsed.path == "/api/workbench/image-studio/defaults":
            self.respond_json({"ok": True, "defaults": get_image_studio_defaults()})
            return
        if parsed.path == "/api/workbench/image-studio/object-storage-status":
            self.respond_json(get_object_storage_status())
            return
        if parsed.path == "/api/workbench/image-studio/models":
            self.respond_json({"ok": True, "models": list_image_studio_models()})
            return
        if parsed.path == "/api/workbench/image-studio/wordlist":
            wordlist_id = (query.get("id") or [""])[0]
            if not wordlist_id:
                self.respond_json({"ok": True, **load_wordlist_index()})
            else:
                try:
                    data = load_wordlist(wordlist_id)
                    self.respond_json({"ok": True, **data})
                except Exception as exc:
                    self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return
        if parsed.path == "/api/workbench/image-studio/pick-directory":
            try:
                self.respond_json({"ok": True, "directory": pick_directory()})
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return
        if parsed.path == "/api/workbench/image-studio/gallery":
            exclude = query.get("excludeSource", ["false"])[0].lower() in ("true", "1", "yes")
            output_dir_param = (query.get("outputDir") or [""])[0]
            self.respond_json({"ok": True, "items": list_image_studio_outputs(output_dir_param or None, exclude_source=exclude)})
            return
        if parsed.path == "/api/workbench/image-studio/image/status":
            try:
                task_id = (query.get("taskId") or [""])[0]
                task = get_image_task(task_id)
                if not task:
                    self.respond_json({"ok": False, "error": "图片任务不存在"}, status=HTTPStatus.NOT_FOUND)
                    return
                self.respond_json({
                    "ok": True,
                    "taskId": task_id,
                    "remoteUrl": task.get("remoteUrl") or "",
                    "localUrl": task.get("localUrl") or "",
                    "localPath": task.get("localPath") or "",
                    "downloadStatus": task.get("downloadStatus") or "waiting",
                    "downloadProgress": task.get("downloadProgress") or 0,
                    "downloadError": task.get("downloadError") or "",
                    "saved": task.get("saved") or {},
                })
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/workbench/image-studio/video/status":
            try:
                task_id = (query.get("taskId") or [""])[0]
                task = get_video_task(task_id)
                if not task:
                    self.respond_json({"ok": False, "error": "视频任务不存在"}, status=HTTPStatus.NOT_FOUND)
                    return
                result = get_video_generation_task_status(task)
                done = str(result.get("status") or "").lower() in {"completed", "succeeded", "success"}
                content_url = str(result.get("contentUrl") or result.get("downloadUrl") or "").strip()
                if content_url:
                    with VIDEO_TASKS_LOCK:
                        live_task = VIDEO_TASKS.get(task_id)
                        if live_task:
                            live_task["contentEndpoint"] = content_url
                            live_task["coverUrl"] = result.get("coverUrl") or live_task.get("coverUrl") or ""
                    task = get_video_task(task_id) or task
                if done and not task.get("localPath") and task.get("downloadStatus") not in {"downloading", "completed"}:
                    start_video_background_download(task_id, str(task.get("outputDir") or ""))
                    task = get_video_task(task_id) or task
                result["downloadStatus"] = task.get("downloadStatus") or "waiting"
                result["downloadProgress"] = task.get("downloadProgress") or 0
                result["downloadError"] = task.get("downloadError") or ""
                result["localPath"] = task.get("localPath") or ""
                result["localUrl"] = task.get("localUrl") or ""
                result["saved"] = task.get("saved") or {}
                self.respond_json(result)
            except (ValueError, ImageStudioError) as exc:
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/workbench/image-studio/video/proxy":
            try:
                remote_url = str((query.get("remoteUrl") or [""])[0] or "").strip()
                if not remote_url:
                    self.respond_json({"ok": False, "error": "缺少 remoteUrl"}, status=HTTPStatus.BAD_REQUEST)
                    return
                remote = urlparse(remote_url)
                if remote.scheme not in {"http", "https"} or not remote.netloc:
                    raise ValueError("视频代理地址无效")
                headers = {
                    "Accept": "video/mp4,video/*;q=0.9,*/*;q=0.8",
                    "Accept-Encoding": "identity",
                    "User-Agent": "image-studio/1.0",
                }
                range_header = self.headers.get("Range")
                if range_header:
                    headers["Range"] = range_header
                if_range_header = self.headers.get("If-Range")
                if if_range_header:
                    headers["If-Range"] = if_range_header
                request = Request(remote_url, headers=headers, method="GET")
                try:
                    response_ctx = urlopen(request, timeout=900)
                except HTTPError as exc:
                    if exc.code not in {206, 416}:
                        self.respond_json(
                            {"ok": False, "error": f"视频代理上游请求失败：HTTP {exc.code}"},
                            status=HTTPStatus.BAD_GATEWAY,
                        )
                        return
                    response_ctx = exc
                with response_ctx as response:
                    content_type = response.headers.get("Content-Type") or "video/mp4"
                    content_length = response.headers.get("Content-Length")
                    content_range = response.headers.get("Content-Range")
                    accept_ranges = response.headers.get("Accept-Ranges") or "bytes"
                    status_code = int(getattr(response, "status", getattr(response, "code", 200)) or 200)
                    if range_header and status_code == 200 and content_range:
                        status_code = 206
                    self.send_response(status_code)
                    self.send_header("Content-Type", content_type)
                    if content_length:
                        self.send_header("Content-Length", content_length)
                    if content_range:
                        self.send_header("Content-Range", content_range)
                    self.send_header("Cache-Control", "no-store")
                    self.send_header("Accept-Ranges", accept_ranges)
                    self.end_headers()
                    while True:
                        chunk = response.read(1024 * 256)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
            except ValueError as exc:
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": f"视频代理失败：{exc}"}, status=HTTPStatus.BAD_GATEWAY)
            return
        if parsed.path == "/api/workbench/image-studio/video/content":
            try:
                task_id = (query.get("taskId") or [""])[0]
                task = get_video_task(task_id)
                if not task:
                    self.respond_json({"ok": False, "error": "视频任务不存在"}, status=HTTPStatus.NOT_FOUND)
                    return
                local_path = str(task.get("localPath") or "").strip()
                if local_path:
                    media_path = Path(local_path).expanduser()
                    if not media_path.is_absolute():
                        media_path = (STUDIO_DIR / media_path).resolve()
                    else:
                        media_path = media_path.resolve()
                    if media_path.exists() and media_path.is_file():
                        self.path = image_studio_file_url(media_path)
                        return self.do_GET()
                content_endpoint = str(task.get("contentEndpoint") or "").strip()
                api_key = str(task.get("apiKey") or "").strip()
                content_auth_required = task.get("contentAuthRequired", True) is not False
                if not content_endpoint or (content_auth_required and not api_key):
                    self.respond_json({"ok": False, "error": "视频任务缺少 contentEndpoint 或 API Key"}, status=HTTPStatus.BAD_REQUEST)
                    return
                headers = {
                    "Accept": "video/mp4,video/*;q=0.9,*/*;q=0.8",
                    "User-Agent": "image-studio/1.0",
                }
                if content_auth_required:
                    headers["Authorization"] = f"Bearer {api_key}"
                range_header = self.headers.get("Range")
                if range_header:
                    headers["Range"] = range_header
                request = Request(content_endpoint, headers=headers, method="GET")
                try:
                    response_ctx = urlopen(request, timeout=900)
                except HTTPError as exc:
                    if exc.code not in {206, 416}:
                        raise
                    response_ctx = exc
                with response_ctx as response:
                    content_type = response.headers.get("Content-Type") or "video/mp4"
                    content_length = response.headers.get("Content-Length")
                    content_range = response.headers.get("Content-Range")
                    accept_ranges = response.headers.get("Accept-Ranges") or "bytes"
                    status_code = int(getattr(response, "status", getattr(response, "code", 200)) or 200)
                    if range_header and status_code == 200 and content_range:
                        status_code = 206
                    self.send_response(status_code)
                    self.send_header("Content-Type", content_type)
                    if content_length:
                        self.send_header("Content-Length", content_length)
                    if content_range:
                        self.send_header("Content-Range", content_range)
                    self.send_header("Cache-Control", "no-store")
                    self.send_header("Accept-Ranges", accept_ranges)
                    self.end_headers()
                    while True:
                        chunk = response.read(1024 * 256)
                        if not chunk:
                            break
                        self.wfile.write(chunk)
            except (ValueError, ImageStudioError) as exc:
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/workbench/image-studio/file":
            try:
                raw_path = (query.get("path") or [""])[0]
                if not raw_path:
                    self.respond_json({"ok": False, "error": "缺少图片路径"}, status=HTTPStatus.BAD_REQUEST)
                    return
                image_path = Path(raw_path).expanduser()
                if not image_path.is_absolute():
                    image_path = (STUDIO_DIR / image_path).resolve()
                else:
                    image_path = image_path.resolve()
                if not image_path.exists() or not image_path.is_file():
                    self.respond_json({"ok": False, "error": f"图片不存在：{image_path}"}, status=HTTPStatus.NOT_FOUND)
                    return
                suffix = image_path.suffix.lower()
                content_type = {
                    ".png": "image/png",
                    ".jpg": "image/jpeg",
                    ".jpeg": "image/jpeg",
                    ".webp": "image/webp",
                    ".gif": "image/gif",
                    ".mp4": "video/mp4",
                    ".webm": "video/webm",
                    ".mov": "video/quicktime",
                    ".avi": "video/x-msvideo",
                }.get(suffix, "application/octet-stream")
                file_size = image_path.stat().st_size
                is_video_file = suffix in {".mp4", ".webm", ".mov", ".avi"}
                max_w, max_h = preview_size_params(query)
                if suffix in IMAGE_FILE_SUFFIXES and (max_w > 0 or max_h > 0):
                    data, content_type = resize_image_for_preview(image_path.read_bytes(), content_type, max_w, max_h)
                    self.send_response(HTTPStatus.OK)
                    self.send_header("Content-Type", content_type)
                    self.send_header("Content-Length", str(len(data)))
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    self.wfile.write(data)
                    return
                range_header = self.headers.get("Range") if is_video_file else ""
                start = 0
                end = file_size - 1
                status_code = HTTPStatus.OK
                if range_header:
                    m = re.match(r"bytes=(\d*)-(\d*)", range_header)
                    if m:
                        if m.group(1):
                            start = int(m.group(1))
                            end = int(m.group(2) or end)
                        elif m.group(2):
                            suffix_len = int(m.group(2))
                            start = max(0, file_size - suffix_len)
                        end = min(end, file_size - 1)
                        if start > end or start >= file_size:
                            self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                            self.send_header("Content-Range", f"bytes */{file_size}")
                            self.end_headers()
                            return
                        status_code = HTTPStatus.PARTIAL_CONTENT
                content_length = max(0, end - start + 1)
                self.send_response(status_code)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(content_length))
                self.send_header("Cache-Control", "no-store")
                if is_video_file:
                    self.send_header("Accept-Ranges", "bytes")
                if status_code == HTTPStatus.PARTIAL_CONTENT:
                    self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
                self.end_headers()
                with image_path.open("rb") as fp:
                    fp.seek(start)
                    remaining = content_length
                    while remaining > 0:
                        chunk = fp.read(min(1024 * 256, remaining))
                        if not chunk:
                            break
                        self.wfile.write(chunk)
                        remaining -= len(chunk)
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return
        if parsed.path == "/api/workbench/image-studio/save-to-dir":
            try:
                body = self.read_json_body()
                source_path = body.get("sourcePath") or None
                remote_url = body.get("remoteUrl") or None
                output_dir = str(body.get("outputDir") or "").strip() or str(IMAGE_STUDIO_OUTPUTS_DIR)
                saved = save_to_user_dir(source_path, remote_url, output_dir)
                self.respond_json({"ok": True, "saved": saved})
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return
        if parsed.path == "/api/workbench/image-studio/proxy-image":
            """代理远程图片。GET 返回二进制给 img 标签；POST 返回 base64 给保存逻辑。"""
            try:
                if self.command == "GET":
                    remote_url = (query.get("remoteUrl") or [""])[0]
                    if not remote_url:
                        self.respond_json({"ok": False, "error": "缺少 remoteUrl"}, status=HTTPStatus.BAD_REQUEST)
                        return
                    from image_studio_backend import _download_binary
                    try:
                        binary, content_type = _download_binary(remote_url, timeout=8, retries=1)
                        content_type = content_type or "image/png"
                        max_w, max_h = preview_size_params(query)
                        if max_w > 0 or max_h > 0:
                            binary, content_type = resize_image_for_preview(binary, content_type, max_w, max_h)
                    except Exception as exc:
                        self.respond_json({"ok": False, "error": str(exc), "remoteUrl": remote_url}, status=HTTPStatus.BAD_GATEWAY)
                        return
                    self.send_response(HTTPStatus.OK)
                    self.send_header("Content-Type", content_type)
                    self.send_header("Content-Length", str(len(binary)))
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    self.wfile.write(binary)
                    return
                body = self.read_json_body()
                remote_url = body.get("remoteUrl") or ""
                if not remote_url:
                    self.respond_json({"ok": False, "error": "缺少 remoteUrl"}, status=HTTPStatus.BAD_REQUEST)
                    return
                from image_studio_backend import _download_binary, _guess_extension_from_content_type
                binary, content_type = _download_binary(remote_url, timeout=12, retries=2)
                ext = _guess_extension_from_content_type(content_type, ".png")
                import base64
                b64 = base64.b64encode(binary).decode("ascii")
                self.respond_json({"ok": True, "data": b64, "ext": ext, "contentType": content_type})
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
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
        if parsed.path == "/api/workbench/url/extract":
            try:
                url = (query.get("url") or [""])[0]
                self.respond_json(extract_url_content(url))
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return
        if parsed.path == "/":
            self.path = "/workbench.html"
        elif parsed.path == "/workbench.html":
            self.path = "/workbench.html"
        elif parsed.path == "/image-studio.html":
            self.path = "/image-studio.html"
        elif parsed.path == "/workbench-run.html":
            self.path = "/workbench-run.html"
        elif parsed.path == "/image-studio-canvas.html":
            self.path = "/image-studio-canvas.html"
        elif parsed.path == "/image-studio-canvas-next.html":
            self.path = "/image-studio-canvas.html"
        elif parsed.path == "/workbench-engine.js":
            self.path = "/workbench-engine.js"
        elif parsed.path.startswith("/canvas-next/"):
            self.path = parsed.path
        elif parsed.path == "/index.html":
            self.path = "/workbench.html"
        else:
            self.path = parsed.path
        super().do_GET()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path in {"/v1/images/edits", "/v1/images/generations"}:
            try:
                payload = self.read_json_body()
                self.respond_json(run_openai_images_edits(payload))
            except (ValueError, ImageStudioError) as exc:
                error_payload, status = _openai_image_error(str(exc))
                self.respond_json(error_payload, status=status)
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"error": {"message": str(exc), "type": "server_error"}}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/workbench/image-studio/generate":
            try:
                payload = self.read_json_body()
                response = run_image_generation(payload)
                self.respond_json(response)
            except (ValueError, ImageStudioError) as exc:
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/workbench/image-studio/smart-midjourney-prompt":
            try:
                payload = self.read_json_body()
                self.respond_json(run_smart_midjourney_prompt(payload))
            except (ValueError, ImageStudioError) as exc:
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/workbench/image-studio/generate-video":
            try:
                payload = self.read_json_body()
                video_result = run_video_generation(payload)
                self.respond_json(video_result)
            except (ValueError, ImageStudioError) as exc:
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/workbench/image-studio/video/start":
            try:
                payload = self.read_json_body()
                self.respond_json(run_video_generation_start(payload))
            except (ValueError, ImageStudioError) as exc:
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/workbench/image-studio/video-provider-payload-preview":
            try:
                payload = self.read_json_body()
                self.respond_json(run_video_provider_payload_preview(payload))
            except (ValueError, ImageStudioError) as exc:
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/workbench/image-studio/image-provider-payload-preview":
            try:
                payload = self.read_json_body()
                self.respond_json(run_image_provider_payload_preview(payload))
            except (ValueError, ImageStudioError) as exc:
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/workbench/image-studio/ensure-local-image":
            try:
                payload = self.read_json_body()
                origin = f"http://{self.headers.get('Host', '')}" if self.headers.get('Host') else ""
                self.respond_json(ensure_local_image_file(payload, origin))
            except (ValueError, ImageStudioError) as exc:
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/workbench/image-studio/upload-local-file-to-provider":
            try:
                payload = self.read_json_body()
                self.respond_json(upload_local_file_to_provider(payload))
            except (ValueError, ImageStudioError) as exc:
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/workbench/image-studio/upload-local-file-to-object-storage":
            try:
                payload = self.read_json_body()
                self.respond_json(upload_local_file_to_object_storage(payload))
            except (ValueError, ImageStudioError) as exc:
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/workbench/image-studio/object-storage-upload-target":
            try:
                payload = self.read_json_body()
                self.respond_json(create_object_storage_upload_target(payload))
            except (ValueError, ImageStudioError) as exc:
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/api/workbench/image-studio/video/frame-file":
            try:
                self.respond_json(capture_uploaded_video_frame(self))
            except (ValueError, ImageStudioError) as exc:
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.INTERNAL_SERVER_ERROR)
            return
        if parsed.path == "/v1/files":
            try:
                uploaded = read_multipart_reference_upload(self)
                self.respond_json({
                    "ok": True,
                    "id": uploaded.get("id"),
                    "fileId": uploaded.get("fileId") or uploaded.get("id"),
                    "providerRef": uploaded.get("providerRef") or uploaded.get("id"),
                    "uploadRef": uploaded.get("uploadRef") or uploaded.get("id"),
                    "remoteUrl": uploaded.get("remoteUrl") or uploaded.get("id"),
                    "url": uploaded.get("url") or uploaded.get("id"),
                    "object": uploaded.get("object") or "file",
                    "bytes": uploaded.get("bytes") or uploaded.get("size"),
                    "size": uploaded.get("size") or uploaded.get("bytes"),
                    "created_at": uploaded.get("created_at"),
                    "filename": uploaded.get("filename"),
                    "purpose": uploaded.get("purpose") or "vision",
                    "mime_type": uploaded.get("mime_type") or uploaded.get("contentType"),
                    "contentType": uploaded.get("contentType") or uploaded.get("mime_type"),
                })
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return
        if parsed.path == "/api/workbench/image-studio/upload-reference":
            try:
                data, filename, field_content_type, _purpose = read_multipart_upload_file(self)
                try:
                    if __package__:
                        from .object_storage_uploader import upload_reference_image
                    else:
                        from object_storage_uploader import upload_reference_image
                except Exception as exc:  # noqa: BLE001
                    raise ValueError(f"对象存储上传模块不可用：{exc}") from exc
                uploaded = upload_reference_image(data, filename, field_content_type)
                self.respond_json({"ok": True, **uploaded})
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return
        if parsed.path == "/api/workbench/image-studio/save-to-dir":
            try:
                body = self.read_json_body()
                source_path = body.get("sourcePath") or None
                remote_url = body.get("remoteUrl") or None
                output_dir = str(body.get("outputDir") or "").strip() or str(IMAGE_STUDIO_OUTPUTS_DIR)
                saved = save_to_user_dir(source_path, remote_url, output_dir)
                self.respond_json({"ok": True, "saved": saved})
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return
        if parsed.path == "/api/workbench/image-studio/proxy-image":
            try:
                body = self.read_json_body()
                remote_url = body.get("remoteUrl") or ""
                if not remote_url:
                    self.respond_json({"ok": False, "error": "缺少 remoteUrl"}, status=HTTPStatus.BAD_REQUEST)
                    return
                from image_studio_backend import _download_binary, _guess_extension_from_content_type
                binary, content_type = _download_binary(remote_url, timeout=12, retries=2)
                ext = _guess_extension_from_content_type(content_type, ".png")
                import base64
                b64 = base64.b64encode(binary).decode("ascii")
                self.respond_json({"ok": True, "data": b64, "ext": ext, "contentType": content_type})
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return
        if parsed.path == "/api/workbench/url/extract":
            try:
                body = self.read_json_body()
                self.respond_json(extract_url_content(str(body.get("url") or "")))
            except Exception as exc:  # noqa: BLE001
                self.respond_json({"ok": False, "error": str(exc)}, status=HTTPStatus.BAD_REQUEST)
            return
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
        origin = self.headers.get("Origin")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        else:
            self.send_header("Access-Control-Allow-Origin", "*")
        request_headers = self.headers.get("Access-Control-Request-Headers")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", request_headers or "Content-Type, Authorization, X-Requested-With, Accept")
        self.send_header("Access-Control-Max-Age", "86400")
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
    print(f"Studio workbench server running at http://{args.host}:{args.port}/workbench.html")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
