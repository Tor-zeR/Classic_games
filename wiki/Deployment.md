# Deployment

## Hosting

The site is hosted on **Azure Static Web Apps** (free tier) at:

- Production: [classicarcade.win](https://classicarcade.win)
- Azure subdomain: `https://blue-field-0b383230f.6.azurestaticapps.net`
- Resource group: `classic-arcade-rg` (eastus2)

DNS is managed via **Cloudflare** with the custom domain `classicarcade.win`.

---

## Automatic Deployment (CI/CD)

Pushing to the `main` branch triggers a GitHub Actions workflow that deploys automatically:

```yaml
# .github/workflows/deploy.yml
on:
  push:
    branches:
      - main
```

The workflow uses `Azure/static-web-apps-deploy@v1`. The deploy token is stored as a GitHub secret: `AZURE_SWA_TOKEN`.

---

## Manual Deployment

```bash
cd /tmp && swa deploy \
  --app-location /path/to/Classic_games \
  --deployment-token <TOKEN> \
  --env production
```

> Run from `/tmp`, not from inside the project directory — the SWA CLI rejects runs from within the app folder.

---

## SWA Configuration

`staticwebapp.config.json` controls:

- **Security headers:** `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`
- **Cache headers:** per-route (`/*.jpg` → 7d, `/css/*.css` → 1d, `/js/*.js` → 1d, default → 1h)
- **MIME types:** `.json` and `.xml`
- **404 redirect:** → `/` (302)

---

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production — auto-deploys to Azure on push |
| `dev` | Work in progress — PRs merge into `main` |

> Claude Code is configured to never push directly to `main`. All changes go through `dev` → PR → merge.
