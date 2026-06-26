# cliproxy-grok-auth-fix-20260602021650

Fixes the CLIProxyAPI management xAI/Grok OAuth auth-url route so the WebUI can open the Grok authentication page instead of receiving 404 for `/v0/management/xai-auth-url`.

Deploy:

```bash
scp "/tmp/cliproxy-grok-auth-fix-20260602021650.tar.gz" ubuntu@45.77.211.38:/tmp/ && ssh ubuntu@45.77.211.38 "bash -s" < "/Users/billy/Documents/AI_pro/后台管理系统/deploy-packages/cliproxy-grok-auth-fix-20260602021650/deploy/apply-cliproxy-grok-auth-fix-20260602021650-on-server.sh"
```
