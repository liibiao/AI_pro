#!/usr/bin/env python3
from __future__ import annotations

import base64
import binascii
import hashlib
import json
import os
import re
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin, urlparse
from urllib.request import Request, urlopen


class ImageStudioError(Exception):
    pass


@dataclass
class ImageStudioConfig:
    base_url: str
    api_key: str
    model: str
    size: str
    requested_ratio: str = ""
    requested_resolution: str = ""
    requested_pixel_size: str = ""
    quality: str = ""
    background: str = ""
    output_format: str = "png"
    adapter: str = "openai-edits"
    endpoint_path: str = ""
    status_endpoint_path: str = ""


VALID_IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
DEFAULT_BASE_URL = os.environ.get("IMAGE_STUDIO_BASE_URL", "").strip()
GPT_IMAGE_V2_BASE_URL = "https://socdabat.it.com/v1"
DEFAULT_MODEL = os.environ.get("IMAGE_STUDIO_MODEL", "gpt-image-2").strip() or "gpt-image-2"
DEFAULT_SIZE = os.environ.get("IMAGE_STUDIO_SIZE", "1024x1024").strip() or "1024x1024"
DEFAULT_API_KEY = os.environ.get("IMAGE_STUDIO_API_KEY", "").strip()
GPT_IMAGE_V2_MODELS_BY_RESOLUTION = {
    "1K": "gpt-image-2-1k",
    "2K": "gpt-image-2-2k",
    "3K": "gpt-image-2-3k",
    "4K": "gpt-image-2-4k",
}
KNOWN_INVALID_GPT_IMAGE_V2_API_KEY_HASHES = {
    "126451d4bd2fb28c4e04dea75635e8ccbbc4ec15e383a47c1be62a0cafcbb434",
}
STUDIO_DIR = Path(__file__).resolve().parent.parent
IMAGE_STUDIO_FILES_DIR = STUDIO_DIR / "data" / "files"
FILE_ID_RE = re.compile(r"^file-[A-Za-z0-9_-]+$")


def is_gpt_image_2_pro_payload(payload: dict[str, Any]) -> bool:
    protocol = payload.get("protocol") if isinstance(payload.get("protocol"), dict) else {}
    values = [
        payload.get("id"),
        payload.get("modelId"),
        payload.get("modelKey"),
        payload.get("configId"),
        payload.get("channelKey"),
        payload.get("providerKey"),
        payload.get("modelNick"),
        payload.get("nick"),
        payload.get("name"),
        payload.get("displayName"),
        payload.get("label"),
        payload.get("model"),
        payload.get("adapter"),
        payload.get("protocolAdapter"),
        protocol.get("adapter") if isinstance(protocol, dict) else "",
    ]
    text = " ".join(str(value or "").strip().lower() for value in values if str(value or "").strip())
    dashed = re.sub(r"[\s_]+", "-", text)
    compact = re.sub(r"[\s_-]+", "", text)
    return (
        "canvas-gpt-image-2-pro" in dashed
        or "gpt-image-2-pro" in dashed
        or "canvasgptimage2pro" in compact
        or "gptimage2pro" in compact
    )


def normalize_base_url(value: str) -> str:
    base = (value or "").strip().rstrip("/")
    if not base:
        raise ImageStudioError("请先填写 API Base URL")
    if not (base.startswith("http://") or base.startswith("https://")):
        raise ImageStudioError("API Base URL 必须以 http:// 或 https:// 开头")
    return base


def build_config(payload: dict[str, Any], require_api_key: bool = True) -> ImageStudioConfig:
    api_key = str(payload.get("apiKey") or DEFAULT_API_KEY).strip()
    if require_api_key and not api_key:
        raise ImageStudioError("未检测到 API Key，请先在环境变量中设置 IMAGE_STUDIO_API_KEY")

    model = str(payload.get("model") or DEFAULT_MODEL).strip()
    if not model:
        raise ImageStudioError("请先填写模型名称")

    size = str(payload.get("size") or DEFAULT_SIZE).strip().replace("×", "x") or DEFAULT_SIZE
    requested_ratio = str(payload.get("requestedRatio") or payload.get("requested_ratio") or "").strip()
    requested_resolution = str(payload.get("requestedResolution") or payload.get("requested_resolution") or "").strip().lower()
    requested_pixel_size = str(payload.get("requestedPixelSize") or payload.get("requested_pixel_size") or size).strip().replace("×", "x")
    quality = str(payload.get("quality") or "").strip()
    background = str(payload.get("background") or "").strip()
    output_format = str(payload.get("outputFormat") or payload.get("output_format") or "png").strip().lower() or "png"
    protocol = payload.get("protocol") or {}
    adapter = str(protocol.get("adapter") if isinstance(protocol, dict) else protocol or "").strip() or "openai-edits"
    endpoint_path = ""
    status_endpoint_path = ""
    if isinstance(protocol, dict):
        endpoint_path = str(
            protocol.get("endpointPath")
            or protocol.get("endpoint_path")
            or protocol.get("endpoint")
            or ""
        ).strip()
        status_endpoint_path = str(
            protocol.get("statusEndpointPath")
            or protocol.get("status_endpoint_path")
            or protocol.get("statusEndpoint")
            or protocol.get("status_endpoint")
            or payload.get("statusEndpointPath")
            or payload.get("status_endpoint_path")
            or ""
        ).strip()
    if is_gpt_image_2_pro_payload(payload):
        model = "gpt-image-2"
        adapter = "openai-edits"
        endpoint_path = "/images/edits"
    configured_base_url = str(payload.get("baseUrl") or payload.get("url") or "").strip()
    if configured_base_url:
        base_url = configured_base_url
    elif adapter == "gpt-image-v2":
        base_url = GPT_IMAGE_V2_BASE_URL
    elif DEFAULT_BASE_URL and adapter in {"openai-edits", "openai-generations"}:
        base_url = DEFAULT_BASE_URL
    else:
        base_url = ""

    return ImageStudioConfig(
        base_url=normalize_base_url(base_url),
        api_key=api_key,
        model=model,
        size=size,
        requested_ratio=requested_ratio,
        requested_resolution=requested_resolution,
        requested_pixel_size=requested_pixel_size,
        quality=quality,
        background=background,
        output_format=output_format,
        adapter=adapter,
        endpoint_path=endpoint_path,
        status_endpoint_path=status_endpoint_path,
    )


def ensure_output_dir(output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    return output_dir


def _json_headers(api_key: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "User-Agent": "image-studio/1.0",
    }


def _is_known_invalid_gpt_image_v2_api_key(api_key: str) -> bool:
    clean = str(api_key or "").strip()
    if not clean:
        return False
    digest = hashlib.sha256(clean.encode("utf-8")).hexdigest()
    return digest in KNOWN_INVALID_GPT_IMAGE_V2_API_KEY_HASHES


def _assert_gpt_image_v2_api_key_ready(config: ImageStudioConfig) -> None:
    if config.adapter != "gpt-image-v2":
        return
    if not config.api_key:
        raise ImageStudioError("GPT-Image-v2 API Key 未配置：请在模型配置中填写该渠道可用的 API Key 后重试")
    if _is_known_invalid_gpt_image_v2_api_key(config.api_key):
        raise ImageStudioError("GPT-Image-v2 当前使用的是已失效的内置 API Key：请在模型配置中替换为该渠道可用的 API Key 后重试")


def _format_http_error_message(url: str, code: int, body: str, debug_text: str, prefix: str = "接口请求失败") -> str:
    auth_failed = code in {401, 403} or re.search(r"invalid[_ -]?token|invalid[_ -]?api[_ -]?key|unauthori[sz]ed|forbidden", body or "", re.I)
    if auth_failed:
        if "socdabat.it.com" in str(url):
            return (
                "GPT-Image-v2 认证失败：当前 API Key 无效、已过期，或没有该模型渠道权限。"
                "请在模型配置中替换 GPT-Image-v2 的 API Key 后重试。"
                f"\n{prefix} HTTP {code}: {body}\n请求调试信息：{debug_text}"
            )
        return (
            "模型接口认证失败：当前 API Key 无效、已过期，或没有该模型渠道权限。"
            "请检查模型配置里的 API Key 和 API Base URL。"
            f"\n{prefix} HTTP {code}: {body}\n请求调试信息：{debug_text}"
        )
    return f"{prefix} HTTP {code}: {body}\n请求调试信息：{debug_text}"


def _mask_header_value(key: str, value: Any) -> str:
    text = str(value or "")
    if key.lower() == "authorization":
        return "Bearer ***" if text else ""
    return text


def _shorten_debug_value(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): _shorten_debug_value(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_shorten_debug_value(item) for item in value]
    if isinstance(value, str):
        if value.startswith("data:image"):
            header = value.split(",", 1)[0]
            return f"{header},...[base64 omitted, length={len(value)}]"
        if len(value) > 600:
            return f"{value[:300]}...[omitted {len(value) - 600} chars]...{value[-300:]}"
    return value


def _debug_request_summary(url: str, method: str, headers: dict[str, Any] | None = None, payload: Any = None) -> dict[str, Any]:
    return {
        "method": method,
        "url": url,
        "headers": {str(k): _mask_header_value(str(k), v) for k, v in (headers or {}).items()},
        "payload": _shorten_debug_value(payload),
    }


def _print_debug_request(url: str, method: str, headers: dict[str, Any] | None = None, payload: Any = None) -> str:
    summary = _debug_request_summary(url, method, headers, payload)
    text = json.dumps(summary, ensure_ascii=False, indent=2)
    print(f"[ImageStudio Request]\n{text}", flush=True)
    return text


def _request_json(url: str, headers: dict[str, str], payload: dict[str, Any], timeout: int = 300) -> dict[str, Any]:
    debug_text = _print_debug_request(url, "POST", headers, payload)
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    request = Request(url, data=data, headers=headers, method="POST")
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise ImageStudioError(_format_http_error_message(url, exc.code, body, debug_text)) from exc
    except URLError as exc:
        raise ImageStudioError(f"网络请求失败: {exc}\n请求调试信息：{debug_text}") from exc


def _request_json_get(url: str, headers: dict[str, str], timeout: int = 60) -> dict[str, Any]:
    debug_text = _print_debug_request(url, "GET", headers, None)
    request = Request(url, headers=headers, method="GET")
    try:
        with urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise ImageStudioError(_format_http_error_message(url, exc.code, body, debug_text, prefix="GET 请求失败")) from exc
    except URLError as exc:
        raise ImageStudioError(f"网络请求失败: {exc}\n请求调试信息：{debug_text}") from exc


def _guess_extension_from_content_type(content_type: str | None, fallback: str = ".png") -> str:
    if not content_type:
        return fallback
    content_type = content_type.split(";")[0].strip().lower()
    mapping = {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }
    return mapping.get(content_type, fallback)


def _looks_like_http_url(value: str) -> bool:
    text = str(value or "").strip()
    return text.startswith("http://") or text.startswith("https://")


def _normalize_base64_image_data(value: str) -> tuple[str, str]:
    raw = str(value or "").strip().strip('"').strip("'")
    if not raw:
        return "", ".png"
    ext = ".png"
    if raw.startswith("data:") and "," in raw:
        header, raw = raw.split(",", 1)
        content_type = header.split(";", 1)[0].replace("data:", "").strip().lower()
        ext = _guess_extension_from_content_type(content_type, ".png")
    raw = "".join(raw.split()).replace("-", "+").replace("_", "/")
    missing_padding = len(raw) % 4
    if missing_padding:
        raw += "=" * (4 - missing_padding)
    return raw, ext


def _decode_base64_image(value: str) -> tuple[bytes, str]:
    normalized, ext = _normalize_base64_image_data(value)
    if not normalized:
        raise ImageStudioError("接口返回了空的 base64 图片数据")
    try:
        return base64.b64decode(normalized, validate=False), ext
    except (binascii.Error, ValueError) as exc:
        raise ImageStudioError(f"接口返回的 base64 图片数据无效：{exc}") from exc


def _detect_image_dimensions(binary: bytes) -> tuple[int | None, int | None]:
    data = binary or b""
    if len(data) >= 24 and data.startswith(b"\x89PNG\r\n\x1a\n"):
        return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")
    if len(data) >= 10 and data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        chunk = data[12:16]
        if chunk == b"VP8X" and len(data) >= 30:
            return int.from_bytes(data[24:27], "little") + 1, int.from_bytes(data[27:30], "little") + 1
        if chunk == b"VP8 " and len(data) >= 30:
            return int.from_bytes(data[26:28], "little") & 0x3FFF, int.from_bytes(data[28:30], "little") & 0x3FFF
        if chunk == b"VP8L" and len(data) >= 25:
            bits = int.from_bytes(data[21:25], "little")
            return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1
    if len(data) >= 4 and data[:2] == b"\xff\xd8":
        pos = 2
        while pos + 9 < len(data):
            if data[pos] != 0xFF:
                pos += 1
                continue
            marker = data[pos + 1]
            pos += 2
            if marker in {0xD8, 0xD9} or 0xD0 <= marker <= 0xD7:
                continue
            if pos + 2 > len(data):
                break
            length = int.from_bytes(data[pos:pos + 2], "big")
            if length < 2 or pos + length > len(data):
                break
            if marker in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF} and length >= 7:
                return int.from_bytes(data[pos + 5:pos + 7], "big"), int.from_bytes(data[pos + 3:pos + 5], "big")
            pos += length
    return None, None


def _download_binary(url: str, timeout: int = 300, retries: int = 3) -> tuple[bytes, str]:
    last_error: Exception | None = None
    for attempt in range(retries):
        request = Request(url, headers={"User-Agent": "image-studio/1.0"}, method="GET")
        try:
            with urlopen(request, timeout=timeout) as response:
                content_type = response.headers.get("Content-Type", "")
                return response.read(), content_type
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="ignore")
            last_error = ImageStudioError(f"下载生成图片失败 HTTP {exc.code}: {body}")
            if 400 <= exc.code < 500 and exc.code not in {408, 429}:
                break
        except URLError as exc:
            last_error = ImageStudioError(f"下载生成图片失败: {exc}")
        except OSError as exc:
            last_error = ImageStudioError(f"下载生成图片失败: {exc}")
        if attempt < retries - 1:
            time.sleep(0.8 * (attempt + 1))
    if isinstance(last_error, ImageStudioError):
        raise last_error
    raise ImageStudioError("下载生成图片失败")


def _extract_first_image_item(response_payload: dict[str, Any]) -> dict[str, Any]:
    data = response_payload.get("data")
    if isinstance(data, list) and data:
        first = data[0]
        if isinstance(first, dict):
            return first

    error_candidates = [
        response_payload.get("error"),
        response_payload.get("message"),
        response_payload.get("msg"),
    ]
    error_text = next((str(item).strip() for item in error_candidates if str(item or "").strip()), "")
    error_code = str(response_payload.get("code") or "").strip()
    if error_text:
        if error_code:
            raise ImageStudioError(f"上游接口返回错误（code={error_code}）：{error_text}")
        raise ImageStudioError(f"上游接口返回错误：{error_text}")

    raise ImageStudioError(f"接口返回中未找到图片数据: {json.dumps(response_payload, ensure_ascii=False)[:500]}")


def _absolute_image_url(value: str, base_url: str) -> str:
    url = str(value or "").strip()
    if not url:
        return ""
    if _looks_like_http_url(url):
        return url
    if url.startswith("/"):
        parsed = urlparse(base_url)
        origin = f"{parsed.scheme}://{parsed.netloc}" if parsed.scheme and parsed.netloc else base_url
        return urljoin(origin.rstrip("/") + "/", url.lstrip("/"))
    return url


def _save_response_image(response_payload: dict[str, Any], output_dir: Path, prefix: str, base_url: str = "") -> dict[str, Any]:
    item = _extract_first_image_item(response_payload)
    revised_prompt = str(item.get("revised_prompt") or response_payload.get("revised_prompt") or "").strip()

    image_url = _absolute_image_url(str(item.get("url") or item.get("image_url") or "").strip(), base_url)
    b64_data = str(item.get("b64_json") or item.get("b64") or "").strip()
    if not image_url and _looks_like_http_url(b64_data):
        image_url = b64_data
        b64_data = ""
    if not image_url and not b64_data:
        raise ImageStudioError(f"接口已返回响应，但未包含 url 或 b64_json: {json.dumps(response_payload, ensure_ascii=False)[:500]}")

    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    download_error = ""
    actual_width = None
    actual_height = None
    if image_url:
        filename = f"{prefix}-{timestamp}.url.txt"
        output_path = output_dir / filename
        output_path.write_text(image_url, encoding="utf-8")
        source_type = "url_remote_only"
        path = ""
    else:
        binary, ext = _decode_base64_image(b64_data)
        actual_width, actual_height = _detect_image_dimensions(binary)
        filename = f"{prefix}-{timestamp}{ext}"
        output_path = output_dir / filename
        output_path.write_bytes(binary)
        image_url = ""
        source_type = "base64"
        path = str(output_path)

    result = {
        "filename": output_path.name,
        "path": path,
        "revisedPrompt": revised_prompt,
        "remoteUrl": image_url,
        "sourceType": source_type,
    }
    if actual_width and actual_height:
        result["width"] = actual_width
        result["height"] = actual_height
        result["actualSize"] = f"{actual_width}x{actual_height}"
    if image_url:
        result["url"] = image_url
    if download_error:
        result["downloadError"] = download_error
    return result


def _parse_image_size(size: str) -> tuple[int | None, int | None]:
    compact = str(size or "").strip().lower().replace(" ", "")
    if "x" not in compact:
        return None, None
    left, right = compact.split("x", 1)
    try:
        width = int(left)
        height = int(right)
    except ValueError:
        return None, None
    if width <= 0 or height <= 0:
        return None, None
    return width, height


