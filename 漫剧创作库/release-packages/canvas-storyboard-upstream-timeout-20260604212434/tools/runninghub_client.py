#!/usr/bin/env python3
"""
RunningHub client

功能：
1. 可选上传本地文件到 RunningHub
2. 发起 workflow 任务（简易 / 高级）
3. 轮询任务结果
4. 下载生成产物到本地目录
5. 支持 Banana2 专用模式，自动拼 nodeInfoList
6. 支持 banana2-edit / banana-pro-edit / portrait-upscale 三种扩展模式
7. 支持 dry-run、nodeInfoList 落盘、任务元信息记录

使用示例：
python3 tools/runninghub_client.py \
  --workflow-id 2043087373063430146 \
  --banana2 \
  --prompt "近景构图（膝盖以上），酷飒女孩，高级电影质感" \
  --ratio 9:16 \
  --output-dir projects/demo_shortdrama_001/06-generated/runninghub

需要环境变量：
export RUNNINGHUB_API_KEY="你的 API Key"
"""

from __future__ import annotations

import argparse
import json
import mimetypes
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

BASE_URL = "https://www.runninghub.cn"
CREATE_URL = f"{BASE_URL}/task/openapi/create"
STATUS_URL = f"{BASE_URL}/task/openapi/status"
OUTPUTS_URL = f"{BASE_URL}/task/openapi/outputs"
UPLOAD_URL = f"{BASE_URL}/openapi/v2/media/upload/binary"
STANDARD_QUERY_URL = f"{BASE_URL}/openapi/v2/query"
STANDARD_MODEL_ENDPOINTS = {
    "mj-v7": f"{BASE_URL}/openapi/v2/youchuan/text-to-image-v7",
    "mj-niji7": f"{BASE_URL}/openapi/v2/youchuan/text-to-image-niji7",
    "mj-niji6": f"{BASE_URL}/openapi/v2/youchuan/text-to-image-niji6",
}
STANDARD_MODEL_FIELDS = {
    "mj-v7": {
        "prompt",
        "negativePrompt",
        "chaos",
        "quality",
        "stylize",
        "weird",
        "raw",
        "imageUrl",
        "iw",
        "sref",
        "sw",
        "sv",
        "oref",
        "ow",
        "tile",
        "aspectRatio",
        "n",
    },
    "mj-niji7": {
        "prompt",
        "chaos",
        "stylize",
        "weird",
        "raw",
        "imageUrl",
        "iw",
        "sref",
        "sw",
        "sv",
        "aspectRatio",
    },
    "mj-niji6": {
        "prompt",
        "chaos",
        "quality",
        "stylize",
        "weird",
        "raw",
        "imageUrl",
        "iw",
        "cref",
        "cw",
        "sref",
        "sw",
        "sv",
        "stop",
        "tile",
        "aspectRatio",
    },
}
BANANA2_DEFAULT_WORKFLOW_ID = "2043087373063430146"
IMAGE_EDIT_UPSCALE_WORKFLOW_ID = "2043088500844662785"

MODE_SUMMARIES = {
    "banana2": "三参考图生成，用于角色图、封面草稿、探索图。",
    "banana2-edit": "单图编辑主链，用于在保持主体基础上调整内容表达。",
    "banana-pro-edit": "单图编辑 AB 备选链，用于与 banana2-edit 对照试稿。",
    "portrait-upscale": "后处理高清增强链，只做画质提升，不改核心内容。",
    "mj-v7": "RunningHub 标准模型 API 文生图，用于快速测试图、封面探索图、风格探索图。",
    "mj-niji7": "RunningHub Niji7 动漫插画模型，用于漫剧海报、动漫风格探索与高风格化测试图。",
    "mj-niji6": "RunningHub Niji6 动漫角色模型，用于角色探索、角色参考控制与复古二次元风格测试。",
    "manual": "手动 workflow / nodeInfoList 模式，适合高级调试或临时实验。",
}


class RunningHubError(Exception):
    pass


