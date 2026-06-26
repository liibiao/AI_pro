# midjourney-baseurl-fix-20260608024118

Fixes the Midjourney Imagine admin configuration so it no longer auto-clones the Antigravity/CLIProxy 45 Base URL.

Installed files:

- `ai-admin-platform/api-server/scripts/materialize-midjourney-imagine.mjs`
- `ai-admin-platform/admin-web/src/main.tsx`
- `ai-admin-platform/admin-web/dist/**`

Deploy script:

- `deploy/apply-midjourney-baseurl-fix-20260608024118-on-server.sh`

Server-side behavior:

- backs up the current API materialize script and admin web files;
- installs the patched files;
- runs `node scripts/materialize-midjourney-imagine.mjs`;
- restarts `ai-admin-api` with PM2 when available;
- verifies the Midjourney provider Base URL no longer points to `45.77.211.38`.
