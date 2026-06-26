#!/usr/bin/env python3
from __future__ import annotations

import os
import re
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote


class ObjectStorageError(Exception):
    pass


ALLOWED_IMAGE_TYPES = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
}
ALLOWED_VIDEO_TYPES = {
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "video/x-m4v": ".m4v",
}
ALLOWED_AUDIO_TYPES = {
    "audio/mpeg": ".mp3",
    "audio/mp3": ".mp3",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/aac": ".aac",
    "audio/mp4": ".m4a",
    "audio/ogg": ".ogg",
}
ALLOWED_OBJECT_TYPES = {
    **ALLOWED_IMAGE_TYPES,
    **ALLOWED_VIDEO_TYPES,
    **ALLOWED_AUDIO_TYPES,
}
SUFFIX_CONTENT_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".m4v": "video/x-m4v",
    ".mov": "video/quicktime",
    ".webm": "video/webm",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".aac": "audio/aac",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
}
MAX_IMAGE_UPLOAD_BYTES = int(os.environ.get("OBJECT_STORAGE_MAX_BYTES", str(20 * 1024 * 1024)))
MAX_MEDIA_UPLOAD_BYTES = int(os.environ.get("OBJECT_STORAGE_MEDIA_MAX_BYTES", str(512 * 1024 * 1024)))
PRESIGNED_EXPIRES_SECONDS = int(os.environ.get("OBJECT_STORAGE_PRESIGNED_EXPIRES_SECONDS", "900"))


@dataclass
class UploadResult:
    ok: bool
    provider: str
    bucket: str
    key: str
    url: str
    remoteUrl: str
    filename: str
    size: int
    contentType: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "provider": self.provider,
            "bucket": self.bucket,
            "key": self.key,
            "url": self.url,
            "remoteUrl": self.remoteUrl,
            "filename": self.filename,
            "size": self.size,
            "contentType": self.contentType,
        }


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _safe_suffix(filename: str, content_type: str) -> str:
    suffix = Path(filename or "").suffix.lower()
    if suffix in SUFFIX_CONTENT_TYPES:
        return ".jpg" if suffix == ".jpeg" else suffix
    return ALLOWED_OBJECT_TYPES.get(content_type, ".png")


def _safe_key(filename: str, content_type: str) -> str:
    prefix = _env("OBJECT_STORAGE_PREFIX", "mjb-reference").strip("/")
    date_dir = datetime.now().strftime("%Y%m%d")
    suffix = _safe_suffix(filename, content_type)
    name = f"{uuid.uuid4().hex}{suffix}"
    return "/".join(part for part in [prefix, date_dir, name] if part)


def _public_url(key: str) -> str:
    base_url = _env("OBJECT_STORAGE_PUBLIC_BASE_URL")
    if not base_url:
        raise ObjectStorageError("缺少 OBJECT_STORAGE_PUBLIC_BASE_URL，无法生成服务商可访问的公网 URL")
    return f"{base_url.rstrip('/')}/{quote(key, safe='/')}"


def _normalize_content_type(filename: str, content_type: str) -> str:
    content_type = (content_type or "").split(";", 1)[0].strip().lower()
    if content_type == "image/jpg":
        content_type = "image/jpeg"
    if content_type == "audio/x-mpeg":
        content_type = "audio/mpeg"
    if content_type == "application/octet-stream":
        content_type = ""
    if content_type not in ALLOWED_OBJECT_TYPES:
        suffix = Path(filename or "").suffix.lower()
        guessed = SUFFIX_CONTENT_TYPES.get(suffix)
        content_type = guessed or content_type
    if content_type not in ALLOWED_OBJECT_TYPES:
        raise ObjectStorageError(f"对象存储仅支持图片/视频/音频参考素材，当前类型：{content_type or '未知'}")
    return content_type


def _max_upload_bytes(content_type: str) -> int:
    return MAX_IMAGE_UPLOAD_BYTES if content_type.startswith("image/") else MAX_MEDIA_UPLOAD_BYTES


def _validate_object(data: bytes, filename: str, content_type: str) -> str:
    content_type = _normalize_content_type(filename, content_type)
    if not data:
        raise ObjectStorageError("上传文件为空")
    max_bytes = _max_upload_bytes(content_type)
    if max_bytes > 0 and len(data) > max_bytes:
        unit = "参考图" if content_type.startswith("image/") else "参考媒体"
        raise ObjectStorageError(f"{unit}不能超过 {max_bytes // 1024 // 1024}MB")
    return content_type