def _headers(api_key: str, content_type: Optional[str] = "application/json") -> Dict[str, str]:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "User-Agent": "runninghub-minimal-client/0.4",
    }
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def _request_json(url: str, api_key: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    data = json.dumps(payload).encode("utf-8")
    req = Request(url, data=data, headers=_headers(api_key), method="POST")
    try:
        with urlopen(req, timeout=600) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        raise RunningHubError(f"HTTP {e.code} 请求失败: {body}") from e
    except URLError as e:
        raise RunningHubError(f"网络错误: {e}") from e


def _build_multipart_body(file_path: Path, boundary: str) -> bytes:
    file_bytes = file_path.read_bytes()
    mime_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    lines = []
    lines.append(f"--{boundary}\r\n".encode())
    lines.append(
        f'Content-Disposition: form-data; name="file"; filename="{file_path.name}"\r\n'.encode()
    )
    lines.append(f"Content-Type: {mime_type}\r\n\r\n".encode())
    lines.append(file_bytes)
    lines.append(b"\r\n")
    lines.append(f"--{boundary}--\r\n".encode())
    return b"".join(lines)


def upload_file(api_key: str, file_path: Path) -> Dict[str, Any]:
    boundary = f"----RunningHubBoundary{int(time.time() * 1000)}"
    body = _build_multipart_body(file_path, boundary)
    headers = _headers(api_key, content_type=f"multipart/form-data; boundary={boundary}")
    req = Request(UPLOAD_URL, data=body, headers=headers, method="POST")
    try:
        with urlopen(req, timeout=300) as resp:
            result = json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        raise RunningHubError(f"上传失败 HTTP {e.code}: {body}") from e
    except URLError as e:
        raise RunningHubError(f"上传网络错误: {e}") from e

    if result.get("code") != 0:
        raise RunningHubError(f"上传失败: {result}")
    return result


def create_task(
    api_key: str,
    workflow_id: Optional[str] = None,
    node_info_list: Optional[List[Dict[str, Any]]] = None,
    workflow: Optional[str] = None,
    webhook_url: Optional[str] = None,
    instance_type: Optional[str] = None,
    use_personal_queue: bool = False,
    add_metadata: bool = True,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "apiKey": api_key,
        "addMetadata": add_metadata,
    }
    if workflow_id:
        payload["workflowId"] = workflow_id
    if workflow:
        payload["workflow"] = workflow
    if node_info_list:
        payload["nodeInfoList"] = node_info_list
    if webhook_url:
        payload["webhookUrl"] = webhook_url
    if instance_type:
        payload["instanceType"] = instance_type
    if use_personal_queue:
        payload["usePersonalQueue"] = True

    result = _request_json(CREATE_URL, api_key, payload)
    if result.get("code") != 0:
        raise RunningHubError(f"创建任务失败: {json.dumps(result, ensure_ascii=False)}")
    return result


def query_status(api_key: str, task_id: str) -> Dict[str, Any]:
    payload = {"apiKey": api_key, "taskId": task_id}
    return _request_json(STATUS_URL, api_key, payload)


def query_outputs(api_key: str, task_id: str) -> Dict[str, Any]:
    payload = {"apiKey": api_key, "taskId": task_id}
    return _request_json(OUTPUTS_URL, api_key, payload)


def create_standard_task(api_key: str, endpoint_url: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    result = _request_json(endpoint_url, api_key, payload)
    if result.get("errorCode") or result.get("errorMessage"):
        raise RunningHubError(f"标准模型任务创建失败: {json.dumps(result, ensure_ascii=False)}")
    return result


def query_standard_result(api_key: str, task_id: str) -> Dict[str, Any]:
    payload = {"taskId": task_id}
    return _request_json(STANDARD_QUERY_URL, api_key, payload)


def wait_for_standard_results(api_key: str, task_id: str, interval: int = 5, timeout: int = 1800) -> Dict[str, Any]:
    start = time.time()
    while True:
        if time.time() - start > timeout:
            raise RunningHubError(f"等待标准模型任务超时，taskId={task_id}")

        result = query_standard_result(api_key, task_id)
        status = str(result.get("status") or "").upper()
        print(f"[poll-standard] taskId={task_id} status={status} resp={json.dumps(result, ensure_ascii=False)}")

        if status == "SUCCESS":
            return result
        if status == "FAILED":
            raise RunningHubError(f"标准模型任务失败: {json.dumps(result, ensure_ascii=False)}")

        time.sleep(interval)


def wait_for_outputs(api_key: str, task_id: str, interval: int = 5, timeout: int = 1800) -> List[Dict[str, Any]]:
    start = time.time()

    while True:
        if time.time() - start > timeout:
            raise RunningHubError(f"等待任务超时，taskId={task_id}")

        outputs_resp = query_outputs(api_key, task_id)
        if outputs_resp.get("code") == 0 and isinstance(outputs_resp.get("data"), list) and outputs_resp.get("data"):
            return outputs_resp["data"]

        status_resp = query_status(api_key, task_id)
        print(f"[poll] taskId={task_id} status_resp={json.dumps(status_resp, ensure_ascii=False)}")

        msg = (outputs_resp.get("msg") or "") if isinstance(outputs_resp, dict) else ""
        if "失败" in msg or "failed" in msg.lower():
            raise RunningHubError(f"任务失败: {json.dumps(outputs_resp, ensure_ascii=False)}")

        time.sleep(interval)


def download_file(url: str, output_dir: Path, filename: Optional[str] = None) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    parsed = urlparse(url)
    guessed_name = Path(parsed.path).name or "runninghub_output"
    target_name = filename or guessed_name
    target_path = output_dir / target_name

    req = Request(url, headers={"User-Agent": "runninghub-minimal-client/0.4"}, method="GET")
    with urlopen(req, timeout=300) as resp:
        target_path.write_bytes(resp.read())
    return target_path


def parse_node_info_list(raw: Optional[str]) -> List[Dict[str, Any]]:
    if not raw:
        return []
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as e:
        raise RunningHubError(f"nodeInfoList 不是合法 JSON: {e}") from e
    if not isinstance(value, list):
        raise RunningHubError("nodeInfoList 必须是 JSON 数组")
    return value


def ensure_parent_dir(file_path: Path) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)


def write_json_file(file_path: Path, payload: Dict[str, Any] | List[Any]) -> None:
    ensure_parent_dir(file_path)
    file_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def detect_mode_name(args: argparse.Namespace) -> str:
    if args.banana2:
        return "banana2"
    if args.banana2_edit:
        return "banana2-edit"
    if args.banana_pro_edit:
        return "banana-pro-edit"
    if args.portrait_upscale:
        return "portrait-upscale"
    if args.mj_v7:
        return "mj-v7"
    if args.mj_niji7:
        return "mj-niji7"
    if args.mj_niji6:
        return "mj-niji6"
    if args.standard_model:
        return args.standard_model
    return "manual"


def print_mode_summary(mode_name: str) -> None:
    summary = MODE_SUMMARIES.get(mode_name, MODE_SUMMARIES["manual"])
    print(f"[mode] {mode_name}: {summary}")


def build_standard_payload(args: argparse.Namespace, model_name: str) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "prompt": args.prompt,
        "negativePrompt": args.negative_prompt,
        "chaos": args.chaos,
        "quality": args.quality,
        "stylize": args.stylize,
        "weird": args.weird,
        "raw": args.raw,
        "imageUrl": args.image_url,
        "iw": args.iw,
        "cref": args.cref,
        "cw": args.cw,
        "sref": args.sref,
        "sw": args.sw,
        "sv": args.sv,
        "oref": args.oref,
        "ow": args.ow,
        "stop": args.stop,
        "tile": args.tile,
        "aspectRatio": args.aspect_ratio,
        "n": args.n,
    }
    allowed_fields = STANDARD_MODEL_FIELDS.get(model_name, set())
    return {key: value for key, value in payload.items() if value is not None and key in allowed_fields}


