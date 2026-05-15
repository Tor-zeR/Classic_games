---
name: deploy-manual
description: Manual deployment of Neon Arcade to Azure Static Web Apps via the `swa` CLI. Use when the user asks to deploy, manually ship, push to Azure, or bypass the auto-deploy workflow.
---

# Manual deploy to Azure Static Web Apps

Default flow is auto-deploy: merging to `main` triggers `.github/workflows/deploy.yml` which deploys to Azure SWA (free tier).

For a manual deploy:

```bash
cd /tmp && swa deploy \
  --app-location /Users/dzmitryalenikau/Classic_games \
  --deployment-token "$AZURE_SWA_TOKEN" \
  --env production
```

## Context

- **Production URL**: https://classicarcade.win
- **Azure resource group**: `classic-arcade-rg` (region `eastus2`)
- **Deployment token**: stored in two places
  - GitHub Actions secret: `AZURE_STATIC_WEB_APPS_API_TOKEN`
  - Azure portal: Static Web App → Manage deployment token
- The token is **not** stored in the repo; the user must export `AZURE_SWA_TOKEN` (or fetch it from the Azure portal) before running the command.

## Branch rules

- `main` is the production branch. **Never push directly to `main`** — a pre-tool hook in `.claude/settings.local.json` blocks `git push … main`.
- Push to `dev` and open a PR. Merging to `main` triggers the auto-deploy workflow.
- Only fall back to the manual `swa deploy` command above if GitHub Actions is broken or you need to deploy a state that isn't on `main`.