def _validate_upload_metadata(filename: str, content_type: str, size: int) -> str:
    content_type = _normalize_content_type(filename, content_type)
    max_bytes = _max_upload_bytes(content_type)
    if size and max_bytes > 0 and size > max_bytes:
        unit = "参考图" if content_type.startswith("image/") else "参考媒体"
        raise ObjectStorageError(f"{unit}不能超过 {max_bytes // 1024 // 1024}MB")
    return content_type


def _s3_client(provider: str):
    try:
        import boto3  # type: ignore
        from botocore.config import Config  # type: ignore
    except Exception as exc:  # noqa: BLE001
        raise ObjectStorageError("缺少 boto3：请先执行 pip install boto3，或配置到当前 Python 环境") from exc

    endpoint_url = _env("OBJECT_STORAGE_ENDPOINT_URL")
    access_key = _env("OBJECT_STORAGE_ACCESS_KEY_ID")
    secret_key = _env("OBJECT_STORAGE_SECRET_ACCESS_KEY")
    region = _env("OBJECT_STORAGE_REGION", "auto")
    bucket = _env("OBJECT_STORAGE_BUCKET")
    if not endpoint_url or not access_key or not secret_key or not bucket:
        raise ObjectStorageError("S3/R2/COS 上传缺少配置：OBJECT_STORAGE_ENDPOINT_URL / ACCESS_KEY_ID / SECRET_ACCESS_KEY / BUCKET")

    client_kwargs: dict[str, Any] = {
        "endpoint_url": endpoint_url,
        "aws_access_key_id": access_key,
        "aws_secret_access_key": secret_key,
        "region_name": region,
    }
    if provider in {"cos", "tencent-cos"}:
        client_kwargs["config"] = Config(signature_version="s3v4", s3={"addressing_style": "virtual"})
    client = boto3.client("s3", **client_kwargs)
    return client, bucket


def _upload_s3_compatible(data: bytes, filename: str, content_type: str, provider: str) -> UploadResult:
    client, bucket = _s3_client(provider)
    acl = _env("OBJECT_STORAGE_ACL")
    key = _safe_key(filename, content_type)
    kwargs: dict[str, Any] = {
        "Bucket": bucket,
        "Key": key,
        "Body": data,
        "ContentType": content_type,
        "CacheControl": "public, max-age=31536000, immutable",
    }
    if acl:
        kwargs["ACL"] = acl
    client.put_object(**kwargs)
    url = _public_url(key)
    return UploadResult(True, provider, bucket, key, url, url, Path(key).name, len(data), content_type)


def _create_s3_upload_target(filename: str, content_type: str, size: int, provider: str) -> dict[str, Any]:
    client, bucket = _s3_client(provider)
    acl = _env("OBJECT_STORAGE_ACL")
    expires = max(60, min(604800, PRESIGNED_EXPIRES_SECONDS))
    key = _safe_key(filename, content_type)
    params: dict[str, Any] = {"Bucket": bucket, "Key": key, "ContentType": content_type}
    headers: dict[str, str] = {}
    if acl:
        params["ACL"] = acl
        headers["x-amz-acl"] = acl
    upload_url = client.generate_presigned_url(
        "put_object",
        Params=params,
        ExpiresIn=expires,
        HttpMethod="PUT",
    )
    public_url = _public_url(key)
    return {
        "ok": True,
        "provider": provider,
        "bucket": bucket,
        "key": key,
        "uploadUrl": upload_url,
        "publicUrl": public_url,
        "url": public_url,
        "remoteUrl": public_url,
        "fileId": public_url,
        "providerRef": public_url,
        "uploadRef": public_url,
        "headers": headers,
        "contentType": content_type,
        "size": size,
        "bytes": size,
        "filename": Path(key).name,
        "expiresIn": expires,
    }