def build_banana2_node_info_list(
    prompt: Optional[str],
    ratio: Optional[str],
    resolution: Optional[str],
    seed: Optional[int],
    filename_prefix: Optional[str],
    char_file_name: Optional[str],
    cloth_file_name: Optional[str],
    scene_file_name: Optional[str],
) -> List[Dict[str, Any]]:
    node_info_list: List[Dict[str, Any]] = []

    if char_file_name:
        node_info_list.append({"nodeId": "2", "fieldName": "image", "fieldValue": char_file_name})
    if cloth_file_name:
        node_info_list.append({"nodeId": "3", "fieldName": "image", "fieldValue": cloth_file_name})
    if scene_file_name:
        node_info_list.append({"nodeId": "4", "fieldName": "image", "fieldValue": scene_file_name})
    if prompt:
        node_info_list.append({"nodeId": "9", "fieldName": "text", "fieldValue": prompt})
        node_info_list.append({"nodeId": "1", "fieldName": "prompt", "fieldValue": prompt})
    if ratio:
        node_info_list.append({"nodeId": "1", "fieldName": "aspectRatio", "fieldValue": ratio})
    if resolution:
        node_info_list.append({"nodeId": "1", "fieldName": "resolution", "fieldValue": resolution})
    if seed is not None:
        node_info_list.append({"nodeId": "1", "fieldName": "seed", "fieldValue": seed})
    if filename_prefix:
        node_info_list.append({"nodeId": "5", "fieldName": "filename_prefix", "fieldValue": filename_prefix})

    return node_info_list