# ── 标准宽高比表 ──
_STANDARD_ASPECT_RATIOS: list[tuple[str, float]] = [
    ("1:3", 1 / 3), ("3:1", 3), ("9:16", 9 / 16), ("16:9", 16 / 9),
    ("2:3", 2 / 3), ("3:2", 3 / 2), ("3:4", 3 / 4), ("4:3", 4 / 3),
    ("1:1", 1), ("21:9", 21 / 9),
]


def _size_to_aspect_ratio(size: str) -> str:
    """将像素尺寸（如 '1920x1080'）映射到最接近的标准宽高比字符串。"""
    w, h = _parse_image_size(size)
    if not w or not h:
        return "1:1"
    ratio = w / h
    best = min(_STANDARD_ASPECT_RATIOS, key=lambda item: abs(item[1] - ratio))
    return best[0]


def _total_pixels(size: str) -> int:
    w, h = _parse_image_size(size)
    return (w or 0) * (h or 0)


def _pixels_to_resolution(total_px: int) -> str:
    """将总像素数映射到 1K / 2K / 3K / 4K。"""
    if total_px >= 6_000_000:
        return "4K"
    if total_px >= 3_000_000:
        return "3K"
    if total_px >= 1_500_000:
        return "2K"
    return "1K"


def normalize_gpt_image_v2_resolution(value: str, fallback: str = "2K") -> str:
    resolution = str(value or "").strip().upper()
    if not resolution:
        resolution = fallback
    if resolution in GPT_IMAGE_V2_MODELS_BY_RESOLUTION:
        return resolution
    raise ImageStudioError(f"GPT-Image-v2 仅支持 1k、2k、3k、4k，当前选择为 {resolution or '空'}")


def gpt_image_v2_model_for_resolution(base_model: str, resolution: str) -> str:
    clean_resolution = normalize_gpt_image_v2_resolution(resolution, fallback="2K")
    default_model = GPT_IMAGE_V2_MODELS_BY_RESOLUTION[clean_resolution]
    clean_base = str(base_model or "gpt-image-2").strip() or "gpt-image-2"
    clean_base = re.sub(r"-(?:1|2|3|4)k$", "", clean_base, flags=re.I)
    if clean_base == "gpt-image-2":
        return default_model
    return f"{clean_base}-{clean_resolution.lower()}"


def _resolve_image_refs_to_data_urls(values: Any) -> list[tuple[str, str]]:
    """将 file-id / URL 解析为 (data_url, mime_type) 列表。URL 直接透传为 data_url 位。"""
    refs = _resolve_image_refs_for_upstream(values)
    result: list[tuple[str, str]] = []
    for ref in refs:
        if FILE_ID_RE.match(ref):
            data_url = _file_id_to_data_url(ref)
            mime = data_url.split(":", 1)[1].split(";")[0] if ":" in data_url else "image/png"
            result.append((data_url, mime))
        else:
            result.append((ref, ""))
    return result


def _assert_file_refs_allowed(config: ImageStudioConfig, refs: list[str]) -> None:
    has_file_ref = any(FILE_ID_RE.match(str(ref or "").strip()) for ref in refs)
    if not has_file_ref:
        return
    if config.adapter == "openai-edits" and config.model == "gpt-image-2":
        return
    raise ImageStudioError("file-xxx 参考图渠道只允许用于 gpt-image-2；GPT-Image-v2 / Gemini-Image 必须使用腾讯云 COS 公网 URL")


# ── gpt-image-v2 payload 构建器 ──
def build_gpt_image_v2_payload(payload: dict[str, Any], images: list[str] | None = None) -> tuple[ImageStudioConfig, dict[str, Any]]:
    """构建 gpt-image-v2 渠道专用 payload（/images/generations, aspect_ratio, resolution, reference_images）。"""
    config = build_config(payload, require_api_key=False)
    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise ImageStudioError("请先填写提示词")

    image_refs = _resolve_image_refs_for_upstream(images if images is not None else (payload.get("reference_images") or payload.get("image")))
    _assert_file_refs_allowed(config, image_refs)
    if any(not str(ref).lower().startswith(("http://", "https://")) for ref in image_refs):
        raise ImageStudioError("GPT-Image-v2 的参考图必须先上传到腾讯云 COS，并使用公网 URL")

    aspect_ratio = str(payload.get("aspect_ratio") or payload.get("aspectRatio") or "").strip() or _size_to_aspect_ratio(config.size)
    raw_resolution = str(payload.get("resolution") or payload.get("requestedResolution") or payload.get("requested_resolution") or "").strip() or _pixels_to_resolution(_total_pixels(config.size))
    resolution = normalize_gpt_image_v2_resolution(raw_resolution, fallback="2K")
    config.model = gpt_image_v2_model_for_resolution(config.model, resolution)
    reasoning_effort = str(payload.get("reasoning_effort") or payload.get("reasoningEffort") or "medium").strip()

    request_payload: dict[str, Any] = {
        "model": config.model,
        "prompt": prompt,
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
        "reasoning_effort": reasoning_effort,
    }

    if image_refs:
        request_payload["reference_images"] = image_refs

    return config, request_payload


# ── Midjourney Imagine payload 构建器 ──
def _midjourney_prompt_version_key(prompt: str) -> str:
    text = str(prompt or "")
    niji = re.search(r"--niji\s+([0-9]+(?:\.[0-9]+)?)", text, re.I)
    if niji:
        return f"niji{niji.group(1)}".lower()
    version = re.search(r"--v(?:ersion)?\s+([0-9]+(?:\.[0-9]+)?)", text, re.I)
    if version:
        return f"v{version.group(1)}".lower()
    return ""


def _midjourney_major_version(version_key: str) -> float:
    match = re.search(r"(?:v|niji)([0-9]+(?:\.[0-9]+)?)", str(version_key or "").lower())
    if not match:
        return 7.0
    try:
        return float(match.group(1))
    except ValueError:
        return 7.0


def _strip_midjourney_url_param(prompt: str, name: str) -> str:
    return re.sub(rf"\s+--{re.escape(name)}\s+.*?(?=\s+--[a-z][a-z0-9-]*\b|$)", " ", str(prompt or ""), flags=re.I)


def _strip_midjourney_scalar_param(prompt: str, name: str) -> str:
    return re.sub(rf"\s+--{re.escape(name)}\s+-?\d+(?:\.\d+)?", " ", str(prompt or ""), flags=re.I)


def _first_url_from_midjourney_param(prompt: str, name: str) -> str:
    match = re.search(rf"\s+--{re.escape(name)}\s+(.+?)(?=\s+--[a-z][a-z0-9-]*\b|$)", str(prompt or ""), re.I)
    if not match:
        return ""
    url = re.search(r"https?://\S+", match.group(1))
    return url.group(0).strip() if url else ""


def _sanitize_midjourney_prompt_for_version(prompt: str) -> str:
    text = re.sub(r"\s+", " ", str(prompt or "")).strip()
    version_key = _midjourney_prompt_version_key(text)
    if not version_key:
        return text
    is_niji = version_key.startswith("niji")
    major = _midjourney_major_version(version_key)
    if version_key == "v8.1":
        for name in ("cref", "oref"):
            text = _strip_midjourney_url_param(text, name)
        for name in ("cw", "ow"):
            text = _strip_midjourney_scalar_param(text, name)
    elif not is_niji and major >= 7:
        cref_url = _first_url_from_midjourney_param(text, "cref")
        text = _strip_midjourney_url_param(text, "cref")
        text = _strip_midjourney_scalar_param(text, "cw")
        if cref_url and not re.search(r"(?:^|\s)--oref\b", text, re.I):
            text = f"{text} --oref {cref_url} --ow 100"
        if re.search(r"(?:^|\s)--oref\b", text, re.I):
            text = re.sub(r"\s+--(?:q|quality)\s+4(?:\.0+)?\b", " --q 2", text, flags=re.I)
    elif (not is_niji and 6 <= major < 7) or (is_niji and int(major) == 6):
        text = _strip_midjourney_url_param(text, "oref")
        text = _strip_midjourney_scalar_param(text, "ow")
    else:
        for name in ("cref", "oref"):
            text = _strip_midjourney_url_param(text, name)
        for name in ("cw", "ow"):
            text = _strip_midjourney_scalar_param(text, name)
    return re.sub(r"\s+", " ", text).strip()


def build_midjourney_imagine_payload(payload: dict[str, Any], images: list[str] | None = None) -> tuple[ImageStudioConfig, dict[str, Any]]:
    """构建 Midjourney Imagine 提交 payload（/mj/submit/imagine）。"""
    config = build_config(payload, require_api_key=False)
    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise ImageStudioError("请先填写提示词")

    planned_prompt_images_raw = None
    for key in ("mjPromptImageUrls", "midjourneyPromptImageUrls", "mj_prompt_image_urls", "midjourney_prompt_image_urls"):
        if key in payload:
            planned_prompt_images_raw = payload.get(key)
            break
    if planned_prompt_images_raw is None and isinstance(payload.get("mjReferencePlan"), dict):
        plan = payload.get("mjReferencePlan") or {}
        if "imagePromptUrls" in plan:
            planned_prompt_images_raw = plan.get("imagePromptUrls")
    if planned_prompt_images_raw is None and isinstance(payload.get("mj_reference_plan"), dict):
        plan = payload.get("mj_reference_plan") or {}
        if "imagePromptUrls" in plan:
            planned_prompt_images_raw = plan.get("imagePromptUrls")
    image_refs = _normalize_midjourney_image_refs(planned_prompt_images_raw) if planned_prompt_images_raw is not None else _normalize_midjourney_image_refs(images if images is not None else (payload.get("reference_images") or payload.get("image")))
    prompt_urls: list[str] = []
    base64_array: list[str] = []
    for ref in image_refs:
        if _looks_like_http_url(ref):
            if ref not in prompt_urls:
                prompt_urls.append(ref)
            continue
        b64 = _midjourney_ref_to_base64(ref)
        if b64 and b64 not in base64_array:
            base64_array.append(b64)

    prompt_urls_to_prefix = [url for url in prompt_urls if url and url not in prompt]
    final_prompt = " ".join([*prompt_urls_to_prefix, prompt]).strip()
    extra_params_value = payload.get("mjParams") or payload.get("midjourneyParams") or payload.get("midjourney_params") or ""
    if isinstance(extra_params_value, dict):
        extra_params = str(extra_params_value.get("command") or extra_params_value.get("promptSuffix") or "").strip()
    else:
        extra_params = str(extra_params_value or "").strip()
    aspect_ratio = _normalize_midjourney_aspect_ratio(
        payload.get("aspectRatio")
        or payload.get("aspect_ratio")
        or payload.get("requestedRatio")
        or payload.get("requested_ratio")
        or config.size
    )
    if extra_params and extra_params not in final_prompt and not re.search(r"--(?:v|niji)\s+\S+", final_prompt, re.I):
        final_prompt = f"{final_prompt} {extra_params}".strip()
    if aspect_ratio and not re.search(r"--(?:ar|aspect)\s+\S+", final_prompt, re.I):
        final_prompt = f"{final_prompt} --ar {aspect_ratio}".strip()
    final_prompt = _sanitize_midjourney_prompt_for_version(final_prompt)

    request_payload: dict[str, Any] = {
        "botType": str(payload.get("botType") or payload.get("bot_type") or "MID_JOURNEY").strip() or "MID_JOURNEY",
        "prompt": final_prompt,
    }
    if base64_array:
        request_payload["base64Array"] = base64_array
    state = str(payload.get("state") or "").strip()
    notify_hook = str(payload.get("notifyHook") or payload.get("notify_hook") or "").strip()
    account_filter = _build_midjourney_account_filter(payload)
    if state:
        request_payload["state"] = state
    if notify_hook:
        request_payload["notifyHook"] = notify_hook
    if account_filter:
        request_payload["accountFilter"] = account_filter
    return config, request_payload


def _build_midjourney_account_filter(payload: dict[str, Any]) -> dict[str, Any]:
    raw = payload.get("accountFilter") or payload.get("account_filter") or {}
    raw_filter = raw if isinstance(raw, dict) else {}
    modes = _normalize_midjourney_speed_modes(
        payload.get("modes")
        or payload.get("mode")
        or payload.get("speedMode")
        or payload.get("speed_mode")
        or payload.get("mjSpeedMode")
        or payload.get("mj_speed_mode")
        or raw_filter.get("modes")
    )
    result: dict[str, Any] = {}
    instance_id = str(payload.get("instanceId") or payload.get("instance_id") or raw_filter.get("instanceId") or raw_filter.get("instance_id") or "").strip()
    remark = str(payload.get("remark") or raw_filter.get("remark") or "").strip()
    if instance_id:
        result["instanceId"] = instance_id
    if modes:
        result["modes"] = modes
    for source_key, target_key in [
        ("remix", "remix"),
        ("nijiRemix", "nijiRemix"),
        ("niji_remix", "nijiRemix"),
        ("remixAutoConsidered", "remixAutoConsidered"),
        ("remix_auto_considered", "remixAutoConsidered"),
    ]:
        if source_key in payload:
            result[target_key] = bool(payload.get(source_key))
        elif source_key in raw_filter:
            result[target_key] = bool(raw_filter.get(source_key))
    if remark:
        result["remark"] = remark
    return result


def _normalize_midjourney_speed_modes(value: Any) -> list[str]:
    values = value if isinstance(value, list) else [value]
    result: list[str] = []
    for item in values:
        mode = str(item or "").strip().upper()
        if mode in {"RELAX", "FAST", "TURBO"} and mode not in result:
            result.append(mode)
    return result


def _normalize_midjourney_aspect_ratio(value: Any) -> str:
    raw = str(value or "").strip().lower().replace(" ", "")
    if not raw or raw == "auto":
        return ""
    direct = re.match(r"^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$", raw)
    if direct:
        return f"{_trim_aspect_number(direct.group(1))}:{_trim_aspect_number(direct.group(2))}"
    size = re.match(r"^(\d+)x(\d+)$", raw)
    if not size:
        return ""
    width = int(size.group(1))
    height = int(size.group(2))
    if width <= 0 or height <= 0:
        return ""
    gcd = _gcd(width, height)
    return f"{width // gcd}:{height // gcd}"


def _trim_aspect_number(value: str) -> str:
    numeric = float(value)
    return str(int(numeric)) if numeric.is_integer() else str(numeric).rstrip("0").rstrip(".")


def _gcd(left: int, right: int) -> int:
    left = abs(left)
    right = abs(right)
    while right:
        left, right = right, left % right
    return left or 1


def _normalize_midjourney_image_refs(values: Any) -> list[str]:
    if values is None:
        return []
    candidates: list[Any]
    if isinstance(values, str):
        candidates = [values]
    elif isinstance(values, list):
        candidates = []
        for item in values:
            if isinstance(item, str):
                candidates.append(item)
            elif isinstance(item, dict):
                saved = item.get("saved") if isinstance(item.get("saved"), dict) else {}
                candidates.extend([
                    item.get("uploadRef"),
                    item.get("providerRef"),
                    item.get("fileId"),
                    item.get("id"),
                    item.get("file_id"),
                    item.get("remoteUrl"),
                    item.get("url"),
                    item.get("dataUrl"),
                    item.get("image"),
                    saved.get("remoteUrl"),
                    saved.get("url"),
                ])
    else:
        return []
    result: list[str] = []
    for item in candidates:
        value = str(item or "").strip()
        if not value:
            continue
        if value.startswith("data:image/") or _is_provider_image_ref(value):
            if value not in result:
                result.append(value)
    return result


def _midjourney_ref_to_base64(ref: str) -> str:
    value = str(ref or "").strip()
    if value.startswith("data:image/") and "," in value:
        return "".join(value.split(",", 1)[1].split())
    if FILE_ID_RE.match(value):
        data_url = _file_id_to_data_url(value)
        return "".join(data_url.split(",", 1)[1].split()) if "," in data_url else data_url
    return ""


# ── Gemini image payload 构建器 ──
_GEMINI_ASPECT_MAP = {
    "1:3": "1:3", "3:1": "3:1", "9:16": "9:16", "16:9": "16:9",
    "2:3": "2:3", "3:2": "3:2", "3:4": "3:4", "4:3": "4:3",
    "1:1": "1:1", "21:9": "21:9",
}
_GEMINI_SIZE_MAP = {"1k": "1K", "2k": "2K", "3k": "3K", "4k": "4K"}


def build_gemini_image_payload(payload: dict[str, Any], images: list[str] | None = None) -> tuple[ImageStudioConfig, dict[str, Any]]:
    """构建 Gemini 格式 payload（contents + generationConfig）。"""
    config = build_config(payload, require_api_key=False)
    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise ImageStudioError("请先填写提示词")

    raw_refs = _normalize_image_refs(images if images is not None else payload.get("image"))
    _assert_file_refs_allowed(config, raw_refs)
    if any(not str(ref).lower().startswith(("http://", "https://")) for ref in raw_refs):
        raise ImageStudioError("Gemini-Image 的参考图必须先上传到腾讯云 COS，并使用公网 URL")

    raw_ratio = str(payload.get("aspect_ratio") or payload.get("aspectRatio") or "").strip() or _size_to_aspect_ratio(config.size)
    aspect_ratio = _GEMINI_ASPECT_MAP.get(raw_ratio.lower(), raw_ratio) if raw_ratio else "1:1"
    if aspect_ratio not in set(_GEMINI_ASPECT_MAP.values()):
        supported = "、".join(sorted(set(_GEMINI_ASPECT_MAP.values())))
        raise ImageStudioError(f"Gemini-Image 不支持当前输出比例 {aspect_ratio}，请改用支持比例：{supported}")
    raw_size = str(payload.get("resolution") or payload.get("imageSize") or "").strip()
    image_size = _GEMINI_SIZE_MAP.get(raw_size.lower(), raw_size) if raw_size else "2K"

    parts: list[dict[str, Any]] = [{"text": prompt}]

    resolved = _resolve_image_refs_to_data_urls(images if images is not None else payload.get("image"))
    for data_url, mime in resolved:
        if data_url.startswith("data:"):
            header, b64 = data_url.split(",", 1)
            actual_mime = mime or header.split(";")[0].replace("data:", "") if ":" in header else "image/png"
            parts.append({"inlineData": {"mimeType": actual_mime, "data": b64}})
        else:
            parts.append({"fileData": {"mimeType": mime or "image/jpeg", "fileUri": data_url}})

    request_payload: dict[str, Any] = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "responseModalities": ["IMAGE"],
            "imageConfig": {"aspectRatio": aspect_ratio, "imageSize": image_size},
        },
    }
    return config, request_payload


