# cliproxy-public-oauth-callback-20260611141534

Changes CLIProxyAPI WebUI OAuth login flows to generate public server callback URLs instead of localhost callback URLs.

Included channels:
- Anthropic/Claude: `/anthropic/callback`
- Codex/OpenAI: `/codex/callback`
- Gemini CLI: `/google/callback`
- Antigravity: `/antigravity/callback`
- xAI: `/xai/callback`
- Plugin auth providers: `/v0/management/oauth-callback`

The deploy script also updates the Nginx `ai-admin` site so those public callback paths reverse proxy to the CLIProxyAPI backend on `127.0.0.1:8317`.