def build_banana2_edit_node_info_list(
    input_file_name: Optional[str],
    prompt: Optional[str],
    ratio: Optional[str],
    resolution: Optional[str],
    seed: Optional[int],
    filename_prefix: Optional[str],
) -> List[Dict[str, Any]]:
    node_info_list: List[Dict[str, Any]] = []
    if input_file_name:
        node_info_list.append({"nodeId": "1261", "fieldName": "image", "fieldValue": input_file_name})
    if prompt:
        node_info_list.append({"nodeId": "1262", "fieldName": "text", "fieldValue": prompt})
        node_info_list.append({"nodeId": "1260", "fieldName": "prompt", "fieldValue": prompt})
    if ratio:
        node_info_list.append({"nodeId": "1260", "fieldName": "aspectRatio", "fieldValue": ratio})
    if resolution:
        node_info_list.append({"nodeId": "1260", "fieldName": "resolution", "fieldValue": resolution})
    if seed is not None:
        node_info_list.append({"nodeId": "1260", "fieldName": "seed", "fieldValue": seed})
    if filename_prefix:
        node_info_list.append({"nodeId": "1263", "fieldName": "filename_prefix", "fieldValue": filename_prefix})
    return node_info_list


def build_banana_pro_edit_node_info_list(
    input_file_name: Optional[str],
    prompt: Optional[str],
    ratio: Optional[str],
    resolution: Optional[str],
    seed: Optional[int],
    filename_prefix: Optional[str],
) -> List[Dict[str, Any]]:
    node_info_list: List[Dict[str, Any]] = []
    if input_file_name:
        node_info_list.append({"nodeId": "841", "fieldName": "image", "fieldValue": input_file_name})
    if prompt:
        node_info_list.append({"nodeId": "842", "fieldName": "text", "fieldValue": prompt})
        node_info_list.append({"nodeId": "848", "fieldName": "prompt", "fieldValue": prompt})
    if ratio:
        node_info_list.append({"nodeId": "848", "fieldName": "aspectRatio", "fieldValue": ratio})
    if resolution:
        node_info_list.append({"nodeId": "848", "fieldName": "resolution", "fieldValue": resolution})
    if seed is not None:
        node_info_list.append({"nodeId": "848", "fieldName": "seed", "fieldValue": seed})
    if filename_prefix:
        node_info_list.append({"nodeId": "843", "fieldName": "filename_prefix", "fieldValue": filename_prefix})
    return node_info_list


def build_portrait_upscale_node_info_list(
    input_file_name: Optional[str],
    filename_prefix: Optional[str],
    upscale_model: Optional[str],
) -> List[Dict[str, Any]]:
    node_info_list: List[Dict[str, Any]] = []
    if input_file_name:
        node_info_list.append({"nodeId": "675", "fieldName": "image", "fieldValue": input_file_name})
    if upscale_model:
        node_info_list.append({"nodeId": "396", "fieldName": "model_name", "fieldValue": upscale_model})
    if filename_prefix:
        node_info_list.append({"nodeId": "402", "fieldName": "filename_prefix", "fieldValue": filename_prefix})
    return node_info_list