def _normalize_gemini_response(response_payload: dict[str, Any]) -> dict[str, Any]:
    """将 Gemini 响应转为 _save_response_image 可识别的标准格式 {data: [{b64_json, mime_type}]}。"""
    error = response_payload.get("error")
    if isinstance(error, dict) and error.get("message"):
        raise ImageStudioError(f"Gemini 接口返回错误：{error.get('message')}")

    candidates = response_payload.get("candidates") or []
    if not candidates:
        raise ImageStudioError("Gemini 接口返回空结果（无 candidates）")

    parts = (candidates[0].get("content") or {}).get("parts") or []
    for part in parts:
        inline_data = part.get("inlineData")
        if not inline_data:
            continue
        b64 = str(inline_data.get("data") or "").strip()
        mime = str(inline_data.get("mimeType") or "image/png").strip()
        if b64:
            return {"data": [{"b64_json": b64, "mime_type": mime}]}

    raise ImageStudioError(f"Gemini 接口返回中未找到图片数据（无 inlineData）：{json.dumps(response_payload, ensure_ascii=False)[:500]}")


def _normalize_gpt_image_v2_response(response_payload: dict[str, Any], headers: dict[str, str], config: ImageStudioConfig) -> dict[str, Any]:
    """处理 gpt-image-v2 响应：如果 task 未完成则轮询，最终转为标准 {data: [{url}]} 格式。"""
    error = response_payload.get("error")
    if isinstance(error, dict) and error.get("message"):
        raise ImageStudioError(f"gpt-image-v2 接口返回错误：{error.get('message')}")

    task = response_payload.get("task") or {}
    status = str(task.get("status") or "").strip().lower()
    task_id = str(task.get("task_id") or response_payload.get("task_id") or "").strip()

    # 如果有 data 且包含 url，直接返回（同步已完成的情况）
    data = response_payload.get("data")
    if isinstance(data, list) and data:
        first = data[0]
        if isinstance(first, dict) and (first.get("url") or first.get("b64_json")):
            return response_payload

    # task 未完成 → 轮询
    if status in ("queued", "processing") or (task_id and not data):
        if not task_id:
            raise ImageStudioError(f"gpt-image-v2 任务状态未知，无法轮询: {json.dumps(response_payload, ensure_ascii=False)[:500]}")

        poll_url = f"{build_endpoint_url(config, '/images/generations').rstrip('/')}/{task_id}"
        max_wait = 300
        poll_interval = 3
        elapsed = 0
        print(f"[gpt-image-v2] 任务 {task_id} 状态={status}，开始轮询...", flush=True)
        while elapsed < max_wait:
            time.sleep(poll_interval)
            elapsed += poll_interval
            try:
                poll_resp = _request_json_get(poll_url, headers, timeout=30)
            except ImageStudioError:
                time.sleep(2)
                continue
            poll_status = str((poll_resp.get("task") or {}).get("status") or "").strip().lower()
            poll_progress = (poll_resp.get("task") or {}).get("progress", 0)
            print(f"[gpt-image-v2] 轮询 {task_id}: status={poll_status}, progress={poll_progress}%, elapsed={elapsed}s", flush=True)
            if poll_status == "completed":
                poll_data = poll_resp.get("data")
                if isinstance(poll_data, list) and poll_data:
                    return poll_resp
                result_urls = (poll_resp.get("task") or {}).get("result_urls") or []
                if result_urls:
                    return {"data": [{"url": u} for u in result_urls]}
                raise ImageStudioError(f"gpt-image-v2 任务 {task_id} 已完成但未返回图片数据")
            if poll_status == "failed":
                err_msg = (poll_resp.get("task") or {}).get("error") or poll_resp.get("error") or "未知原因"
                raise ImageStudioError(f"gpt-image-v2 任务 {task_id} 生成失败：{err_msg}")
        raise ImageStudioError(f"gpt-image-v2 任务 {task_id} 超时（{max_wait}s），最后状态={poll_status}")

    # data 为空且非轮询场景
    return response_payload


def _normalize_midjourney_imagine_response(response_payload: dict[str, Any], headers: dict[str, str], config: ImageStudioConfig) -> dict[str, Any]:
    """处理 Midjourney Imagine 异步提交响应，并轮询到最终图片 URL。"""
    if _midjourney_submit_rejected(response_payload):
        raise ImageStudioError(f"Midjourney Imagine 提交失败：{_midjourney_error_message(response_payload)}")

    urls = _extract_midjourney_image_urls(response_payload)
    if urls:
        return {"data": [{"url": url} for url in urls], "rawResponse": response_payload}

    task_id = _extract_midjourney_task_id(response_payload)
    if not task_id:
        return response_payload

    max_wait = int(os.environ.get("MIDJOURNEY_IMAGE_MAX_WAIT_SECONDS", "600") or "600")
    poll_interval = int(os.environ.get("MIDJOURNEY_IMAGE_POLL_INTERVAL_SECONDS", "4") or "4")
    poll_interval = max(2, poll_interval)
    elapsed = 0
    last_status = ""
    print(f"[Midjourney] 任务 {task_id} 已提交，开始轮询...", flush=True)
    while elapsed < max_wait:
        time.sleep(poll_interval)
        elapsed += poll_interval
        poll_url = _midjourney_status_url(config, task_id)
        try:
            poll_resp = _request_json_get(poll_url, headers, timeout=60)
        except ImageStudioError as exc:
            print(f"[Midjourney] 轮询 {task_id} 暂时失败：{exc}", flush=True)
            continue
        last_status = _extract_midjourney_status(poll_resp)
        progress = _extract_midjourney_progress(poll_resp)
        print(f"[Midjourney] 轮询 {task_id}: status={last_status or 'unknown'}, progress={progress}%, elapsed={elapsed}s", flush=True)
        urls = _extract_midjourney_image_urls(poll_resp)
        if urls:
            return {"data": [{"url": url} for url in urls], "taskId": task_id, "rawResponse": poll_resp}
        if last_status in {"failed", "failure", "fail", "error", "cancelled", "canceled"}:
            raise ImageStudioError(f"Midjourney Imagine 任务 {task_id} 生成失败：{_midjourney_error_message(poll_resp)}")
        if last_status in {"success", "succeeded", "completed", "done", "finished"}:
            raise ImageStudioError(f"Midjourney Imagine 任务 {task_id} 已完成但未返回图片 URL：{json.dumps(poll_resp, ensure_ascii=False)[:500]}")
    raise ImageStudioError(f"Midjourney Imagine 任务 {task_id} 超时（{max_wait}s），最后状态={last_status or 'unknown'}")


def _midjourney_status_url(config: ImageStudioConfig, task_id: str) -> str:
    raw_path = (config.status_endpoint_path or "/mj/task/{taskId}/fetch").strip()
    has_placeholder = any(token in raw_path for token in ("{taskId}", "{task_id}", "{id}"))
    endpoint_path = raw_path.replace("{taskId}", task_id).replace("{task_id}", task_id).replace("{id}", task_id)
    url = build_endpoint_url(config, endpoint_path, force_default=True)
    if has_placeholder:
        return url
    separator = "&" if "?" in url else "?"
    return f"{url}{separator}{urlencode({'taskId': task_id, 'task_id': task_id, 'id': task_id})}"


def _midjourney_submit_rejected(payload: dict[str, Any]) -> bool:
    code = payload.get("code")
    if code is None or code == "":
        return False
    return str(code).strip().lower() not in {"0", "1", "200", "success", "ok"}