def _upload_ali_oss(data: bytes, filename: str, content_type: str) -> UploadResult:
    try:
        import oss2  # type: ignore
    except Exception as exc:  # noqa: BLE001
        raise ObjectStorageError("缺少 oss2：请先执行 pip install oss2，或配置到当前 Python 环境") from exc

    endpoint = _env("OBJECT_STORAGE_ENDPOINT_URL")
    access_key = _env("OBJECT_STORAGE_ACCESS_KEY_ID")
    secret_key = _env("OBJECT_STORAGE_SECRET_ACCESS_KEY")
    bucket_name = _env("OBJECT_STORAGE_BUCKET")
    if not endpoint or not access_key or not secret_key or not bucket_name:
        raise ObjectStorageError("阿里 OSS 上传缺少配置：OBJECT_STORAGE_ENDPOINT_URL / ACCESS_KEY_ID / SECRET_ACCESS_KEY / BUCKET")

    key = _safe_key(filename, content_type)
    bucket = oss2.Bucket(oss2.Auth(access_key, secret_key), endpoint, bucket_name)
    headers = {"Content-Type": content_type, "Cache-Control": "public, max-age=31536000, immutable"}
    bucket.put_object(key, data, headers=headers)
    url = _public_url(key)
    return UploadResult(True, "oss", bucket_name, key, url, url, Path(key).name, len(data), content_type)


def _create_ali_oss_upload_target(filename: str, content_type: str, size: int) -> dict[str, Any]:
    try:
        import oss2  # type: ignore
    except Exception as exc:  # noqa: BLE001
        raise ObjectStorageError("缺少 oss2：请先执行 pip install oss2，或配置到当前 Python 环境") from exc

    endpoint = _env("OBJECT_STORAGE_ENDPOINT_URL")
    access_key = _env("OBJECT_STORAGE_ACCESS_KEY_ID")
    secret_key = _env("OBJECT_STORAGE_SECRET_ACCESS_KEY")
    bucket_name = _env("OBJECT_STORAGE_BUCKET")
    if not endpoint or not access_key or not secret_key or not bucket_name:
        raise ObjectStorageError("阿里 OSS 上传缺少配置：OBJECT_STORAGE_ENDPOINT_URL / ACCESS_KEY_ID / SECRET_ACCESS_KEY / BUCKET")

    expires = max(60, min(604800, PRESIGNED_EXPIRES_SECONDS))
    key = _safe_key(filename, content_type)
    bucket = oss2.Bucket(oss2.Auth(access_key, secret_key), endpoint, bucket_name)
    signed_headers = {"Content-Type": content_type}
    upload_url = bucket.sign_url("PUT", key, expires, headers=signed_headers)
    public_url = _public_url(key)
    return {
        "ok": True,
        "provider": "oss",
        "bucket": bucket_name,
        "key": key,
        "uploadUrl": upload_url,
        "publicUrl": public_url,
        "url": public_url,
        "remoteUrl": public_url,
        "fileId": public_url,
        "providerRef": public_url,
        "uploadRef": public_url,
        "headers": {},
        "contentType": content_type,
        "size": size,
        "bytes": size,
        "filename": Path(key).name,
        "expiresIn": expires,
    }


def upload_reference_image(data: bytes, filename: str, content_type: str) -> dict[str, Any]:
    content_type = _validate_object(data, filename, content_type)
    provider = _env("OBJECT_STORAGE_PROVIDER", "s3").lower()
    provider = re.sub(r"[^a-z0-9_-]", "", provider) or "s3"
    if provider in {"s3", "r2", "cos", "tencent-cos", "cloudflare-r2"}:
        return _upload_s3_compatible(data, filename, content_type, provider).to_dict()
    if provider in {"oss", "ali-oss", "aliyun-oss"}:
        return _upload_ali_oss(data, filename, content_type).to_dict()
    raise ObjectStorageError("OBJECT_STORAGE_PROVIDER 仅支持 s3/r2/cos/oss")


def create_upload_target(filename: str, content_type: str, size: int = 0) -> dict[str, Any]:
    content_type = _validate_upload_metadata(filename, content_type, int(size or 0))
    provider = _env("OBJECT_STORAGE_PROVIDER", "s3").lower()
    provider = re.sub(r"[^a-z0-9_-]", "", provider) or "s3"
    if provider in {"s3", "r2", "cos", "tencent-cos", "cloudflare-r2"}:
        return _create_s3_upload_target(filename, content_type, int(size or 0), provider)
    if provider in {"oss", "ali-oss", "aliyun-oss"}:
        return _create_ali_oss_upload_target(filename, content_type, int(size or 0))
    raise ObjectStorageError("OBJECT_STORAGE_PROVIDER 仅支持 s3/r2/cos/oss")