def merge_node_info_lists(base_list: List[Dict[str, Any]], extra_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    merged: Dict[tuple, Dict[str, Any]] = {}
    for item in base_list + extra_list:
        key = (str(item.get("nodeId")), str(item.get("fieldName")))
        merged[key] = item
    return list(merged.values())


def resolve_single_input_upload(
    api_key: str,
    file_arg: Optional[str],
    label: str,
    uploaded_files: List[Dict[str, Any]],
) -> Optional[str]:
    if not file_arg:
        return None
    file_path = Path(file_arg).expanduser().resolve()
    if not file_path.exists():
        raise RunningHubError(f"{label} 输入文件不存在: {file_path}")
    upload_resp = upload_file(api_key, file_path)
    uploaded_files.append(upload_resp["data"])
    print(f"[{label} upload] {file_path} -> {json.dumps(upload_resp['data'], ensure_ascii=False)}")
    return upload_resp["data"]["fileName"]


def validate_args(args: argparse.Namespace, mode_name: str) -> None:
    if mode_name in {"banana2-edit", "banana-pro-edit"} and not args.input_file:
        raise RunningHubError(f"{mode_name} 模式必须提供 --input-file")
    if mode_name == "portrait-upscale":
        if not args.input_file:
            raise RunningHubError("portrait-upscale 模式必须提供 --input-file")
        if not args.upscale_model:
            raise RunningHubError("portrait-upscale 模式建议明确提供 --upscale-model，避免模型不确定")
    if mode_name in {"mj-v7", "mj-niji7", "mj-niji6"}:
        if not args.prompt:
            raise RunningHubError(f"{mode_name} 模式必须提供 --prompt")
        if args.image_url and args.iw is None:
            args.iw = 1
        if args.sref and args.sw is None:
            args.sw = 100
        if mode_name == "mj-v7" and args.oref and args.ow is None:
            args.ow = 100
        if mode_name == "mj-niji6":
            if args.cref and args.cw is None:
                args.cw = 100
            if args.stop is None:
                args.stop = 100


def build_task_metadata(
    args: argparse.Namespace,
    mode_name: str,
    workflow_id: Optional[str],
    workflow_file: Optional[str],
    node_info_list: List[Dict[str, Any]],
    uploaded_files: List[Dict[str, Any]],
    dry_run: bool,
    task_id: Optional[str],
    downloaded_files: List[str],
) -> Dict[str, Any]:
    return {
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "mode": mode_name,
        "modeSummary": MODE_SUMMARIES.get(mode_name),
        "workflowId": workflow_id,
        "workflowFile": workflow_file,
        "dryRun": dry_run,
        "taskId": task_id,
        "parameters": {
            "prompt": args.prompt,
            "negativePrompt": args.negative_prompt,
            "standardModel": args.standard_model,
            "ratio": args.ratio,
            "aspectRatio": args.aspect_ratio,
            "resolution": args.resolution,
            "seed": args.seed,
            "filenamePrefix": args.filename_prefix,
            "outputDir": args.output_dir,
            "downloadPrefix": args.download_prefix,
            "inputFile": args.input_file,
            "imageUrl": args.image_url,
            "iw": args.iw,
            "cref": args.cref,
            "cw": args.cw,
            "sref": args.sref,
            "sw": args.sw,
            "sv": args.sv,
            "oref": args.oref,
            "ow": args.ow,
            "stop": args.stop,
            "quality": args.quality,
            "chaos": args.chaos,
            "stylize": args.stylize,
            "weird": args.weird,
            "raw": args.raw,
            "tile": args.tile,
            "charFile": args.char_file,
            "clothFile": args.cloth_file,
            "sceneFile": args.scene_file,
            "upscaleModel": args.upscale_model,
            "instanceType": args.instance_type,
            "webhookUrl": args.webhook_url,
            "usePersonalQueue": args.use_personal_queue,
            "disableMetadata": args.disable_metadata,
        },
        "nodeInfoList": node_info_list,
        "uploadedFiles": uploaded_files,
        "downloadedFiles": downloaded_files,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="RunningHub 最小可用客户端")
    parser.add_argument("--workflow-id", help="RunningHub workflowId")
    parser.add_argument("--workflow-file", help="本地 workflow JSON 文件路径，可选")
    parser.add_argument("--node-info-list", help="JSON 字符串格式的 nodeInfoList")
    parser.add_argument("--upload-file", action="append", default=[], help="上传本地文件，支持多次传入")
    parser.add_argument("--webhook-url", help="任务完成后 webhook 地址")
    parser.add_argument("--instance-type", help="实例类型，例如 plus")
    parser.add_argument("--use-personal-queue", action="store_true", help="独占队列模式")
    parser.add_argument("--disable-metadata", action="store_true", help="关闭 addMetadata")
    parser.add_argument("--interval", type=int, default=5, help="轮询间隔秒数")
    parser.add_argument("--timeout", type=int, default=1800, help="总超时时间秒数")
    parser.add_argument("--output-dir", default="runninghub_outputs", help="下载输出目录")
    parser.add_argument("--download-prefix", default="", help="下载文件名前缀")
    parser.add_argument("--dry-run", action="store_true", help="只生成并打印 nodeInfoList / metadata，不真正发起任务")
    parser.add_argument("--save-node-info-list", help="把最终 nodeInfoList 保存为 JSON 文件")
    parser.add_argument("--task-meta-file", help="把本次执行元信息保存为 JSON 文件")
    parser.add_argument("--print-mode-summary", action="store_true", help="打印当前模式用途摘要")

    # Banana2 三图生成模式
    parser.add_argument("--banana2", action="store_true", help="启用 Banana2 三图生成模式，自动拼接 nodeInfoList")
    parser.add_argument("--prompt", help="提示词")
    parser.add_argument("--ratio", help="画幅，例如 9:16、3:4")
    parser.add_argument("--resolution", help="分辨率，例如 2k")
    parser.add_argument("--seed", type=int, help="种子")
    parser.add_argument("--filename-prefix", help="SaveImage 输出前缀")
    parser.add_argument("--char-file", help="Banana2 人物参考图本地路径，会上传并写入 nodeId=2")
    parser.add_argument("--cloth-file", help="Banana2 服装参考图本地路径，会上传并写入 nodeId=3")
    parser.add_argument("--scene-file", help="Banana2 场景参考图本地路径，会上传并写入 nodeId=4")

    # 图像编辑 / 高清增强模式
    parser.add_argument("--banana2-edit", action="store_true", help="启用 Banana2 单图编辑模式")
    parser.add_argument("--banana-pro-edit", action="store_true", help="启用 BananaPRO 单图编辑模式")
    parser.add_argument("--portrait-upscale", action="store_true", help="启用人物高清增强模式")
    parser.add_argument("--input-file", help="单图编辑或高清增强的输入图本地路径")
    parser.add_argument("--upscale-model", help="portrait-upscale 使用的超分模型名，例如 4x-UltraSharp.pth")

    # RunningHub 标准模型 API
    parser.add_argument("--standard-model", choices=["mj-v7", "mj-niji7", "mj-niji6"], help="标准模型 API 名称")
    parser.add_argument("--mj-v7", action="store_true", help="启用 MJ-V7 标准模型 API 文生图模式")
    parser.add_argument("--mj-niji7", action="store_true", help="启用 MJ-Niji7 标准模型 API 动漫插画模式")
    parser.add_argument("--mj-niji6", action="store_true", help="启用 MJ-Niji6 标准模型 API 动漫角色模式")
    parser.add_argument("--negative-prompt", help="标准模型 API 的负向提示词")
    parser.add_argument("--aspect-ratio", help="标准模型 API 画幅，例如 1:1、3:4、9:16")
    parser.add_argument("--quality", help="标准模型 API 质量参数，例如 1、2、4")
    parser.add_argument("--chaos", type=int, help="标准模型 API chaos 参数")
    parser.add_argument("--stylize", type=int, help="标准模型 API stylize 参数")
    parser.add_argument("--weird", type=int, help="标准模型 API weird 参数")
    parser.add_argument("--raw", action="store_true", help="标准模型 API raw 模式")
    parser.add_argument("--image-url", help="标准模型 API 垫图 URL")
    parser.add_argument("--iw", type=int, help="标准模型 API 垫图权重")
    parser.add_argument("--cref", help="标准模型 API 角色参考图 URL")
    parser.add_argument("--cw", type=int, help="标准模型 API 角色参考权重")
    parser.add_argument("--sref", help="标准模型 API 风格参考图 URL")
    parser.add_argument("--sw", type=int, help="标准模型 API 风格权重")
    parser.add_argument("--sv", type=int, help="标准模型 API 风格版本")
    parser.add_argument("--oref", help="标准模型 API 万物引用图 URL")
    parser.add_argument("--ow", type=int, help="标准模型 API 万物引用权重")
    parser.add_argument("--stop", type=int, help="标准模型 API stop 参数")
    parser.add_argument("--tile", action="store_true", help="标准模型 API 平铺模式")
    parser.add_argument("--n", type=int, default=1, help="标准模型 API 出图数量，默认 1（每次只出一张图）")
    args = parser.parse_args()

    api_key = os.getenv("RUNNINGHUB_API_KEY")
    if not api_key:
        raise RunningHubError("缺少环境变量 RUNNINGHUB_API_KEY")

    workflow = None
    if args.workflow_file:
        workflow = Path(args.workflow_file).read_text(encoding="utf-8")

    node_info_list = parse_node_info_list(args.node_info_list)
    uploaded_files: List[Dict[str, Any]] = []

    for file_arg in args.upload_file:
        file_path = Path(file_arg).expanduser().resolve()
        if not file_path.exists():
            raise RunningHubError(f"上传文件不存在: {file_path}")
        upload_resp = upload_file(api_key, file_path)
        uploaded_files.append(upload_resp["data"])
        print(f"[upload] {file_path} -> {json.dumps(upload_resp['data'], ensure_ascii=False)}")

    mode_flags = [
        args.banana2,
        args.banana2_edit,
        args.banana_pro_edit,
        args.portrait_upscale,
        args.mj_v7,
        args.mj_niji7,
        args.mj_niji6,
        bool(args.standard_model),
    ]
    if sum(1 for flag in mode_flags if flag) > 1:
        raise RunningHubError("--banana2 / --banana2-edit / --banana-pro-edit / --portrait-upscale / --standard-model / --mj-v7 / --mj-niji7 / --mj-niji6 只能选择一种模式")

    mode_name = detect_mode_name(args)
    validate_args(args, mode_name)
    if args.print_mode_summary:
        print_mode_summary(mode_name)

    standard_payload: Dict[str, Any] = {}

    if args.banana2:
        banana2_upload_map: Dict[str, Optional[str]] = {"char": None, "cloth": None, "scene": None}
        for key, file_arg in [("char", args.char_file), ("cloth", args.cloth_file), ("scene", args.scene_file)]:
            if not file_arg:
                continue
            file_path = Path(file_arg).expanduser().resolve()
            if not file_path.exists():
                raise RunningHubError(f"Banana2 输入文件不存在: {file_path}")
            upload_resp = upload_file(api_key, file_path)
            uploaded_files.append(upload_resp["data"])
            banana2_upload_map[key] = upload_resp["data"]["fileName"]
            print(f"[banana2 upload] {key} {file_path} -> {json.dumps(upload_resp['data'], ensure_ascii=False)}")

        banana2_node_info_list = build_banana2_node_info_list(
            prompt=args.prompt,
            ratio=args.ratio,
            resolution=args.resolution,
            seed=args.seed,
            filename_prefix=args.filename_prefix,
            char_file_name=banana2_upload_map["char"],
            cloth_file_name=banana2_upload_map["cloth"],
            scene_file_name=banana2_upload_map["scene"],
        )
        node_info_list = merge_node_info_lists(banana2_node_info_list, node_info_list)

        if not args.workflow_id and not workflow:
            args.workflow_id = BANANA2_DEFAULT_WORKFLOW_ID

    elif args.banana2_edit:
        input_file_name = resolve_single_input_upload(api_key, args.input_file, "banana2-edit", uploaded_files)
        mode_node_info_list = build_banana2_edit_node_info_list(
            input_file_name=input_file_name,
            prompt=args.prompt,
            ratio=args.ratio,
            resolution=args.resolution,
            seed=args.seed,
            filename_prefix=args.filename_prefix,
        )
        node_info_list = merge_node_info_lists(mode_node_info_list, node_info_list)

        if not args.workflow_id and not workflow:
            args.workflow_id = IMAGE_EDIT_UPSCALE_WORKFLOW_ID

    elif args.banana_pro_edit:
        input_file_name = resolve_single_input_upload(api_key, args.input_file, "banana-pro-edit", uploaded_files)
        mode_node_info_list = build_banana_pro_edit_node_info_list(
            input_file_name=input_file_name,
            prompt=args.prompt,
            ratio=args.ratio,
            resolution=args.resolution,
            seed=args.seed,
            filename_prefix=args.filename_prefix,
        )
        node_info_list = merge_node_info_lists(mode_node_info_list, node_info_list)

        if not args.workflow_id and not workflow:
            args.workflow_id = IMAGE_EDIT_UPSCALE_WORKFLOW_ID

    elif args.portrait_upscale:
        input_file_name = resolve_single_input_upload(api_key, args.input_file, "portrait-upscale", uploaded_files)
        mode_node_info_list = build_portrait_upscale_node_info_list(
            input_file_name=input_file_name,
            filename_prefix=args.filename_prefix,
            upscale_model=args.upscale_model,
        )
        node_info_list = merge_node_info_lists(mode_node_info_list, node_info_list)

        if not args.workflow_id and not workflow:
            args.workflow_id = IMAGE_EDIT_UPSCALE_WORKFLOW_ID

    elif mode_name in STANDARD_MODEL_ENDPOINTS:
        standard_payload = build_standard_payload(args, mode_name)

    if uploaded_files:
        print("\n提示：如需把上传结果写入 nodeInfoList，请使用返回的 fileName 字段作为 fieldValue。\n")

    if mode_name in STANDARD_MODEL_ENDPOINTS:
        if standard_payload:
            print(f"[standard-payload] {json.dumps(standard_payload, ensure_ascii=False, indent=2)}")
        if args.dry_run:
            metadata = build_task_metadata(
                args=args,
                mode_name=mode_name,
                workflow_id=None,
                workflow_file=None,
                node_info_list=[],
                uploaded_files=uploaded_files,
                dry_run=True,
                task_id=None,
                downloaded_files=[],
            )
            if args.task_meta_file:
                task_meta_path = Path(args.task_meta_file).expanduser().resolve()
                write_json_file(task_meta_path, {**metadata, "standardPayload": standard_payload})
                print(f"[save] task metadata -> {task_meta_path}")
            print("[dry-run] 已完成标准模型 API 参数校验，未实际发起任务。")
            return 0

        endpoint_url = STANDARD_MODEL_ENDPOINTS[mode_name]
        create_resp = create_standard_task(api_key, endpoint_url, standard_payload)
        print(f"[create-standard] {json.dumps(create_resp, ensure_ascii=False, indent=2)}")
        task_id = create_resp.get("taskId")
        if not task_id:
            raise RunningHubError("标准模型任务创建成功但未返回 taskId")

        result = wait_for_standard_results(api_key, task_id, interval=args.interval, timeout=args.timeout)
        outputs = result.get("results") or []
        print(f"[results-standard] {json.dumps(outputs, ensure_ascii=False, indent=2)}")

        output_dir = Path(args.output_dir)
        downloaded: List[Path] = []
        for idx, item in enumerate(outputs, start=1):
            file_url = item.get("url")
            if not file_url:
                continue
            suffix = item.get("outputType") or Path(urlparse(file_url).path).suffix.lstrip(".") or "bin"
            name = f"{args.download_prefix}{idx}.{suffix}" if args.download_prefix else None
            saved = download_file(file_url, output_dir, filename=name)
            downloaded.append(saved)
            print(f"[download-standard] {file_url} -> {saved}")

        metadata = build_task_metadata(
            args=args,
            mode_name=mode_name,
            workflow_id=None,
            workflow_file=None,
            node_info_list=[],
            uploaded_files=uploaded_files,
            dry_run=False,
            task_id=task_id,
            downloaded_files=[str(path) for path in downloaded],
        )
        metadata["standardPayload"] = standard_payload
        metadata["standardResult"] = result
        if args.task_meta_file:
            task_meta_path = Path(args.task_meta_file).expanduser().resolve()
            write_json_file(task_meta_path, metadata)
            print(f"[save] task metadata -> {task_meta_path}")

        print("\n完成。")
        print(f"taskId: {task_id}")
        if downloaded:
            print("已下载文件：")
            for path in downloaded:
                print(f"- {path}")
        return 0

    if not args.workflow_id and not workflow:
        print("仅上传完成，未发起任务。因为你没有提供 --workflow-id 或 --workflow-file。")
        return 0

    if node_info_list:
        print(f"[nodeInfoList] {json.dumps(node_info_list, ensure_ascii=False, indent=2)}")

    if args.save_node_info_list:
        save_path = Path(args.save_node_info_list).expanduser().resolve()
        write_json_file(save_path, node_info_list)
        print(f"[save] nodeInfoList -> {save_path}")

    if args.dry_run:
        metadata = build_task_metadata(
            args=args,
            mode_name=mode_name,
            workflow_id=args.workflow_id,
            workflow_file=args.workflow_file,
            node_info_list=node_info_list,
            uploaded_files=uploaded_files,
            dry_run=True,
            task_id=None,
            downloaded_files=[],
        )
        if args.task_meta_file:
            task_meta_path = Path(args.task_meta_file).expanduser().resolve()
            write_json_file(task_meta_path, metadata)
            print(f"[save] task metadata -> {task_meta_path}")
        print("[dry-run] 已完成参数校验、上传与 nodeInfoList 生成，未实际发起 RunningHub 任务。")
        return 0

    create_resp = create_task(
        api_key=api_key,
        workflow_id=args.workflow_id,
        node_info_list=node_info_list,
        workflow=workflow,
        webhook_url=args.webhook_url,
        instance_type=args.instance_type,
        use_personal_queue=args.use_personal_queue,
        add_metadata=not args.disable_metadata,
    )
    print(f"[create] {json.dumps(create_resp, ensure_ascii=False, indent=2)}")

    task_id = create_resp.get("data", {}).get("taskId")
    if not task_id:
        raise RunningHubError("创建任务成功但未返回 taskId")

    outputs = wait_for_outputs(api_key, task_id, interval=args.interval, timeout=args.timeout)
    print(f"[outputs] {json.dumps(outputs, ensure_ascii=False, indent=2)}")

    output_dir = Path(args.output_dir)
    downloaded: List[Path] = []
    for idx, item in enumerate(outputs, start=1):
        file_url = item.get("fileUrl")
        if not file_url:
            continue
        suffix = item.get("fileType") or Path(urlparse(file_url).path).suffix.lstrip(".") or "bin"
        name = f"{args.download_prefix}{idx}.{suffix}" if args.download_prefix else None
        saved = download_file(file_url, output_dir, filename=name)
        downloaded.append(saved)
        print(f"[download] {file_url} -> {saved}")

    metadata = build_task_metadata(
        args=args,
        mode_name=mode_name,
        workflow_id=args.workflow_id,
        workflow_file=args.workflow_file,
        node_info_list=node_info_list,
        uploaded_files=uploaded_files,
        dry_run=False,
        task_id=task_id,
        downloaded_files=[str(path) for path in downloaded],
    )
    if args.task_meta_file:
        task_meta_path = Path(args.task_meta_file).expanduser().resolve()
        write_json_file(task_meta_path, metadata)
        print(f"[save] task metadata -> {task_meta_path}")

    print("\n完成。")
    print(f"taskId: {task_id}")
    if downloaded:
        print("已下载文件：")
        for path in downloaded:
            print(f"- {path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RunningHubError as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        raise SystemExit(1)