def _extract_midjourney_task_id(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    result = payload.get("result")
    data_result = data.get("result") if isinstance(data, dict) else None
    candidates = [
        result,
        data_result,
        payload.get("taskId"),
        payload.get("task_id"),
        payload.get("id"),
        data.get("taskId"),
        data.get("task_id"),
        data.get("id"),
    ]
    for item in candidates:
        if isinstance(item, dict):
            nested = item.get("taskId") or item.get("task_id") or item.get("id")
            if nested:
                item = nested
        if isinstance(item, (str, int, float)):
            value = str(item).strip()
            if value and not _looks_like_http_url(value):
                return value
    return ""


def _extract_midjourney_status(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    result = payload.get("result") if isinstance(payload.get("result"), dict) else {}
    candidates = [
        payload.get("status"),
        payload.get("state"),
        payload.get("action"),
        data.get("status"),
        data.get("state"),
        result.get("status"),
        result.get("state"),
    ]
    return next((str(item).strip().lower() for item in candidates if str(item or "").strip()), "")


def _extract_midjourney_progress(payload: Any) -> int:
    if not isinstance(payload, dict):
        return 0
    data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    result = payload.get("result") if isinstance(payload.get("result"), dict) else {}
    for item in [payload.get("progress"), data.get("progress"), result.get("progress")]:
        text = str(item or "").strip().rstrip("%")
        if not text:
            continue
        try:
            return max(0, min(99, int(float(text))))
        except ValueError:
            continue
    return 0


def _extract_midjourney_image_urls(payload: Any) -> list[str]:
    urls: list[str] = []

    def visit(value: Any, key: str = "") -> None:
        if value is None:
            return
        if isinstance(value, str):
            raw = value.strip()
            if _looks_like_http_url(raw) and re.search(r"url|uri|image|output|result", key, re.I) and raw not in urls:
                urls.append(raw)
            return
        if isinstance(value, list):
            for item in value:
                visit(item, key)
            return
        if isinstance(value, dict):
            for item_key, item in value.items():
                visit(item, item_key)

    visit(payload)
    return urls


def _midjourney_error_message(payload: Any) -> str:
    if not isinstance(payload, dict):
        return str(payload or "未知原因")
    candidates = [
        payload.get("description"),
        payload.get("message"),
        payload.get("msg"),
        payload.get("error"),
        payload.get("failReason"),
        payload.get("fail_reason"),
    ]
    for item in candidates:
        if isinstance(item, dict):
            item = item.get("message") or item.get("description") or item.get("error")
        text = str(item or "").strip()
        if text:
            return text
    return json.dumps(payload, ensure_ascii=False)[:500]


def _is_probably_size_compat_error(exc: Exception) -> bool:
    text = str(exc).lower()
    auth_markers = (
        "auth_unavailable",
        "unauthorized",
        "forbidden",
        "invalid api key",
        "invalid_api_key",
        "no auth available",
        "authentication",
        "permission",
    )
    if any(marker in text for marker in auth_markers):
        return False
    image_ref_markers = (
        "error while downloading",
        "while downloading",
        "invalid_image_url",
        "image url",
        "image_url",
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "file_id is not supported",
        "image_url is required",
        "invalid image",
        "invalid mask",
        "file id",
        "file_id",
        "file-",
        "mask",
        "image is required",
        "images is required",
    )
    if any(marker in text for marker in image_ref_markers):
        return False
    size_markers = (
        "unsupported size",
        "invalid size",
        "size is not supported",
        "unsupported dimensions",
        "invalid dimensions",
        "width/height",
        "width and height",
        "resolution",
        "2k",
        "4k",
    )
    return any(marker in text for marker in size_markers)


def _is_probably_response_format_compat_error(exc: Exception) -> bool:
    text = str(exc).split("请求调试信息：", 1)[0].lower()
    markers = (
        "response_format",
        "unsupported response format",
        "invalid response format",
        "url is not supported",
        "b64_json",
    )
    return any(marker in text for marker in markers)


def _request_json_with_response_format_fallback(url: str, headers: dict[str, str], payload: dict[str, Any]) -> dict[str, Any]:
    try:
        return _request_json(url, headers, payload)
    except ImageStudioError as exc:
        if str(payload.get("response_format") or "") != "url" or not _is_probably_response_format_compat_error(exc):
            raise
        if os.environ.get("IMAGE_STUDIO_DISABLE_B64_FALLBACK", "").strip().lower() in {"1", "true", "yes"}:
            raise ImageStudioError(
                "上游不接受 response_format=url，但当前画布要求生图结果走 URL 响应；"
                "已停止自动改用 b64_json。请检查当前 API 通道是否支持 URL 返回。"
                f"原始错误：{exc}"
            ) from exc
        alt_payload = dict(payload)
        alt_payload["response_format"] = "b64_json"
        return _request_json(url, headers, alt_payload)


def build_endpoint_url(config: ImageStudioConfig, default_path: str = "", force_default: bool = False) -> str:
    endpoint_path = ((default_path if force_default else (config.endpoint_path or default_path)) or "").strip().replace("{model}", config.model)
    if endpoint_path.startswith("http://") or endpoint_path.startswith("https://"):
        return endpoint_path
    if not endpoint_path:
        return config.base_url
    return f"{config.base_url.rstrip('/')}/{endpoint_path.lstrip('/')}"


def _request_image_generation_once(config: ImageStudioConfig, request_payload: dict[str, Any]) -> dict[str, Any]:
    """按 adapter 选择 endpoint 并发送一次请求，Gemini 响应自动标准化。"""
    _assert_gpt_image_v2_api_key_ready(config)
    headers = _json_headers(config.api_key)

    if config.adapter == "gemini-image":
        endpoint = build_endpoint_url(config, f"/v1beta/models/{config.model}:generateContent")
        raw_response = _request_json(endpoint, headers, request_payload)
        return _normalize_gemini_response(raw_response)

    if config.adapter == "gpt-image-v2":
        endpoint = build_endpoint_url(config, "/images/generations")
        raw_response = _request_json(endpoint, headers, request_payload)
        return _normalize_gpt_image_v2_response(raw_response, headers, config)

    if config.adapter == "midjourney-imagine":
        endpoint = build_endpoint_url(config, "/mj/submit/imagine")
        raw_response = _request_json(endpoint, headers, request_payload)
        return _normalize_midjourney_imagine_response(raw_response, headers, config)

    # openai-edits / openai-generations（标准兼容模式）
    # GPT-Image-2-pro 这类 openai-edits 渠道即使是文生图也必须走配置的 /images/edits；
    # 只有明确标记为 openai-generations 的兼容渠道才走 /images/generations。
    endpoint_suffix = "/images/generations" if config.adapter == "openai-generations" else "/images/edits"
    endpoint = build_endpoint_url(config, endpoint_suffix)
    filtered_payload = request_payload
    if endpoint_suffix == "/images/generations":
        allowed_keys = {"model", "prompt", "size", "n", "response_format", "quality", "style", "width", "height"}
        filtered_payload = {k: v for k, v in request_payload.items() if k in allowed_keys}
    try:
        return _request_json_with_response_format_fallback(endpoint, headers, filtered_payload)
    except ImageStudioError as exc:
        width, height = _parse_image_size(str(filtered_payload.get("size") or ""))
        if not width or not height or not _is_probably_size_compat_error(exc):
            raise
        alt_payload = dict(filtered_payload)
        alt_payload.pop("size", None)
        alt_payload["width"] = width
        alt_payload["height"] = height
        try:
            return _request_json_with_response_format_fallback(endpoint, headers, alt_payload)
        except ImageStudioError as alt_exc:
            raise ImageStudioError(
                "高分辨率请求失败：已先按 size 原样请求，又改用 width/height 兼容参数重试，但上游仍拒绝。"
                f"原始错误：{exc}；兼容重试错误：{alt_exc}"
            ) from alt_exc


def _is_non_retryable_generation_error(exc: Exception) -> bool:
    text = str(exc).split("请求调试信息：", 1)[0].lower()
    markers = (
        "认证失败",
        "api key",
        "invalid token",
        "unauthorized",
        "forbidden",
        "没有该模型渠道权限",
        "请先填写",
        "未检测到",
        "不支持",
        "not supported",
        "参考图必须",
        "mask 必须",
        "找不到上传文件",
        "不是图片文件",
        "内容为空",
        "invalid image",
        "invalid mask",
        "content policy",
        "safety",
    )
    return any(marker in text for marker in markers)


def _request_image_generation_with_size_fallback(config: ImageStudioConfig, request_payload: dict[str, Any]) -> dict[str, Any]:
    max_attempts = 3
    last_error: ImageStudioError | None = None
    for attempt in range(1, max_attempts + 1):
        try:
            return _request_image_generation_once(config, request_payload)
        except ImageStudioError as exc:
            last_error = exc
            if attempt >= max_attempts or _is_non_retryable_generation_error(exc):
                break
            print(f"[ImageStudio Retry] 生图请求失败，准备第 {attempt + 1}/{max_attempts} 次尝试：{exc}", flush=True)
            time.sleep(1.2 * attempt)
    if last_error is not None and max_attempts > 1 and not _is_non_retryable_generation_error(last_error):
        raise ImageStudioError(f"生图请求失败：已连续尝试 {max_attempts} 次仍未成功。最后错误：{last_error}") from last_error
    if last_error is not None:
        raise last_error
    raise ImageStudioError("生图请求失败")


def _is_provider_image_ref(value: Any) -> bool:
    ref = str(value or "").strip()
    if not ref:
        return False
    lowered = ref.lower()
    if lowered.startswith("data:") or lowered.startswith("blob:"):
        return False
    return bool(FILE_ID_RE.match(ref) or lowered.startswith("http://") or lowered.startswith("https://"))


def _normalize_image_refs(values: Any) -> list[str]:
    if values is None:
        return []
    if isinstance(values, str):
        candidates = [values]
    elif isinstance(values, list):
        candidates = []
        for item in values:
            if isinstance(item, str):
                candidates.append(item)
            elif isinstance(item, dict):
                candidates.extend([
                    item.get("uploadRef"),
                    item.get("providerRef"),
                    item.get("fileId"),
                    item.get("id"),
                    item.get("file_id"),
                    item.get("remoteUrl"),
                    item.get("image"),
                ])
    else:
        return []
    result: list[str] = []
    for item in candidates:
        value = str(item or "").strip()
        if _is_provider_image_ref(value) and value not in result:
            result.append(value)
    return result


def _file_id_to_data_url(file_id: str) -> str:
    clean_id = str(file_id or "").strip()
    if not FILE_ID_RE.match(clean_id):
        return clean_id
    meta_path = IMAGE_STUDIO_FILES_DIR / f"{clean_id}.json"
    bin_path = IMAGE_STUDIO_FILES_DIR / f"{clean_id}.bin"
    if not meta_path.exists() or not bin_path.exists():
        raise ImageStudioError(f"找不到上传文件 {clean_id}，请重新通过 /v1/files 上传参考图")
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ImageStudioError(f"上传文件元数据损坏：{clean_id}") from exc
    mime_type = str(meta.get("mime_type") or meta.get("contentType") or "image/png").split(";", 1)[0].strip().lower() or "image/png"
    if not mime_type.startswith("image/"):
        raise ImageStudioError(f"上传文件 {clean_id} 不是图片文件")
    binary = bin_path.read_bytes()
    if not binary:
        raise ImageStudioError(f"上传文件 {clean_id} 内容为空，请重新上传")
    encoded = base64.b64encode(binary).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def _resolve_image_ref_for_upstream(value: str) -> str:
    ref = str(value or "").strip()
    if not _is_provider_image_ref(ref):
        return ""
    return ref


def _resolve_image_refs_for_upstream(values: Any) -> list[str]:
    resolved: list[str] = []
    for ref in _normalize_image_refs(values):
        value = _resolve_image_ref_for_upstream(ref)
        if value and value not in resolved:
            resolved.append(value)
    return resolved


def build_image_payload(payload: dict[str, Any], images: list[str] | None = None, mask: str | None = None) -> tuple[ImageStudioConfig, dict[str, Any]]:
    """统一分发：按 adapter 选择对应的 payload 构建器。"""
    config = build_config(payload, require_api_key=False)
    if config.adapter == "gpt-image-v2":
        return build_gpt_image_v2_payload(payload, images=images)
    if config.adapter == "gemini-image":
        return build_gemini_image_payload(payload, images=images)
    if config.adapter == "midjourney-imagine":
        return build_midjourney_imagine_payload(payload, images=images)
    return build_gpt_image2_edits_payload(payload, images=images, mask=mask)


def build_gpt_image2_edits_payload(payload: dict[str, Any], images: list[str] | None = None, mask: str | None = None) -> tuple[ImageStudioConfig, dict[str, Any]]:
    config = build_config(payload, require_api_key=False)
    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise ImageStudioError("请先填写提示词")
    request_payload: dict[str, Any] = {
        "model": config.model,
        "prompt": prompt,
        "size": config.size,
        "response_format": "url",
    }
    image_refs = _resolve_image_refs_for_upstream(images if images is not None else payload.get("image"))
    _assert_file_refs_allowed(config, image_refs)
    if image_refs:
        request_payload["image"] = image_refs
    mask_value = str(mask or payload.get("mask") or "").strip()
    if mask_value:
        resolved_mask = _resolve_image_ref_for_upstream(mask_value)
        if not resolved_mask:
            raise ImageStudioError("mask 必须是 file-xxx 或 http(s) URL")
        _assert_file_refs_allowed(config, [resolved_mask])
        request_payload["mask"] = resolved_mask
    if config.background:
        request_payload["background"] = config.background
    if payload.get("n"):
        request_payload["n"] = payload.get("n")
    return config, request_payload


def generate_from_text(payload: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    config, request_payload = build_image_payload(payload, images=[])
    prompt = str(request_payload.get("prompt") or "").strip()

    response_payload = _request_image_generation_with_size_fallback(config, request_payload)
    saved = _save_response_image(response_payload, ensure_output_dir(output_dir), "txt2img", config.base_url)
    saved["requestedSize"] = config.size
    saved["requestedRatio"] = config.requested_ratio
    saved["requestedResolution"] = config.requested_resolution
    saved["requestedPixelSize"] = config.requested_pixel_size
    return {
        "mode": "txt2img",
        "prompt": prompt,
        "size": config.size,
        "requestedRatio": config.requested_ratio,
        "requestedResolution": config.requested_resolution,
        "requestedPixelSize": config.requested_pixel_size,
        "actualSize": saved.get("actualSize", ""),
        "model": config.model,
        "saved": saved,
        "rawResponse": response_payload,
    }


def edit_image(payload: dict[str, Any], reference_images: str | list[str], output_dir: Path) -> dict[str, Any]:
    reference_values = _normalize_image_refs(reference_images)
    if not reference_values:
        raise ImageStudioError("图生图输入图片不存在")

    config, request_payload = build_image_payload(payload, images=reference_values)
    prompt = str(request_payload.get("prompt") or "").strip()

    response_payload = _request_image_generation_with_size_fallback(config, request_payload)
    saved = _save_response_image(response_payload, ensure_output_dir(output_dir), "img2img", config.base_url)
    saved["requestedSize"] = config.size
    saved["requestedRatio"] = config.requested_ratio
    saved["requestedResolution"] = config.requested_resolution
    saved["requestedPixelSize"] = config.requested_pixel_size
    return {
        "mode": "img2img",
        "prompt": prompt,
        "size": config.size,
        "requestedRatio": config.requested_ratio,
        "requestedResolution": config.requested_resolution,
        "requestedPixelSize": config.requested_pixel_size,
        "actualSize": saved.get("actualSize", ""),
        "model": config.model,
        "saved": saved,
        "rawResponse": response_payload,
    }


def generate_panorama(payload: dict[str, Any], reference_images: list[str], output_dir: Path) -> dict[str, Any]:
    reference_values = _normalize_image_refs(reference_images)
    if not reference_values:
        raise ImageStudioError("生成全景图至少需要一张参考图")
    config, request_payload = build_image_payload(payload, images=reference_values)
    prompt = str(request_payload.get("prompt") or "").strip()
    if config.adapter not in {"gpt-image-v2", "gemini-image", "midjourney-imagine"}:
        if "seam_fix" not in request_payload:
            request_payload["seam_fix"] = str(payload.get("seamFix") or payload.get("seam_fix") or "auto").strip() or "auto"
        strength = str(payload.get("strength") or "").strip()
        if strength:
            request_payload["strength"] = strength
        lora_weight = str(payload.get("loraWeight") or payload.get("lora_weight") or "").strip()
        if lora_weight:
            request_payload["lora_weight"] = lora_weight
    response_payload = _request_image_generation_with_size_fallback(config, request_payload)
    saved = _save_response_image(response_payload, ensure_output_dir(output_dir), "panorama", config.base_url)
    saved["requestedSize"] = config.size
    saved["requestedRatio"] = config.requested_ratio
    saved["requestedResolution"] = config.requested_resolution
    saved["requestedPixelSize"] = config.requested_pixel_size
    return {
        "mode": "panorama",
        "prompt": prompt,
        "size": config.size,
        "requestedRatio": config.requested_ratio,
        "requestedResolution": config.requested_resolution,
        "requestedPixelSize": config.requested_pixel_size,
        "actualSize": saved.get("actualSize", ""),
        "model": config.model,
        "saved": saved,
        "rawResponse": response_payload,
    }


def repair_image(payload: dict[str, Any], reference_images: str | list[str], output_dir: Path, mask: str | None = None) -> dict[str, Any]:
    reference_values = _normalize_image_refs(reference_images)
    if not reference_values:
        raise ImageStudioError("修图模式需要至少一张参考图")

    config, request_payload = build_image_payload(payload, images=reference_values, mask=mask)
    prompt = str(request_payload.get("prompt") or "").strip()

    response_payload = _request_image_generation_with_size_fallback(config, request_payload)
    saved = _save_response_image(response_payload, ensure_output_dir(output_dir), "repair", config.base_url)
    saved["requestedSize"] = config.size
    saved["requestedRatio"] = config.requested_ratio
    saved["requestedResolution"] = config.requested_resolution
    saved["requestedPixelSize"] = config.requested_pixel_size
    return {
        "mode": "repair",
        "prompt": prompt,
        "size": config.size,
        "requestedRatio": config.requested_ratio,
        "requestedResolution": config.requested_resolution,
        "requestedPixelSize": config.requested_pixel_size,
        "actualSize": saved.get("actualSize", ""),
        "model": config.model,
        "saved": saved,
        "rawResponse": response_payload,
    }


# ═══════════════════════════════════════════════════════════
#  Seedance 2.0 视频生成（异步任务模式）
# ═══════════════════════════════════════════════════════════

def _get_json(url: str, headers: dict[str, str], timeout: int = 60) -> dict[str, Any]:
    """GET 请求 JSON"""
    return _request_json_get(url, headers, timeout=timeout)


def _download_binary_with_headers(url: str, headers: dict[str, str] | None = None, timeout: int = 300, retries: int = 3) -> tuple[bytes, str]:
    last_error: Exception | None = None
    request_headers = {"User-Agent": "image-studio/1.0", **(headers or {})}
    for attempt in range(retries):
        request = Request(url, headers=request_headers, method="GET")
        try:
            with urlopen(request, timeout=timeout) as response:
                content_type = response.headers.get("Content-Type", "")
                return response.read(), content_type
        except HTTPError as exc:
            body = exc.read().decode("utf-8", errors="ignore")
            last_error = ImageStudioError(f"下载生成视频失败 HTTP {exc.code}: {body}")
            if 400 <= exc.code < 500 and exc.code not in {408, 429}:
                break
        except URLError as exc:
            last_error = ImageStudioError(f"下载生成视频失败: {exc}")
        except OSError as exc:
            last_error = ImageStudioError(f"下载生成视频失败: {exc}")
        if attempt < retries - 1:
            time.sleep(0.8 * (attempt + 1))
    if isinstance(last_error, ImageStudioError):
        raise last_error
    raise ImageStudioError("下载生成视频失败")


def _normalize_seedance_duration(value: Any) -> str:
    text = str(value or "5").strip().lower().replace("秒", "s")
    if not text:
        text = "5"
    return text if text.endswith("s") else f"{text}s"


def _normalize_seedance_video_mode(value: Any) -> str:
    text = str(value or "text-to-video").strip().lower().replace("_", "-")
    if text in {"text2video", "t2v", "txt2video"}:
        return "text-to-video"
    if text in {"img2video", "image-to-video", "i2v", "full", "fullplus", "full-plus", "imgref", "img-ref", "firstlast", "first-last"}:
        return "video-to-video"
    return text or "text-to-video"


def build_seedance_chat_model_name(base_model: str, video_mode: str, duration: Any, quality: str, aspect_ratio: str) -> str:
    base = str(base_model or "").strip()
    if not base:
        raise ImageStudioError("请先填写模型名称")
    mode = _normalize_seedance_video_mode(video_mode)
    duration_text = _normalize_seedance_duration(duration)
    quality_text = str(quality or "720p").strip() or "720p"
    ratio_text = str(aspect_ratio or "9:16").strip() or "9:16"
    return f"{base}-{mode}+{duration_text}+{quality_text}+{ratio_text}"


def _extract_video_url_from_chat_response(response_payload: dict[str, Any]) -> str:
    candidates: list[Any] = [
        response_payload.get("video_url"),
        response_payload.get("url"),
        response_payload.get("output"),
    ]
    data = response_payload.get("data")
    if isinstance(data, list):
        candidates.extend(data)
    elif data:
        candidates.append(data)
    choices = response_payload.get("choices")
    if isinstance(choices, list):
        for choice in choices:
            if isinstance(choice, dict):
                candidates.append(choice.get("message", {}).get("content"))
                candidates.append(choice.get("text"))

    def walk(value: Any) -> str:
        if isinstance(value, str):
            text = value.strip()
            if _looks_like_http_url(text):
                return text
            match = re.search(r"https?://[^\s\"'<>]+", text)
            return match.group(0) if match else ""
        if isinstance(value, dict):
            for key in ("video_url", "url", "video", "content", "output"):
                found = walk(value.get(key))
                if found:
                    return found
            for nested in value.values():
                found = walk(nested)
                if found:
                    return found
        if isinstance(value, list):
            for item in value:
                found = walk(item)
                if found:
                    return found
        return ""

    return walk(candidates)


def generate_seedance_chat_video(payload: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    """Seedance chat/completions 同步视频生成：独立 UI 参数 → 真实模型名 → messages 请求体。"""
    config = build_video_config(payload)
    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise ImageStudioError("请先填写提示词")

    endpoint = config.endpoint_url
    base_model = config.model
    video_mode = _normalize_seedance_video_mode(payload.get("videoMode") or payload.get("refMode"))
    full_model_name = build_seedance_chat_model_name(
        base_model,
        video_mode,
        payload.get("duration") or "5",
        str(payload.get("quality") or "720p").strip(),
        str(payload.get("aspectRatio") or "9:16").strip(),
    )
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    images = payload.get("images") or []
    if isinstance(images, list):
        for idx, image in enumerate(images):
            image_url = str(image.get("dataUrl") or image.get("url") if isinstance(image, dict) else image or "").strip()
            if not image_url:
                continue
            role = "reference_image"
            ref_mode = str(payload.get("refMode") or "").strip()
            if ref_mode == "firstLast":
                role = "first_frame" if idx == 0 else "last_frame" if idx == 1 else "reference_image"
            elif idx == 0 and video_mode == "video-to-video":
                role = "first_frame" if len(images) == 1 and ref_mode in {"img2video", "image-to-video"} else "reference_image"
            content.append({"type": "image_url", "image_url": {"url": image_url}, "role": role})

    request_body: dict[str, Any] = {
        "model": full_model_name,
        "messages": [{"role": "user", "content": content}],
    }
    response_payload = _request_json(endpoint, _json_headers(config.api_key), request_body, timeout=900)
    video_url = _extract_video_url_from_chat_response(response_payload)
    if not video_url:
        raise ImageStudioError(f"Seedance 接口已返回响应，但未找到视频 URL：{json.dumps(response_payload, ensure_ascii=False)[:500]}")
    return _finalize_video(
        video_url,
        prompt,
        full_model_name,
        _normalize_seedance_duration(payload.get("duration") or "5"),
        str(payload.get("quality") or "720p").strip() or "720p",
        str(payload.get("aspectRatio") or "9:16").strip() or "9:16",
        output_dir,
        response_payload,
    )


def _image_entry_to_url(image: Any) -> str:
    if isinstance(image, dict):
        saved = image.get("saved") if isinstance(image.get("saved"), dict) else {}
        return str(
            image.get("remoteUrl")
            or image.get("providerRef")
            or image.get("uploadRef")
            or image.get("fileId")
            or image.get("file_id")
            or image.get("id")
            or image.get("image_url")
            or saved.get("remoteUrl")
            or saved.get("url")
            or image.get("url")
            or image.get("dataUrl")
            or ""
        ).strip()
    return str(image or "").strip()


def _media_entry_to_url(media: Any, kind: str = "video") -> str:
    if isinstance(media, dict):
        saved = media.get("saved") if isinstance(media.get("saved"), dict) else {}
        kind_url_key = "audioUrl" if kind == "audio" else "videoUrl"
        return str(
            media.get("remoteUrl")
            or media.get("providerRef")
            or media.get("uploadRef")
            or media.get("fileId")
            or media.get("file_id")
            or media.get("id")
            or media.get(kind_url_key)
            or media.get("contentUrl")
            or media.get("downloadUrl")
            or saved.get("remoteUrl")
            or saved.get("url")
            or media.get("url")
            or media.get("dataUrl")
            or ""
        ).strip()
    return str(media or "").strip()


def _payload_url_list(payload: dict[str, Any], keys: list[str], kind: str, limit: int) -> list[str]:
    urls: list[str] = []
    for key in keys:
        raw = payload.get(key)
        if raw is None:
            continue
        entries = raw if isinstance(raw, list) else [raw]
        for entry in entries:
            url = _media_entry_to_url(entry, kind)
            if _looks_like_http_url(url) and url not in urls:
                urls.append(url)
            if len(urls) >= limit:
                return urls[:limit]
    return urls[:limit]


def _payload_image_url_list(payload: dict[str, Any], keys: list[str], limit: int) -> list[str]:
    urls: list[str] = []
    for key in keys:
        raw = payload.get(key)
        if raw is None:
            continue
        entries = raw if isinstance(raw, list) else [raw]
        for entry in entries:
            url = _image_entry_to_url(entry)
            if _looks_like_http_url(url) and url not in urls:
                urls.append(url)
            if len(urls) >= limit:
                return urls[:limit]
    return urls[:limit]


def video_config_url(payload: dict[str, Any]) -> str:
    return normalize_base_url(str(payload.get("baseUrl") or payload.get("url") or ""))


@dataclass
class VideoStudioConfig:
    endpoint_url: str
    api_key: str
    model: str
    adapter: str = "notevideo"
    request_method: str = "async-poll"


def normalize_video_adapter_name(value: Any, endpoint_url: str = "") -> str:
    adapter = str(value or "").strip().lower().replace("_", "-")
    if adapter:
        return adapter
    return "openai-chat" if "/chat/completions" in str(endpoint_url or "") else "notevideo"


def build_video_config(payload: dict[str, Any]) -> VideoStudioConfig:
    endpoint_url = video_config_url(payload)
    api_key = str(payload.get("apiKey") or "").strip()
    if not api_key:
        raise ImageStudioError("未检测到视频 API Key，请先在视频模型配置中填写 API Key")
    model = str(payload.get("model") or "").strip()
    if not model:
        raise ImageStudioError("请先在视频模型配置中填写模型名称")
    adapter = normalize_video_adapter_name(payload.get("adapter") or payload.get("protocolAdapter"), endpoint_url)
    request_method = str(payload.get("requestMethod") or payload.get("protocolMethod") or "async-poll").strip().lower() or "async-poll"
    return VideoStudioConfig(endpoint_url=endpoint_url, api_key=api_key, model=model, adapter=adapter, request_method=request_method)


def _payload_has_key(payload: dict[str, Any], *keys: str) -> bool:
    return any(key in payload for key in keys)


def _payload_bool(payload: dict[str, Any], keys: list[str], default: bool = True) -> bool:
    for key in keys:
        if key in payload:
            return payload.get(key) is not False
    return default


def _set_nested_request_field(target: dict[str, Any], dotted_field: str, value: Any) -> None:
    parts = [part.strip() for part in str(dotted_field or "").split(".") if part.strip()]
    if not parts:
        return
    cursor = target
    for part in parts[:-1]:
        next_value = cursor.get(part)
        if not isinstance(next_value, dict):
            next_value = {}
            cursor[part] = next_value
        cursor = next_value
    cursor[parts[-1]] = value


def _video_sound_field(payload: dict[str, Any], default_field: str = "generate_audio") -> str:
    protocol = payload.get("protocol") if isinstance(payload.get("protocol"), dict) else {}
    field = str(
        payload.get("soundField")
        or payload.get("sound_field")
        or protocol.get("soundField")
        or protocol.get("sound_field")
        or default_field
        or ""
    ).strip()
    if field.lower() in {"false", "none", "null", "0", "off"}:
        return ""
    if field == "metadata.enableSound" and default_field:
        return default_field
    return field


def _apply_video_sound_control(request_body: dict[str, Any], payload: dict[str, Any], default_field: str = "generate_audio") -> None:
    field = _video_sound_field(payload, default_field)
    if not field:
        return
    enabled = _payload_bool(payload, ["generateAudio", "generate_audio", "enableSound", "enable_sound"], True)
    _set_nested_request_field(request_body, field, enabled)


def _extract_response_id(response_payload: dict[str, Any]) -> str:
    data = response_payload.get("data")
    data_obj = data if isinstance(data, dict) else {}
    return str(
        response_payload.get("id")
        or response_payload.get("task_id")
        or response_payload.get("video_id")
        or data_obj.get("id")
        or data_obj.get("task_id")
        or data_obj.get("video_id")
        or ""
    ).strip()


def _build_video_status_url(endpoint_url: str, video_id: str) -> str:
    if not video_id:
        return endpoint_url
    marker = f"/{video_id}"
    if marker in endpoint_url:
        return endpoint_url.split(marker, 1)[0] + marker
    return f"{endpoint_url}/{video_id}"


def _extract_video_status(response_payload: dict[str, Any]) -> str:
    data = response_payload.get("data")
    data_obj = data if isinstance(data, dict) else {}
    return str(response_payload.get("status") or data_obj.get("status") or "").strip().lower()


def _extract_video_error(response_payload: dict[str, Any]) -> str:
    data = response_payload.get("data")
    data_obj = data if isinstance(data, dict) else {}
    return str(
        response_payload.get("error")
        or response_payload.get("message")
        or response_payload.get("msg")
        or data_obj.get("error")
        or data_obj.get("message")
        or data_obj.get("msg")
        or "未知错误"
    )


def _extract_video_progress(response_payload: dict[str, Any]) -> int:
    data = response_payload.get("data")
    data_obj = data if isinstance(data, dict) else {}
    raw = response_payload.get("progress", data_obj.get("progress", 0))
    try:
        return max(0, min(100, int(float(str(raw).strip().replace("%", "")))))
    except (TypeError, ValueError):
        return 0


def _normalize_sora_video_pro_duration(value: Any) -> int:
    text = str(value or "5").strip().lower().replace("秒", "").replace("s", "")
    if not text:
        text = "5"
    try:
        duration = int(float(text))
    except ValueError as exc:
        raise ImageStudioError("video-pro-720p 视频时长 duration 必须是数字，范围 4-15 秒") from exc
    return max(4, min(15, duration))


def _normalize_sora_video_pro_aspect_ratio(value: Any) -> str:
    aspect_ratio = str(value or "16:9").strip() or "16:9"
    allowed = {"16:9", "9:16", "1:1", "21:9", "3:4", "4:3"}
    return aspect_ratio if aspect_ratio in allowed else "16:9"


def _is_artifex_video_adapter(adapter: Any) -> bool:
    return str(adapter or "").strip().lower() in {"sora-video-pro", "seedance2", "seedance2.0"}


def _is_lingdong_sd2_vip_adapter(adapter: Any) -> bool:
    return str(adapter or "").strip().lower() in {"lingdong-sd-2-vip", "sd-2-vip"}


def _is_zaomeng_seedance2_adapter(adapter: Any) -> bool:
    return str(adapter or "").strip().lower() in {"zaomeng-seedance2", "zaomeng-seedance2-svip", "zaomeng-seedance2-fast"}


def _is_seedance2_sd_adapter(adapter: Any) -> bool:
    return str(adapter or "").strip().lower() in {"seedance2-sd", "canvas-sd2", "sd2"}


def _is_toapis_seedance2_adapter(adapter: Any) -> bool:
    return str(adapter or "").strip().lower() in {"toapis-seedance2", "toapis-seedance-2", "seedance2-toapis"}


def _artifex_video_resolution(model: Any, payload: dict[str, Any] | None = None) -> str:
    payload = payload or {}
    for value in (
        payload.get("resolution"),
        payload.get("quality"),
        payload.get("videoResolution"),
        payload.get("requestedResolution"),
        model,
    ):
        text = str(value or "").strip().lower()
        if "1080p" in text:
            return "1080p"
        if "480p" in text:
            return "480p"
        if "720p" in text:
            return "720p"
    return "720p"


def _artifex_video_model_name(payload: dict[str, Any], config: VideoStudioConfig) -> str:
    artifex_seedance_models = {"seedance-2-fast", "seedance-2", "seedance-2-pro-1080p"}
    allowed = {"video-fast-480p", "video-fast-720p", "video-pro-480p", "video-pro-720p"}
    raw = str(payload.get("model") or config.model or "").strip().lower()
    if raw in artifex_seedance_models:
        return raw
    explicit_resolution = any(
        "480p" in str(payload.get(key) or "").lower() or "720p" in str(payload.get(key) or "").lower()
        for key in ("resolution", "quality", "videoResolution", "requestedResolution")
    )
    if raw in allowed and not explicit_resolution:
        return raw
    key = " ".join(
        str(value or "").strip().lower()
        for value in (payload.get("model"), config.model, payload.get("modelKey"), payload.get("displayName"), payload.get("modelNick"))
    )
    quality = "pro" if ("pro" in raw or "pro" in key or "高质量" in key) else "fast"
    resolution = _artifex_video_resolution(raw, payload)
    return f"video-{quality}-{resolution}"


def _sora_video_pro_explicit_image_url(explicit_image_url: str, image_urls: list[str]) -> str:
    explicit = str(explicit_image_url or "").strip()
    if not explicit:
        return ""
    if not image_urls:
        return explicit
    if explicit in image_urls:
        return ""
    return explicit if len(image_urls) < 9 else ""


def _extract_video_cover_url(response_payload: dict[str, Any]) -> str:
    data = response_payload.get("data")
    data_obj = data if isinstance(data, dict) else {}
    return str(
        response_payload.get("cover_url")
        or response_payload.get("coverUrl")
        or data_obj.get("cover_url")
        or data_obj.get("coverUrl")
        or ""
    ).strip()


def _normalize_toapis_seedance2_duration(value: Any) -> int:
    text = str(value if value not in (None, "") else "5").strip().lower().replace("秒", "").replace("s", "")
    if not text:
        text = "5"
    try:
        duration = int(float(text))
    except ValueError as exc:
        raise ImageStudioError("ToAPIs Seedance 2 视频时长 duration 必须是数字，范围 4-15 秒，或 0/-1 自动") from exc
    if duration in {0, -1}:
        return duration
    if duration < 4 or duration > 15:
        raise ImageStudioError("ToAPIs Seedance 2 视频时长 duration 必须在 4-15 秒之间，或使用 0/-1 自动")
    return duration


def _normalize_toapis_seedance2_aspect_ratio(value: Any) -> str:
    aspect_ratio = str(value or "16:9").strip() or "16:9"
    allowed = {"21:9", "16:9", "4:3", "1:1", "3:4", "9:16"}
    if aspect_ratio not in allowed:
        raise ImageStudioError("ToAPIs Seedance 2 宽高比只支持 21:9、16:9、4:3、1:1、3:4、9:16")
    return aspect_ratio


def _normalize_toapis_seedance2_resolution(value: Any, model: Any) -> str:
    resolution = str(value or "720p").strip().lower() or "720p"
    allowed = {"480p", "720p", "1080p"}
    if resolution not in allowed:
        raise ImageStudioError("ToAPIs Seedance 2 分辨率只支持 480p、720p、1080p")
    if str(model or "").strip() == "seedance-2-fast" and resolution == "1080p":
        raise ImageStudioError("ToAPIs seedance-2-fast 不支持 1080p，请选择 480p 或 720p")
    return resolution


def build_sora_video_pro_request_body(payload: dict[str, Any], config: VideoStudioConfig) -> dict[str, Any]:
    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise ImageStudioError("请先填写提示词")
    model_name = _artifex_video_model_name(payload, config)
    is_artifex_seedance = model_name in {"seedance-2-fast", "seedance-2", "seedance-2-pro-1080p"}
    if is_artifex_seedance and len(prompt) > 2500:
        raise ImageStudioError("Seedance 2 提示词最多 2500 个字符")

    duration = _normalize_sora_video_pro_duration(payload.get("duration") or payload.get("seconds"))
    aspect_ratio = _normalize_sora_video_pro_aspect_ratio(payload.get("aspectRatio") or payload.get("aspect_ratio"))
    if is_artifex_seedance and aspect_ratio not in {"16:9", "9:16", "1:1"}:
        aspect_ratio = "16:9"
    image_urls = _payload_image_url_list(
        payload,
        [
            "extra_images",
            "extraImages",
            "reference_image_urls",
            "referenceImageUrls",
            "referenceImages",
            "reference_images",
            "images",
            "image",
        ],
        9,
    )
    explicit_image_url = _payload_image_url_list(payload, ["image_url", "imageUrl", "firstFrame", "first_frame"], 1)
    video_urls = _payload_url_list(
        payload,
        [
            "extra_videos",
            "extraVideos",
            "reference_video_urls",
            "referenceVideoUrls",
            "referenceVideos",
            "reference_videos",
            "videos",
            "video",
            "videoUrl",
            "refVideo",
        ],
        "video",
        3,
    )
    audio_urls = _payload_url_list(
        payload,
        [
            "extra_audios",
            "extraAudios",
            "reference_audio_urls",
            "referenceAudioUrls",
            "referenceAudios",
            "reference_audios",
            "audios",
            "audio",
            "audioUrl",
            "refAudio",
        ],
        "audio",
        3,
    )
    if is_artifex_seedance and explicit_image_url:
        for url in explicit_image_url:
            if url not in image_urls and len(image_urls) < 9:
                image_urls.append(url)
        explicit_image_url = []

    material_count = len(image_urls) + len(explicit_image_url) + len(video_urls) + len(audio_urls)
    if is_artifex_seedance and material_count > 12:
        raise ImageStudioError(f"Seedance 2 参考素材合计最多 12 个，当前 {material_count} 个")

    request_body: dict[str, Any] = {
        "model": model_name,
        "prompt": prompt,
        "duration": duration,
        "aspect_ratio": aspect_ratio,
    }
    image_url = _sora_video_pro_explicit_image_url(explicit_image_url[0] if explicit_image_url else "", image_urls)
    if image_url:
        request_body["image_url"] = image_url
    if image_urls:
        request_body["extra_images"] = image_urls
    if video_urls:
        request_body["extra_videos"] = video_urls
    if audio_urls:
        request_body["extra_audios"] = audio_urls
    return request_body


def _toapis_media_url_allowed(value: str, kind: str) -> bool:
    text = str(value or "").strip()
    lowered = text.lower()
    if _looks_like_http_url(text) or lowered.startswith("asset://"):
        return True
    if kind == "image" and lowered.startswith("data:image/"):
        return True
    if kind == "audio" and lowered.startswith("data:audio/"):
        return True
    return False


def _payload_toapis_url_list(payload: dict[str, Any], keys: list[str], kind: str, limit: int) -> list[str]:
    urls: list[str] = []
    for key in keys:
        raw = payload.get(key)
        if raw is None:
            continue
        entries = raw if isinstance(raw, list) else [raw]
        for entry in entries:
            url = _image_entry_to_url(entry) if kind == "image" else _media_entry_to_url(entry, kind)
            if _toapis_media_url_allowed(url, kind) and url not in urls:
                urls.append(url)
            if len(urls) >= limit:
                return urls[:limit]
    return urls[:limit]


def _normalize_toapis_role_entries(raw: Any, allowed_roles: set[str], kind: str, limit: int) -> list[dict[str, str]]:
    if raw is None:
        return []
    entries = raw if isinstance(raw, list) else [raw]
    result: list[dict[str, str]] = []
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        url = str(entry.get("url") or entry.get(f"{kind}_url") or entry.get(f"{kind}Url") or "").strip()
        role = str(entry.get("role") or "").strip()
        if not url or not role:
            continue
        if role not in allowed_roles:
            raise ImageStudioError(f"ToAPIs Seedance 2 不支持 {kind} role={role}")
        if not _toapis_media_url_allowed(url, kind):
            raise ImageStudioError(f"ToAPIs Seedance 2 {kind} 素材必须是 https/data/asset 支持的地址")
        result.append({"url": url, "role": role})
        if len(result) >= limit:
            break
    return result


def _validate_toapis_seedance2_roles(
    image_with_roles: list[dict[str, str]],
    video_with_roles: list[dict[str, str]],
    audio_with_roles: list[dict[str, str]],
) -> None:
    first_count = sum(1 for item in image_with_roles if item.get("role") == "first_frame")
    last_count = sum(1 for item in image_with_roles if item.get("role") == "last_frame")
    ref_image_count = sum(1 for item in image_with_roles if item.get("role") == "reference_image")
    if first_count > 1:
        raise ImageStudioError("ToAPIs Seedance 2 first_frame 最多 1 张")
    if last_count > 1:
        raise ImageStudioError("ToAPIs Seedance 2 last_frame 最多 1 张")
    if ref_image_count > 9:
        raise ImageStudioError("ToAPIs Seedance 2 reference_image 最多 9 张")
    if ref_image_count and (first_count or last_count):
        raise ImageStudioError("ToAPIs Seedance 2 首帧/首尾帧模式不能与 reference_image 模式混用")
    if len(video_with_roles) > 3:
        raise ImageStudioError("ToAPIs Seedance 2 reference_video 最多 3 条")
    if len(audio_with_roles) > 3:
        raise ImageStudioError("ToAPIs Seedance 2 reference_audio 最多 3 段")
    if audio_with_roles and not image_with_roles and not video_with_roles:
        raise ImageStudioError("ToAPIs Seedance 2 audio_with_roles 不能单独使用，至少需要一个图片或视频参考输入")


def build_toapis_seedance2_request_body(payload: dict[str, Any], config: VideoStudioConfig) -> dict[str, Any]:
    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise ImageStudioError("请先填写提示词")
    model = str(config.model or "").strip() or "seedance-2"
    if model not in {"seedance-2", "seedance-2-fast"}:
        raise ImageStudioError("ToAPIs Seedance 2 模型名只支持 seedance-2 或 seedance-2-fast")

    image_with_roles = _normalize_toapis_role_entries(
        payload.get("image_with_roles") or payload.get("imageWithRoles"),
        {"first_frame", "last_frame", "reference_image"},
        "image",
        9,
    )
    video_with_roles = _normalize_toapis_role_entries(
        payload.get("video_with_roles") or payload.get("videoWithRoles"),
        {"reference_video"},
        "video",
        3,
    )
    audio_with_roles = _normalize_toapis_role_entries(
        payload.get("audio_with_roles") or payload.get("audioWithRoles"),
        {"reference_audio"},
        "audio",
        3,
    )

    if not image_with_roles:
        image_urls = _payload_toapis_url_list(
            payload,
            [
                "image_urls",
                "imageUrls",
                "reference_image_urls",
                "referenceImageUrls",
                "referenceImages",
                "reference_images",
                "images",
                "image",
                "imageUrl",
                "image_url",
            ],
            "image",
            9,
        )
        ref_mode = str(payload.get("refMode") or payload.get("ref_mode") or "").strip().lower()
        mode = str(payload.get("mode") or payload.get("seedanceMode") or payload.get("seedance_mode") or "").strip().lower()
        video_mode = str(payload.get("videoMode") or payload.get("video_mode") or "").strip().lower()
        first_last = ref_mode in {"firstlast", "first-last", "i2v_first_last"} or mode == "i2v_first_last"
        first_frame_only = ref_mode in {"img2video", "image-to-video", "i2v"} or video_mode == "image-to-video"
        for idx, url in enumerate(image_urls):
            if first_last:
                role = "first_frame" if idx == 0 else "last_frame" if idx == 1 else "reference_image"
            elif first_frame_only and idx == 0 and len(image_urls) == 1:
                role = "first_frame"
            else:
                role = "reference_image"
            image_with_roles.append({"url": url, "role": role})

    if not video_with_roles:
        video_urls = _payload_toapis_url_list(
            payload,
            [
                "video_urls",
                "videoUrls",
                "reference_video_urls",
                "referenceVideoUrls",
                "referenceVideos",
                "reference_videos",
                "videos",
                "video",
                "videoUrl",
                "refVideo",
            ],
            "video",
            3,
        )
        video_with_roles = [{"url": url, "role": "reference_video"} for url in video_urls]

    if not audio_with_roles:
        audio_urls = _payload_toapis_url_list(
            payload,
            [
                "audio_urls",
                "audioUrls",
                "reference_audio_urls",
                "referenceAudioUrls",
                "referenceAudios",
                "reference_audios",
                "audios",
                "audio",
                "audioUrl",
                "refAudio",
            ],
            "audio",
            3,
        )
        audio_with_roles = [{"url": url, "role": "reference_audio"} for url in audio_urls]

    _validate_toapis_seedance2_roles(image_with_roles, video_with_roles, audio_with_roles)
    duration = _normalize_toapis_seedance2_duration(payload.get("duration") or payload.get("seconds"))
    aspect_ratio = _normalize_toapis_seedance2_aspect_ratio(payload.get("aspectRatio") or payload.get("aspect_ratio") or payload.get("ratio"))
    resolution = _normalize_toapis_seedance2_resolution(payload.get("resolution") or payload.get("quality"), model)

    request_body: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "duration": duration,
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
    }
    if image_with_roles:
        request_body["image_with_roles"] = image_with_roles
    if video_with_roles:
        request_body["video_with_roles"] = video_with_roles
    if audio_with_roles:
        request_body["audio_with_roles"] = audio_with_roles
    _apply_video_sound_control(request_body, payload, "generate_audio")
    if "seed" in payload and str(payload.get("seed") or "").strip():
        try:
            request_body["seed"] = int(float(str(payload.get("seed")).strip()))
        except ValueError as exc:
            raise ImageStudioError("ToAPIs Seedance 2 seed 必须是整数") from exc
    callback_url = str(payload.get("callback_url") or payload.get("callbackUrl") or "").strip()
    trace_id = str(payload.get("trace_id") or payload.get("traceId") or "").strip()
    if callback_url and trace_id:
        request_body["callback_url"] = callback_url
        request_body["trace_id"] = trace_id
    client_business_id = str(payload.get("client_business_id") or payload.get("clientBusinessId") or "").strip()
    if client_business_id:
        request_body["client_business_id"] = client_business_id
    return request_body


def start_sora_video_pro_video(payload: dict[str, Any]) -> dict[str, Any]:
    config = build_video_config(payload)
    headers = _json_headers(config.api_key)
    request_body = build_sora_video_pro_request_body(payload, config)
    model_name = str(request_body.get("model") or config.model)
    resolution = _artifex_video_resolution(model_name, payload)
    create_resp = _request_json(config.endpoint_url, headers, request_body, timeout=900)
    video_id = _extract_response_id(create_resp)
    if not video_id:
        video_url = _extract_video_url_from_chat_response(create_resp)
        if video_url:
            return {
                "ok": True,
                "taskId": "",
                "providerTaskId": "",
                "status": "completed",
                "progress": 100,
                "contentUrl": video_url,
                "downloadUrl": video_url,
                "coverUrl": _extract_video_cover_url(create_resp),
                "meta": {
                    "adapter": config.adapter,
                    "baseUrl": config.endpoint_url,
                    "apiKey": config.api_key,
                    "model": model_name,
                    "prompt": str(request_body.get("prompt") or ""),
                    "seconds": str(request_body.get("duration") or ""),
                    "resolution": resolution,
                    "aspectRatio": str(request_body.get("aspect_ratio") or "16:9"),
                    "contentAuthRequired": False,
                },
                "raw": create_resp,
            }
        raise ImageStudioError(f"视频任务提交成功但未返回 task_id：{json.dumps(create_resp, ensure_ascii=False)[:500]}")
    status_endpoint = _build_video_status_url(config.endpoint_url, video_id)
    return {
        "ok": True,
        "taskId": video_id,
        "providerTaskId": video_id,
        "status": _extract_video_status(create_resp) or "queued",
        "progress": _extract_video_progress(create_resp),
        "statusEndpoint": status_endpoint,
        "contentEndpoint": "",
        "contentUrl": "",
        "meta": {
            "adapter": config.adapter,
            "baseUrl": config.endpoint_url,
            "apiKey": config.api_key,
            "model": model_name,
            "prompt": str(request_body.get("prompt") or ""),
            "seconds": str(request_body.get("duration") or ""),
            "resolution": resolution,
            "aspectRatio": str(request_body.get("aspect_ratio") or "16:9"),
            "contentAuthRequired": False,
        },
        "raw": create_resp,
    }


def get_sora_video_pro_status(task: dict[str, Any]) -> dict[str, Any]:
    api_key = str(task.get("apiKey") or task.get("meta", {}).get("apiKey") or "").strip()
    status_endpoint = str(task.get("statusEndpoint") or "").strip()
    if not api_key or not status_endpoint:
        raise ImageStudioError("视频任务缺少查询所需的 API Key 或 statusEndpoint")
    status_resp = _request_json_get(status_endpoint, _json_headers(api_key), timeout=60)
    status = _extract_video_status(status_resp) or "queued"
    done = status in {"completed", "succeeded", "success"}
    failed = status in {"failed", "error", "cancelled", "canceled"}
    progress = 100 if done else _extract_video_progress(status_resp)
    video_url = _extract_video_url_from_chat_response(status_resp) if done else ""
    return {
        "ok": True,
        "taskId": str(task.get("taskId") or task.get("providerTaskId") or ""),
        "providerTaskId": str(task.get("providerTaskId") or task.get("taskId") or ""),
        "status": status,
        "progress": progress,
        "error": _extract_video_error(status_resp) if failed else "",
        "contentUrl": video_url,
        "downloadUrl": video_url,
        "coverUrl": _extract_video_cover_url(status_resp),
        "raw": status_resp,
    }


def start_notevideo_seedance_video(payload: dict[str, Any]) -> dict[str, Any]:
    config = build_video_config(payload)
    headers = _json_headers(config.api_key)
    request_body = build_notevideo_request_body(payload, config)
    create_resp = _request_json(config.endpoint_url, headers, request_body, timeout=900)
    video_id = _extract_response_id(create_resp)
    if not video_id:
        raise ImageStudioError(f"视频任务提交成功但未返回 video_id/task_id：{json.dumps(create_resp, ensure_ascii=False)[:500]}")
    status_endpoint = _build_video_status_url(config.endpoint_url, video_id)
    content_endpoint = f"{status_endpoint}/content"
    return {
        "ok": True,
        "taskId": video_id,
        "providerTaskId": video_id,
        "status": _extract_video_status(create_resp) or "processing",
        "progress": _extract_video_progress(create_resp),
        "statusEndpoint": status_endpoint,
        "contentEndpoint": content_endpoint,
        "contentUrl": content_endpoint,
        "meta": {
            "baseUrl": config.endpoint_url,
            "apiKey": config.api_key,
            "model": config.model,
            "prompt": str(request_body.get("prompt") or ""),
            "seconds": str(request_body.get("seconds") or payload.get("seconds") or payload.get("duration") or "5"),
            "resolution": str(request_body.get("resolution") or payload.get("resolution") or payload.get("quality") or "720p"),
            "aspectRatio": str(request_body.get("aspect_ratio") or payload.get("aspectRatio") or "9:16"),
        },
        "raw": create_resp,
    }


def get_notevideo_seedance_video_status(task: dict[str, Any]) -> dict[str, Any]:
    api_key = str(task.get("apiKey") or task.get("meta", {}).get("apiKey") or "").strip()
    status_endpoint = str(task.get("statusEndpoint") or "").strip()
    if not api_key or not status_endpoint:
        raise ImageStudioError("视频任务缺少查询所需的 API Key 或 statusEndpoint")
    status_resp = _request_json_get(status_endpoint, _json_headers(api_key), timeout=60)
    status = _extract_video_status(status_resp) or "processing"
    done = status in {"completed", "succeeded", "success"}
    failed = status in {"failed", "error", "cancelled", "canceled"}
    progress = 100 if done else _extract_video_progress(status_resp)
    content_endpoint = str(task.get("contentEndpoint") or f"{status_endpoint}/content")
    return {
        "ok": True,
        "taskId": str(task.get("taskId") or task.get("providerTaskId") or ""),
        "providerTaskId": str(task.get("providerTaskId") or task.get("taskId") or ""),
        "status": status,
        "progress": progress,
        "error": _extract_video_error(status_resp) if failed else "",
        "contentUrl": content_endpoint if done else "",
        "downloadUrl": content_endpoint if done else "",
        "raw": status_resp,
    }


def start_toapis_seedance2_video(payload: dict[str, Any]) -> dict[str, Any]:
    config = build_video_config(payload)
    headers = _json_headers(config.api_key)
    request_body = build_toapis_seedance2_request_body(payload, config)
    create_resp = _request_json(config.endpoint_url, headers, request_body, timeout=900)
    task_id = _extract_response_id(create_resp)
    video_url = _extract_video_url_from_chat_response(create_resp)
    if not task_id and not video_url:
        raise ImageStudioError(f"ToAPIs Seedance 2 视频任务提交成功但未返回 task id/video_url：{json.dumps(create_resp, ensure_ascii=False)[:500]}")
    status_endpoint = _build_video_status_url(config.endpoint_url, task_id) if task_id else ""
    status = _extract_video_status(create_resp) or ("succeeded" if video_url else "queued")
    failed = status in {"failed", "error", "cancelled", "canceled"}
    return {
        "ok": True,
        "taskId": task_id,
        "providerTaskId": task_id,
        "status": "succeeded" if video_url and not failed else status,
        "progress": 100 if video_url else _extract_video_progress(create_resp),
        "statusEndpoint": status_endpoint,
        "contentEndpoint": video_url,
        "contentUrl": video_url,
        "downloadUrl": video_url,
        "meta": {
            "adapter": config.adapter,
            "baseUrl": config.endpoint_url,
            "apiKey": config.api_key,
            "model": str(request_body.get("model") or config.model),
            "prompt": str(request_body.get("prompt") or ""),
            "seconds": str(request_body.get("duration") or payload.get("seconds") or ""),
            "resolution": str(request_body.get("resolution") or payload.get("resolution") or payload.get("quality") or ""),
            "aspectRatio": str(request_body.get("aspect_ratio") or payload.get("aspectRatio") or ""),
            "contentAuthRequired": False,
        },
        "raw": create_resp,
    }


def get_toapis_seedance2_video_status(task: dict[str, Any]) -> dict[str, Any]:
    api_key = str(task.get("apiKey") or task.get("meta", {}).get("apiKey") or "").strip()
    status_endpoint = str(task.get("statusEndpoint") or "").strip()
    if not api_key or not status_endpoint:
        content_endpoint = str(task.get("contentEndpoint") or task.get("contentUrl") or task.get("downloadUrl") or "").strip()
        if content_endpoint:
            return {
                "ok": True,
                "taskId": str(task.get("taskId") or task.get("providerTaskId") or ""),
                "providerTaskId": str(task.get("providerTaskId") or task.get("taskId") or ""),
                "status": "succeeded",
                "progress": 100,
                "error": "",
                "contentUrl": content_endpoint,
                "downloadUrl": content_endpoint,
            }
        raise ImageStudioError("ToAPIs Seedance 2 视频任务缺少查询所需的 API Key 或 statusEndpoint")
    status_resp = _request_json_get(status_endpoint, _json_headers(api_key), timeout=60)
    status = _extract_video_status(status_resp) or "queued"
    video_url = _extract_video_url_from_chat_response(status_resp)
    done = status in {"completed", "succeeded", "success"} or bool(video_url)
    failed = status in {"failed", "error", "cancelled", "canceled"}
    return {
        "ok": True,
        "taskId": str(task.get("taskId") or task.get("providerTaskId") or ""),
        "providerTaskId": str(task.get("providerTaskId") or task.get("taskId") or ""),
        "status": "succeeded" if done and not failed else status,
        "progress": 100 if done else _extract_video_progress(status_resp),
        "error": _extract_video_error(status_resp) if failed else "",
        "contentUrl": video_url if done else "",
        "downloadUrl": video_url if done else "",
        "raw": status_resp,
    }


def start_video_generation_task(payload: dict[str, Any]) -> dict[str, Any]:
    config = build_video_config(payload)
    normalized_payload = {**payload, "baseUrl": config.endpoint_url, "apiKey": config.api_key, "model": config.model, "adapter": config.adapter, "requestMethod": config.request_method}
    if _is_toapis_seedance2_adapter(config.adapter):
        return start_toapis_seedance2_video(normalized_payload)
    if config.adapter == "notevideo":
        return start_notevideo_seedance_video(normalized_payload)
    if _is_zaomeng_seedance2_adapter(config.adapter):
        return start_zaomeng_seedance2_video(normalized_payload)
    if _is_seedance2_sd_adapter(config.adapter):
        return start_seedance2_sd_video(normalized_payload)
    if _is_artifex_video_adapter(config.adapter):
        return start_sora_video_pro_video(normalized_payload)
    raise ImageStudioError(f"当前真实进度模式暂不支持 {config.adapter} 适配器")


def get_video_generation_task_status(task: dict[str, Any]) -> dict[str, Any]:
    adapter = normalize_video_adapter_name(task.get("adapter") or task.get("meta", {}).get("adapter") or "notevideo")
    if _is_toapis_seedance2_adapter(adapter):
        return get_toapis_seedance2_video_status(task)
    if _is_zaomeng_seedance2_adapter(adapter):
        return get_zaomeng_seedance2_video_status(task)
    if _is_seedance2_sd_adapter(adapter):
        return get_seedance2_sd_video_status(task)
    if _is_artifex_video_adapter(adapter):
        return get_sora_video_pro_status(task)
    return get_notevideo_seedance_video_status(task)


def _normalize_seedance2_sd_duration(value: Any) -> int:
    try:
        duration = int(float(str(value or 15).strip().lower().replace("秒", "").replace("s", "")))
    except ValueError:
        duration = 15
    return max(1, min(15, duration))


def build_seedance2_sd_request_body(payload: dict[str, Any], config: VideoStudioConfig) -> dict[str, Any]:
    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise ImageStudioError("请先填写提示词")
    image_urls = _payload_image_url_list(
        payload,
        [
            "images",
            "image",
            "extra_images",
            "extraImages",
            "reference_image_urls",
            "referenceImageUrls",
            "referenceImages",
            "reference_images",
            "image_url",
            "imageUrl",
        ],
        9,
    )
    video_urls = _payload_url_list(
        payload,
        [
            "videos",
            "video",
            "videoUrl",
            "refVideo",
            "video_url",
            "extra_videos",
            "extraVideos",
            "reference_video_urls",
            "referenceVideoUrls",
            "referenceVideos",
            "reference_videos",
        ],
        "video",
        3,
    )
    audio_urls = _payload_url_list(
        payload,
        [
            "audios",
            "audio",
            "audioUrl",
            "refAudio",
            "audio_url",
            "extra_audios",
            "extraAudios",
            "reference_audio_urls",
            "referenceAudioUrls",
            "referenceAudios",
            "reference_audios",
        ],
        "audio",
        3,
    )
    duration = _normalize_seedance2_sd_duration(payload.get("duration") or payload.get("seconds"))
    aspect_ratio = str(payload.get("aspectRatio") or payload.get("aspect_ratio") or "16:9").strip() or "16:9"
    resolution = str(payload.get("resolution") or payload.get("quality") or "720p").strip().lower() or "720p"
    body: dict[str, Any] = {
        "model": config.model or "seedance-2",
        "prompt": prompt,
        "duration": duration,
        "seconds": duration,
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
    }
    if image_urls:
        body["images"] = image_urls
    if video_urls:
        body["videos"] = video_urls
    if audio_urls:
        body["audios"] = audio_urls
    _apply_video_sound_control(body, payload, "generate_audio")
    return body


def start_seedance2_sd_video(payload: dict[str, Any]) -> dict[str, Any]:
    config = build_video_config(payload)
    headers = _json_headers(config.api_key)
    request_body = build_seedance2_sd_request_body(payload, config)
    create_resp = _request_json(config.endpoint_url, headers, request_body, timeout=900)
    task_id = _extract_response_id(create_resp)
    video_url = _extract_video_url_from_chat_response(create_resp)
    if not task_id and not video_url:
        raise ImageStudioError(f"视频任务提交成功但未返回 task_id/video_url：{json.dumps(create_resp, ensure_ascii=False)[:500]}")
    status_endpoint = _build_video_status_url(config.endpoint_url, task_id) if task_id else ""
    status = _extract_video_status(create_resp) or ("succeeded" if video_url else "queued")
    return {
        "ok": True,
        "taskId": task_id,
        "providerTaskId": task_id,
        "status": "succeeded" if video_url and status not in {"failed", "error", "cancelled", "canceled"} else status,
        "progress": 100 if video_url else _extract_video_progress(create_resp),
        "statusEndpoint": status_endpoint,
        "contentEndpoint": video_url,
        "contentUrl": video_url,
        "downloadUrl": video_url,
        "meta": {
            "adapter": config.adapter,
            "baseUrl": config.endpoint_url,
            "apiKey": config.api_key,
            "model": str(request_body.get("model") or config.model),
            "prompt": str(request_body.get("prompt") or ""),
            "seconds": str(request_body.get("duration") or ""),
            "resolution": str(request_body.get("resolution") or ""),
            "aspectRatio": str(request_body.get("aspect_ratio") or ""),
            "contentAuthRequired": False,
        },
        "raw": create_resp,
    }


def get_seedance2_sd_video_status(task: dict[str, Any]) -> dict[str, Any]:
    api_key = str(task.get("apiKey") or task.get("meta", {}).get("apiKey") or "").strip()
    status_endpoint = str(task.get("statusEndpoint") or "").strip()
    if not api_key or not status_endpoint:
        content_endpoint = str(task.get("contentEndpoint") or task.get("contentUrl") or task.get("downloadUrl") or "").strip()
        if content_endpoint:
            return {
                "ok": True,
                "taskId": str(task.get("taskId") or task.get("providerTaskId") or ""),
                "providerTaskId": str(task.get("providerTaskId") or task.get("taskId") or ""),
                "status": "succeeded",
                "progress": 100,
                "error": "",
                "contentUrl": content_endpoint,
                "downloadUrl": content_endpoint,
            }
        raise ImageStudioError("SD 2.0 视频任务缺少查询所需的 API Key 或 statusEndpoint")
    status_resp = _request_json_get(status_endpoint, _json_headers(api_key), timeout=60)
    status = _extract_video_status(status_resp) or "queued"
    done = status in {"completed", "succeeded", "success"} or bool(_extract_video_url_from_chat_response(status_resp))
    failed = status in {"failed", "error", "cancelled", "canceled"}
    video_url = _extract_video_url_from_chat_response(status_resp) if done else ""
    return {
        "ok": True,
        "taskId": str(task.get("taskId") or task.get("providerTaskId") or ""),
        "providerTaskId": str(task.get("providerTaskId") or task.get("taskId") or ""),
        "status": "succeeded" if done and not failed else status,
        "progress": 100 if done else _extract_video_progress(status_resp),
        "error": _extract_video_error(status_resp) if failed else "",
        "contentUrl": video_url,
        "downloadUrl": video_url,
        "raw": status_resp,
    }


def generate_seedance2_sd_video(payload: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    config = build_video_config(payload)
    headers = _json_headers(config.api_key)
    request_body = build_seedance2_sd_request_body(payload, config)
    prompt = str(request_body["prompt"])
    duration = str(request_body["duration"])
    resolution = str(request_body.get("resolution") or "720p")
    aspect_ratio = str(request_body.get("aspect_ratio") or "16:9")

    create_resp = _request_json(config.endpoint_url, headers, request_body, timeout=900)
    task_id = _extract_response_id(create_resp)
    video_url = _extract_video_url_from_chat_response(create_resp)
    status_endpoint = _build_video_status_url(config.endpoint_url, task_id) if task_id else ""
    if not task_id and not video_url:
        raise ImageStudioError(f"视频任务提交成功但未返回 task_id/video_url：{json.dumps(create_resp, ensure_ascii=False)[:500]}")
    if video_url and (_extract_video_status(create_resp) in {"completed", "succeeded", "success"} or not task_id):
        return _finalize_video(video_url, prompt, config.model, duration, resolution, aspect_ratio, output_dir, {"create": create_resp})

    max_poll_seconds = 900
    poll_interval = 8
    elapsed = 0
    status_resp: dict[str, Any] = create_resp
    while elapsed <= max_poll_seconds:
        status = _extract_video_status(status_resp)
        if status in {"completed", "succeeded", "success"}:
            video_url = _extract_video_url_from_chat_response(status_resp)
            if not video_url:
                raise ImageStudioError(f"视频已完成但未返回 video_url：{json.dumps(status_resp, ensure_ascii=False)[:500]}")
            return _finalize_video(video_url, prompt, config.model, duration, resolution, aspect_ratio, output_dir, {"create": create_resp, "status": status_resp})
        if status in {"failed", "error", "cancelled", "canceled"}:
            raise ImageStudioError(f"视频生成失败：{_extract_video_error(status_resp)}")
        time.sleep(poll_interval)
        elapsed += poll_interval
        if status_endpoint:
            status_resp = _request_json_get(status_endpoint, headers, timeout=60)
    raise ImageStudioError(f"视频生成超时（已等待 {max_poll_seconds} 秒），任务可能仍在处理中，task_id：{task_id}")


def _is_sora_v3_notevideo_request(config: VideoStudioConfig) -> bool:
    model = str(config.model or "").lower()
    endpoint_path = urlparse(str(config.endpoint_url or "")).path.lower().rstrip("/")
    if "sora-vip" in model or "sora-v3-vip" in model or "sora-3.0-vip" in model:
        return False
    if "sora-v4-pro" in model:
        return True
    return endpoint_path.endswith("/videos") and ("sora-v3-pro" in model or "sora-v3-fast" in model or "sora-2" in model)


def _normalize_notevideo_seconds(payload: dict[str, Any], config: VideoStudioConfig, is_sora_v3: bool) -> str:
    seconds = str(payload.get("seconds") or payload.get("duration") or "5").strip().lower().replace("s", "") or "5"
    try:
        seconds_int = int(float(seconds))
    except ValueError as exc:
        raise ImageStudioError("视频时长 seconds 必须是正整数或数字字符串") from exc
    if is_sora_v3:
        model = str(config.model or "").lower()
        allowed = {4, 8, 12} if "sora-2" in model and "v3" not in model else set(range(5, 16))
        if seconds_int not in allowed:
            ordered = sorted(allowed)
            seconds_int = max((item for item in ordered if item <= seconds_int), default=ordered[0])
        return str(seconds_int)
    return str(max(1, min(120, seconds_int)))


def _normalize_sora_v3_reference_mode(value: Any) -> str:
    raw = str(value or "").strip()
    mapped = {
        "firstLast": "start_end",
        "firstlast": "start_end",
        "smartMultiFrame": "auto",
        "smartmultiframe": "auto",
        "full": "image_reference",
        "text2video": "image_reference",
    }.get(raw, raw or "image_reference")
    return mapped if mapped in {"auto", "start_frame", "start_end", "image_reference"} else "image_reference"


def _collect_sora_v3_reference_videos(payload: dict[str, Any]) -> list[str]:
    urls: list[str] = []

    def push(value: Any) -> None:
        if not value:
            return
        if isinstance(value, list):
            for item in value:
                push(item)
            return
        if isinstance(value, dict):
            saved = value.get("saved") if isinstance(value.get("saved"), dict) else {}
            for key in ("soraV3ReferenceVideoUrl", "referenceVideoUrl", "remoteUrl", "providerRef", "uploadRef", "fileId", "file_id", "id", "url", "videoUrl", "video_url"):
                push(value.get(key))
            for key in ("soraV3ReferenceVideoUrl", "referenceVideoUrl", "remoteUrl", "url"):
                push(saved.get(key))
            return
        raw = str(value).strip()
        if (raw.startswith("http://") or raw.startswith("https://") or raw.startswith("data:video/")) and raw not in urls:
            urls.append(raw)

    push(payload.get("reference_videos") or payload.get("referenceVideos"))
    push(payload.get("reference_video") or payload.get("referenceVideo"))
    push(payload.get("video") or payload.get("videoUrl") or payload.get("refVideo") or payload.get("video_url"))
    push(payload.get("soraV3ReferenceVideoUrl") or payload.get("referenceVideoUrl") or payload.get("audioReferenceVideoUrl"))
    return urls


def build_notevideo_request_body(payload: dict[str, Any], config: VideoStudioConfig) -> dict[str, Any]:
    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise ImageStudioError("请先填写提示词")

    is_sora_v3 = _is_sora_v3_notevideo_request(config)
    aspect_ratio = str(payload.get("aspectRatio") or payload.get("aspect_ratio") or "16:9").strip() or "16:9"
    if is_sora_v3:
        if aspect_ratio not in {"16:9", "9:16", "1:1", "4:3", "3:4", "21:9"}:
            aspect_ratio = "9:16" if aspect_ratio.startswith("9:") else "16:9"
    elif aspect_ratio not in {"16:9", "9:16"}:
        aspect_ratio = "9:16" if aspect_ratio.startswith("9:") else "16:9"

    resolution = str(payload.get("resolution") or payload.get("quality") or "720p").strip().lower() or "720p"
    if is_sora_v3:
        if resolution not in {"480p", "720p"}:
            resolution = "720p"
    elif resolution not in {"720p", "1080p"}:
        resolution = "720p"

    seconds = _normalize_notevideo_seconds(payload, config, is_sora_v3)

    request_body: dict[str, Any] = {
        "model": config.model,
        "prompt": prompt,
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
        "seconds": seconds,
    }
    
    images = payload.get("images") or []
    image_urls = [_image_entry_to_url(item) for item in images] if isinstance(images, list) else []
    explicit_images = payload.get("reference_images") or payload.get("referenceImages")
    if isinstance(explicit_images, list):
        image_urls.extend([_image_entry_to_url(item) for item in explicit_images])
    image_urls = [url for url in image_urls if _looks_like_http_url(url) or (is_sora_v3 and str(url).startswith("data:image/"))]
    ref_mode = str(payload.get("refMode") or payload.get("ref_mode") or "full").strip().lower()

    if len(image_urls) > (4 if is_sora_v3 else 9):
        image_urls = image_urls[:4 if is_sora_v3 else 9]

    if is_sora_v3:
        if image_urls:
            request_body["reference_image_urls"] = image_urls
            request_body["reference_mode"] = _normalize_sora_v3_reference_mode(payload.get("reference_mode") or payload.get("referenceMode") or ref_mode)
        video_urls = _payload_url_list(
            payload,
            [
                "reference_video_urls",
                "referenceVideoUrls",
                "referenceVideos",
                "reference_videos",
                "video_urls",
                "videoUrls",
                "videos",
                "video",
                "videoUrl",
                "refVideo",
            ],
            "video",
            3,
        )
        if video_urls:
            request_body["reference_video_urls"] = video_urls
        audio_urls = _payload_url_list(
            payload,
            [
                "reference_audio_urls",
                "referenceAudioUrls",
                "referenceAudios",
                "reference_audios",
                "audio_urls",
                "audioUrls",
                "audios",
                "audio",
                "audioUrl",
                "refAudio",
            ],
            "audio",
            3,
        )
        if audio_urls:
            request_body["reference_audio_urls"] = audio_urls
            if not image_urls and not video_urls:
                raise ImageStudioError("音频参考需要同时提供至少一个参考图或视频参考")
        if video_urls or audio_urls:
            request_body["audio_mode"] = str(payload.get("audio_mode") or payload.get("audioMode") or "auto").strip() or "auto"
        return request_body

    if image_urls:
        if len(image_urls) == 1:
            request_body["image_url"] = image_urls[0]
        else:
            request_body["reference_image_urls"] = image_urls
    
    if ref_mode == "full":
        video_urls = _payload_url_list(
            payload,
            [
                "reference_video_urls",
                "referenceVideoUrls",
                "referenceVideos",
                "reference_videos",
                "video_urls",
                "videoUrls",
                "videos",
                "video",
                "videoUrl",
                "refVideo",
            ],
            "video",
            3,
        )
        if video_urls:
            request_body["reference_video_urls"] = video_urls
    
    if ref_mode == "full":
        audio_urls = _payload_url_list(
            payload,
            [
                "reference_audio_urls",
                "referenceAudioUrls",
                "referenceAudios",
                "reference_audios",
                "audio_urls",
                "audioUrls",
                "audios",
                "audio",
                "audioUrl",
                "refAudio",
            ],
            "audio",
            3,
        )
        if audio_urls:
            request_body["reference_audio_urls"] = audio_urls
            if not image_urls and not video_urls:
                raise ImageStudioError("音频参考需要同时提供至少一个参考图或视频参考")
    
    return request_body


def _normalize_zaomeng_seedance2_resolution(value: Any) -> str:
    raw = str(value or "720p").strip().lower()
    return raw if raw in {"720p", "1080p"} else "720p"


def _normalize_zaomeng_seedance2_duration(value: Any, resolution: str) -> int:
    max_seconds = 12 if resolution == "1080p" else 15
    try:
        duration = int(float(str(value or 5).strip().lower().replace("秒", "").replace("s", "")))
    except ValueError:
        duration = 5
    return max(1, min(max_seconds, duration))


def _zaomeng_seedance2_model(payload: dict[str, Any], config: VideoStudioConfig) -> str:
    raw = str(payload.get("model") or config.model or "").strip()
    lowered = raw.lower()
    if lowered in {"seedance-2.0-svip", "seedance-2.0-fast"}:
        return lowered
    if "fast" in lowered or "快速" in raw:
        return "seedance-2.0-fast"
    return raw or "seedance-2.0-svip"


def _zaomeng_add_unique(target: list[str], url: str, limit: int) -> None:
    if _looks_like_http_url(url) and url not in target and len(target) < limit:
        target.append(url)


def _zaomeng_seedance2_reference_lists(payload: dict[str, Any]) -> tuple[list[str], list[str], list[str]]:
    images = _payload_image_url_list(payload, ["images", "image", "image_url", "imageUrl", "reference_image_urls", "referenceImageUrls", "referenceImages", "reference_images"], 9)
    videos = _payload_url_list(payload, ["videos", "video", "videoUrl", "refVideo", "video_url", "reference_video_urls", "referenceVideoUrls", "referenceVideos", "reference_videos"], "video", 3)
    audios = _payload_url_list(payload, ["audios", "audio", "audioUrl", "refAudio", "audio_url", "reference_audio_urls", "referenceAudioUrls", "referenceAudios", "reference_audios"], "audio", 3)
    raw_files = payload.get("files") or []
    for entry in raw_files if isinstance(raw_files, list) else [raw_files]:
        url = _image_entry_to_url(entry) or _media_entry_to_url(entry, "video") or _media_entry_to_url(entry, "audio")
        path = urlparse(url).path.lower()
        if path.endswith((".jpg", ".jpeg", ".png", ".webp")):
            _zaomeng_add_unique(images, url, 9)
        elif path.endswith(".mp4"):
            _zaomeng_add_unique(videos, url, 3)
        elif path.endswith((".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg")):
            _zaomeng_add_unique(audios, url, 3)
    return images, videos, audios


def _zaomeng_seedance2_prompt_with_markers(prompt: str, images: list[str], videos: list[str], audios: list[str]) -> str:
    missing: list[str] = []
    for prefix, values in (("IMG", images), ("VID", videos), ("AUD", audios)):
        for index in range(1, len(values) + 1):
            if not re.search(rf"@{prefix}_?{index}\b", prompt, flags=re.IGNORECASE):
                missing.append(f"@{prefix}{index}")
    return f"{' '.join(missing)} {prompt}" if missing else prompt


def _build_zaomeng_seedance2_status_url(endpoint_url: str, task_id: str) -> str:
    base = str(endpoint_url or "").rstrip("/")
    if base.endswith("/video/generations"):
        base = base[: -len("/video/generations")]
        return f"{base}/videos/{task_id}"
    if base.endswith("/videos"):
        return f"{base}/{task_id}"
    return f"{base}/v1/videos/{task_id}"


def build_zaomeng_seedance2_request_body(payload: dict[str, Any], config: VideoStudioConfig) -> dict[str, Any]:
    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise ImageStudioError("请先填写提示词")
    if len(prompt) > 4000:
        raise ImageStudioError("造梦 Seedance 2.0 提示词最多 4000 个字符")
    resolution = _normalize_zaomeng_seedance2_resolution(payload.get("resolution") or payload.get("quality"))
    duration = _normalize_zaomeng_seedance2_duration(payload.get("duration") or payload.get("seconds"), resolution)
    aspect_ratio = str(payload.get("aspectRatio") or payload.get("aspect_ratio") or "16:9").strip()
    if aspect_ratio not in {"16:9", "9:16", "1:1"}:
        aspect_ratio = "16:9"
    images, videos, audios = _zaomeng_seedance2_reference_lists(payload)
    if len(images) > 9 or len(videos) > 3 or len(audios) > 3 or len(images) + len(videos) + len(audios) > 9:
        raise ImageStudioError("造梦 Seedance 2.0 最多支持 9 个 files，其中图片 9 张、视频 3 个、音频 3 个")
    if any(not urlparse(url).path.lower().endswith(".mp4") for url in videos):
        raise ImageStudioError("造梦 Seedance 2.0 参考视频 URL 必须以 .mp4 结尾")
    files = [*images, *videos, *audios]
    body: dict[str, Any] = {
        "model": _zaomeng_seedance2_model(payload, config),
        "prompt": _zaomeng_seedance2_prompt_with_markers(prompt, images, videos, audios),
        "duration": duration,
        "resolution": resolution,
        "aspect_ratio": aspect_ratio,
    }
    if files:
        body["files"] = files
    return body


def start_zaomeng_seedance2_video(payload: dict[str, Any]) -> dict[str, Any]:
    config = build_video_config(payload)
    headers = _json_headers(config.api_key)
    request_body = build_zaomeng_seedance2_request_body(payload, config)
    create_resp = _request_json(config.endpoint_url, headers, request_body, timeout=900)
    task_id = _extract_response_id(create_resp)
    video_url = _extract_video_url_from_chat_response(create_resp)
    if not task_id and not video_url:
        raise ImageStudioError(f"视频任务提交成功但未返回 id/video_url：{json.dumps(create_resp, ensure_ascii=False)[:500]}")
    status = _extract_video_status(create_resp) or ("succeeded" if video_url else "queued")
    status_endpoint = _build_zaomeng_seedance2_status_url(config.endpoint_url, task_id) if task_id else ""
    return {
        "ok": True,
        "taskId": task_id,
        "providerTaskId": task_id,
        "status": "succeeded" if video_url and status not in {"failed", "error", "cancelled", "canceled"} else status,
        "progress": 100 if video_url else _extract_video_progress(create_resp),
        "statusEndpoint": status_endpoint,
        "contentEndpoint": video_url,
        "contentUrl": video_url,
        "downloadUrl": video_url,
        "meta": {
            "adapter": config.adapter,
            "baseUrl": config.endpoint_url,
            "apiKey": config.api_key,
            "model": str(request_body.get("model") or config.model),
            "prompt": str(request_body.get("prompt") or ""),
            "seconds": str(request_body.get("duration") or ""),
            "resolution": str(request_body.get("resolution") or ""),
            "aspectRatio": str(request_body.get("aspect_ratio") or ""),
            "contentAuthRequired": False,
        },
        "raw": create_resp,
    }


def get_zaomeng_seedance2_video_status(task: dict[str, Any]) -> dict[str, Any]:
    api_key = str(task.get("apiKey") or task.get("meta", {}).get("apiKey") or "").strip()
    status_endpoint = str(task.get("statusEndpoint") or "").strip()
    if not api_key or not status_endpoint:
        raise ImageStudioError("造梦 Seedance 2.0 视频任务缺少查询所需的 API Key 或 statusEndpoint")
    status_resp = _request_json_get(status_endpoint, _json_headers(api_key), timeout=60)
    status = _extract_video_status(status_resp) or "queued"
    failed = status in {"failed", "error", "cancelled", "canceled"}
    video_url = _extract_video_url_from_chat_response(status_resp)
    done = status in {"completed", "succeeded", "success"} or bool(video_url)
    return {
        "ok": True,
        "taskId": str(task.get("taskId") or task.get("providerTaskId") or ""),
        "providerTaskId": str(task.get("providerTaskId") or task.get("taskId") or ""),
        "status": "succeeded" if done and not failed else status,
        "progress": 100 if done else _extract_video_progress(status_resp),
        "error": _extract_video_error(status_resp) if failed else "",
        "contentUrl": video_url if done else "",
        "downloadUrl": video_url if done else "",
        "raw": status_resp,
    }


def generate_zaomeng_seedance2_video(payload: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    config = build_video_config(payload)
    headers = _json_headers(config.api_key)
    request_body = build_zaomeng_seedance2_request_body(payload, config)
    prompt = str(request_body["prompt"])
    duration = str(request_body["duration"])
    resolution = str(request_body.get("resolution") or "720p")
    aspect_ratio = str(request_body.get("aspect_ratio") or "16:9")
    model_name = str(request_body.get("model") or config.model)
    create_resp = _request_json(config.endpoint_url, headers, request_body, timeout=900)
    task_id = _extract_response_id(create_resp)
    video_url = _extract_video_url_from_chat_response(create_resp)
    if not task_id and not video_url:
        raise ImageStudioError(f"视频任务提交成功但未返回 id/video_url：{json.dumps(create_resp, ensure_ascii=False)[:500]}")
    if video_url and (_extract_video_status(create_resp) in {"completed", "succeeded", "success"} or not task_id):
        return _finalize_video(video_url, prompt, model_name, duration, resolution, aspect_ratio, output_dir, {"create": create_resp})
    status_endpoint = _build_zaomeng_seedance2_status_url(config.endpoint_url, task_id)
    max_poll_seconds = 900
    poll_interval = 5
    elapsed = 0
    status_resp: dict[str, Any] = create_resp
    while elapsed <= max_poll_seconds:
        status = _extract_video_status(status_resp)
        if status in {"completed", "succeeded", "success"}:
            video_url = _extract_video_url_from_chat_response(status_resp)
            if not video_url:
                raise ImageStudioError(f"视频已完成但未返回 video_url：{json.dumps(status_resp, ensure_ascii=False)[:500]}")
            return _finalize_video(video_url, prompt, model_name, duration, resolution, aspect_ratio, output_dir, {"create": create_resp, "status": status_resp})
        if status in {"failed", "error", "cancelled", "canceled"}:
            raise ImageStudioError(f"视频生成失败：{_extract_video_error(status_resp)}")
        time.sleep(poll_interval)
        elapsed += poll_interval
        status_resp = _request_json_get(status_endpoint, headers, timeout=60)
    raise ImageStudioError(f"视频生成超时（已等待 {max_poll_seconds} 秒），任务可能仍在处理中，id：{task_id}")


def build_video_provider_request_body(payload: dict[str, Any], config: VideoStudioConfig | None = None) -> dict[str, Any]:
    config = config or build_video_config(payload)
    normalized_payload = {**payload, "baseUrl": config.endpoint_url, "apiKey": config.api_key, "model": config.model, "adapter": config.adapter, "requestMethod": config.request_method}
    if _is_toapis_seedance2_adapter(config.adapter):
        return build_toapis_seedance2_request_body(normalized_payload, config)
    if _is_zaomeng_seedance2_adapter(config.adapter):
        return build_zaomeng_seedance2_request_body(normalized_payload, config)
    if _is_seedance2_sd_adapter(config.adapter):
        return build_seedance2_sd_request_body(normalized_payload, config)
    if _is_artifex_video_adapter(config.adapter):
        return build_sora_video_pro_request_body(normalized_payload, config)
    return build_notevideo_request_body(normalized_payload, config)


def generate_toapis_seedance2_video(payload: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    """ToAPIs /v1/videos/generations：提交任务，轮询 completed 后下载落盘。"""
    config = build_video_config(payload)
    headers = _json_headers(config.api_key)
    request_body = build_toapis_seedance2_request_body(payload, config)
    prompt = str(request_body["prompt"])
    duration = str(request_body["duration"])
    resolution = str(request_body.get("resolution") or "720p")
    aspect_ratio = str(request_body.get("aspect_ratio") or "16:9")

    create_resp = _request_json(config.endpoint_url, headers, request_body, timeout=900)
    task_id = _extract_response_id(create_resp)
    if not task_id:
        video_url = _extract_video_url_from_chat_response(create_resp)
        if video_url:
            return _finalize_video(video_url, prompt, config.model, duration, resolution, aspect_ratio, output_dir, create_resp)
        raise ImageStudioError(f"ToAPIs Seedance 2 视频任务提交成功但未返回 task id：{json.dumps(create_resp, ensure_ascii=False)[:500]}")

    status_resp: dict[str, Any] = create_resp
    max_poll_seconds = 600
    poll_interval = 10
    elapsed = 0
    status_endpoint = _build_video_status_url(config.endpoint_url, task_id)
    time.sleep(5)
    elapsed += 5
    while elapsed <= max_poll_seconds:
        status = _extract_video_status(status_resp)
        video_url = _extract_video_url_from_chat_response(status_resp)
        if video_url and status not in {"failed", "error", "cancelled", "canceled"}:
            return _finalize_video(video_url, prompt, config.model, duration, resolution, aspect_ratio, output_dir, {"create": create_resp, "status": status_resp})
        if status in {"completed", "succeeded", "success"}:
            raise ImageStudioError(f"ToAPIs Seedance 2 已完成但未返回视频 URL：{json.dumps(status_resp, ensure_ascii=False)[:500]}")
        if status in {"failed", "error", "cancelled", "canceled"}:
            raise ImageStudioError(f"ToAPIs Seedance 2 视频生成失败：{_extract_video_error(status_resp)}")
        time.sleep(poll_interval)
        elapsed += poll_interval
        status_resp = _request_json_get(status_endpoint, headers, timeout=60)
    raise ImageStudioError(f"ToAPIs Seedance 2 视频生成超时（已等待 {max_poll_seconds} 秒），任务可能仍在处理中，task_id：{task_id}")


def generate_notevideo_seedance_video(payload: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    """sora-v3-pro / notevideo 视频接口：提交 URL 完全使用视频模型配置 URL。"""
    config = build_video_config(payload)
    headers = _json_headers(config.api_key)
    request_body = build_notevideo_request_body(payload, config)
    prompt = str(request_body["prompt"])
    seconds = str(request_body["seconds"])
    resolution = str(request_body["resolution"])
    aspect_ratio = str(request_body["aspect_ratio"])

    create_resp = _request_json(config.endpoint_url, headers, request_body, timeout=900)
    video_id = _extract_response_id(create_resp)
    if not video_id:
        raise ImageStudioError(f"视频任务提交成功但未返回 video_id/task_id：{json.dumps(create_resp, ensure_ascii=False)[:500]}")

    status_endpoint = _build_video_status_url(config.endpoint_url, video_id)
    content_endpoint = f"{status_endpoint}/content"
    max_poll_seconds = 900
    poll_interval = 5
    elapsed = 0
    status_resp: dict[str, Any] = create_resp
    while elapsed < max_poll_seconds:
        time.sleep(poll_interval)
        elapsed += poll_interval
        status_resp = _request_json_get(status_endpoint, headers, timeout=60)
        status = _extract_video_status(status_resp)
        if status == "completed":
            video_bytes, _ = _download_binary_with_headers(content_endpoint, {"Authorization": f"Bearer {config.api_key}"}, timeout=900, retries=2)
            return _finalize_video_bytes(video_bytes, content_endpoint, prompt, config.model, seconds, resolution, aspect_ratio, output_dir, {"create": create_resp, "status": status_resp})
        if status == "failed":
            raise ImageStudioError(f"视频生成失败：{_extract_video_error(status_resp)}")
        if status in {"queued", "processing", "pending", "running", ""}:
            continue
    raise ImageStudioError(f"视频生成超时（已等待 {max_poll_seconds} 秒），任务可能仍在处理中，video_id：{video_id}")


def _lingdong_sd2_vip_orientation(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw in {"portrait", "landscape", "square"}:
        return raw
    ratio = str(value or "9:16").strip()
    if ratio == "1:1":
        return "square"
    parts = ratio.split(":")
    if len(parts) == 2:
        try:
            width = float(parts[0])
            height = float(parts[1])
            return "portrait" if width < height else "landscape"
        except ValueError:
            pass
    return "portrait"


def _lingdong_sd2_vip_size(value: Any) -> str:
    raw = str(value or "").strip().lower()
    if raw in {"small", "large"}:
        return raw
    if "large" in raw or "1080" in raw:
        return "large"
    return "small"


def build_lingdong_sd2_vip_request_body(payload: dict[str, Any], config: VideoStudioConfig) -> dict[str, Any]:
    prompt = str(payload.get("prompt") or "").strip()
    if not prompt:
        raise ImageStudioError("请先填写提示词")
    if len(prompt) > 4000:
        raise ImageStudioError("sd-2-vip 提示词建议最多 4000 个字符")
    image_urls = _payload_image_url_list(payload, ["images", "image", "image_url", "imageUrl", "reference_image_urls", "referenceImageUrls", "referenceImages", "reference_images"], 9)
    video_urls = _payload_url_list(payload, ["videos", "video", "videoUrl", "refVideo", "video_url", "reference_video_urls", "referenceVideoUrls", "referenceVideos", "reference_videos"], "video", 3)
    audio_urls = _payload_url_list(payload, ["audios", "audio", "audioUrl", "refAudio", "audio_url", "reference_audio_urls", "referenceAudioUrls", "referenceAudios", "reference_audios"], "audio", 3)
    if audio_urls and not image_urls and not video_urls:
        raise ImageStudioError("sd-2-vip 音频参考需要同时提供至少 1 张图片或 1 段视频")
    try:
        duration = int(float(str(payload.get("duration") or payload.get("seconds") or 15).replace("s", "")))
    except ValueError:
        duration = 15
    body: dict[str, Any] = {
        "model": config.model or "sd-2-vip",
        "prompt": prompt,
        "orientation": _lingdong_sd2_vip_orientation(payload.get("orientation") or payload.get("aspectRatio") or payload.get("aspect_ratio")),
        "size": _lingdong_sd2_vip_size(payload.get("size") or payload.get("quality") or payload.get("resolution")),
        "duration": duration or 15,
    }
    if image_urls:
        body["images"] = image_urls
    if video_urls:
        body["videos"] = video_urls
    if audio_urls:
        body["audios"] = audio_urls
    return body


def _build_lingdong_sd2_vip_status_url(endpoint_url: str, task_id: str) -> str:
    base = str(endpoint_url or "").rstrip("/")
    if base.endswith("/videos"):
        base = base[: -len("/videos")]
    return f"{base}/video/generations/{task_id}"


def generate_lingdong_sd2_vip_video(payload: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    config = build_video_config(payload)
    headers = _json_headers(config.api_key)
    request_body = build_lingdong_sd2_vip_request_body(payload, config)
    prompt = str(request_body["prompt"])
    duration = str(request_body["duration"])
    aspect_ratio = str(payload.get("aspectRatio") or payload.get("aspect_ratio") or "9:16")
    size = str(request_body["size"])
    create_resp = _request_json(config.endpoint_url, headers, request_body, timeout=900)
    task_id = _extract_response_id(create_resp)
    video_url = _extract_video_url_from_chat_response(create_resp)
    if not task_id and not video_url:
        raise ImageStudioError(f"视频任务提交成功但未返回 task_id/video_url：{json.dumps(create_resp, ensure_ascii=False)[:500]}")
    if video_url and (_extract_video_status(create_resp) in {"completed", "succeeded", "success"} or not task_id):
        return _finalize_video(video_url, prompt, config.model, duration, size, aspect_ratio, output_dir, {"create": create_resp})
    max_poll_seconds = 900
    poll_interval = 8
    elapsed = 0
    status_resp: dict[str, Any] = create_resp
    status_endpoint = _build_lingdong_sd2_vip_status_url(config.endpoint_url, task_id)
    while elapsed <= max_poll_seconds:
        status = _extract_video_status(status_resp)
        if status in {"completed", "succeeded", "success"}:
            video_url = _extract_video_url_from_chat_response(status_resp)
            if not video_url:
                raise ImageStudioError(f"视频已完成但未返回 video_url：{json.dumps(status_resp, ensure_ascii=False)[:500]}")
            return _finalize_video(video_url, prompt, config.model, duration, size, aspect_ratio, output_dir, {"create": create_resp, "status": status_resp})
        if status in {"failed", "error", "cancelled", "canceled"}:
            raise ImageStudioError(f"视频生成失败：{_extract_video_error(status_resp)}")
        time.sleep(poll_interval)
        elapsed += poll_interval
        status_resp = _request_json_get(status_endpoint, headers, timeout=60)
    raise ImageStudioError(f"视频生成超时（已等待 {max_poll_seconds} 秒），任务可能仍在处理中，task_id：{task_id}")


def generate_sora_video_pro(payload: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    """Artifex /v1/videos 视频接口：提交任务，轮询后下载 video_url。"""
    config = build_video_config(payload)
    headers = _json_headers(config.api_key)
    request_body = build_sora_video_pro_request_body(payload, config)
    prompt = str(request_body["prompt"])
    duration = str(request_body["duration"])
    aspect_ratio = str(request_body["aspect_ratio"])
    model_name = str(request_body.get("model") or config.model)
    resolution = _artifex_video_resolution(model_name, payload)

    create_resp = _request_json(config.endpoint_url, headers, request_body, timeout=900)
    video_id = _extract_response_id(create_resp)
    video_url = _extract_video_url_from_chat_response(create_resp)
    status_endpoint = _build_video_status_url(config.endpoint_url, video_id) if video_id else ""
    if not video_id and not video_url:
        raise ImageStudioError(f"视频任务提交成功但未返回 task_id/video_url：{json.dumps(create_resp, ensure_ascii=False)[:500]}")
    if video_url and (_extract_video_status(create_resp) in {"completed", "succeeded", "success"} or not video_id):
        return _finalize_video(video_url, prompt, model_name, duration, resolution, aspect_ratio, output_dir, {"create": create_resp})

    max_poll_seconds = 900
    poll_interval = 8
    elapsed = 0
    status_resp: dict[str, Any] = create_resp
    while elapsed <= max_poll_seconds:
        status = _extract_video_status(status_resp)
        if status in {"completed", "succeeded", "success"}:
            video_url = _extract_video_url_from_chat_response(status_resp)
            if not video_url:
                raise ImageStudioError(f"视频已完成但未返回 video_url：{json.dumps(status_resp, ensure_ascii=False)[:500]}")
            return _finalize_video(video_url, prompt, model_name, duration, resolution, aspect_ratio, output_dir, {"create": create_resp, "status": status_resp})
        if status in {"failed", "error", "cancelled", "canceled"}:
            raise ImageStudioError(f"视频生成失败：{_extract_video_error(status_resp)}")
        time.sleep(poll_interval)
        elapsed += poll_interval
        if status_endpoint:
            status_resp = _request_json_get(status_endpoint, headers, timeout=60)
    raise ImageStudioError(f"视频生成超时（已等待 {max_poll_seconds} 秒），任务可能仍在处理中，task_id：{video_id}")


def generate_video(payload: dict[str, Any], output_dir: Path) -> dict[str, Any]:
    """视频生成总入口：按模型 JSON 传入的 adapter 选择请求协议。"""
    config = build_video_config(payload)
    normalized_payload = {**payload, "baseUrl": config.endpoint_url, "apiKey": config.api_key, "model": config.model, "adapter": config.adapter, "requestMethod": config.request_method}
    if config.adapter == "openai-chat":
        return generate_seedance_chat_video(normalized_payload, output_dir)
    if _is_toapis_seedance2_adapter(config.adapter):
        return generate_toapis_seedance2_video(normalized_payload, output_dir)
    if config.adapter == "notevideo":
        return generate_notevideo_seedance_video(normalized_payload, output_dir)
    if _is_zaomeng_seedance2_adapter(config.adapter):
        return generate_zaomeng_seedance2_video(normalized_payload, output_dir)
    if _is_seedance2_sd_adapter(config.adapter):
        return generate_seedance2_sd_video(normalized_payload, output_dir)
    if _is_lingdong_sd2_vip_adapter(config.adapter):
        return generate_lingdong_sd2_vip_video(normalized_payload, output_dir)
    if _is_artifex_video_adapter(config.adapter):
        return generate_sora_video_pro(normalized_payload, output_dir)
    raise ImageStudioError(f"未知的视频协议适配器: {config.adapter}")


def _finalize_video_bytes(
    video_bytes: bytes,
    video_url: str,
    prompt: str,
    model: str,
    duration: str,
    quality: str,
    aspect_ratio: str,
    output_dir: Path,
    raw_response: dict[str, Any],
) -> dict[str, Any]:
    ensure_output_dir(output_dir)
    timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    safe_model = model.replace("+", "_").replace("/", "_")[:40]
    filename = f"video-{timestamp}-{safe_model}.mp4"
    target_path = output_dir / filename
    target_path.write_bytes(video_bytes)
    file_size = len(video_bytes)
    saved = {
        "path": str(target_path),
        "filename": filename,
        "url": video_url,
        "fileSize": file_size,
    }
    return {
        "mode": "text2video",
        "prompt": prompt,
        "model": model,
        "duration": duration,
        "quality": quality,
        "aspectRatio": aspect_ratio,
        "saved": saved,
        "rawResponse": raw_response,
    }


def _finalize_video(
    video_url: str,
    prompt: str,
    model: str,
    duration: str,
    quality: str,
    aspect_ratio: str,
    output_dir: Path,
    raw_response: dict[str, Any],
) -> dict[str, Any]:
    """下载远程视频并保存到本地，返回结果字典。"""
    video_bytes, _ = _download_binary(video_url, timeout=900, retries=2)
    return _finalize_video_bytes(video_bytes, video_url, prompt, model, duration, quality, aspect_ratio, output_dir, raw_response)
