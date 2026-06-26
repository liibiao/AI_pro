# Autumn

Autumn 是一个基于 React 18、TypeScript 5.x 与 Vite 6 的前端项目。

## Scripts

```bash
npm install
npm run dev
npm run build
```

## Runtime Config

Project data defaults to local mock data. To connect the project list and create/open project flow to a backend, set:

```bash
VITE_PROJECT_DATA_SOURCE=api
VITE_PROJECT_API_BASE=https://your-api.example.com
```

When `VITE_PROJECT_DATA_SOURCE` is omitted or set to `mock`, the app keeps using local mock project data.

Composer model config now defaults directly to the shared admin backend, `http://124.156.137.236/api`, the same API used by `http://124.156.137.236/admin/`. Override the base only when pointing at another backend:

```bash
VITE_MODEL_CONFIG_DATA_SOURCE=api
VITE_MODEL_CONFIG_API_BASE=http://124.156.137.236/api
```

The app calls `GET /api/models?type=IMAGE`, `GET /api/models?type=VIDEO`, and `GET /api/models?type=LLM` with the admin bearer token. If a typed list is empty, it falls back to `GET /api/admin/models` and filters enabled models. Autumn reads `ai_admin_token` first, then `canvas_platform_token`; without a token the model picker shows the backend login error instead of local fake models.

Agent data packs and Skill library entries also default directly to the shared canvas/admin backend:

```bash
VITE_AGENT_PACKAGE_DATA_SOURCE=api
VITE_AGENT_PACKAGE_API_BASE=http://124.156.137.236/api
VITE_SKILL_LIBRARY_DATA_SOURCE=api
VITE_SKILL_LIBRARY_API_BASE=http://124.156.137.236/api
```

Autumn calls `GET /api/data-packs` with the shared bearer token. Data packs are mapped into Autumn Agent packages, and Skill entries are derived from the data pack `skills` roots. Local imports remain device-only.
Set `VITE_AGENT_PACKAGE_DATA_SOURCE=mock` or `VITE_SKILL_LIBRARY_DATA_SOURCE=mock` only for local demo data.

LLM planning and script drafting use the same text-node chat endpoint as `image-studio-canvas-next.html`:

```bash
VITE_LLM_CHAT_API_BASE=http://124.156.137.236/api
```

Autumn calls `POST /api/generate/llm/chat` with `{ modelId, messages, maxOutputTokens, endpointPath, extra }` for the first two creative-chat stages: project skill planning and script drafting. It does not create `/api/generation/tasks` for these text-only LLM steps.

Media generation tasks can read and create tasks through the shared canvas/admin backend:

```bash
VITE_GENERATION_TASK_DATA_SOURCE=api
VITE_GENERATION_TASK_API_BASE=http://124.156.137.236/api
```

Autumn uses the shared bearer token for `GET /api/generation/tasks`, `POST /api/generation/tasks`, `GET /api/generation/tasks/:id`, and `POST /api/generation/tasks/:id/query` against the shared 124 backend by default. Composer submits image/video media jobs with the same task modes as the admin联调 page: image uses `txt2img`, video uses `text-to-video`. In API mode, missing auth fails loudly instead of creating a local mock task.

Project export progress can use an SSE endpoint when project data is connected to the API. The app subscribes to
`/api/export-tasks/:taskId/events` by default; override the base URL with:

```bash
VITE_PROJECT_EXPORT_SOCKET_BASE=https://your-api.example.com
```

If `VITE_PROJECT_EXPORT_SOCKET_BASE` is omitted, the app falls back to `VITE_PIPELINE_SOCKET_BASE`, then same-origin `/api`.

Auth/user profile data also defaults to mock-safe local behavior. To load profile data from a backend, set:

```bash
VITE_AUTH_DATA_SOURCE=api
VITE_AUTH_API_BASE=https://your-api.example.com
```

For the shared canvas/admin backend used by `image-studio-canvas-next.html`, point Autumn at the same API origin:

```bash
VITE_AUTH_DATA_SOURCE=api
VITE_AUTH_API_BASE=http://124.156.137.236/api
```

Autumn reads the admin `ai_admin_token` localStorage key first, then the same `canvas_platform_token` key used by the canvas app, and first calls
`GET /api/account/summary`, so user profile, wallet credits, membership, and agent binding come from the shared backend.
`GET /api/auth/me` remains as a compatibility fallback. `VITE_PLATFORM_API_BASE` can also be set as a shared backend base;
when it is omitted, the API clients above default to `http://124.156.137.236/api`.

## Stack

- React 18
- TypeScript 5.x
- Vite 6
