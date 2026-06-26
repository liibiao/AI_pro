# Project Export Events Contract

版本：V1.0  
更新日期：2026-06-17  
前端状态：已接入 DTO、adapter、SSE 订阅、轮询 fallback 和 mock fixtures。

## 1. REST Endpoints

### Create Export Task

```http
POST /api/projects/:projectId/export-tasks
Content-Type: application/json
Authorization: Bearer <access_token>
```

Request:

```json
{
  "options": {
    "format": "mp4",
    "resolution": "1080p",
    "frame_rate": 30,
    "include_subtitles": true,
    "compress_quality": false
  }
}
```

Response:

```json
{
  "task_id": "export-contract-001",
  "project_id": "project-human-demon-war",
  "status": "running",
  "progress": 12,
  "options": {
    "format": "mp4",
    "resolution": "1080p",
    "frame_rate": 30,
    "include_subtitles": true,
    "compress_quality": false
  },
  "created_at": "2026-06-17T09:00:00.000Z",
  "updated_at": "2026-06-17T09:00:00.000Z"
}
```

### Get Export Task

```http
GET /api/export-tasks/:taskId
Authorization: Bearer <access_token>
```

Returns the same task shape as `POST /api/projects/:projectId/export-tasks`.

## 2. SSE Endpoint

```http
GET /api/export-tasks/:taskId/events
Accept: text/event-stream
Authorization: Bearer <access_token>
```

Frontend config:

```bash
VITE_PROJECT_EXPORT_SOCKET_BASE=https://your-api.example.com
```

If omitted, the frontend falls back to `VITE_PIPELINE_SOCKET_BASE`, then same-origin.

## 3. Event Types

Supported SSE event names:

| Event | Meaning |
| --- | --- |
| `export:progress` | Export is running and progress changed |
| `export:succeeded` | Export completed and `download_url` is available |
| `export:failed` | Export failed and `error_message` should be shown |

The frontend also accepts default `message` events carrying the same JSON payload.

## 4. Event Payload

```json
{
  "event_id": "export-contract-event-003",
  "task_id": "export-contract-001",
  "project_id": "project-human-demon-war",
  "type": "export:succeeded",
  "status": "completed",
  "progress": 100,
  "updated_at": "2026-06-17T09:00:15.000Z",
  "download_url": "/downloads/project-human-demon-war/export-contract-001.mp4"
}
```

Failure payload:

```json
{
  "event_id": "export-contract-event-failed",
  "task_id": "export-contract-001",
  "project_id": "project-human-demon-war",
  "type": "export:failed",
  "status": "failed",
  "progress": 64,
  "updated_at": "2026-06-17T09:00:12.000Z",
  "error_message": "导出服务暂时不可用，请稍后重试。"
}
```

## 5. Field Rules

| Field | Type | Rule |
| --- | --- | --- |
| `format` | `mp4 \| gif \| mov` | Required |
| `resolution` | `720p \| 1080p \| 4k` | Required |
| `frame_rate` | `24 \| 30 \| 60` | Required |
| `status` | `pending \| running \| completed \| failed` | Required |
| `progress` | `number` | 0-100; frontend clamps out-of-range values |
| `download_url` | `string` | Required only when completed |
| `error_message` | `string` | Required only when failed |

## 6. Frontend Behavior

- API mode subscribes to SSE first.
- If SSE errors, the frontend falls back to polling `GET /api/export-tasks/:taskId`.
- Mock mode uses local polling only.
- Events for other `task_id` values are ignored.
- `export:succeeded` forces progress to `100`.
